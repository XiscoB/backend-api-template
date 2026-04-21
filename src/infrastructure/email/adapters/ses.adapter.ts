import { Injectable, Logger } from '@nestjs/common';
import { EmailAdapter } from '../types/email-adapter.interface';
import { RenderedEmail, AdapterSendResult } from '../types/email.types';
import { EmailConfigService } from '../config/email-config.service';

/**
 * SES SendEmail API response shape.
 * @see https://docs.aws.amazon.com/ses/latest/APIReference/API_SendEmail.html
 */
interface SesSendResponse {
  MessageId?: string;
}

/**
 * Type guard for SES response.
 */
function isSesSendResponse(data: unknown): data is SesSendResponse {
  return typeof data === 'object' && data !== null;
}

/**
 * Amazon SES email adapter.
 *
 * Implements email delivery via Amazon Simple Email Service (SES).
 * This adapter is INACTIVE by default and requires AWS configuration.
 *
 * AWS SES API Reference:
 * https://docs.aws.amazon.com/ses/latest/APIReference/API_SendEmail.html
 *
 * Design principles:
 * - No runtime dependency on AWS SDK (uses HTTP API)
 * - Provider-agnostic interface
 * - Ready to enable via configuration
 * - No AWS config required until activated
 *
 * To enable:
 * 1. Set EMAIL_PROVIDER=ses in environment
 * 2. Configure AWS credentials:
 *    - AWS_SES_REGION
 *    - AWS_SES_ACCESS_KEY_ID
 *    - AWS_SES_SECRET_ACCESS_KEY
 */
@Injectable()
export class SesAdapter implements EmailAdapter {
  private readonly logger = new Logger(SesAdapter.name);

  readonly name = 'ses';

  constructor(private readonly config: EmailConfigService) {}

  /**
   * Send a single rendered email via SES.
   *
   * Uses the SES v2 SendEmail API with raw email format.
   */
  async send(email: RenderedEmail): Promise<AdapterSendResult> {
    // Validate configuration
    if (!this.isConfigured()) {
      return {
        accepted: false,
        error:
          'SES adapter not configured. Set AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, and AWS_SES_SECRET_ACCESS_KEY.',
      };
    }

    try {
      const response = await this.sendRawEmail(email);

      if (response.ok) {
        const data: unknown = await response.json();
        const sesResponse = isSesSendResponse(data) ? data : {};
        return {
          accepted: true,
          messageId: sesResponse.MessageId,
          rawResponse: data,
        };
      }

      const errorData = await response.text();
      this.logger.warn(`SES send failed: ${errorData}`, {
        to: email.to,
        status: response.status,
      });

      return {
        accepted: false,
        error: this.extractErrorMessage(errorData),
        rawResponse: errorData,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`SES request failed: ${message}`, { to: email.to });

      return {
        accepted: false,
        error: message,
      };
    }
  }

  /**
   * Send multiple emails in batch.
   *
   * SES does not support true batch sending in a single API call.
   * This implementation sends emails sequentially.
   */
  async sendBatch(emails: RenderedEmail[]): Promise<AdapterSendResult[]> {
    const results: AdapterSendResult[] = [];

    for (const email of emails) {
      const result = await this.send(email);
      results.push(result);
    }

    return results;
  }

  /**
   * Check if the adapter is properly configured.
   */
  private isConfigured(): boolean {
    return !!(
      this.config.sesRegion &&
      this.config.sesAccessKeyId &&
      this.config.sesSecretAccessKey
    );
  }

  /**
   * Send a raw email via SES v2 API.
   *
   * Uses AWS Signature Version 4 for authentication.
   */
  private async sendRawEmail(email: RenderedEmail): Promise<Response> {
    const region = this.config.sesRegion!;
    const accessKeyId = this.config.sesAccessKeyId!;
    const secretAccessKey = this.config.sesSecretAccessKey!;

    // Build the raw MIME email
    const rawEmail = this.buildMimeEmail(email);
    const rawEmailBase64 = Buffer.from(rawEmail).toString('base64');

    // SES v2 SendEmail endpoint
    const endpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;

    // Build request payload
    const payload = {
      Content: {
        Raw: {
          Data: rawEmailBase64,
        },
      },
    };

    // Sign the request with AWS Signature Version 4
    const { headers } = await this.signRequest(
      'POST',
      endpoint,
      JSON.stringify(payload),
      region,
      accessKeyId,
      secretAccessKey,
    );

    return await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Build a raw MIME email.
   */
  private buildMimeEmail(email: RenderedEmail): string {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    const fromHeader = email.fromName ? `"${email.fromName}" <${email.from}>` : email.from;

    const toHeader = email.toName ? `"${email.toName}" <${email.to}>` : email.to;

    let mime = '';
    mime += `From: ${fromHeader}\r\n`;
    mime += `To: ${toHeader}\r\n`;
    mime += `Subject: ${this.encodeHeader(email.subject)}\r\n`;

    if (email.replyTo) {
      mime += `Reply-To: ${email.replyTo}\r\n`;
    }

    if (email.messageId) {
      mime += `Message-ID: <${email.messageId}>\r\n`;
    }

    mime += `MIME-Version: 1.0\r\n`;
    mime += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
    mime += `\r\n`;

    // Plain text part
    if (email.text) {
      mime += `--${boundary}\r\n`;
      mime += `Content-Type: text/plain; charset=UTF-8\r\n`;
      mime += `Content-Transfer-Encoding: quoted-printable\r\n`;
      mime += `\r\n`;
      mime += `${email.text}\r\n`;
    }

    // HTML part
    mime += `--${boundary}\r\n`;
    mime += `Content-Type: text/html; charset=UTF-8\r\n`;
    mime += `Content-Transfer-Encoding: quoted-printable\r\n`;
    mime += `\r\n`;
    mime += `${email.html}\r\n`;

    mime += `--${boundary}--\r\n`;

    return mime;
  }

  /**
   * Encode header for MIME (UTF-8 encoded-word).
   */
  private encodeHeader(value: string): string {
    // Check if encoding is needed (non-ASCII characters)
    if (/^[\x00-\x7F]*$/.test(value)) {
      return value;
    }
    // Use Base64 encoding for UTF-8
    const encoded = Buffer.from(value, 'utf-8').toString('base64');
    return `=?UTF-8?B?${encoded}?=`;
  }

  /**
   * Sign a request with AWS Signature Version 4.
   *
   * This is a simplified implementation for SES v2.
   * For production, consider using @aws-sdk/signature-v4.
   */
  private async signRequest(
    method: string,
    url: string,
    body: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
  ): Promise<{ headers: Record<string, string> }> {
    const service = 'ses';
    const host = new URL(url).host;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    // Hash the payload
    const payloadHash = await this.sha256(body);

    // Create canonical request
    const canonicalUri = new URL(url).pathname;
    const canonicalQueryString = '';
    const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-date';

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      await this.sha256(canonicalRequest),
    ].join('\n');

    // Calculate signature
    const signingKey = await this.getSignatureKey(secretAccessKey, dateStamp, region, service);
    const signature = await this.hmacHex(signingKey, stringToSign);

    // Build authorization header
    const authorizationHeader = [
      `${algorithm} Credential=${accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    return {
      headers: {
        Host: host,
        'X-Amz-Date': amzDate,
        'X-Amz-Content-Sha256': payloadHash,
        Authorization: authorizationHeader,
      },
    };
  }

  /**
   * Generate AWS signing key.
   */
  private async getSignatureKey(
    key: string,
    dateStamp: string,
    region: string,
    service: string,
  ): Promise<ArrayBuffer> {
    const kDate = await this.hmac(`AWS4${key}`, dateStamp);
    const kRegion = await this.hmac(kDate, region);
    const kService = await this.hmac(kRegion, service);
    return await this.hmac(kService, 'aws4_request');
  }

  /**
   * HMAC-SHA256.
   */
  private async hmac(key: string | ArrayBuffer, data: string): Promise<ArrayBuffer> {
    const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : new Uint8Array(key);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  }

  /**
   * HMAC-SHA256 returning hex string.
   */
  private async hmacHex(key: ArrayBuffer, data: string): Promise<string> {
    const result = await this.hmac(key, data);
    return Array.from(new Uint8Array(result))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * SHA-256 hash returning hex string.
   */
  private async sha256(data: string): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Extract error message from SES error response.
   */
  private extractErrorMessage(errorData: string): string {
    // Try to parse as JSON first
    try {
      const parsed: unknown = JSON.parse(errorData);
      if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.message === 'string') return obj.message;
        if (typeof obj.Message === 'string') return obj.Message;
      }
      return 'SES API error';
    } catch {
      // Fall back to raw message
      return errorData.substring(0, 200) || 'SES API error';
    }
  }
}

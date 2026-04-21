> Documentation Layer: Canonical Contract

# Email Delivery Infrastructure

This document describes the email delivery infrastructure in this template repository.

## Overview

The email module provides **generic, provider-agnostic email delivery** for transactional emails. It is designed to be:

- **Reusable** — Works for any project that clones this template
- **Provider-neutral** — Swap providers without code changes
- **Language-based** — Content stored in locale files, not provider templates
- **Single-first** — Optimized for single sends, supports batch

> **Note**: Authentication emails (magic links, verification, password reset) are **out of scope**. These are handled by the external identity provider (Supabase, Auth0, etc.).

## Quick Start

### 1. Import the Module

```typescript
// src/app.module.ts
import { EmailModule } from './infrastructure/email';

@Module({
  imports: [
    EmailModule.forRoot(),
    // ... other modules
  ],
})
export class AppModule {}
```

### 2. Configure Environment

```bash
# Minimum configuration (development)
EMAIL_PROVIDER=console

# Production with SparkPost
EMAIL_PROVIDER=sparkpost
SPARKPOST_API_KEY=your-api-key
EMAIL_DEFAULT_FROM=noreply@yourdomain.com
```

### 3. Send an Email

```typescript
import { Injectable } from '@nestjs/common';
import { EmailService } from './infrastructure/email';

@Injectable()
export class MyService {
  constructor(private readonly emailService: EmailService) {}

  async sendWelcomeEmail(email: string, name: string) {
    const result = await this.emailService.send({
      templateKey: 'welcome',
      from: 'noreply@example.com',
      recipients: [{ email, name }],
      locale: 'en',
      variables: { name, appName: 'My App' },
    });

    if (result.rejectedCount > 0) {
      // Handle rejected emails
    }
  }
}
```

## Architecture

```
src/infrastructure/email/
├── email.module.ts          # NestJS module configuration
├── email.service.ts         # Main entry point
├── index.ts                 # Public exports
├── adapters/
│   ├── sparkpost.adapter.ts # SparkPost implementation
│   ├── ses.adapter.ts       # Amazon SES implementation
│   └── console.adapter.ts   # Development/testing adapter
├── config/
│   └── email-config.service.ts
├── templates/
│   ├── template-resolver.service.ts
│   └── locales/
│       ├── en.json          # English templates
│       └── de.json          # German templates
└── types/
    ├── email.types.ts       # Payload, Result types
    └── email-adapter.interface.ts
```

## Providers

### Console (Development)

The default provider. Logs emails to the console instead of sending.

```bash
EMAIL_PROVIDER=console
```

No additional configuration required.

### SparkPost

Production email delivery via SparkPost.

```bash
EMAIL_PROVIDER=sparkpost
SPARKPOST_API_KEY=your-api-key

# Optional: EU endpoint
SPARKPOST_API_ENDPOINT=https://api.eu.sparkpost.com/api/v1
```

### Amazon SES

Production email delivery via Amazon SES. Adapter is implemented but inactive by default.

```bash
EMAIL_PROVIDER=ses
AWS_SES_REGION=us-east-1
AWS_SES_ACCESS_KEY_ID=AKIA...
AWS_SES_SECRET_ACCESS_KEY=...
```

## Templates

Templates are stored as JSON files in `src/infrastructure/email/templates/locales/`.

### Template Structure

```json
{
  "welcome": {
    "subject": "Welcome to {{appName}}",
    "html": "<h1>Welcome, {{name}}!</h1><p>Thanks for joining {{appName}}.</p>",
    "text": "Welcome, {{name}}!\n\nThanks for joining {{appName}}."
  }
}
```

### Variables

Use double curly braces for placeholders: `{{variableName}}`

Variables are passed in the `variables` field of the payload:

```typescript
await emailService.send({
  templateKey: 'welcome',
  variables: {
    name: 'John',
    appName: 'My App',
  },
  // ...
});
```

### Locale Fallback

If a template is not found in the requested locale, the service falls back to English (`en.json`).

### Adding a New Template

1. Add the template to `src/infrastructure/email/templates/locales/en.json`
2. Add translations to other locale files as needed
3. Reference it by the template key in your code

## Raw HTML Mode

For edge cases where templates are not suitable, you can send raw HTML directly:

```typescript
await emailService.send({
  rawHtml: '<h1>Custom Email</h1><p>This is raw HTML content.</p>',
  rawSubject: 'Custom Subject Line',
  rawText: 'Fallback plain text content', // Optional
  from: 'noreply@example.com',
  recipients: [{ email: 'user@example.com', name: 'User' }],
});
```

> **Note**: In raw mode, `locale` and `variables` are optional and ignored.

### When to Use Raw HTML

- One-off system notifications
- Dynamically generated content that doesn't fit templates
- Integration with external content sources

For most use cases, templates are recommended for maintainability and localization.

## API Reference

### EmailPayload

The payload type is a union of `TemplateEmailPayload` and `RawEmailPayload`.

```typescript
// Common fields
interface BaseEmailPayload {
  from: string;
  fromName?: string;
  recipients: EmailRecipient[];
  replyTo?: string;
  metadata?: Record<string, string>;
}

// Mode 1: Template
interface TemplateEmailPayload extends BaseEmailPayload {
  templateKey: string;
  locale: string;
  variables: Record<string, string>;
}

// Mode 2: Raw HTML
interface RawEmailPayload extends BaseEmailPayload {
  rawHtml: string;
  rawSubject: string;
  rawText?: string;
  // locale and variables are optional/ignored
}

type EmailPayload = TemplateEmailPayload | RawEmailPayload;

interface EmailRecipient {
  email: string; // Recipient address
  name?: string; // Display name
  variables?: Record<string, string>; // Per-recipient overrides
  messageId?: string; // Idempotency key
}
```

### EmailResult

```typescript
interface EmailResult {
  provider: string; // Provider name
  acceptedCount: number; // Emails accepted
  rejectedCount: number; // Emails rejected
  recipientResults?: EmailRecipientResult[]; // Per-recipient details
}
```

## Batch Sending

Send to multiple recipients with optional per-recipient personalization:

```typescript
await emailService.send({
  templateKey: 'notification',
  from: 'noreply@example.com',
  recipients: [
    { email: 'user1@example.com', name: 'User 1', variables: { customField: 'value1' } },
    { email: 'user2@example.com', name: 'User 2', variables: { customField: 'value2' } },
  ],
  locale: 'en',
  variables: { appName: 'My App' }, // Base variables for all
});
```

## Testing

Use the testing module configuration to always use the console adapter:

```typescript
// test/setup.ts
EmailModule.forTesting();
```

Or disable email sending entirely:

```bash
EMAIL_ENABLED=false
```

## Custom Adapters

Implement the `EmailAdapter` interface to add a new provider:

```typescript
import { EmailAdapter, RenderedEmail, AdapterSendResult } from './infrastructure/email';

@Injectable()
export class MyCustomAdapter implements EmailAdapter {
  readonly name = 'my-provider';

  async send(email: RenderedEmail): Promise<AdapterSendResult> {
    // Implementation
    return { accepted: true, messageId: '...' };
  }
}
```

## Out of Scope

The following are **intentionally NOT included**:

- ❌ Retry logic
- ❌ Background jobs / queues
- ❌ Bounce handling
- ❌ SNS / webhooks
- ❌ Rate limiting
- ❌ Metrics / dashboards
- ❌ Authentication emails (handled by identity provider)

These belong to project-specific layers, not the template.

## Environment Variables

| Variable                    | Required  | Default     | Description                             |
| --------------------------- | --------- | ----------- | --------------------------------------- |
| `EMAIL_PROVIDER`            | No        | `console`   | Provider: `sparkpost`, `ses`, `console` |
| `EMAIL_ENABLED`             | No        | `true`      | Enable/disable sending                  |
| `EMAIL_DEFAULT_FROM`        | No        | -           | Default sender address                  |
| `EMAIL_DEFAULT_FROM_NAME`   | No        | -           | Default sender name                     |
| `SPARKPOST_API_KEY`         | SparkPost | -           | SparkPost API key                       |
| `SPARKPOST_API_ENDPOINT`    | No        | US endpoint | SparkPost API endpoint                  |
| `AWS_SES_REGION`            | SES       | -           | AWS region                              |
| `AWS_SES_ACCESS_KEY_ID`     | SES       | -           | AWS access key                          |
| `AWS_SES_SECRET_ACCESS_KEY` | SES       | -           | AWS secret key                          |
| `EMAIL_PRODUCT_NAME`        | No        | `FROM_NAME` | Branding: App Name                      |
| `EMAIL_PRODUCT_LOGO_URL`    | No        | -           | Branding: Logo URL                      |
| `EMAIL_SUPPORT_EMAIL`       | No        | -           | Support contact email                   |
| `EMAIL_ALLOW_USER_EMAILS`   | No        | `true`      | Toggle user-facing emails               |
| `EMAIL_ADMIN_EMAIL`         | No        | -           | Alerting: Admin email address           |


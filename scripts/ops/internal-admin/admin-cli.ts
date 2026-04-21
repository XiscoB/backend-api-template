#!/usr/bin/env node

/**
 * Internal Admin Console CLI Helper
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠️  FOR OPERATIONAL USE ONLY — REQUIRES ADMIN CONSOLE TO BE ENABLED  ⚠️
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This script provides a convenient way to interact with the Internal Admin Console
 * without manually crafting HTTP requests.
 *
 * Prerequisites:
 *   - Backend must be running with ADMIN_CONSOLE_ENABLED=true
 *   - Valid JWT with ADMIN_READ or ADMIN_WRITE privilege
 *
 * Environment Variables:
 *   ADMIN_API_URL   - Base URL of the admin console (default: http://localhost:3000/internal/admin)
 *   ADMIN_JWT       - JWT token with admin privileges (required)
 *
 * Usage:
 *   node admin-cli.js tables                           # List visible tables
 *   node admin-cli.js query <table> [options]          # Query table records
 *   node admin-cli.js get <table> <id>                 # Get single record
 *   node admin-cli.js update <table> <id> <json>       # Update record (ADMIN_WRITE only)
 *   node admin-cli.js health                           # Check admin console health
 *
 * Options for query:
 *   --limit <n>       Maximum records to return (default: 50, max: 100)
 *   --offset <n>      Skip first n records (default: 0)
 *   --filter <field>  Field to filter by
 *   --value <value>   Value to filter by (requires --filter)
 *
 * Examples:
 *   node admin-cli.js tables
 *   node admin-cli.js query profiles --limit 10
 *   node admin-cli.js query notifications --filter userId --value "user-123"
 *   node admin-cli.js get profiles abc-123-def
 *   node admin-cli.js update notifications abc-123 '{"isRead": true}'
 *
 * Security:
 *   - All requests go through existing admin API endpoints
 *   - Same guards, validation, and rate limits apply
 *   - No bypassing of backend security
 */

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ─────────────────────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

interface AdminConfig {
  apiUrl: string;
  jwt: string;
}

interface ApiResponse {
  status: number;
  data: Record<string, unknown>;
}

interface TableInfo {
  name: string;
  writable: boolean;
}

interface QueryMeta {
  offset: number;
  total: number;
}

interface QueryOptions {
  limit: number;
  offset: number;
  filter?: string;
  value?: string;
}

interface HealthData {
  status: string;
  privilege: string;
  timestamp: string;
}

interface ParsedArgs {
  _: string[];
  [key: string]: string | boolean | string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_API_URL = 'http://localhost:3000/internal/admin';

function getConfig(): AdminConfig {
  const apiUrl = process.env.ADMIN_API_URL || DEFAULT_API_URL;
  const jwt = process.env.ADMIN_JWT;

  if (!jwt) {
    console.error('❌ Error: ADMIN_JWT environment variable is required');
    console.error('');
    console.error('Set it with a valid admin JWT token:');
    console.error('  export ADMIN_JWT="your-jwt-token"');
    console.error('  # or on Windows:');
    console.error('  $env:ADMIN_JWT = "your-jwt-token"');
    process.exit(1);
  }

  return { apiUrl, jwt };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely parse a JSON string into a typed record.
 * Returns an empty object if parsing fails or result is not an object.
 */
function safeJsonParse(raw: string): Record<string, unknown> {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return { raw: parsed };
}

/**
 * Make an HTTP request to the admin API.
 */
function request(
  method: string,
  path: string,
  body: Record<string, unknown> | null = null,
): Promise<ApiResponse> {
  const { apiUrl, jwt } = getConfig();

  return new Promise((resolve, reject) => {
    const url = new URL(path, apiUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });

      res.on('end', () => {
        try {
          const parsed = safeJsonParse(data);
          resolve({ status: res.statusCode ?? 0, data: parsed });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: { raw: data } });
        }
      });
    });

    req.on('error', (error: Error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Response Narrowing Helpers
// ─────────────────────────────────────────────────────────────────────────────

function asTableInfoArray(val: unknown): TableInfo[] {
  if (!Array.isArray(val)) return [];
  return val.filter(
    (item): item is TableInfo =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).name === 'string' &&
      typeof (item as Record<string, unknown>).writable === 'boolean',
  );
}

function asRecordArray(val: unknown): Record<string, unknown>[] {
  if (!Array.isArray(val)) return [];
  return val.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  );
}

function asQueryMeta(val: unknown): QueryMeta {
  if (typeof val !== 'object' || val === null) return { offset: 0, total: 0 };
  const obj = val as Record<string, unknown>;
  return {
    offset: typeof obj.offset === 'number' ? obj.offset : 0,
    total: typeof obj.total === 'number' ? obj.total : 0,
  };
}

function asHealthData(val: unknown): HealthData {
  if (typeof val !== 'object' || val === null)
    return { status: 'unknown', privilege: 'unknown', timestamp: 'unknown' };
  const obj = val as Record<string, unknown>;
  return {
    status: typeof obj.status === 'string' ? obj.status : 'unknown',
    privilege: typeof obj.privilege === 'string' ? obj.privilege : 'unknown',
    timestamp: typeof obj.timestamp === 'string' ? obj.timestamp : 'unknown',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all visible tables.
 */
async function listTables(): Promise<void> {
  console.log('📋 Fetching visible tables...\n');

  try {
    const { status, data } = await request('GET', '/tables');

    if (status !== 200) {
      handleError(status, data);
      return;
    }

    const tables = asTableInfoArray(data.data);

    if (tables.length === 0) {
      console.log('No visible tables configured.');
      return;
    }

    console.log('Visible Tables:');
    console.log('─'.repeat(50));

    for (const table of tables) {
      const writable = table.writable ? '✏️  (writable)' : '👁️  (read-only)';
      console.log(`  ${table.name.padEnd(35)} ${writable}`);
    }

    console.log('─'.repeat(50));
    console.log(`Total: ${tables.length} tables`);
  } catch (error: unknown) {
    handleNetworkError(error);
  }
}

/**
 * Query records from a table.
 */
async function queryTable(table: string, options: QueryOptions): Promise<void> {
  const { limit = 50, offset = 0, filter, value } = options;

  console.log(`🔍 Querying table: ${table}\n`);

  try {
    let path = `/query?table=${encodeURIComponent(table)}&limit=${limit}&offset=${offset}`;

    if (filter && value !== undefined) {
      path += `&filterField=${encodeURIComponent(filter)}&filterValue=${encodeURIComponent(value)}`;
    }

    const { status, data } = await request('GET', path);

    if (status !== 200) {
      handleError(status, data);
      return;
    }

    const records = asRecordArray(data.data);
    const meta = asQueryMeta(data.meta);

    if (records.length === 0) {
      console.log('No records found.');
      return;
    }

    console.log(`Results (${meta.offset + 1}-${meta.offset + records.length} of ${meta.total}):`);
    console.log('─'.repeat(80));

    for (const record of records) {
      console.log(JSON.stringify(record, null, 2));
      console.log('─'.repeat(80));
    }

    console.log(`\nShowing ${records.length} of ${meta.total} records`);

    if (meta.offset + records.length < meta.total) {
      console.log(`\nTo see more, use: --offset ${meta.offset + records.length}`);
    }
  } catch (error: unknown) {
    handleNetworkError(error);
  }
}

/**
 * Get a single record by ID.
 */
async function getRecord(table: string, id: string): Promise<void> {
  console.log(`📄 Fetching record: ${table}/${id}\n`);

  try {
    const { status, data } = await request(
      'GET',
      `/record/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
    );

    if (status !== 200) {
      handleError(status, data);
      return;
    }

    console.log('Record:');
    console.log('─'.repeat(80));
    console.log(JSON.stringify(data.data, null, 2));
    console.log('─'.repeat(80));
  } catch (error: unknown) {
    handleNetworkError(error);
  }
}

/**
 * Update a record.
 */
async function updateRecord(table: string, id: string, jsonData: string): Promise<void> {
  console.log(`✏️  Updating record: ${table}/${id}\n`);

  let parsedData: Record<string, unknown>;
  try {
    const raw: unknown = JSON.parse(jsonData);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      console.error('❌ Error: JSON data must be an object');
      process.exit(1);
    }
    parsedData = raw as Record<string, unknown>;
  } catch {
    console.error('❌ Error: Invalid JSON data');
    console.error('   Provide valid JSON, e.g.: \'{"field": "value"}\'');
    process.exit(1);
  }

  try {
    const { status, data } = await request('POST', '/update', {
      table,
      id,
      data: parsedData,
    });

    if (status !== 200 && status !== 201) {
      handleError(status, data);
      return;
    }

    console.log('✅ Record updated successfully');
    console.log('─'.repeat(50));
    console.log(JSON.stringify(data.data, null, 2));
  } catch (error: unknown) {
    handleNetworkError(error);
  }
}

/**
 * Check admin console health.
 */
async function checkHealth(): Promise<void> {
  console.log('🏥 Checking admin console health...\n');

  try {
    const { status, data } = await request('GET', '/health');

    if (status !== 200) {
      handleError(status, data);
      return;
    }

    const health = asHealthData(data.data);

    console.log('Admin Console Status:');
    console.log('─'.repeat(50));
    console.log(`  Status:     ${health.status === 'ok' ? '✅ OK' : '❌ Error'}`);
    console.log(`  Privilege:  ${health.privilege}`);
    console.log(`  Timestamp:  ${health.timestamp}`);
    console.log('─'.repeat(50));
  } catch (error: unknown) {
    handleNetworkError(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────────────────────────

function handleError(status: number, data: Record<string, unknown>): void {
  console.error(`❌ Error (HTTP ${status}):`);

  if (status === 401) {
    console.error('   Authentication failed. Check your ADMIN_JWT token.');
  } else if (status === 403) {
    console.error('   Access denied. Your JWT may lack admin privileges.');
    console.error('   Required: ADMIN_READ or ADMIN_WRITE in JWT roles.');
  } else if (status === 404) {
    console.error('   Resource not found. Table may not be in the allowlist.');
  } else if (status === 429) {
    console.error('   Rate limit exceeded. Wait before retrying.');
  } else {
    const message = typeof data.message === 'string' ? data.message : JSON.stringify(data);
    console.error(`   ${message}`);
  }

  process.exit(1);
}

function handleNetworkError(error: unknown): void {
  console.error('❌ Network error:');

  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ECONNREFUSED') {
      console.error('   Cannot connect to admin API.');
      console.error('   Is the backend running with ADMIN_CONSOLE_ENABLED=true?');
    } else {
      console.error(`   ${error.message}`);
    }
  } else {
    console.error(`   ${String(error)}`);
  }

  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Argument Parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = { _: [] };
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg: string | undefined = args[i + 1];

      if (nextArg !== undefined && !nextArg.startsWith('--')) {
        result[key] = nextArg;
        i += 2;
      } else {
        result[key] = true;
        i += 1;
      }
    } else {
      result._.push(arg);
      i += 1;
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
Internal Admin Console CLI Helper
═══════════════════════════════════════════════════════════════════════════════

Usage:
  node admin-cli.js <command> [arguments] [options]

Commands:
  tables                        List all visible tables
  query <table>                 Query records from a table
  get <table> <id>              Get a single record by ID
  update <table> <id> <json>    Update a record (ADMIN_WRITE required)
  health                        Check admin console health

Options for query:
  --limit <n>                   Max records to return (default: 50, max: 100)
  --offset <n>                  Skip first n records (default: 0)
  --filter <field>              Field to filter by
  --value <value>               Value to filter by (requires --filter)

Environment Variables:
  ADMIN_API_URL                 Base URL (default: http://localhost:3000/internal/admin)
  ADMIN_JWT                     JWT token with admin privileges (required)

Examples:
  node admin-cli.js tables
  node admin-cli.js query profiles --limit 10
  node admin-cli.js query notifications --filter userId --value "user-123"
  node admin-cli.js get profiles abc-123-def
  node admin-cli.js update notifications abc-123 '{"isRead": true}'
  node admin-cli.js health
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || args.help) {
    printUsage();
    process.exit(0);
  }

  switch (command) {
    case 'tables':
      await listTables();
      break;

    case 'query': {
      const table = args._[1];
      if (!table) {
        console.error('❌ Error: Table name required');
        console.error('   Usage: node admin-cli.js query <table> [--limit n] [--offset n]');
        process.exit(1);
      }
      const limitStr = typeof args.limit === 'string' ? args.limit : '';
      const offsetStr = typeof args.offset === 'string' ? args.offset : '';
      await queryTable(table, {
        limit: parseInt(limitStr, 10) || 50,
        offset: parseInt(offsetStr, 10) || 0,
        filter: typeof args.filter === 'string' ? args.filter : undefined,
        value: typeof args.value === 'string' ? args.value : undefined,
      });
      break;
    }

    case 'get': {
      const table = args._[1];
      const id = args._[2];
      if (!table || !id) {
        console.error('❌ Error: Table name and record ID required');
        console.error('   Usage: node admin-cli.js get <table> <id>');
        process.exit(1);
      }
      await getRecord(table, id);
      break;
    }

    case 'update': {
      const table = args._[1];
      const id = args._[2];
      const jsonData = args._[3];
      if (!table || !id || !jsonData) {
        console.error('❌ Error: Table name, record ID, and JSON data required');
        console.error('   Usage: node admin-cli.js update <table> <id> \'{"field": "value"}\'');
        process.exit(1);
      }
      await updateRecord(table, id, jsonData);
      break;
    }

    case 'health':
      await checkHealth();
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('❌ Unexpected error:', message);
  process.exit(1);
});

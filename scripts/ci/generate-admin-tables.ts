/**
 * ⚠️ AUTO-GENERATED SCRIPT — DO NOT EDIT
 *
 * This script generates the config for the internal admin panel by parsing schema.prisma.
 * It ensures all tables are discovered at build time without runtime introspection.
 */

import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_PATH = path.join(__dirname, '../../prisma/schema.prisma');
const OUTPUT_PATH = path.join(
  __dirname,
  '../../src/modules/internal-admin/generated-admin-tables.ts',
);

function generateAdminTables() {
  console.log(`Parsing schema from: ${SCHEMA_PATH}`);

  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`Error: schema.prisma not found at ${SCHEMA_PATH}`);
    process.exit(1);
  }

  const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  const models: Record<string, { prismaDelegate: string; writable: boolean }> = {};

  // Regex to find models: model ModelName { ... }
  // capturing group 1: ModelName
  // We scan line by line to handle block content (like @@map) more reliably than a single massive regex
  const lines = schemaContent.split('\n');
  let currentModel: string | null = null;
  let currentModelContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Start of model
    const modelMatch = trimmed.match(/^model\s+([A-Za-z0-9_]+)\s+\{/);
    if (modelMatch) {
      if (currentModel) {
        // Process previous model
        processModel(currentModel, currentModelContent, models);
      }
      currentModel = modelMatch[1];
      currentModelContent = [];
      continue;
    }

    // End of model (assuming '}' is on its own line or at end of block)
    if (trimmed === '}' && currentModel) {
      processModel(currentModel, currentModelContent, models);
      currentModel = null;
      currentModelContent = [];
      continue;
    }

    if (currentModel) {
      currentModelContent.push(trimmed);
    }
  }

  // Handle last model if file ends abruptly
  if (currentModel) {
    processModel(currentModel, currentModelContent, models);
  }

  const modelCount = Object.keys(models).length;
  console.log(`Found ${modelCount} models.`);

  if (modelCount === 0) {
    console.error('Error: No models found in schema.prisma');
    process.exit(1);
  }

  const fileContent = `/**
 * ⚠️ AUTO-GENERATED FILE — DO NOT EDIT
 *
 * Generated from prisma/schema.prisma.
 * Safe defaults only. Use TABLE_TO_PRISMA_MAP for overrides.
 */
export const GENERATED_ADMIN_TABLES = ${JSON.stringify(models, null, 2)} as const;
`;

  fs.writeFileSync(OUTPUT_PATH, fileContent);
  console.log(`Generated admin tables config at: ${OUTPUT_PATH}`);
}

function processModel(
  modelName: string,
  content: string[],
  models: Record<string, { prismaDelegate: string; writable: boolean }>,
) {
  // Check for @@map("table_name")
  let tableName = modelName;

  for (const line of content) {
    // Matches @@map("name") or @@map('name')
    const mapMatch = line.match(/@@map\s*\(\s*["']([^"']+)["']\s*\)/);
    if (mapMatch) {
      tableName = mapMatch[1];
      break;
    }
  }

  // Delegate is lowerCamelCase(ModelName)
  // Standard simple lowercase first char
  const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1);

  models[tableName] = {
    prismaDelegate: delegateName,
    writable: false,
  };
}

generateAdminTables();

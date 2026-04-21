# ADR-008: Dynamic GDPR Export System

## Status

**Proposed**

## Context

Currently, adding a new table to the GDPR export requires changes in 4 files:

1. `gdpr.registry.ts` - Register table
2. `gdpr-collection.types.ts` - Add type definitions
3. `gdpr-data-collector.service.ts` - Add collector method
4. `gdpr-document-builder.service.ts` - Add rendering logic

This is error-prone and doesn't scale. We want a **single-point registration** where adding a table to the registry automatically includes it in exports.

## Decision

Extend the GDPR registry to include **field-level metadata** that enables dynamic data collection and rendering.

### New Registry Schema

```typescript
export interface GdprExportFieldDef {
  /** Prisma field name */
  field: string;

  /** Human-readable label (supports i18n key or literal) */
  label: string;

  /** Explanation for the user */
  explanation: string;

  /** Field type for formatting */
  type: 'string' | 'date' | 'boolean' | 'number' | 'email' | 'masked';

  /** For 'masked' type: how many chars to show at start/end */
  maskConfig?: { showStart: number; showEnd: number };

  /** Whether to include in export (default: true) */
  include?: boolean;
}

export interface GdprExportTableDefV2 extends GdprExportTableDef {
  /**
   * Fields to include in GDPR export.
   * If not specified, table is collected but rendered generically.
   */
  exportFields?: GdprExportFieldDef[];

  /**
   * Section name for grouping in the export document.
   * Tables with same section are grouped together.
   * @example 'profile', 'notifications', 'preferences'
   */
  section?: string;

  /**
   * Section display order (lower = first).
   */
  sectionOrder?: number;

  /**
   * For nested tables: the parent table's model name.
   * Data will be fetched via relation instead of direct identityId query.
   * @example UserEmailChannel has parent: 'UserNotificationProfile'
   */
  parentModel?: string;

  /**
   * The relation path from parent to this table.
   * @example 'emailChannels' for UserNotificationProfile.emailChannels
   */
  parentRelation?: string;
}
```

### Example Registration

```typescript
// Current (manual)
{
  modelName: 'UserPushChannel',
  tableName: 'user_push_channel',
  userField: 'notificationProfileId',
  export: true,
}

// New (dynamic)
{
  modelName: 'UserPushChannel',
  tableName: 'user_push_channel',
  userField: 'notificationProfileId',
  export: true,
  section: 'preferences',
  sectionOrder: 30,
  parentModel: 'UserNotificationProfile',
  parentRelation: 'pushChannels',
  exportFields: [
    {
      field: 'platform',
      label: 'Device Platform',
      explanation: 'The type of device registered for push notifications',
      type: 'string',
    },
    {
      field: 'uniqueKey',
      label: 'Device Identifier',
      explanation: 'A unique identifier for this device',
      type: 'string',
    },
    {
      field: 'expoToken',
      label: 'Push Token',
      explanation: 'Your push notification token (masked for security)',
      type: 'masked',
      maskConfig: { showStart: 15, showEnd: 4 },
    },
    {
      field: 'isActive',
      label: 'Active',
      explanation: 'Whether push notifications are active for this device',
      type: 'boolean',
    },
    {
      field: 'createdAt',
      label: 'Registered On',
      explanation: 'When this device was registered',
      type: 'date',
    },
  ],
}
```

### Dynamic Collection Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    GDPR Registry                            │
│  (Single Source of Truth with field metadata)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Dynamic Data Collector                         │
│  - Reads registry for tables with export: true              │
│  - Builds Prisma select dynamically from exportFields       │
│  - Handles parent/child relations automatically             │
│  - Returns generic { table, records: [...] } structure      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Dynamic Document Builder                       │
│  - Groups tables by section                                 │
│  - Renders fields using type-aware formatters               │
│  - Applies masking for 'masked' type fields                 │
│  - Uses labels/explanations from registry                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              HTML Renderer (unchanged)                      │
│  - Receives semantic document structure                     │
│  - Renders to HTML with styling                             │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Extend Registry (Low Risk)

- Add new `GdprExportTableDefV2` interface
- Update existing registrations with `exportFields`
- Keep backward compatibility

### Phase 2: Dynamic Collector (Medium Risk)

- Create `GdprDynamicCollectorService`
- Build Prisma queries from registry metadata
- Handle parent/child relations
- Fallback to legacy collectors for complex cases

### Phase 3: Dynamic Document Builder (Medium Risk)

- Create `GdprDynamicDocumentBuilder`
- Generate sections from registry metadata
- Type-aware field formatters

### Phase 4: Migration (Low Risk)

- Gradually move tables to dynamic system
- Remove legacy collector methods as tables migrate

## Backward Compatibility

The new system will:

1. Support both old (`GdprExportTableDef`) and new (`GdprExportTableDefV2`) formats
2. Tables without `exportFields` fall back to legacy collectors
3. Gradual migration, no big-bang change

## Alternatives Considered

### A. Code Generation

Generate collector/builder code from registry at build time.

- Pros: Static code, easy debugging
- Cons: Build complexity, still requires regeneration

### B. Prisma Introspection

Use Prisma's DMMF to auto-discover fields.

- Pros: True single source of truth
- Cons: No control over labels/explanations

### C. Decorator-based (current approach rejected)

Annotate Prisma schema with GDPR metadata.

- Pros: Co-located with model
- Cons: Prisma schema doesn't support custom annotations

## Consequences

### Positive

- Single-point registration for new tables
- Consistent field handling across all tables
- Built-in validation (registry knows expected fields)
- Easier audit (registry is the source of truth)

### Negative

- More complex registry schema
- Learning curve for registry format
- Some edge cases may still need custom collectors

## References

- Current GDPR registry: `src/modules/gdpr/gdpr.registry.ts`
- Data collector: `src/modules/gdpr/gdpr-data-collector.service.ts`
- Document builder: `src/modules/gdpr/gdpr-document-builder.service.ts`

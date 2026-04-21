> Documentation Layer: Canonical Contract

# GDPR Export Rendering Model (Phase 3.5)

This document describes the implementation of Phase 3.5 of the GDPR system: **Export Rendering Model**.

## Overview

Phase 3.5 implements the semantic document model for GDPR exports. This phase transforms raw collected data into a human-centric, language-aware, renderer-independent structure.

**Phase 3.5 sits BETWEEN:**

- Phase 3: Data Collection (raw database queries)
- Phase 4: Export Packaging (file generation and storage)

## What Phase 3.5 Does

✅ **Semantic Document Model**

- Defines how GDPR data should be represented for humans
- Language-aware (all user-facing text is localized)
- Format-agnostic (works for HTML, JSON, PDF, etc.)
- Explicit structure (sections, entries, fields)
- Strong TypeScript types

✅ **Localization Service**

- Multi-language support (English and Spanish included)
- Field label and explanation lookup
- Section title and description lookup
- Fallback chain (requested language → English → key itself)
- Missing translation logging

✅ **Document Builder**

- Transforms GdprCollectedData into GdprExportDocument
- Deterministic section ordering
- Value formatting (dates, booleans, nulls)
- Independent section builders
- Fail-safe (missing sections are omitted)

✅ **User Language Persistence**

- Language field added to Profile model
- Non-nullable with "en" default
- Validated as ISO 639-1 code (e.g., "en", "es")
- Must be resolved from database (never from headers)
- First-class attribute for all GDPR operations

✅ **Renderer Contract**

- Abstract interface for format-specific renderers
- Phase 4 will implement HTML renderer
- Future: JSON, PDF, etc.

## What Phase 3.5 Does NOT Do

❌ Generate HTML, JSON, or other formats (renderer interface only)  
❌ Create files or buffers  
❌ Query the database (uses pre-collected data)  
❌ Upload to storage  
❌ Send notifications  
❌ Modify GDPR request lifecycle

These will be added in Phase 4.

---

## Architecture

### Data Flow

```
Phase 3 Output: GdprCollectedData
    ↓
Profile.language (from database)
    ↓
GdprDocumentBuilderService.buildDocument(data, language)
    ↓
    ├─ GdprLocalizationService (lookup labels/explanations)
    ├─ Build Identity Section (required)
    ├─ Build Profile Section (optional)
    ├─ Build Notifications Section (optional)
    └─ Build Preferences Section (optional)
    ↓
GdprExportDocument (semantic model)
    ↓
Phase 4: GdprExportRenderer.render(document) → HTML/JSON/etc.
```

### Components

```
gdpr-export-document.types.ts
  ├─ GdprExportDocument (top-level structure)
  ├─ GdprDocumentMetadata (when, who, language, version)
  ├─ GdprDocumentSection (domain-specific grouping)
  ├─ GdprDocumentEntry (logical record)
  ├─ GdprDocumentField (field / value / explanation)
  └─ GdprExportRenderer<T> (renderer contract)

gdpr-localization.service.ts
  ├─ getText(key, language) → localized string
  ├─ getFieldLabel(fieldKey, language) → localized label
  ├─ getFieldExplanation(fieldKey, language) → localized explanation
  ├─ getSectionTitle(sectionId, language) → localized title
  ├─ formatBoolean(value, language) → "Yes"/"No"
  └─ formatNullable(value, language) → value or "N/A"

gdpr-document-builder.service.ts
  ├─ buildDocument(collectedData, language) → GdprExportDocument
  ├─ buildIdentitySection() → section with identity fields
  ├─ buildProfileSection() → section with profile fields (or null)
  ├─ buildNotificationsSection() → section with notification entries (or null)
  └─ buildNotificationPreferencesSection() → section with preferences (or null)

prisma/schema.prisma (Profile model)
  └─ language: String @default("en") (ISO 639-1 code)
```

---

## Files Added/Modified

### Type Definitions (New)

**[gdpr-export-document.types.ts](../src/modules/gdpr/gdpr-export-document.types.ts)**

- Complete semantic document model
- 400+ lines of comprehensive type definitions
- GdprExportDocument, GdprDocumentSection, GdprDocumentEntry, GdprDocumentField
- Renderer contract (GdprExportRenderer<T>)
- Language and localization types
- Builder types and options

### Localization Service (New)

**[gdpr-localization.service.ts](../src/modules/gdpr/gdpr-localization.service.ts)**

- Multi-language text dictionary (English and Spanish)
- Fallback chain for missing translations
- Field label and explanation lookup
- Section title and description lookup
- Boolean and nullable value formatting
- 500+ lines with complete translations

### Document Builder Service (New)

**[gdpr-document-builder.service.ts](../src/modules/gdpr/gdpr-document-builder.service.ts)**

- Main entry point: `buildDocument(collectedData, language)`
- Section builders for each data domain
- Value formatting (dates, booleans, nulls)
- Deterministic section ordering
- 400+ lines with extension patterns

### Profile Model (Modified)

**[prisma/schema.prisma](../prisma/schema.prisma)**

- Added `language: String @default("en")` field to Profile
- Non-nullable with safe default
- ISO 639-1 locale code (e.g., "en", "es")
- Must be resolved from database, never from request headers

**Migration: [20260103100223_add_language_to_profile](../prisma/migrations/20260103100223_add_language_to_profile/migration.sql)**

- Adds `language` column to `profiles` table
- Default value: "en"

### Profile DTOs (Modified)

**[create-profile.dto.ts](../src/modules/profiles/v1/dto/create-profile.dto.ts)**

- Added optional `language?: string` field
- Validates ISO 639-1 format (`/^[a-z]{2}$/`)
- Defaults to "en" in repository if not provided

**[profile-response.dto.ts](../src/modules/profiles/v1/dto/profile-response.dto.ts)**

- Added `language!: string` field to response
- Updated `fromEntity()` to include language
- Public API now exposes user's preferred language

### Profile Service (Modified)

**[profiles.repository.ts](../src/modules/profiles/profiles.repository.ts)**

- Updated `create()` to accept optional `language` parameter
- Updated `upsert()` to accept optional `language` parameter
- Defaults to "en" if not provided

**[profiles.service.ts](../src/modules/profiles/profiles.service.ts)**

- Updated `createMyProfile()` to pass language to repository
- Language flows from DTO → service → repository → database

### GDPR Collection Types (Modified)

**[gdpr-collection.types.ts](../src/modules/gdpr/gdpr-collection.types.ts)**

- Added `language?: string` to `GdprProfileData` interface
- Available to Phase 3.5 for document building

**[gdpr-data-collector.service.ts](../src/modules/gdpr/gdpr-data-collector.service.ts)**

- Updated `collectProfile()` to select `language` field
- Returns language in GdprProfileData

### Module Registration (Modified)

**[gdpr.module.ts](../src/modules/gdpr/gdpr.module.ts)**

- Added `GdprLocalizationService` to providers and exports
- Added `GdprDocumentBuilderService` to providers and exports
- Updated module documentation to reference Phase 3.5

**[index.ts](../src/modules/gdpr/index.ts)**

- Exported all Phase 3.5 types
- Exported GdprLocalizationService
- Exported GdprDocumentBuilderService

---

## Semantic Document Model

### Document Structure

```typescript
{
  metadata: {
    generatedAt: Date;          // When document was built
    identityId: string;         // For whom
    language: "en";             // User's preferred language
    schemaVersion: "1.0.0";     // For future compatibility
  },
  sections: [
    {
      id: "identity",           // Stable section key
      title: "Your Identity",   // Localized title
      description: "...",       // Localized description
      entries: [
        {
          fields: [
            {
              key: "identityId",
              label: "Internal Identity ID",        // Localized
              value: "uuid-...",
              explanation: "This is your unique..." // Localized
            },
            // ... more fields
          ]
        }
      ]
    },
    // ... more sections
  ]
}
```

### Section Ordering

Sections are deterministically ordered for consistent user experience:

1. **Identity** (who you are) - Always present
2. **Profile** (your public info) - Optional
3. **Notifications** (what we've sent you) - Optional
4. **Notification Preferences** (your settings) - Optional

Empty sections are omitted (null check).

### Field Structure

Each field follows the "Field / Value / Explanation" pattern:

```typescript
{
  key: "displayName",                         // Stable key (never shown to user)
  label: "Display Name",                      // Localized label (what is this?)
  value: "John Doe",                          // Formatted value (the actual data)
  explanation: "This is the name you chose..." // Localized explanation (why do we have this?)
}
```

This directly supports GDPR's transparency requirement: users must understand WHY each piece of data exists.

---

## Language System

### Language Resolution

**Language MUST be resolved from the database, NEVER from request headers.**

```typescript
// ✅ CORRECT: Database-driven
const profile = await profilesRepository.findByIdentityId(identityId);
const language = profile?.language ?? 'en';
const document = await documentBuilder.buildDocument(collectedData, language);

// ❌ WRONG: Request-driven
const language = req.headers['accept-language']; // NEVER DO THIS
```

### Supported Languages

Currently supported:

- `en` - English (default)
- `es` - Spanish

To add a new language:

1. Add language code to `supportedLanguages` in GdprLocalizationService
2. Add translations to `textDictionaries`
3. Ensure all keys have translations

### Fallback Chain

1. Try requested language (e.g., "es")
2. Try default language ("en")
3. Return key itself (makes missing translations obvious)

Missing translations are logged as warnings (not errors).

### Localization Keys

Convention:

- Field labels: `field.<fieldKey>.label`
- Field explanations: `field.<fieldKey>.explanation`
- Section titles: `section.<sectionId>.title`
- Section descriptions: `section.<sectionId>.description`
- Common text: `common.<key>`

Example:

```typescript
localization.getFieldLabel('displayName', 'en');
// Returns: "Display Name"

localization.getFieldExplanation('displayName', 'es');
// Returns: "Este es el nombre que elegiste..."
```

---

## Usage

### Building a Document

```typescript
import { GdprDocumentBuilderService } from './modules/gdpr';

// In a service
async function buildExportDocument(identityId: string) {
  // 1. Collect data (Phase 3)
  const { data, summary } = await orchestrator.collectUserData(identityId);

  // 2. Resolve user language from database
  const profile = await profilesRepository.findByIdentityId(identityId);
  const language = profile?.language ?? 'en';

  // 3. Build semantic document (Phase 3.5)
  const document = await documentBuilder.buildDocument(data, language);

  // document is now ready for rendering (Phase 4)
  return document;
}
```

### Future: Rendering (Phase 4)

```typescript
// Phase 4 will implement this
class HtmlExportRenderer implements GdprExportRenderer<string> {
  render(document: GdprExportDocument): string {
    // Transform semantic document into HTML
    const html = `
      <html>
        <h1>${document.metadata.identityId}</h1>
        ${document.sections.map((s) => this.renderSection(s)).join('')}
      </html>
    `;
    return html;
  }
}

// Usage
const document = await documentBuilder.buildDocument(data, language);
const htmlRenderer = new HtmlExportRenderer();
const html = htmlRenderer.render(document);
```

---

## Extension Pattern

### Adding a New Data Domain

To add a new section (e.g., "Orders"):

#### 1. Add to Collection Types

```typescript
// In gdpr-collection.types.ts
export interface GdprOrderData {
  totalOrders: number;
  orders: GdprOrderRecord[];
}

export interface GdprCollectedData {
  // ...existing properties
  orders: GdprOrderData;
}
```

#### 2. Add Translations

```typescript
// In gdpr-localization.service.ts
textDictionaries = {
  en: {
    // ...existing translations
    'section.orders.title': 'Your Orders',
    'section.orders.description': 'This section contains your purchase history.',
    'field.orderId.label': 'Order ID',
    'field.orderId.explanation': 'Unique identifier for this order.',
    'field.orderAmount.label': 'Amount',
    'field.orderAmount.explanation': 'Total amount paid for this order.',
  },
  es: {
    // ...Spanish translations
  },
};
```

#### 3. Add Section Builder

```typescript
// In gdpr-document-builder.service.ts
private buildOrdersSection(
  orders: GdprOrderData,
  language: LanguageCode,
): GdprDocumentSection | null {
  if (orders.totalOrders === 0) {
    return null;
  }

  const entries: GdprDocumentEntry[] = orders.orders.map(order => {
    const fields: GdprDocumentField[] = [
      {
        key: 'orderId',
        label: this.localization.getFieldLabel('orderId', language),
        value: order.id,
        explanation: this.localization.getFieldExplanation('orderId', language),
      },
      {
        key: 'orderAmount',
        label: this.localization.getFieldLabel('orderAmount', language),
        value: order.amount.toString(),
        explanation: this.localization.getFieldExplanation('orderAmount', language),
      },
    ];

    return { id: order.id, fields };
  });

  return {
    id: 'orders',
    title: this.localization.getSectionTitle('orders', language),
    description: this.localization.getSectionDescription('orders', language),
    summary: `Total orders: ${orders.totalOrders}`,
    entries,
  };
}
```

#### 4. Add to Section List

```typescript
// In gdpr-document-builder.service.ts
private buildAllSections(data: GdprCollectedData, language: LanguageCode) {
  return [
    this.buildIdentitySection(data.identity, language),
    this.buildProfileSection(data.profile, language),
    this.buildNotificationsSection(data.notifications, language),
    this.buildNotificationPreferencesSection(data.notificationPreferences, language),
    this.buildOrdersSection(data.orders, language), // NEW
  ];
}
```

---

## Design Principles

### 1. Semantic Over Visual

This layer defines WHAT to show, not HOW to show it.

- ✅ `{ key: "displayName", label: "Display Name", value: "John" }`
- ❌ `<div class="field"><strong>Display Name:</strong> John</div>`

HTML/CSS happens in Phase 4 (renderers).

### 2. Language-Aware Throughout

All user-facing text comes from localization service.

- ✅ `localization.getFieldLabel('displayName', language)`
- ❌ `"Display Name"` (hardcoded string)

### 3. Database-Driven Language

Language is a first-class persisted attribute, not runtime inference.

- ✅ `profile.language` (from database)
- ❌ `req.headers['accept-language']` (from request)

### 4. Explicit Structure

Sections and fields are explicitly declared, not dynamically generated.

- ✅ Individual section builder methods
- ❌ Dynamic field introspection or table scanning

### 5. Deterministic and Auditable

Same input always produces same output.

- ✅ Fixed section ordering
- ✅ Reproducible field values
- ✅ Logged missing translations

### 6. Fail-Safe

Missing data doesn't break the entire document.

- ✅ Optional sections return null (omitted)
- ✅ Null values formatted as "N/A"
- ✅ Missing translations fall back to English

---

## Repository Compliance

✅ **Identity-First Pattern**

- Document metadata includes identityId
- Language resolved through Identity → Profile chain

✅ **Explicit Documentation**

- 1300+ lines of inline documentation across services
- Every design decision explained
- Clear extension patterns

✅ **Boring, Stable Solutions**

- Hardcoded translations (simple, explicit)
- Sequential section building (predictable)
- No external dependencies
- Standard TypeScript patterns

✅ **Template-Neutral**

- Works for any GDPR-compliant application
- Easy to extend with new sections
- No product-specific logic

✅ **Type Safety**

- Complete TypeScript coverage
- Strong typing for all structures
- Compile-time safety

✅ **No Magic**

- No dynamic code generation
- No hidden behavior
- Everything is discoverable in code

---

## Testing Checklist

### ✅ Language Persistence

- [ ] Create profile with language="es"
- [ ] Verify language saved to database
- [ ] Verify Profile response includes language
- [ ] Verify validation rejects invalid codes (e.g., "english")
- [ ] Verify default language="en" when not provided

### ✅ Localization Service

- [ ] Get text in supported language (e.g., "es")
- [ ] Get text in unsupported language (falls back to "en")
- [ ] Get missing key (returns key itself)
- [ ] Format boolean: true → "Yes"/"Sí"
- [ ] Format nullable: null → "N/A"/"N/D"
- [ ] Get field label: "displayName" → "Display Name"/"Nombre para Mostrar"

### ✅ Document Builder

- [ ] Build document with English language
- [ ] Build document with Spanish language
- [ ] Verify all sections present (identity, profile, notifications, preferences)
- [ ] Verify missing profile section omitted (profile=null)
- [ ] Verify empty notifications section omitted (count=0)
- [ ] Verify metadata includes language and identityId
- [ ] Verify deterministic section ordering

### ✅ End-to-End Flow

- [ ] Collect data (Phase 3)
- [ ] Resolve language from profile
- [ ] Build semantic document (Phase 3.5)
- [ ] Verify document structure matches types
- [ ] Verify all user-facing text is localized

---

## Integration Points

### Current Integration

```
GdprModule
  ├─ GdprDataCollectorService (Phase 3)
  ├─ GdprDataOrchestratorService (Phase 3)
  ├─ GdprLocalizationService (Phase 3.5) ← NEW
  ├─ GdprDocumentBuilderService (Phase 3.5) ← NEW
  └─ GdprRequestProcessorService (Phase 2)
```

### Future Integration (Phase 4)

```
GdprRequestProcessorService
    ↓
GdprDataOrchestratorService.collectUserData() (Phase 3)
    ↓
GdprDocumentBuilderService.buildDocument() (Phase 3.5)
    ↓
HtmlExportRenderer.render() (Phase 4) ← NEXT
    ↓
GdprStorageService.upload() (Phase 4) ← NEXT
    ↓
GdprNotificationService.notify() (Phase 4) ← NEXT
```

---

## Mental Model

**Phase 3 collected the truth** (raw database data)  
**Phase 3.5 defines how truth is explained to humans** (semantic structure + language)  
**Phase 4 will decide how it's packaged** (HTML/JSON files)  
**Phase 5 will decide how it's delivered** (storage + notifications)

This separation ensures:

- Data collection is independent from presentation
- Language is a first-class concern
- Renderers can be swapped without changing data logic
- GDPR transparency requirements are met (explanations!)

---

## Summary

Phase 3.5 implements the **semantic export document model**:

- User language is a first-class persisted attribute
- Complete multi-language localization system (English + Spanish)
- Document builder transforms raw data into human-centric structure
- Renderer contract defined (implementation in Phase 4)
- Format-agnostic (works for HTML, JSON, PDF, etc.)
- All GDPR data is explainable (field explanations)

The infrastructure is now ready for Phase 4 (export rendering and packaging).

**If humans cannot understand their data, the export is not GDPR-compliant.**

Phase 3.5 ensures they can. ✅


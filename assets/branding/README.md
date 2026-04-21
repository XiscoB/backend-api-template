# Branding Assets

## Logo

Place your company logo here as `logo.png`.

**Requirements:**

- Format: PNG
- Recommended size: 48x48 pixels (or higher, will be scaled)
- Transparency supported

**Usage:**

- Logo is embedded in GDPR exports as base64
- If file doesn't exist, only company name displays
- No fallback to SVG - intentionally minimal

## Company Name

Configured in: `src/modules/gdpr/gdpr-document-builder.service.ts`

```typescript
const BRANDING = {
  companyName: 'Template-base',
  logoPath: 'assets/branding/logo.png',
};
```

Change "Template-base" to your company name.

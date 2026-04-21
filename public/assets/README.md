# Assets Directory

## Company Logo

To replace the default logo in GDPR exports:

1. Place your company logo here as `logo.png`
2. Recommended size: 48x48 pixels (or higher resolution, will be scaled)
3. Format: PNG with transparency preferred
4. The logo will be embedded as base64 in HTML exports

**Current state**: Using a placeholder SVG logo in the HTML renderer. When you add `logo.png` here, update the renderer to use it.

## Logo Integration (Future)

When ready to use a real logo file:

1. Place `logo.png` in this directory
2. Update `src/modules/gdpr/gdpr-html-renderer.service.ts`:
   - Read the logo file as base64
   - Replace the placeholder SVG in `buildHeader()` with:
     ```html
     <img class="company-logo" src="data:image/png;base64,{base64Data}" alt="{companyName}" />
     ```

## Company Name

The company name is configurable in `src/modules/gdpr/gdpr-localization.service.ts`:

- English: `'branding.companyName': 'Template-base'`
- Spanish: `'branding.companyName': 'Template-base'`

Change "Template-base" to your company name in both language dictionaries.

> Documentation Layer: Operational Guide

# Email System Setup Guide

This backend template comes with a built-in, provider-agnostic email system. It supports transactional emails (verification, notifications) and includes a responsive HTML layout engine.

## 🚀 Quick Start

By default, the system runs in **Console Mode** (logs emails to terminal instead of sending them). This is effectively a "dry run" mode perfectly safe for local development.

To start sending real emails, you need to configure a provider in `.env`.

---

## 📅 Configuration Reference

### 1. Essential Settings

| Variable                  | Description                                   | Default               | Required? |
| ------------------------- | --------------------------------------------- | --------------------- | --------- |
| `EMAIL_PROVIDER`          | `sparkpost`, `ses`, or `console`              | `console`             | Yes       |
| `EMAIL_ENABLED`           | Global kill-switch for all emails             | `true`                | Yes       |
| `EMAIL_DEFAULT_FROM`      | Sender address (MUST be verified by provider) | `noreply@example.com` | **Yes**   |
| `EMAIL_DEFAULT_FROM_NAME` | Sender name shown in inbox                    | `My App`              | No        |

### 2. Branding (Layout System)

Customize the look and feel without touching code:

| Variable                  | Description                                       | Example                     |
| ------------------------- | ------------------------------------------------- | --------------------------- |
| `EMAIL_PRODUCT_NAME`      | App name in header/footer (defaults to From Name) | `Acme Corp`                 |
| `EMAIL_PRODUCT_LOGO_URL`  | URL to your logo (Header)                         | `https://acme.com/logo.png` |
| `EMAIL_SUPPORT_EMAIL`     | Contact email shown in footer                     | `help@acme.com`             |
| `EMAIL_ALLOW_USER_EMAILS` | Toggle user-facing emails (keep system emails on) | `true`                      |

---

## 🔌 Provider Setup

### Option A: SparkPost (Recommended)

1.  Get your API Key from [SparkPost](https://app.sparkpost.com/).
2.  **Verify your sending domain** in SparkPost settings.
3.  Update `.env`:

```properties
EMAIL_PROVIDER=sparkpost
SPARKPOST_API_KEY=your_api_key_here
# EMAIL_DEFAULT_FROM=noreply@your-verified-domain.com
```

### Option B: Amazon SES

1.  Create an IAM user with `ses:SendEmail` and `ses:SendRawEmail` permissions.
2.  **Verify your sending domain/email** in AWS Console.
3.  Update `.env`:

```properties
EMAIL_PROVIDER=ses
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
# EMAIL_DEFAULT_FROM=noreply@your-verified-domain.com
```

### Option C: Console (Development)

Logs full email content to the terminal. Great for testing templates without spamming yourself.

```properties
EMAIL_PROVIDER=console
```

---

## 📧 Application Layer (Usage)

The `EmailNotificationService` is your main entry point for sending emails. API is safe (never crashes on failure) and handles permissions automatically.

```typescript
// Example Usage
constructor(private emailService: EmailNotificationService) {}

async register() {
  // ... logic ...
  await this.emailService.sendVerificationEmail(user.email, link);
}
```

### Adding New Templates

1.  Open `src/infrastructure/email/templates/locales/en.json`.
2.  Add a new key with `subject`, `html`, and `text`.
    - **Note**: Use HTML **fragments only** (e.g., `<h1>Title</h1><p>Body</p>`). Do NOT include `<html>`, `<body>`, or styles. The system automatically wraps your content in the branded layout.

---

## ❓ Troubleshooting

**Q: Emails are returning "Rejected" status.**

- Check if your `EMAIL_DEFAULT_FROM` domain is **verified** in your provider's dashboard.
- Check if you are in a "Sandbox" mode (e.g., AWS SES Sandbox) which limits sending only to verified addresses.

**Q: Emails look unstyled.**

- The system inlines CSS automatically. Ensure you are not using complex CSS selectors that `juice` (the inliner) cannot handle. Use simple classes or inline styles where possible.


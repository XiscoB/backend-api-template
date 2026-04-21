> Documentation Layer: Canonical Contract

# Admin Visibility vs Database Schema

## Summary

The admin visibility architecture explicitly separates the database schema from the administrative interface. While the database schema defines the physical storage structure, the Admin Visibility model serves as a curated view, defining which resources are accessible to administrators. This separation ensures that the admin console remains a focused operational tool rather than a raw database viewer.

## Database Table Inventory (18 Tables)

There are exactly 18 database tables in the current schema:

1. `identities`
2. `profiles`
3. `gdpr_requests`
4. `gdpr_export_files`
5. `gdpr_audit_logs`
6. `notification_logs`
7. `scheduled_notifications`
8. `user_notification_profile`
9. `user_email_channel`
10. `user_push_channel`
11. `account_suspensions`
12. `suspension_backups`
13. `notification_delivery_log`
14. `scheduler_locks`
15. `gdpr_deletion_emails`
16. `deletion_legal_holds`
17. `internal_logs`
18. `reports`

## Admin Visibility Model

Admin visibility is curated by design. The system does not automatically expose all database tables to the admin console. Instead, visibility is opt-in, requiring explicit definition of resources. This allows for a tailored administrative experience that prioritizes relevant business entities over technical implementation details.

## Merge Behavior (Generated vs Curated)

The system maintains a `GENERATED_ADMIN_TABLES` list, which is a schema-derived baseline. This list serves as a reference for available entities but **does not imply admin exposure**.

When reconciling the schema with the admin configuration, resources that appear in the schema but are missing from the configuration are classified as **"present in generated tables, intentionally not curated"**.

## Mismatch Explanation (Intentional)

Discrepancies between the database schema and the admin visibility configuration are intentional. Not all technical tables (e.g., `scheduler_locks`, `gdpr_deletion_emails`) require administrative oversight. These mismatches reflect architectural decisions to hide ephemeral or purely technical data.

## Startup Validation Guarantees

Startup validation exists but does not enforce full schema coverage. The system verifies that explicitly configured admin resources exist in the database, ensuring that the admin console does not reference invalid tables. However, it does not require that all database tables be exposed to the admin console.

## Explicit Non-Guarantees

- The system does **not** guarantee that every database table is visible in the admin console.
- The system does **not** automatically expose new schema additions to the admin console.

## Design Rationale

This architecture prioritizes safety and intent over automation. By requiring explicit curation, we prevent the accidental exposure of sensitive or purely technical data. It ensures that the admin console acts as a secure and focused interface for business operations.


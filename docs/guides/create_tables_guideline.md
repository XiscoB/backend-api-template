> Documentation Layer: Operational Guide

# Database Table Creation Guidelines

This document defines **how database tables must be designed** in this repository.

---

## 1. Identity Ownership (MANDATORY)

- All person-owned data MUST reference `Identity`
- JWT `sub` or `externalUserId` must NOT appear in domain tables

```prisma
identityId String
identity   Identity @relation(fields: [identityId], references: [id])
```

---

## 2. External Identifiers

- External identifiers are boundary-only concepts
- Allowed in controllers, services, DTOs
- Forbidden in persistence layers (except Identity)

---

## 3. Required Columns

All tables MUST include:

```prisma
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

Optional:

- deletedAt
- anonymizedAt

---

## 4. Foreign Key Naming

- Internal relations: `<table>Id`
- Never use `fk_user` or auth-derived names

---

## 5. Policy & GDPR State

Policy flags live ONLY on Identity:

- anonymized
- isSuspended
- isFlagged

Domain tables must not duplicate these.

---

## 6. GDPR & Deletion Strategy

Design so that:

- Identity deletion can cascade
- Anonymization is centralized
- Orphans are impossible

---

## 7. Enums

- Enums represent persisted state
- Must be supersets of DB values
- Removal requires explicit approval

---

## 8. Reset Safety

All tables must support:

```bash
npm run docker:reset
```

Failure = invalid design.

---

## 9. Forbidden Patterns

❌ Raw externalUserId in tables  
❌ FK to auth provider concepts  
❌ Profile owning policy  
❌ Magic cascades

---

## 10. Checklist

Before adding a table:

- Who owns this data?
- Does it belong to Identity?
- Can it be anonymized safely?


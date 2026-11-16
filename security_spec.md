# Security Specification: Update Harian Outlet (Multi-Role RBAC)

## 1. Data Invariants

1. **Verified Identity Required**: Every read and write requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Account Governance (No Self-Escalation)**: Only `isAdmin()` (bootstrapped owner `nelayanca03@gmail.com` or active account with `role == 'admin'`) may create, update, or delete `/accounts/{accountId}` and `/adminRegistry/accounts`. Users cannot register themselves or elevate their own `role` or `active` status.
3. **PII Isolation**: `/accounts/{accountId}` contains email addresses and can only be read (`get`) by the account owner (matching verified email) or `isAdmin()`. `allow list` is disabled on `/accounts` and `/adminRegistry`.
4. **Role-Scoped Operational Access**: Only `isAdmin()` or an active user whose `/accounts/{emailDocId}.role == roleId` may access `/roleConfigs/{roleId}` and `/roleWorkspaces/{roleId}`.
5. **Admin-Only Configuration**: Only `isAdmin()` may create or modify tasks, outlets, PIC assignments, or period settings in `/roleConfigs/{roleId}`.
6. **Immutable Ownership & Server Timestamps**: `createdAt`, `createdBy`, `email`, and `roleId` are immutable after creation. All `createdAt` / `updatedAt` fields must equal `request.time`, and `updatedBy` / `createdBy` must equal `request.auth.uid`.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Unverified Email Spoof**: User with `email_verified: false` and `email: 'nelayanca03@gmail.com'` attempts `get` on `/adminRegistry/accounts` -> `PERMISSION_DENIED`.
2. **Self-Registration Escalation**: Non-admin user attempts `create` on `/accounts/hacker_at_gmail_dot_com` with `role: 'admin'` -> `PERMISSION_DENIED`.
3. **Self-Role Promotion**: Active `stock_accounting` user attempts `update` on own `/accounts/{id}` changing `role` to `'admin'` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Admin attempts `update` on `/roleWorkspaces/stock_accounting` with extra ghost field `isVerified: true` -> `PERMISSION_DENIED`.
5. **Cross-Role Read**: Active `gl` user attempts `get` on `/roleWorkspaces/stock_accounting` -> `PERMISSION_DENIED`.
6. **Cross-Role Write**: Active `accounting` user attempts `update` on `/roleWorkspaces/gl` -> `PERMISSION_DENIED`.
7. **Non-Admin Task Mutation**: Active `stock_accounting` user attempts `update` on `/roleConfigs/stock_accounting` to add/remove tasks or outlets -> `PERMISSION_DENIED`.
8. **Blanket Account Scraping**: Non-admin user attempts `list` on `/accounts` -> `PERMISSION_DENIED`.
9. **Other User PII Get**: Active `stock_accounting` user attempts `get` on `/accounts/otheruser_at_gmail_dot_com` -> `PERMISSION_DENIED`.
10. **Deactivated Account Access**: User with `active: false` in `/accounts/{id}` attempts `get` or `update` on `/roleWorkspaces/stock_accounting` -> `PERMISSION_DENIED`.
11. **Client Timestamp Tampering**: Authorized user attempts `update` on `/roleWorkspaces/stock_accounting` with backdated `updatedAt` (`!= request.time`) -> `PERMISSION_DENIED`.
12. **ID Poisoning / Oversized Payload**: Attempt `get` or `create` on `/accounts/invalid$id!` or with `name` > 80 chars -> `PERMISSION_DENIED`.

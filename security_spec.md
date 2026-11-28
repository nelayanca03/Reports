# Security Specification: Update Harian Outlet (Multi-Role RBAC)

## 1. Data Invariants

1. **Verified Identity Required**: Every read and write requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Account Governance (No Self-Escalation)**: Only `isAdmin()` (bootstrapped owner `nelayanca03@gmail.com` or active account with `role == 'admin'`) may create, update, or delete `/accounts/{accountId}` and `/adminRegistry/{registryId}` (`accounts` and `resetSecurity`). Users cannot register themselves or elevate their own `role` or `active` status.
3. **PII Isolation**: `/accounts/{accountId}` contains email addresses and can only be read (`get`) by the account owner (matching verified email) or `isAdmin()`. `allow list` is disabled on `/accounts`, `/adminRegistry`, `/roleConfigs`, `/roleWorkspaces`, `/roleMonthlyWorkspaces`, and `/recordCounters`.
4. **Role-Scoped Operational Access**: Only `isAdmin()` or an active user whose `/accounts/{emailDocId}.role == roleId` (`hasRoleAccess(roleId)`) may read (`get`) `/roleConfigs/{roleId}`, `/roleWorkspaces/{roleId}`, and `/roleMonthlyWorkspaces/{roleId}_{monthKey}`.
5. **Server-Side Outlet Ownership & Past-Day Lock**: Non-admin PICs writing to `/roleWorkspaces/{roleId}` or `/roleMonthlyWorkspaces/{workspaceMonthId}` may only mutate outlets listed under `roleConfigs/{roleId}.outletsByPic[picUpper]`. First-time fills of unfilled past days (`addedKeys()`) are permitted, whereas modifying (`changedKeys()`) or deleting (`removedKeys()`) existing entries is strictly restricted to today's WIB task keys (`currentWibDateKey()`), preventing overwrites of already-filled past days.
6. **Admin-Only Configuration & Shared Calendar Media**: Only `isAdmin()` may create or modify tasks, outlets, PIC assignments, or period settings in `/roleConfigs/{roleId}`. Shared calendar banners in `/calendarMedia/{mediaId}` can be read by any active account (`hasActiveAccount()`) and created/updated/deleted strictly by `isAdmin()`.
7. **Calendar Assignments, Personal Reminders & Atomic Audit Logs**: `/calendarEvents/{eventId}` is readable by `isAdmin()`, the assigned PIC (`assignedPicUpper` or `assignedEmail`), members of the assigned division (`assignedDivision == role`), or roles in `visibleTo` for general events; non-admin assignees can submit a non-future `returnTime` or `cancelled` status once. `/personalReminders/{reminderId}` is strictly private to `createdBy == request.auth.uid`. `/inputLogs/{logId}` is append-only (no client update/delete) and readable only by `isAdmin()`.
8. **Immutable Ownership & Server Timestamps**: `createdAt`, `createdBy`, `email`, and `roleId` are immutable after creation. All `createdAt` / `updatedAt` fields must equal `request.time`, and `updatedBy` / `createdBy` must equal `request.auth.uid`.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Unverified Email Spoof**: User with `email_verified: false` and `email: 'nelayanca03@gmail.com'` attempts `get` on `/adminRegistry/accounts` -> `PERMISSION_DENIED`.
2. **Self-Registration Escalation**: Non-admin user attempts `create` on `/accounts/hacker_at_gmail_dot_com` with `role: 'admin'` -> `PERMISSION_DENIED`.
3. **Self-Role Promotion**: Active `stock_accounting` user attempts `update` on own `/accounts/{id}` changing `role` to `'admin'` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Admin attempts `update` on `/roleWorkspaces/stock_accounting` with extra ghost field `isVerified: true` -> `PERMISSION_DENIED`.
5. **Cross-Role Read**: Active `gl` user attempts `get` on `/roleConfigs/stock_accounting`, `/roleWorkspaces/stock_accounting`, or `/roleMonthlyWorkspaces/stock_accounting_{month}` -> `PERMISSION_DENIED`.
6. **Cross-Role Write**: Active `accounting` user attempts `update` on `/roleWorkspaces/gl` -> `PERMISSION_DENIED`.
7. **Non-Admin Task Mutation**: Active `stock_accounting` user attempts `update` on `/roleConfigs/stock_accounting` to add/remove tasks or outlets -> `PERMISSION_DENIED`.
8. **Blanket Account Scraping**: Non-admin user attempts `list` on `/accounts` -> `PERMISSION_DENIED`.
9. **Other User PII Get**: Active `stock_accounting` user attempts `get` on `/accounts/otheruser_at_gmail_dot_com` -> `PERMISSION_DENIED`.
10. **Deactivated Account Access**: User with `active: false` in `/accounts/{id}` attempts `get` or `update` on `/roleWorkspaces/stock_accounting` -> `PERMISSION_DENIED`.
11. **Client Timestamp Tampering**: Authorized user attempts `update` on `/roleWorkspaces/stock_accounting` with backdated `updatedAt` (`!= request.time`) -> `PERMISSION_DENIED`.
12. **ID Poisoning / Oversized Payload**: Attempt `get` or `create` on `/accounts/invalid$id!` or with `name` > 80 chars -> `PERMISSION_DENIED`.

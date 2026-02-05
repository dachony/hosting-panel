# Changelog - 2026-02-04

## Nove funkcionalnosti

### Password Reset (Self-Service)
- Forgot Password stranica (`/forgot-password`)
- Reset Password stranica (`/reset-password`)
- Token važi 1 sat
- Email sa reset linkom

### Audit Log (`/audit`)
- Praćenje svih korisničkih akcija
- Filtriranje po: entity type, action, user, date range
- Prikaz JSON diff za izmene
- Paginacija

### Email Log (`/emails`)
- Integracija sa MailHog
- Pretraga emailova
- Preview sadržaja
- Brisanje svih emailova
- Auto-refresh 30s

### System Status (`/system`)
- CPU monitoring (usage, cores, load)
- Memorija (total/used/free)
- Disk (total/used/free)
- Database statistika
- System info i uptime
- Auto-refresh 10s

### Test Email funkcionalnost
- Save dugme za Test Email u SMTP settings
- Test Email se čuva u bazi i učitava automatski
- Test dugmad za notifikacije i template

## Izmene

### Sidebar
- Company logo iz Owner settings
- "Hosting Panel" tekst ispod loga
- Kompaktniji frejm

### Settings Page
- Packages tab dodat (prebačen iz zasebne stranice)
- Uklonjena "both" opcija iz notification recipient type

### ClientsPage
- Technical Contact "Same as Primary" checkbox
- Uklonjena "Additional Emails" sekcija

### Docker
- Auto-migrate pri startu kontejnera

## Bug Fixes

- Fix: Dupli email pri testu notifikacije (uklonjen višak sendTestEmail poziv)

## Fajlovi

### Novi
- `frontend/src/pages/ForgotPasswordPage.tsx`
- `frontend/src/pages/ResetPasswordPage.tsx`
- `frontend/src/pages/AuditLogPage.tsx`
- `frontend/src/pages/EmailLogPage.tsx`
- `frontend/src/pages/SystemStatusPage.tsx`
- `backend/src/routes/audit.ts`
- `backend/src/routes/system.ts`
- `backend/src/services/audit.ts`
- `backend/src/db/migrations/0004_update_notification_settings.sql`
- `backend/src/db/migrations/0005_add_password_reset_tokens.sql`
- `backend/src/db/migrations/0006_add_audit_logs.sql`

### Izmenjeni
- `frontend/src/App.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/ClientsPage.tsx`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/components/Layout/Sidebar.tsx`
- `frontend/src/components/Layout/Header.tsx`
- `backend/src/index.ts`
- `backend/src/db/schema.ts`
- `backend/src/db/migrate.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/clients.ts`
- `backend/src/routes/notifications.ts`
- `backend/src/routes/templates.ts`
- `docker-compose.yml`

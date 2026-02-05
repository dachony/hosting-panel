# Hosting Panel

A comprehensive web application for managing domains, web hosting, and mail hosting services. Features an admin panel with automated notifications, expiry tracking, reporting, and a full role-based access control system.

## Tech Stack

### Backend
- **[Hono](https://hono.dev/)** - Lightweight, high-performance web framework
- **[Drizzle ORM](https://orm.drizzle.team/)** - Type-safe TypeScript ORM
- **[SQLite](https://www.sqlite.org/)** (via better-sqlite3) - Embedded database
- **[JWT](https://jwt.io/)** (jsonwebtoken) - Token-based authentication
- **[Nodemailer](https://nodemailer.com/)** - Email sending
- **[node-cron](https://github.com/node-cron/node-cron)** - Task scheduling
- **[Zod](https://zod.dev/)** - Input validation
- **[otplib](https://github.com/yeojz/otplib)** - TOTP-based 2FA
- **[bcryptjs](https://github.com/dcodeIO/bcrypt.js)** - Password hashing

### Frontend
- **[React 18](https://react.dev/)** + **[Vite 5](https://vitejs.dev/)** - UI framework & build tool
- **[TailwindCSS](https://tailwindcss.com/)** - Utility-first CSS (Dark/Light theme)
- **[TanStack Query](https://tanstack.com/query)** - Server state management & data fetching
- **[React Router v6](https://reactrouter.com/)** - Client-side routing
- **[react-i18next](https://react.i18next.com/)** - Internationalization (Serbian / English)
- **[React Hook Form](https://react-hook-form.com/)** + **Zod** - Form handling & validation
- **[Lucide React](https://lucide.dev/)** - Icon library
- **[react-hot-toast](https://react-hot-toast.com/)** - Toast notifications

## Quick Start

### With Docker (recommended)

```bash
docker-compose up --build
```

Services:
| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8080 |
| MailHog UI | http://localhost:8025 |

The backend automatically runs database migrations on startup.

### Without Docker

#### Backend

```bash
cd backend
npm install
npm run db:migrate
npm run db:seed       # Seeds default admin user
npm run dev           # Starts dev server with hot-reload on port 8080
```

#### Frontend

```bash
cd frontend
npm install
npm run dev           # Starts dev server on port 3000
```

## Environment Variables

### Backend

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Backend server port |
| `NODE_ENV` | `development` | Environment mode |
| `DATABASE_URL` | `file:/app/data/hosting.db` | SQLite database file path |
| `JWT_SECRET` | `your-super-secret-jwt-key-change-in-production` | Secret key for JWT signing (change in production!) |
| `SMTP_HOST` | `localhost` | SMTP server hostname |
| `SMTP_PORT` | `1025` | SMTP server port |
| `SMTP_FROM` | `noreply@hosting-dashboard.local` | Default sender email address |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend URL (used in password reset emails) |

### Frontend

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://backend:8080` | Backend API base URL |

> SMTP settings can also be configured through the admin UI under Settings > Mail Configuration, which are stored in the database and override the environment variables.

## Default Credentials

| Field | Value |
|---|---|
| Email | `admin@example.com` |
| Password | `admin123` |

> Change these immediately in production. The admin can also force password changes for any user.

## Features Overview

### Service Management
- **Clients** - Companies/individuals with contact details, tax IDs (PIB/MIB), technical contacts
- **Domains** - Registered domains with expiry tracking, registrar info, auto-renew flags, and per-domain contacts
- **Web Hosting** - Web hosting services linked to clients, domains, and mail servers with expiry dates
- **Mail Packages** - Configurable mail hosting package types (mailbox limits, storage, pricing, features)
- **Mail Hosting** - Mail hosting service instances linked to clients, domains, and packages
- **Mail Servers** - Mail server definitions with hostname and default selection
- **Mail Security** - Mail security service definitions (e.g., spam filters)

### Dashboard
- Total counts for clients, domains, web hosting, and mail hosting
- Expiring services overview (configurable time window)
- Services marked for deletion
- Recent activity feed

### Notifications & Scheduling
- Automated email notifications before service expiry
- Configurable notification schedules (e.g., 30, 14, 7, 3, 1 days before expiry)
- Configurable run time per notification rule
- Five notification types: `client`, `service_request`, `sales_request`, `reports`, `system`
- Recipient type selection: primary contact or custom email
- Daily, weekly, and monthly report scheduling
- Notification log with sent/failed status tracking
- Cron-based scheduler:
  - **08:00** - Check expiring items
  - **09:00** - Send daily reports
  - **09:30** - Send report notifications (template-based)
  - **10:00** - Send system notifications

### Template Editor
- Visual HTML editor for email and PDF templates
- Template variable support (e.g., `{{domainName}}`, `{{clientName}}`, `{{companyName}}`, `{{hostingList}}`, `{{systemInfo}}`)
- Template types: `client`, `service_request`, `sales_request`, `reports`, `system`
- Report templates with configurable filters (status-based), sorting, and grouping
- System templates with configurable sections (blocked IPs, locked users, failed logins, password changes, resource usage, database size)
- Template preview and test email sending

### Backup & Import
- Full JSON export of all data (selective by category)
- CSV export for individual entity types
- CSV import with validation and preview
- JSON import supporting full backup restore
- CSV templates downloadable per entity type
- Import categories: clients, domains, hosting, packages, templates, scheduler settings, app settings

### Security
- Two-factor authentication (2FA) via Email or TOTP (authenticator app)
- 2FA enforcement policies: `optional`, `required_admins`, `required_all`, `disabled`
- Backup codes for TOTP recovery
- IP-based login attempt tracking and automatic blocking
- Account locking after failed attempts
- Password reset via email with time-limited tokens
- Password policy enforcement (configurable)
- Forced password change on next login
- Audit logging for all actions (create, update, delete, login, logout)

### Company & Branding
- Company information management (name, address, contacts, tax IDs)
- Company logo upload
- Bank account management with default selection
- Customizable system name (displayed in UI and emails)
- Public branding endpoint (no auth required)

### System Monitoring
- System status: CPU, memory, disk usage, database stats
- Email log viewer (MailHog integration)
- Email statistics

### UI
- Dark / Light theme toggle
- Serbian and English language support
- Responsive design
- Toast notifications

## Project Structure

```
hosting-dashboard/
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── README.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   └── src/
│       ├── index.ts                 # App entry point, route registration
│       ├── db/
│       │   ├── index.ts             # Database connection
│       │   ├── schema.ts            # Drizzle ORM schema definitions
│       │   ├── migrate.ts           # Migration runner
│       │   ├── seed.ts              # Database seeder
│       │   └── migrations/          # SQL migration files
│       ├── middleware/
│       │   └── auth.ts              # JWT auth & role-based middleware
│       ├── routes/
│       │   ├── auth.ts              # Authentication (login, 2FA, password reset)
│       │   ├── users.ts             # User management (superadmin only)
│       │   ├── clients.ts           # Client CRUD + hosting extension
│       │   ├── domains.ts           # Domain CRUD
│       │   ├── hosting.ts           # Web hosting CRUD + toggle
│       │   ├── mail-hosting.ts      # Mail hosting CRUD
│       │   ├── mail-packages.ts     # Mail package CRUD
│       │   ├── mail-servers.ts      # Mail server management
│       │   ├── mail-security.ts     # Mail security services
│       │   ├── notifications.ts     # Notification & report settings, SMTP config
│       │   ├── templates.ts         # Email template CRUD + preview/test
│       │   ├── settings.ts          # App settings (system, theme, etc.)
│       │   ├── company.ts           # Company info, logo, bank accounts
│       │   ├── dashboard.ts         # Dashboard stats & expiring items
│       │   ├── backup.ts            # Export/import (JSON & CSV)
│       │   ├── audit.ts             # Audit log viewer & export
│       │   ├── security.ts          # 2FA, blocked IPs, login attempts
│       │   └── system.ts            # System status, email logs
│       ├── services/
│       │   ├── email.ts             # SMTP transport & email sending
│       │   ├── scheduler.ts         # Cron-based notification scheduler
│       │   ├── reports.ts           # Report generation & dashboard stats
│       │   ├── security.ts          # IP blocking, 2FA codes, password policy
│       │   ├── audit.ts             # Audit log helper
│       │   ├── system.ts            # System info generation
│       │   └── systemNotifications.ts  # App start/error notifications
│       └── utils/
│           └── dates.ts             # Date formatting utilities
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── i18n.ts                  # i18next configuration
        ├── api/
        │   └── client.ts            # API client (axios/fetch wrapper)
        ├── locales/
        │   ├── sr.json              # Serbian translations
        │   └── en.json              # English translations
        └── types/
            └── index.ts             # TypeScript type definitions
```

## API Endpoints

All endpoints are prefixed with `/api` unless noted otherwise.

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | No | API status check |
| `GET` | `/health` | No | Health check |
| `GET` | `/api/public/branding` | No | Get system name & logo |

### Authentication (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/login` | No | Login (returns JWT or 2FA challenge) |
| `POST` | `/login/verify-2fa` | No | Verify 2FA code and complete login |
| `POST` | `/login/resend-2fa` | No | Resend email 2FA code |
| `POST` | `/login/setup-2fa` | No | Setup 2FA during forced enrollment |
| `POST` | `/login/verify-2fa-setup` | No | Verify 2FA setup and complete login |
| `POST` | `/logout` | No | Logout |
| `GET` | `/me` | Auth | Get current user info |
| `POST` | `/change-password` | Auth | Change own password |
| `POST` | `/forgot-password` | No | Request password reset email |
| `POST` | `/reset-password` | No | Reset password with token |

### Clients (`/api/clients`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Auth | List all clients with expiry status |
| `GET` | `/:id` | Auth | Get client with related domains & hosting |
| `POST` | `/` | Auth | Create client |
| `PUT` | `/:id` | Auth | Update client |
| `DELETE` | `/:id` | Auth | Delete client |
| `POST` | `/:clientId/extend` | Auth | Extend hosting expiry date |

### Domains (`/api/domains`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Auth | List all domains with client names |
| `GET` | `/:id` | Auth | Get single domain |
| `POST` | `/` | Auth | Create domain |
| `PUT` | `/:id` | Auth | Update domain |
| `DELETE` | `/:id` | Auth | Delete domain |

### Web Hosting (`/api/hosting`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Auth | List all hosting with expiry info |
| `GET` | `/expiring` | Auth | Get hosting expiring within N days (`?days=30`) |
| `GET` | `/:id` | Auth | Get single hosting item |
| `POST` | `/` | Auth | Create hosting |
| `PUT` | `/:id` | Auth | Update hosting |
| `DELETE` | `/:id` | Auth | Delete hosting |
| `POST` | `/:id/toggle` | Auth | Toggle hosting active status |

### Mail Hosting (`/api/packages` - mail hosting instances use hosting routes)

#### Mail Packages (`/api/packages`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | SalesAdmin+ | List all mail packages |
| `GET` | `/:id` | SalesAdmin+ | Get single package |
| `POST` | `/` | SalesAdmin+ | Create package |
| `PUT` | `/:id` | Admin+ | Update package |
| `DELETE` | `/:id` | Admin+ | Delete package |

### Mail Servers (`/api/mail-servers`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Auth | List all mail servers |
| `GET` | `/default` | Auth | Get default mail server |
| `POST` | `/` | Admin+ | Create mail server |
| `PUT` | `/:id` | Admin+ | Update mail server |
| `DELETE` | `/:id` | Admin+ | Delete mail server |
| `POST` | `/:id/set-default` | Admin+ | Set default mail server |

### Mail Security (`/api/mail-security`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Auth | List all mail security services |
| `GET` | `/:id` | Auth | Get single service |
| `POST` | `/` | Auth | Create mail security service |
| `PUT` | `/:id` | Auth | Update service |
| `DELETE` | `/:id` | Auth | Delete service |
| `POST` | `/:id/set-default` | Auth | Set default service |

### Users (`/api/users`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | SuperAdmin | List all users |
| `POST` | `/` | SuperAdmin | Create user (with optional invite email) |
| `PUT` | `/:id` | SuperAdmin | Update user |
| `PATCH` | `/:id/toggle-active` | SuperAdmin | Toggle user active status |
| `POST` | `/:id/resend-invite` | SuperAdmin | Resend invitation email |
| `DELETE` | `/:id` | SuperAdmin | Delete user |

### Dashboard (`/api/dashboard`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/stats` | Auth | Get dashboard statistics |
| `GET` | `/expiring` | Auth | Get expiring items (`?days=30`) |
| `GET` | `/will-be-deleted` | Auth | Get items marked for deletion |
| `GET` | `/activity` | Auth | Get recent activity (`?limit=10`) |

### Notifications (`/api/notifications`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/settings` | Auth | List notification settings |
| `POST` | `/settings` | Admin+ | Create notification setting |
| `PUT` | `/settings/:id` | Admin+ | Update notification setting |
| `DELETE` | `/settings/:id` | Admin+ | Delete notification setting |
| `POST` | `/settings/:id/test` | Admin+ | Test notification setting |
| `GET` | `/reports` | Auth | List report settings |
| `POST` | `/reports` | Admin+ | Create report setting |
| `PUT` | `/reports/:id` | Admin+ | Update report setting |
| `DELETE` | `/reports/:id` | Admin+ | Delete report setting |
| `GET` | `/log` | Auth | Get notification logs |
| `GET` | `/mail-settings` | Auth | Get SMTP settings |
| `PUT` | `/mail-settings` | SuperAdmin | Update SMTP settings |
| `POST` | `/smtp/verify` | SuperAdmin | Test SMTP connection |
| `POST` | `/smtp/test` | Admin+ | Send test email |
| `POST` | `/imap/verify` | SuperAdmin | Test IMAP connection |

### Templates (`/api/templates`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Auth | List all email templates |
| `GET` | `/:id` | Auth | Get single template |
| `GET` | `/type/:type` | Auth | Get template by type |
| `POST` | `/` | Admin+ | Create template |
| `PUT` | `/:id` | Admin+ | Update template |
| `DELETE` | `/:id` | Admin+ | Delete template |
| `POST` | `/:id/preview` | Auth | Preview template with sample data |
| `POST` | `/:id/test` | Admin+ | Send test email with template |

### Settings (`/api/settings`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Auth | Get all settings |
| `GET` | `/system` | Auth | Get system settings |
| `PUT` | `/system` | SuperAdmin | Update system settings |
| `GET` | `/system-notifications` | Auth | Get system notification settings |
| `PUT` | `/system-notifications` | SuperAdmin | Update system notification settings |
| `GET` | `/theme/current` | Auth | Get current theme |
| `PUT` | `/theme/current` | Auth | Update theme |
| `GET` | `/:key` | Auth | Get setting by key |
| `PUT` | `/:key` | SuperAdmin | Update setting |
| `DELETE` | `/:key` | SuperAdmin | Delete setting |

### Company (`/api/company`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/info` | Auth | Get company information |
| `PUT` | `/info` | Auth | Create/update company info |
| `POST` | `/logo` | Auth | Upload company logo |
| `DELETE` | `/logo` | Auth | Delete company logo |
| `GET` | `/bank-accounts` | Auth | List bank accounts |
| `POST` | `/bank-accounts` | Auth | Add bank account |
| `PUT` | `/bank-accounts/:id` | Auth | Update bank account |
| `DELETE` | `/bank-accounts/:id` | Auth | Delete bank account |
| `POST` | `/bank-accounts/:id/set-default` | Auth | Set default bank account |

### Backup (`/api/backup`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/export` | Admin+ | Export data (`?types=clients,domains&format=json`) |
| `GET` | `/template/:type` | Admin+ | Download CSV import template |
| `POST` | `/validate` | Admin+ | Validate import data before importing |
| `POST` | `/import` | Admin+ | Import data (JSON or CSV) |

### Audit (`/api/audit`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Auth | Get audit logs (paginated, filterable) |
| `GET` | `/entity-types` | Auth | Get distinct entity types |
| `GET` | `/actions` | Auth | Get distinct action types |
| `GET` | `/stats` | Auth | Get audit log statistics |
| `DELETE` | `/old` | SuperAdmin | Delete old audit logs |
| `GET` | `/export` | SuperAdmin | Export audit logs |

### Security (`/api/security`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/settings` | SuperAdmin | Get security settings |
| `PUT` | `/settings` | SuperAdmin | Update security settings |
| `GET` | `/blocked-ips` | SuperAdmin | List blocked IPs |
| `DELETE` | `/blocked-ips/:ip` | SuperAdmin | Unblock an IP |
| `GET` | `/login-attempts` | SuperAdmin | Get login attempt history |
| `GET` | `/locked-users` | SuperAdmin | List locked user accounts |
| `POST` | `/unlock-user/:id` | SuperAdmin | Unlock a user account |
| `GET` | `/2fa/status` | Auth | Get own 2FA status |
| `POST` | `/2fa/setup/email` | Auth | Begin email-based 2FA setup |
| `POST` | `/2fa/verify/email` | Auth | Verify and enable email 2FA |
| `POST` | `/2fa/setup/totp` | Auth | Begin TOTP 2FA setup (QR code) |
| `POST` | `/2fa/verify/totp` | Auth | Verify and enable TOTP 2FA |
| `POST` | `/2fa/disable` | Auth | Disable 2FA |
| `POST` | `/2fa/backup-codes/regenerate` | Auth | Regenerate backup codes |

### System (`/api/system`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/status` | Auth | System status (CPU, memory, disk, DB) |
| `GET` | `/emails` | Auth | Get email logs from MailHog |
| `DELETE` | `/emails` | Auth | Delete emails from MailHog |
| `GET` | `/emails/stats` | Auth | Get email statistics |

## Authentication & Roles

### Role Hierarchy

| Role | Level | Permissions |
|---|---|---|
| `superadmin` | Highest | Full system access: user management, system settings, security settings, mail config, audit export, and everything below |
| `admin` | High | Content management: templates, notifications, mail servers, backup/import, packages (full CRUD), and everything below |
| `salesadmin` | Medium | Can view and create packages (but not edit/delete), and everything below |
| `sales` | Base | Client, domain, hosting CRUD, dashboard access, view templates and settings |

### Authentication Flow

1. User sends `POST /api/auth/login` with email and password
2. Server validates credentials and checks IP blocking
3. If 2FA is enabled, returns a `sessionToken` + `requires2FA: true`
4. Client sends `POST /api/auth/login/verify-2fa` with the code
5. On success, server returns a JWT token (valid for 7 days)
6. Client includes `Authorization: Bearer <token>` in all subsequent requests

### Two-Factor Authentication (2FA)

- **Email method** - Server sends a 6-digit code to the user's email
- **TOTP method** - User scans QR code with an authenticator app (Google Authenticator, Authy, etc.)
- **Backup codes** - Generated for TOTP users as a recovery mechanism
- **Enforcement levels** - Configurable per system: optional, required for admins, required for all, or disabled

### Security Features

- Automatic IP blocking after repeated failed login attempts
- Account locking with manual unlock by superadmin
- Password reset via time-limited email tokens (1 hour expiry)
- Configurable password policy
- Audit logging of all CRUD operations and auth events

## Internationalization (i18n)

The frontend supports two languages:

| Language | Code | File |
|---|---|---|
| Serbian | `sr` | `frontend/src/locales/sr.json` |
| English | `en` | `frontend/src/locales/en.json` |

The fallback language is English. Language detection is automatic via `i18next-browser-languagedetector`.

### Adding a New Language

1. Create a new translation file at `frontend/src/locales/{code}.json` using `en.json` as a template
2. Register it in `frontend/src/i18n.ts`:
   ```ts
   import newTranslation from './locales/{code}.json';

   // Add to resources:
   resources: {
     sr: { translation: srTranslation },
     en: { translation: enTranslation },
     {code}: { translation: newTranslation },
   },
   ```
3. Add a language switcher option in the UI

## Database

### Engine

SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), managed with [Drizzle ORM](https://orm.drizzle.team/).

Default location: `./data/hosting.db` (Docker) or project root (local).

### Schema Overview

| Table | Description |
|---|---|
| `users` | User accounts with roles, 2FA settings, lock status |
| `clients` | Client companies/individuals with contacts and tax info |
| `domains` | Registered domains with expiry dates and contacts |
| `web_hosting` | Web hosting service instances |
| `mail_hosting` | Mail hosting service instances |
| `mail_packages` | Mail package type definitions (limits, pricing) |
| `mail_servers` | Mail server definitions |
| `mail_security` | Mail security service definitions |
| `notification_settings` | Notification rules (type, schedule, template, recipient) |
| `notification_log` | Log of sent/failed notifications |
| `report_settings` | Report schedule configuration |
| `email_templates` | Email/PDF templates with variables |
| `app_settings` | Key-value application settings |
| `company_info` | Company details and branding |
| `bank_accounts` | Company bank account details |
| `audit_logs` | Full audit trail of all actions |
| `verification_codes` | 2FA email verification codes |
| `backup_codes` | TOTP backup recovery codes |
| `login_attempts` | Login attempt tracking per IP |
| `blocked_ips` | Blocked IP addresses (temp or permanent) |
| `password_reset_tokens` | Time-limited password reset tokens |

### Migrations

```bash
# Generate a new migration after schema changes
cd backend
npm run db:generate

# Run pending migrations
npm run db:migrate
```

### Seeding

```bash
cd backend
npm run db:seed
```

Creates the default superadmin user (`admin@example.com` / `admin123`).

## Backup & Import

### Export

- **JSON** (full): `GET /api/backup/export` - exports all data categories
- **JSON** (selective): `GET /api/backup/export?types=clients,domains` - export specific categories
- **CSV**: `GET /api/backup/export?types=clients&format=csv` - export single category as CSV

Available export types: `clients`, `domains`, `hosting`, `packages`, `templates`, `scheduler`, `settings`

### Import

- **JSON**: `POST /api/backup/import` - import full backup or specific categories
- **CSV**: `POST /api/backup/import` with `{ type: "clients", format: "csv", data: "..." }`
- **Validation**: `POST /api/backup/validate` - validate data before importing (returns errors and preview)

### CSV Templates

Download blank CSV templates with headers and example rows:

```
GET /api/backup/template/clients
GET /api/backup/template/domains
GET /api/backup/template/hosting
GET /api/backup/template/packages
```

## Email & Notifications

### SMTP Configuration

SMTP can be configured via:
1. Environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`)
2. Admin UI under Settings > Mail Configuration (stored in DB, takes priority)

In development, [MailHog](https://github.com/mailhog/MailHog) captures all outgoing emails at http://localhost:8025.

### Notification Types

| Type | Description |
|---|---|
| `client` | Client-facing expiry notifications |
| `service_request` | Internal service request alerts |
| `sales_request` | Sales team alerts |
| `reports` | Scheduled reports with hosting status lists |
| `system` | System health reports (blocked IPs, locked users, failed logins, etc.) |

### Template Variables

Templates support placeholder variables wrapped in `{{` and `}}`:

| Variable | Description |
|---|---|
| `{{domainName}}` | Domain name |
| `{{clientName}}` | Client name |
| `{{expiryDate}}` | Service expiry date |
| `{{companyName}}` | Company name from settings |
| `{{companyLogo}}` | Company logo (base64) |
| `{{hostingList}}` | Auto-generated hosting status table (for report templates) |
| `{{systemInfo}}` | Auto-generated system health info (for system templates) |

## Development

### NPM Scripts

#### Backend

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled JavaScript |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed database with default data |

#### Frontend

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server (port 3000) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run preview` | Preview production build locally |

### Docker Development

The Docker setup mounts source directories as volumes for hot-reload:

- `./backend/src` is mounted into the backend container
- `./frontend/src` and `./frontend/public` are mounted into the frontend container

Changes to source files are reflected immediately without rebuilding containers.

### Runtime

- **Node.js 20** (Alpine-based Docker images)
- **TypeScript 5.3+**

## License

This project is proprietary software.

# Changelog - 2026-02-01

## Summary
Major refactoring of the hosting dashboard application. Simplified the data model and converted UI to English.

---

## Completed Changes

### 1. Data Model Simplification
- **Removed web hosting** - kept only mail hosting, renamed to just "hosting"
- **Removed domain registration/expiry** - only hosting has expiry dates now
- **Extend logic updated** - extends from current expiry date if active, otherwise from today (activation date)

### 2. Renamed Entities
- "Hosting" page → "Domains" page
- Route `/hosting` → `/domains`
- Navigation updated accordingly
- Old routes redirect to new ones

### 3. UI Changes

#### Clients Page (`/clients`)
- Added **search field** - searches by name, domain, contact, email, phone
- Added **status filters** - All, OK (>31 days), Warning (14-31), Critical (≤7), Expired
- Status shows as colored badge with days until earliest hosting expiry
- All text converted to English

#### Domains Page (`/domains`)
- Added **search field** - searches by domain, client, package
- Added **status filters** - same as Clients
- Added **"Add Domain" button** with modal:
  - Client dropdown (auto-fills contact emails when selected)
  - Domain name, Contact emails 1/2/3, Notes
- Added **Edit modal** - click on row or Edit button to edit domain/hosting
- Table layout matching Clients page style

### 4. Files Modified

#### Frontend
- `src/App.tsx` - Updated routes, renamed imports
- `src/pages/HostingPage.tsx` - Now serves as DomainsPage, complete rewrite
- `src/pages/ClientsPage.tsx` - Added search, English text
- `src/pages/DashboardPage.tsx` - Updated labels to "Domains"
- `src/pages/MailPackagesPage.tsx` - Uses Package type
- `src/components/Layout/Sidebar.tsx` - "Domains" nav item
- `src/types/index.ts` - Simplified types

#### Backend
- `src/routes/clients.ts` - Extended periods (2y, 5y, unlimited), extend logic
- `src/routes/hosting.ts` - Uses mailHosting table
- `src/routes/domains.ts` - Simplified schema (removed registrar, dates)
- `src/index.ts` - Updated route registrations

#### Deleted Files
- `src/pages/DomainsPage.tsx` (old, unused)
- `src/pages/MailHostingPage.tsx` (old, unused)

---

## Current State
- Application runs with `docker compose up`
- Frontend: http://localhost:3000
- Backend: http://localhost:8080
- All TypeScript compiles without errors

---

## Pending / Future Work
- [ ] Consider adding delete functionality to Domains page
- [ ] Dashboard "Expiring Items" table could link to domains
- [ ] Mobile responsiveness testing
- [ ] Consider batch extend operations

---

## How to Continue
1. `cd /media/partition02/GIT-Repos/hosting-dashboard`
2. `docker compose up` (or `docker compose up --build` if needed)
3. Open http://localhost:3000

---

## Notes
- Status colors: green (>31d), yellow (14-31d), orange (≤7d), red (expired)
- Client status shows earliest expiring hosting for that client
- Extend periods: 1 month, 1 year, 2 years, 3 years, 5 years, unlimited (100 years)

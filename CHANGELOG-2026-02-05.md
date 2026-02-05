# Changelog - 2026-02-05

## Email Log - Database umesto MailHog

### Izmene
- **Email logovanje u bazu**: Svaki email (uspešan ili neuspešan) se čuva u `email_logs` tabeli sa punim sadržajem
- **Email Log stranica**: Mail klijent UI sa pretragom, paginacijom, expand za sadržaj, status badge (Sent/Failed)
- **MailHog potpuno uklonjen** iz docker-compose.dev.yml i svih referenci u README

### Novi API endpointi (`/api/system/emails`)
- `GET /emails` - paginacija + pretraga po to/subject/from
- `GET /emails/stats` - statistika (total, sent, failed, estimatedSize)
- `GET /emails/:id` - pojedinačan email sa punim HTML sadržajem
- `DELETE /emails?days=N` - brisanje svih ili starijih od N dana

### Nove migracije
- `0018_add_email_logs.sql` - email_logs tabela
- `0019_add_mail_servers_and_company.sql` - mail_servers, mail_security, company_info, bank_accounts tabele
- `0020_add_missing_columns.sql` - tech_contact/phone/email na clients, primary_contact kolone na domains

### Bug fixes
- Fix: Template preview "no such table: company_info" - dodana migracija za nedostajuće tabele
- Fix: "NOT NULL constraint failed: domains.expiry_date" - popravljena migracija 0009 (redosled kolona)
- Fix: "no such column: tech_contact" na clients tabeli - dodana migracija 0020
- Fix: Migracija 0009 referencirala kolone koje tada nisu postojale - sada koristi samo kolone dostupne u tom koraku
- Očišćene zaostale `domains_new` i `notification_settings_new` tabele na produkciji

## Produkcija

### Server info
- **Host**: `danijel@192.168.222.71`
- **Putanja**: `/home/danijel/hosting-panel`
- **Docker**: korisnik `danijel` je u docker grupi (ne treba sudo)
- **Deploy**: `git pull origin main && docker compose up -d --build`
- **NAPOMENA**: Ako git javlja "Permission denied", treba `sudo chown -R danijel:danijel /home/danijel/hosting-panel`

### Deploy komande
```bash
# Standardni deploy
ssh danijel@192.168.222.71 "cd /home/danijel/hosting-panel && git pull origin main && docker compose up -d --build"

# Samo restart backend (bez rebuild)
ssh danijel@192.168.222.71 "cd /home/danijel/hosting-panel && docker compose restart backend"

# Logovi
ssh danijel@192.168.222.71 "docker logs hosting-panel-backend-1 --tail 50"

# Provera baze
ssh danijel@192.168.222.71 "docker exec hosting-panel-backend-1 node -e \"const Database = require('better-sqlite3'); const db = new Database('/app/data/hosting.db'); console.log(db.prepare('SELECT name FROM sqlite_master WHERE type=\\\"table\\\"').all());\""
```

## Fajlovi

### Izmenjeni
- `backend/src/db/schema.ts` - dodana emailLogs tabela
- `backend/src/services/email.ts` - logovanje emailova u bazu
- `backend/src/routes/system.ts` - zamenjeni MailHog proxy endpointi sa DB upitima
- `backend/src/db/migrations/0009_make_domain_expiry_optional.sql` - fix redosleda kolona
- `frontend/src/pages/EmailLogPage.tsx` - novi mail klijent UI
- `frontend/src/locales/en.json` - emailLog prevodi
- `frontend/src/locales/sr.json` - emailLog prevodi
- `docker-compose.dev.yml` - uklonjen MailHog servis
- `README.md` - ažurirane MailHog reference na email log u bazi

### Novi
- `backend/src/db/migrations/0018_add_email_logs.sql`
- `backend/src/db/migrations/0019_add_mail_servers_and_company.sql`
- `backend/src/db/migrations/0020_add_missing_columns.sql`

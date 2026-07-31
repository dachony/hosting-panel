# Changelog - 2026-07-31

## Nove funkcionalnosti

### Web Servers
- Nova tabela `web_servers` (name, hostname, description, isDefault) - ista struktura kao `mail_servers`
- Nova kolona `mail_packages.web_server_id` (migracija `0028_add_web_servers.sql`)
- REST API `/api/web-servers`: GET lista, GET `/default`, POST, PUT, DELETE, POST `/:id/set-default`
- Pisanje zahteva `adminMiddleware` (isto kao mail serveri)
- Nov Settings tab **Web Servers**, postavljen ispred Mail Servers taba
- Postojeći tab `Servers` preimenovan u **Mail Servers** / **Mail serveri**
- Backup export/restore pokriva `web_servers` (ubacuje se pre paketa zbog redosleda zavisnosti)

### Dodela servera paketu
- Modal paketa sada nudi tri selecta: Web Server | Mail Server | Mail Security
- Pri kreiranju novog paketa svaki select se predpopunjava serverom označenim kao default

### Sortiranje i filtriranje paketa
- Toolbar iznad liste: sort dropdown (naziv, mailboxes, kapacitet, cena) + dugme za smer
- Tri filtera - po web serveru, mail serveru i mail security, sa opcijom "Unassigned"
- Sve radi client-side, bez URL sinhronizacije
- Red paketa posle cene prikazuje `Web Hosting - X | Mail Hosting - Y | Mail Security - Z`,
  sa `—` kad server nije dodeljen (segmenti se uvek ispisuju radi poravnanja)

### Web server u pregledu domena i klijenata
- `DomainDetailPage` - red sa detaljima paketa i dropdown za izbor paketa
- `ClientDetailPage` - red hostinga i mobilna kartica
- Mail server dobio `HardDrive` ikonicu da se vizuelno razlikuje od web servera (`Server`)

## Ispravke

### Audit log nije beležio izmene podataka
Audit helper (`services/audit.ts`) je radio ispravno, ali je bio pozvan samo u
`auth.ts`, `clients.ts` i `settings.ts`. Ostalih 74 write-endpointa nisu zvala ništa,
pa kreiranje servera, paketa, hostinga ili korisnika nije ostavljalo trag.

Instrumentisane sve rute:

| Ruta | Akcije |
|---|---|
| `web-servers`, `mail-servers`, `mail-security` | create, update, delete, set_default |
| `mail-packages` | create, update, delete |
| `domains` | create, update, delete, lock/unlock, pdf_upload, pdf_delete |
| `hosting`, `mail-hosting` | create, update, delete, enable/disable, extend, expire_now |
| `clients` | extend (create/update/delete su već postojali) |
| `users` | create, update, delete, activate/deactivate, resend_invite |
| `templates` | create, update, delete, test_email |
| `notifications` | create, update, delete (settings i reports), test, trigger, smtp_test, mail-settings |
| `company` | create, update, logo_upload, logo_delete, bank accounts CRUD + set_default |
| `security` | settings update, unblock_ip, unlock_user, 2fa_enable/disable, backup_codes_regenerate |
| `backup` | create, import, cleanup, delete |
| `system` | cleanup email logova i PDF fajlova |

Detalji:
- Hosting zapisi se labeliraju imenom domena (`hostingLabel()` / `mailHostingLabel()`),
  jer hosting red nema svoje ime
- `extend` i `expire_now` beleže period i stari/novi datum isteka u `details`
- `AuditLogPage` dobio prevode i boje za nove akcije i tipove entiteta;
  bez toga bi se prikazivalo sirovo `set_default`, `expire_now` itd.

## Napomene za održavanje

- Brisanje web/mail servera **ne** čisti `*_server_id` iz paketa koji ga koriste.
  Prikaz padne na `—`, nema loma. Ponašanje je namerno usklađeno sa postojećim
  mail serverima.
- `frontend/src/pages/MailPackagesPage.tsx` je mrtav kod - rute `/packages` i
  `/mail-packages` redirektuju na `/settings`. Paketi se uređuju u Settings tabu.
- Izmene rađene direktno u bazi (npr. kroz `docker compose exec backend node -e`)
  ne prolaze kroz API pa ne ostavljaju audit trag.

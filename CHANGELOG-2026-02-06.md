# Changelog - 2026-02-06

## Nove funkcionalnosti

### PDF Attachment za domene
- Upload/download/brisanje PDF fajla po domenu (`/api/domains/:id/pdf`)
- PDF skladištenje u `/app/data/pdfs/` (isti Docker volume kao baza)
- Opciono prilaganje PDF-a uz notification emailove (checkbox u template editoru)
- Podrška za attachments u email servisu (nodemailer)
- Scheduler automatski prilaže PDF ako je template tako konfigurisan

### PDF Documents kartica u System Status
- Prikaz ukupne veličine PDF fajlova i broja domena sa PDF-om
- Dugmići za brisanje starijih od 1 mesec, 3 meseca, ili svih
- Brisanje čisti i `pdf_filename` polje u bazi (ne prikazuje se više na domenu)

### Trigger Now sa odabirom domena
- Trigger Now dugme otvara modal sa dropdown listom svih domena
- Moguće odabrati konkretni domen za test slanje
- Opcija "All domains" šalje za sve domene u opsegu schedule-a
- Prikazuje broj poslatih notifikacija u toast poruci

## Poboljšanja

### Scheduler - range umesto exact match
- Manuelni trigger sada traži SVE stavke u opsegu schedule-a (npr. danas-60 do danas+30)
- Svaki domen/hosting/mail dobija individualni email sa popunjenim template varijablama
- Ne proverava `notificationLog` duplikate kod manuelnog trigera
- Schedule ažuriran na pun opseg: `[30, 14, 7, 3, 1, 0, -7, -14, -30, -45, -60]`

### Error handling u frontendu
- API klijent sada čuva `details` niz iz backend error odgovora
- `onError` handleri koriste `error.message` umesto `error.response?.data?.error`
- Korisnik sada vidi tačan razlog greške (npr. password policy) umesto generičkog "Error saving"

## Bugfixevi

### Kritično: Migracija 0009 - gubitak podataka na svakom deployu
- **Problem:** `0009_make_domain_expiry_optional.sql` je na svakom restartu radila DROP TABLE + RENAME na domains tabeli
- Kolone dodate kasnijim migracijama (`primary_contact_name`, `primary_contact_phone`, `primary_contact_email`, `pdf_filename`) su se brisale na svakom deployu
- **Rešenje:** Migracija 0009 je sada no-op (`SELECT 1;`), `0000_init.sql` ažuriran da odmah kreira `expiry_date` bez NOT NULL

### Trigger Now greška "No recipient configured"
- Notification setting tipa `client` sa `recipientType: primary` nije bio podržan u trigger handleru
- Dodata detekcija client tipa i poziv `triggerClientNotification` funkcije

## Izmenjeni fajlovi

### Backend
- `backend/src/db/migrations/0000_init.sql` - expiry_date bez NOT NULL
- `backend/src/db/migrations/0009_make_domain_expiry_optional.sql` - no-op
- `backend/src/db/migrations/0022_add_domain_pdf.sql` - nova migracija
- `backend/src/db/schema.ts` - pdfFilename, attachDomainPdf
- `backend/src/routes/domains.ts` - PDF upload/download/delete endpointi
- `backend/src/routes/notifications.ts` - trigger sa domainId
- `backend/src/routes/templates.ts` - attachDomainPdf validacija
- `backend/src/routes/system.ts` - PDF stats i delete endpointi
- `backend/src/services/email.ts` - attachments podrška
- `backend/src/services/scheduler.ts` - PDF attachment, range queries, triggerClientNotification

### Frontend
- `frontend/src/api/client.ts` - uploadFile metod, error details
- `frontend/src/types/index.ts` - pdfFilename, attachDomainPdf
- `frontend/src/pages/DomainDetailPage.tsx` - PDF sekcija
- `frontend/src/pages/SettingsPage.tsx` - trigger modal, attachDomainPdf checkbox, error handling
- `frontend/src/pages/SystemStatusPage.tsx` - PDF Documents kartica
- `frontend/src/locales/sr.json` - prevodi
- `frontend/src/locales/en.json` - prevodi

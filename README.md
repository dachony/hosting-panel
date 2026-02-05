# Hosting Panel

Web aplikacija za evidenciju domena, web hostinga i mail hostinga sa admin panelom, automatskim notifikacijama i izveštajima.

## Tehnologije

### Backend
- **Hono** - Lightweight web framework
- **Drizzle ORM** - TypeScript ORM
- **SQLite** - Baza podataka
- **JWT** - Autentifikacija
- **Nodemailer** - Slanje emailova

### Frontend
- **React 18** + **Vite**
- **TailwindCSS** - Styling (Dark/Light tema)
- **TanStack Query** - Data fetching
- **React Router v6** - Routing
- **react-i18next** - Internacionalizacija (SR/EN)

## Pokretanje

### Sa Docker-om (preporučeno)

```bash
docker-compose up --build
```

Servisi:
- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:8080
- **MailHog UI:** http://localhost:8025

### Bez Docker-a

#### Backend

```bash
cd backend
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Default Kredencijali

- **Email:** admin@example.com
- **Password:** admin123

## Funkcionalnosti

### Entiteti
- **Klijenti** - Firme/lica sa kontakt podacima
- **Domeni** - Registrovani domeni sa datumima isteka
- **Web Hosting** - Web hosting usluge
- **Mail paketi** - Tipovi mail hosting paketa
- **Mail Hosting** - Mail hosting usluge

### Notifikacije
- Automatske email notifikacije pre isteka usluga
- Konfigurabilni intervali (30, 14, 7, 3, 1 dan pre isteka)
- Dnevni, nedeljni i mesečni izveštaji

### Template Editor
- Vizualni editor za email i PDF šablone
- Podrška za varijable ({{domainName}}, {{clientName}}, itd.)
- Pregled šablona pre slanja

### Backup
- Export svih podataka u JSON format
- Import podataka u novu instancu

### UI
- Dark/Light tema
- Srpski i Engleski jezik
- Responsive dizajn

## API Endpoints

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### CRUD
- `/api/clients`
- `/api/domains`
- `/api/hosting`
- `/api/mail-packages`
- `/api/mail-hosting`
- `/api/users`

### Settings
- `/api/notifications/settings`
- `/api/templates`
- `/api/settings`
- `/api/backup/export`
- `/api/backup/import`

### Dashboard
- `GET /api/dashboard/stats`
- `GET /api/dashboard/expiring`

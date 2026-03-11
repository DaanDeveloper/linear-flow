# Linear → GitHub Branch Automation

Maakt automatisch een GitHub branch aan wanneer een issue wordt aangemaakt in Linear. De juiste repository wordt bepaald door de Linear project naam (moet matchen met de GitHub repo naam).

**Branch format:** `feat/PAK-123-slugified-issue-title`

## Setup

### 1. Environment variabelen

Kopieer `.env.example` naar `.env`:

```bash
cp .env.example .env
```

Vul de waardes in:

```env
PORT=3000
LINEAR_WEBHOOK_SECRET=<zie stap 3>
LINEAR_API_KEY=<zie stap 2>
GITHUB_TOKEN=<zie stap 4>
GITHUB_OWNER=<je GitHub org of username>
DEFAULT_BRANCH=main
```

### 2. Linear API Key

1. Ga naar [Linear Settings → API](https://linear.app/settings/api)
2. Klik **Create key**
3. Geef de key een naam (bijv. "Branch Automation")
4. Kopieer de key naar `LINEAR_API_KEY` in `.env`

### 3. Linear Webhook

1. Ga naar [Linear Settings → API → Webhooks](https://linear.app/settings/api)
2. Klik **Create webhook**
3. **URL**: vul je server URL in → `https://jouw-server.com/webhook/linear`
4. **Label**: bijv. "GitHub Branch Creator"
5. Onder **Data change events**, vink aan: **Issues → Create**
6. Klik **Create webhook**
7. Kopieer de **Signing secret** naar `LINEAR_WEBHOOK_SECRET` in `.env`

> **Tip:** Voor lokaal testen kun je [ngrok](https://ngrok.com) gebruiken:
> ```bash
> ngrok http 3000
> ```
> Gebruik dan de ngrok URL als webhook URL in Linear.

### 4. GitHub Token

1. Ga naar [GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
2. **Token name**: bijv. "Linear Branch Automation"
3. **Repository access**: selecteer de repo's waar branches in aangemaakt moeten worden
4. **Permissions → Repository permissions**:
   - **Contents**: Read and write (nodig om branches aan te maken)
5. Klik **Generate token**
6. Kopieer het token naar `GITHUB_TOKEN` in `.env`

Zet bij `GITHUB_OWNER` de GitHub organisatie of gebruikersnaam waar de repo's onder vallen.

### 5. Linear project naam = GitHub repo naam

De automation matcht de Linear **project naam** met de GitHub **repository naam**. Zorg dat deze exact overeenkomen.

Voorbeeld: als je Linear project "my-web-app" heet, dan moet de GitHub repo ook "my-web-app" heten.

> Issues zonder project worden genegeerd.

## Draaien

```bash
# Dependencies installeren
npm install

# Development (hot reload)
npm run dev

# Production
npm run build
npm start
```

Controleer of de server draait:

```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

## Testen

Maak een issue aan in Linear (in een project dat matcht met een GitHub repo). Check de server logs en kijk of de branch verschijnt in GitHub.

Je kunt ook handmatig een webhook simuleren met curl:

```bash
curl -X POST http://localhost:3000/webhook/linear \
  -H "Content-Type: application/json" \
  -H "linear-signature: <berekende-signature>" \
  -d '{
    "action": "create",
    "type": "Issue",
    "data": {
      "id": "test-id",
      "identifier": "PAK-1",
      "title": "Test issue",
      "number": 1,
      "teamId": "team-id",
      "projectId": "project-id"
    }
  }'
```
# linear-flow

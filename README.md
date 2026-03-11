# Linear ↔ GitHub Automation

Bidirectionele sync tussen Linear en GitHub. Automatisch branches, PRs en AI code fixes op basis van Linear issues.

**Branch format:** `feat/DAA-123-slugified-issue-title`

## Flow

| Actie | Resultaat |
|---|---|
| Linear issue → **In Progress** | Branch + PR aanmaken (handmatig werken) |
| Linear issue → **AI** | Branch aanmaken → Claude AI fixt het issue → PR aanmaken |
| Linear issue → **Todo** (terug) | PR sluiten + branch verwijderen |
| GitHub PR **comment** | Claude AI pikt feedback op en pushed wijzigingen |
| GitHub PR **merged** | Linear issue → Done |
| GitHub PR **closed** (niet merged) | Linear issue → Todo |

## Setup

### 1. Environment variabelen

```bash
cp .env.example .env
```

```env
PORT=3000
LINEAR_WEBHOOK_SECRET=<zie stap 3>
GITHUB_WEBHOOK_SECRET=<zie stap 5>
LINEAR_API_KEY=<zie stap 2>
GITHUB_TOKEN=<zie stap 4>
GITHUB_OWNER=<je GitHub org of username>
SOURCE_BRANCH=main
TARGET_BRANCH=main
LINEAR_STATUS_TODO=Todo
LINEAR_STATUS_IN_PROGRESS=In Progress
LINEAR_STATUS_AI=AI
LINEAR_STATUS_DONE=Done
```

### 2. Linear API Key

1. Ga naar [Linear Settings → API](https://linear.app/settings/api)
2. Klik **Create key**
3. Geef de key een naam (bijv. "Branch Automation")
4. Kopieer de key naar `LINEAR_API_KEY` in `.env`

### 3. Linear Webhook

1. Ga naar [Linear Settings → API → Webhooks](https://linear.app/settings/api)
2. Klik **Create webhook**
3. **URL**: je server URL (bijv. ngrok URL)
4. **Label**: bijv. "GitHub Automation"
5. Onder **Data change events**, vink aan: **Issues → Create** en **Issues → Update**
6. Klik **Create webhook**
7. Kopieer de **Signing secret** naar `LINEAR_WEBHOOK_SECRET` in `.env`

> **Tip:** Voor lokaal testen kun je [ngrok](https://ngrok.com) gebruiken:
> ```bash
> ngrok http 3000
> ```

### 4. GitHub Token

1. Ga naar [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Maak een **classic token** aan met de `repo` scope
3. Kopieer het token naar `GITHUB_TOKEN` in `.env`

Zet bij `GITHUB_OWNER` de GitHub organisatie of gebruikersnaam.

### 5. GitHub Webhook

1. Ga naar je repository → **Settings → Webhooks → Add webhook**
2. **Payload URL**: zelfde URL als Linear webhook
3. **Content type**: `application/json`
4. **Secret**: kies een secret en zet in `.env` bij `GITHUB_WEBHOOK_SECRET`
5. **Events**: selecteer **Pull requests** en **Issue comments**

### 6. Linear project naam = GitHub repo naam

De automation matcht de Linear **project naam** met de GitHub **repository naam**. Zorg dat deze exact overeenkomen.

> Issues zonder project worden genegeerd.

### 7. Linear statussen

Maak in je Linear team workflow de volgende statussen aan (of pas de namen aan in `.env`):

- **Todo** — standaard status
- **In Progress** — handmatig werken (branch + PR)
- **AI** — Claude AI fixt het issue automatisch
- **Done** — wordt automatisch gezet bij PR merge

### 8. Claude CLI (voor AI modus)

De AI modus vereist dat [Claude Code](https://claude.ai/code) geïnstalleerd is op de server:

```bash
claude --version  # moet beschikbaar zijn
```

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

Health check:

```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

## Testen

1. Maak een issue aan in Linear (in een project dat matcht met een GitHub repo)
2. Verplaats naar **In Progress** → check of branch + PR verschijnt in GitHub
3. Verplaats naar **AI** → check of Claude wijzigingen maakt en een PR opent
4. Plaats een comment op de PR → check of Claude de feedback verwerkt
5. Merge de PR → check of het Linear issue naar Done gaat
6. Sluit de PR (zonder merge) → check of het Linear issue terug naar Todo gaat

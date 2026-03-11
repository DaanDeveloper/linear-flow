# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Linear → GitHub branch automation. When an issue is created in Linear, a GitHub branch is automatically created in the matching repo (Linear project name = GitHub repo name).

## Commands

- `npm run build` — TypeScript compilation
- `npm run dev` — Start dev server with hot reload (tsx watch)
- `npm start` — Run compiled JS from dist/

## Architecture

```
Linear webhook → POST /webhook/linear → Express server → GitHub API (create branch)
```

- **src/index.ts** — Express server, webhook endpoint, signature verification
- **src/handlers/issueCreated.ts** — Handles Issue.create events
- **src/services/github.ts** — Octokit wrapper for branch creation
- **src/services/linear.ts** — Linear SDK wrapper for project info
- **src/utils/branchName.ts** — Branch name formatting (`feat/{ID}-{slug}`)
- **src/types/linear.ts** — TypeScript types for webhook payloads

## Key Conventions

- Branch format: `feat/{TEAM_KEY}-{ISSUE_NUMBER}-{slugified-title}`
- Linear project name must match GitHub repo name exactly
- Webhook signature verified via `LINEAR_WEBHOOK_SECRET`
- Environment variables in `.env` (see `.env.example`)

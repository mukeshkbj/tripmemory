# Trip Memory

Trip Memory is a local-first photo journal for revisiting the places that stay with you. Build a memory from 5–10 photographs, arrange the stops, add notes, and explore the trip as a gallery, an estimated-depth spatial view, an AI-generated landscape, a live Reactor world, or a video journey.

## What it does

- Creates photo memories with a title, place, date, description, and ordered stops
- Stores resized, EXIF-free photo copies, notes, favorites, and generated artifacts in browser IndexedDB
- Searches and filters a local memory library
- Exports and imports individual memories as portable backups
- Uses Modal to estimate depth for interactive spatial photographs
- Uses Runware to generate landscape scenes and journey clips
- Uses Reactor to open a live world from one selected seed photograph
- Includes bundled sample journeys for trying the interface

Spatial views use inferred relative depth, not measured reconstruction. Generated scenes are labeled and kept separate from source photographs.

## Stack

- Next.js 15 and React 19
- TypeScript and Zod
- Three.js for spatial rendering
- IndexedDB for browser-local persistence
- Reactor, Runware, and Modal for optional cloud features
- Vitest and Playwright for testing

## Run locally

### Requirements

- Node.js 24
- pnpm 10.14.0

```bash
git clone https://github.com/mukeshkbj/tripmemory.git
cd tripmemory
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open [http://127.0.0.1:3001](http://127.0.0.1:3001).

The journal and bundled samples work without cloud providers. Configure the provider settings below to enable spatial views, generated scenes, live worlds, and journey clips.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `MEMORY_ACCESS_CODE` | Private access code used to unlock cloud actions; must contain at least 16 characters |
| `MEMORY_SITE_ORIGIN` | Additional trusted origin, such as `http://127.0.0.1:3001` for local development |
| `REACTOR_API_KEY` | Reactor API credential for live worlds |
| `RUNWARE_API_KEY` | Runware API credential for generated landscapes and journey clips |
| `MODAL_DEPTH_URL` | HTTPS `.modal.run` endpoint for the depth worker |
| `MODAL_TOKEN_ID` | Modal proxy-token ID |
| `MODAL_TOKEN_SECRET` | Modal proxy-token secret |

Keep all credentials in `.env.local`; do not expose them to browser code. Enter `MEMORY_ACCESS_CODE` on the Connections screen to unlock cloud actions.

### Optional Modal depth worker

The Python worker lives in `modal/memory_depth.py`. For local contract tests, create the project environment and install its local test dependencies:

```bash
python3 -m venv --system-site-packages .venv
.venv/bin/python -m pip install Pillow==12.0.0 numpy==2.3.5
pnpm modal:check
```

After authenticating the Modal CLI, deploy the worker:

```bash
pnpm modal:deploy
```

Set `MODAL_DEPTH_URL` to the HTTPS endpoint printed by Modal. `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` must be proxy-token credentials created for the workspace, not Modal CLI authentication tokens.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the development server on `127.0.0.1:3001` |
| `pnpm build` | Create a production build |
| `pnpm start` | Serve the production build on `127.0.0.1:3001` |
| `pnpm typecheck` | Run TypeScript without emitting files |
| `pnpm test` | Run Vitest tests |
| `pnpm test:e2e` | Run Playwright end-to-end tests |
| `pnpm verify` | Run type checking, unit tests, and a production build |
| `pnpm modal:check` | Run Python contract tests for the Modal worker |
| `pnpm modal:deploy` | Deploy the Modal depth worker |

## Privacy and cloud use

Trip Memory is a protected, single-owner demo, not a hosted backup or multi-user account system. Its main collection remains in the current browser. Localhost and deployed domains have separate IndexedDB stores, so use export/import to move a memory between them.

Cloud actions require explicit consent before photographs are shared and may consume paid provider resources. Keep provider-side spending limits enabled. Reactor media streams directly to the browser; the app does not proxy that media through a Vercel Function.

## Deploy to Vercel

The Next.js frontend and API routes can run on Vercel with Node.js 24 and Fluid compute. Deploy the Modal GPU worker separately; `modal/` and `.venv/` are intentionally excluded from Vercel.

Copy the six provider and access settings from `.env.example` into the Vercel project environment. Vercel system hostnames are trusted automatically. Set `MEMORY_SITE_ORIGIN` only when you need to allow an additional exact HTTPS origin; do not copy the localhost value into production.

Keep the app access code private. This repository is designed for a protected personal demo rather than public, anonymous cloud access.

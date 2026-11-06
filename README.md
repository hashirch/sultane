---
title: Sultane Luxury Jewellery
emoji: 💍
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# SULTANÉ

Luxury silver jewellery e-commerce site: React storefront + admin dashboard, Express API, PostgreSQL database. Three independent packages — each has its own `package.json`, runs on its own, and is documented in its own README.

```
frontend/    React + TypeScript + Tailwind storefront and admin dashboard
backend/     Express + TypeScript API (routes, auth, uploads)
database/    PostgreSQL schema, migrations, seed data — no app code
```

## Run it

Three terminals, in this order:

```bash
# 1. Database — one-time setup
cd database && npm install && cp .env.example .env
npm run migrate && npm run seed

# 2. Backend
cd backend && npm install && cp .env.example .env
npm run dev          # http://localhost:4000

# 3. Frontend
cd frontend && npm install && cp .env.example .env
npm run dev          # http://localhost:5173 (or next free port)
```

Open the frontend URL. Admin dashboard is at `/admin/login` — the seed script prints the owner login it creates (default `owner@sultane.pk` / `change-this-password`, override via `database/.env` before seeding anything real).

For production or Docker deployment, set `JWT_SECRET` to a long, random value and provide the production `DATABASE_URL`; neither is configured in the image.

## Free deployment

The repository includes a GitHub Pages workflow for the frontend and a Render blueprint for the API:

1. Create a free PostgreSQL database on Neon and copy its connection string.
2. In Render, create a Blueprint from this repository using `render.yaml`. Set `DATABASE_URL` to the Neon connection string and `CORS_ORIGIN` to `https://hashirch.github.io`.
3. Run the database migration and seed against Neon using the `database` package, then note the Render API URL.
4. In GitHub repository Settings → Secrets and variables → Actions → Variables, add `VITE_API_URL` with the Render API URL plus `/api`, for example `https://sultane-api.onrender.com/api`.
5. In GitHub repository Settings → Pages, select **GitHub Actions** as the source. Pushes to `main` will deploy the frontend at `https://hashirch.github.io/sultane/`.

Free services can sleep when idle and have usage limits. The API's local upload directory is ephemeral on free hosting, so uploaded files should move to object storage before production use.

## Why three packages instead of one

`database/` owns the schema and has no business knowing about Express or React — it's a deployment-time concern (migrate once, before anything else starts), not a runtime one. `backend/` only keeps the thin query client it needs at request time (`backend/src/db/pool.ts`); schema changes never require touching it. `frontend/` only ever talks to `backend/` over HTTP and has zero knowledge of PostgreSQL. Each can be developed, deployed, and reasoned about independently — see `database/README.md` for the fuller rationale.

## Verifying it actually works

`frontend/verify-integration.mjs` is a Playwright script that drives both running servers together through a real checkout, admin login, payment verification, article-code generation, and lookup — against live Postgres data, not mocks. Run it whenever you touch the integration between frontend and backend:

```bash
cd frontend && node verify-integration.mjs
```

## Current scope

Fully live: catalogue, cart, checkout, order confirmation, customisation enquiries (both flows), article verification, order tracking, admin orders + admin enquiries dashboards.

Known gaps (see each package's README for detail): no payment-proof upload screen in the storefront yet, admin catalogue/article-registry/settings screens are placeholders, cart doesn't persist across a hard refresh, no automated test suite.

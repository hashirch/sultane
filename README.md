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

Luxury silver jewellery e-commerce for Pakistan (English, PKR), built to the **SULTANÉ Website Feasibility Study & Developer Requirements** (v2). React storefront + owner dashboard, Express API, PostgreSQL.

```
frontend/    React + TypeScript + Tailwind storefront and owner dashboard
backend/     Express + TypeScript API (routes, auth, uploads, acceptance tests)
database/    PostgreSQL schema, reset/migrate, seed data — no app code
```

## Run it locally

```bash
# 1. Database — one-time setup (DATABASE_URL must point at an existing, UTF-8 database)
cd database && npm install && cp .env.example .env
npm run migrate && npm run seed

# 2. API
cd backend && npm install && cp .env.example .env   # set JWT_SECRET to a long random string
npm run dev          # http://localhost:4000

# 3. Storefront
cd frontend && npm install && cp .env.example .env
npm run dev          # http://localhost:5173
```

Owner dashboard: `/admin/login` — the seed prints the owner login (default `owner@sultane.pk` / `change-this-password`; set `SEED_ADMIN_PASSWORD` before seeding anything real, and change it in **Site settings → Account**).

> **Upgrading an existing v1 database:** the v2 schema is not compatible with the first prototype's tables (5 collections, COD, etc.). Run `npm run reset && npm run seed` in `database/` — this **deletes all data**, which is fine pre-launch. On the Hugging Face Space, restart with a fresh persistent volume so `start.sh` initialises the new schema.

## Free deployment

**Without an API (catalogue-only, current setup):** when the `VITE_API_URL` Actions variable is not set, the GitHub Pages site runs from the bundled catalogue in `frontend/src/data/catalogue.json`. Products, photos, collections, FAQs and policies all show, and checkout sends the order to the shop on WhatsApp. Order tracking, accounts, piece verification and the owner dashboard need the API.

**Owner dashboard (`/admin`):** the owner edits the shop from https://hashirch.github.io/sultane/admin — launch new products with photos, change prices (`0` shows *Price on request* with an *Ask price on WhatsApp* button), names, descriptions, collections and visibility, and run **New Arrivals**: a product shows in the New Arrivals section (homepage, menu and `/new-arrivals`) for a set number of days after its launch date, then leaves on its own; the section is hidden when nothing is new. Shop settings cover the WhatsApp number, the New Arrivals period and the announcement bar.

There is no server: the dashboard signs in with a GitHub fine-grained access key (only this repository, *Contents: Read and write*, *Actions: Read-only*) and each save is one commit to `frontend/src/data/catalogue.json` plus any new photos in `frontend/public/products/` (1000px) and `frontend/public/products/sm/` (480px). The Pages workflow then republishes the site in about a minute. `catalogue.json` is the single source of truth for the static site — edit it through the dashboard. The backend's `database/seed.ts` keeps the sample products the acceptance tests rely on.

**Firebase Hosting with your own domain:** `.github/workflows/deploy-firebase.yml` builds the site for the root path (`VITE_BASE=/`) and deploys it to Firebase on every push to `main`, including dashboard saves. It stays off until both of these exist in GitHub → Settings → Secrets and variables → Actions:

1. In the Firebase console, create a project (the free Spark plan is enough) and note its project ID.
2. Google Cloud console → IAM & Admin → Service accounts → pick the project → create a service account with the roles *Firebase Hosting Admin*, *API Keys Viewer* and *Cloud Run Viewer*, then Keys → Add key → JSON.
3. Add the Actions **variable** `FIREBASE_PROJECT_ID` (the project ID) and the Actions **secret** `FIREBASE_SERVICE_ACCOUNT` (the whole JSON file's contents). Re-run the workflow or push to deploy.
4. Firebase console → Hosting → Add custom domain, enter the domain, and add the DNS records it shows at your domain registrar. Firebase issues the HTTPS certificate itself.

`firebase.json` holds the hosting config (every path falls back to `index.html`, long caching for `assets/`). GitHub Pages keeps deploying alongside; turn it off in Settings → Pages once the domain is live.

**With an API (full shop: orders, receipts, article numbers, accounts):** the repository also includes a Render blueprint:

1. Create a free PostgreSQL database on Neon (region: AWS Singapore) and copy its connection string.
2. In Render, create a Blueprint from this repository using `render.yaml` and paste the Neon connection string as `DATABASE_URL`. The blueprint uses the Starter plan in Singapore with a 1 GB disk for uploads (receipts and dashboard photos survive restarts). On every start the API runs `database` `bootstrap`: it applies the schema (also upgrading an existing database) and, only if the database is empty, loads the real shop catalogue from `frontend/src/data/catalogue.json` (`npm run import-catalogue`) plus the owner account and default settings. Set `SEED_SAMPLES=yes` to load the sample catalogue instead. The owner dashboard password is generated as `SEED_ADMIN_PASSWORD` (Render → sultane-api → Environment). Once the API is live the owner works in its dashboard (`/admin/login`), which includes products, New Arrivals launch dates and the New Arrivals period (Site settings → Homepage); the GitHub-key dashboard is only used by the catalogue-only site.
3. Note the Render API URL (e.g. `https://sultane-api.onrender.com`).
4. In GitHub repository Settings → Secrets and variables → Actions → Variables, add `VITE_API_URL` with the Render API URL plus `/api`, for example `https://sultane-api.onrender.com/api`.
5. In GitHub repository Settings → Pages, select **GitHub Actions** as the source. Pushes to `main` will deploy the frontend at `https://hashirch.github.io/sultane/`.

Free services can sleep when idle and have usage limits. The API's local upload directory (including private payment receipts) is ephemeral on free hosting, so uploads should move to persistent storage before production use.

## What the site does (feasibility study → implementation)

| Requirement | Where |
|---|---|
| Baby pink / silver / rose gold / black luxury identity | `frontend/src/index.css` tokens, `Wordmark`, rose-gold accents |
| 7-second hero video: muted autoplay loop, sound toggle, fallback image, wordmark + Shop Now | `HeroVideo.tsx`; owner uploads it in **Site settings → Homepage** |
| Homepage: Bestsellers, Premium, Men's, Customise, Story, collection tiles, footer | `pages/Home.tsx` |
| Nav: Necklaces, Earrings, Bracelets, Men's (Chains/Rings/Bracelets), Rings, Collections (Italia/Turkish/Middle Eastern), Premium, Customized Jewellery, About Us + search, account, cart, **Verify Your Piece** | `components/Header.tsx` |
| Products in several places at once; filters by type, collection, gemstone | `product_collections` table, `pages/Shop.tsx` |
| New Arrivals: launch date per product, period in Site settings; section hides when empty | `products.launched_at`, `lib/newArrivals.ts` |
| New Arrivals: launch date per product, period in Site settings; section hides itself when empty | `products.launched_at`, `lib/newArrivals.ts` |
| Made-to-order: publish / pause / unpublish, per-product production time, no stock counts | `products.status`, `production_time` |
| “925 Sterling Silver” tag only when confirmed per product | `products.purity_925` |
| Premium gemstone details + optional **Rs. 799** testing, ticked by default, saved on the order | product page, `order_items.gemstone_testing` / `testing_fee_pkr` |
| Buy the original vs. **Customise This Design — Request Price** (never priced in the cart) | `ProductDetail.tsx`, `CustomizeExisting.tsx` |
| New design from an inspiration image → WhatsApp | `NewCustomDesign.tsx`, `EnquiryConfirmation.tsx` |
| Guest checkout + optional accounts with order history | `Checkout.tsx`, `Account.tsx` |
| Bank transfer only; receipt upload; manual verify / flag; upload never starts production | `orders.ts` (`payment-proof`, `verify-payment`, `flag-payment`) |
| One unique article number **per piece**, created only on verification; QR authenticity cards | `verify-payment`, **Article registry** (print cards) |
| Verify page shows only name, piece, purchase date; rate-limited; invalid numbers reveal nothing | `articles.ts`, `pages/Verify.tsx` (`/verify/:code` is the QR target) |
| Status workflow Pending Price → … → Delivered with enforced transitions; courier, tracking no., date, link | `orders.ts` `TRANSITIONS`, admin order page |
| Secure tracking (order no. + phone), WhatsApp update templates | `TrackOrder.tsx`, admin order page |
| Free Karachi delivery, configurable charge elsewhere | **Site settings → Store** |
| Promo codes: dates, limits, per-customer limits, min order, collection/product scope | **Promotions & rewards** |
| 5% next-order reward: after first delivered order, once per customer, bound to their phone | `POST /orders/:id/loyalty`, `loyalty_rewards` |
| FAQs, delivery / returns & defects / privacy / terms — editable | **Site settings → Story & FAQs / Policies** |
| Reports: verified revenue vs outstanding, pipeline, bestsellers, promo usage | **Overview** |
| No reviews, no testimonials, no abandoned-cart messages | intentionally absent |

## Verifying it works

`backend/test/acceptance.mjs` runs 71 checks mapped to §25 *Acceptance Criteria* against a running API and a **freshly seeded** database:

```bash
cd database && npm run reset && npm run seed     # sample catalogue (SEED_SAMPLES defaults to yes)
cd ../backend && npm run dev            # in another terminal
API_URL=http://localhost:4000 npm run test:acceptance
```

## Before launch (business inputs needed)

- Upload the real hero video and fallback still; replace sample products and photos.
- Enter real bank details and WhatsApp number (**Site settings → Store**).
- Confirm 925 purity per product before ticking the tag; confirm the gemstone-testing provider and wording.
- Review the policy texts with a legal adviser (consumer-protection rights must not be limited).
- Production hosting: HTTPS, a strong `JWT_SECRET`, `CORS_ORIGIN`, daily `pg_dump` backups and a backup of `backend/uploads/` (see `backend/README.md`).

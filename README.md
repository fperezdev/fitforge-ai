# FitForge AI

AI-powered workout planner for hypertrophy and running, with a Gemini-backed coach.

**Stack:** Hono · Drizzle ORM · Supabase (Auth + PostgreSQL) · React · Vite · Tailwind CSS v4

---

## Prerequisites

| Tool                    | Version                    |
| ----------------------- | -------------------------- |
| Node.js                 | 20+                        |
| pnpm                    | 9+ (`npm install -g pnpm`) |
| A Supabase project      | —                          |
| A Google Gemini API key | —                          |

---

## Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

**API** — copy and fill in `apps/api/.env`:

```bash
cp apps/api/.env.example apps/api/.env
```

| Variable                   | Where to find it                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Supabase → Project Settings → Database → Connection string (use the "URI" format, port `5432`) |
| `SUPABASE_URL`             | Supabase → Project Settings → API → Project URL                                                |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase → Connect → API Keys → Publishable Key                                                |
| `SUPABASE_SECRET_KEY`      | Supabase → Settings → API Keys → Secret key                                                    |
| `GEMINI_API_KEY`           | [Google AI Studio](https://aistudio.google.com/app/apikey)                                     |
| `WEB_URL`                  | `http://localhost:5173` (default Vite port)                                                    |
| `PORT`                     | `3000` (default)                                                                               |

**Web** — copy and fill in `apps/web/.env`:

```bash
cp apps/web/.env.example apps/web/.env
```

| Variable       | Value                   |
| -------------- | ----------------------- |
| `VITE_API_URL` | `http://localhost:3000` |

### 3. Run database migrations

Drizzle reads `DATABASE_URL` from `apps/api/.env`. Run from the repo root:

```bash
pnpm --filter @fitforge/db exec drizzle-kit migrate
```

> If you need to generate new migration files after changing the schema:
>
> ```bash
> pnpm --filter @fitforge/db exec drizzle-kit generate
> pnpm --filter @fitforge/db exec drizzle-kit migrate
> ```

### 4. Start the dev servers

```bash
pnpm dev
```

This runs `apps/api` (Hono on port 3000) and `apps/web` (Vite on port 5173) in parallel.

Open [http://localhost:5173](http://localhost:5173).

---

## Project structure

```
fitforge-ai/
├── apps/
│   ├── api/          # Hono backend (Node.js)
│   └── web/          # React + Vite frontend
└── packages/
    └── db/           # Drizzle schema + client (shared)
```

---

## Deployment (Render)

The repo ships with a `render.yaml` that defines two services:

| Service  | Type                | Name           |
| -------- | ------------------- | -------------- |
| Backend  | Node.js web service | `fitforge-api` |
| Frontend | Static site         | `fitforge-web` |

### Steps

1. Push the repository to GitHub (or GitLab).

2. Go to [render.com](https://render.com) → **New** → **Blueprint** → connect your repo.  
   Render will detect `render.yaml` and create both services automatically.

3. For each service, set the environment variables marked `sync: false` in the Render dashboard:

   **`fitforge-api`**

   | Variable                   | Value                                                                   |
   | -------------------------- | ----------------------------------------------------------------------- |
   | `DATABASE_URL`             | Supabase connection string                                              |
   | `SUPABASE_URL`             | Supabase project URL                                                    |
   | `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key                                                |
   | `SUPABASE_SECRET_KEY`      | Supabase secret key                                                     |
   | `GEMINI_API_KEY`           | Gemini API key                                                          |
   | `WEB_URL`                  | Public URL of `fitforge-web` (e.g. `https://fitforge-web.onrender.com`) |

   **`fitforge-web`**

   | Variable       | Value                                                                   |
   | -------------- | ----------------------------------------------------------------------- |
   | `VITE_API_URL` | Public URL of `fitforge-api` (e.g. `https://fitforge-api.onrender.com`) |

4. Trigger a deploy. Render will install pnpm, build both workspaces, and start the API.

> **Free tier note:** Render free web services spin down after 15 minutes of inactivity and take ~30 s to cold-start on the next request.

---

## Useful commands

```bash
# Type-check all packages
pnpm typecheck

# Build everything
pnpm build

# Drizzle Studio (visual DB browser)
pnpm --filter @fitforge/db exec drizzle-kit studio
```

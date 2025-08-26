# Deployment.md

Run this Next.js app **locally** (Node or Docker), and ship it from your GitHub repo. Includes environment setup, production build, Docker, troubleshooting, and optional debug tools.

---

## 0) Prerequisites

- **Google AI Studio API key** (Gemini). You’ll need it as `GEMINI_API_KEY`.
- **Node.js 20+** (22 recommended) with npm/yarn/pnpm **or** **Docker 24+**.
- Git installed.

> This app uses Next.js 15 / React 19. Node 20/22 works great.

---

## 1) Clone the repository

```bash
# SSH
git clone git@github.com:<YOUR_GH_USERNAME>/<YOUR_REPO>.git
# or HTTPS
git clone https://github.com/<YOUR_GH_USERNAME>/<YOUR_REPO>.git

cd <YOUR_REPO>
```

---

## 2) Configure environment variables

Create **`.env.local`** in the project root:

```bash
# macOS/Linux
printf "GEMINI_API_KEY=YOUR_REAL_KEY_HERE\n" > .env.local
```

```powershell
# Windows (PowerShell)
"GEMINI_API_KEY=YOUR_REAL_KEY_HERE" | Out-File -FilePath .env.local -Encoding utf8
```

Optional overrides:

```dotenv
# Optional: override the default model
GEMINI_MODEL=gemini-2.0-flash
# Optional: enable server-side debug by default (see §6)
DEBUG_EXTRACT=1
```

> ⚠️ `.env.local` lines must be `KEY=value`. Do **not** write `process.env.GEMINI_API_KEY`.

---

## 3) Run locally (Node)

Install dependencies (pick one):

```bash
# npm
npm ci
# yarn
yarn install --frozen-lockfile
# pnpm
corepack enable pnpm
pnpm install --frozen-lockfile
```

### 3.1 Dev mode (hot reload)

```bash
npm run dev
# or: yarn dev / pnpm dev
```

Open: http://localhost:3000

### 3.2 Production build (local)

```bash
npm run build
npm run start
```

Change port if needed:

```bash
PORT=4000 npm run dev   # then open http://localhost:4000
```

> If the build fails only due to ESLint (e.g. “Unexpected any”), either fix the rule or temporarily add in `next.config.ts`:
>
> ```ts
> export default {
>   output: "standalone",
>   eslint: { ignoreDuringBuilds: true },
>   // ...rest of your config
> }
> ```

---

## 4) Run in Docker

Build:

```bash
docker build -t pdf-extractor .
```

Run:

```bash
docker run --rm   -e GEMINI_API_KEY=YOUR_REAL_KEY_HERE   -p 3000:3000   pdf-extractor
```

Open: http://localhost:3000

### 4.1 docker-compose (optional)

```yaml
# docker-compose.yml
services:
  pdf-extractor:
    build: .
    ports:
      - "3000:3000"
    environment:
      GEMINI_API_KEY: ${GEMINI_API_KEY}
```

Run:

```bash
GEMINI_API_KEY=YOUR_REAL_KEY_HERE docker compose up --build
```

---

## 5) Using the app

1. Upload a **PDF** (≤ 100 MB).
2. (Optional) Fill **Supplier / Manufacturer / Validity Date**.
3. Click:
   - **Extract Data (fast)** — heuristic parser (no AI).
   - **Smart Extract (AI)** — sends PDF to Gemini and returns structured rows.

Preview appears on the right; results table supports **JSON/XLSX** export.

---

## 6) Debugging “Model returned non-JSON”

The AI route is defensive and tries to repair “JSON-ish” replies. To see exactly what’s happening **without server logs**:

- Temporarily call the API with `?debug=1` (the route supports this):
  - In the client fetch, change `/api/extract` → `/api/extract?debug=1`.
- When it fails, open DevTools → **Network** → `api/extract` → **Response**:
  - `detail`: first 2k chars of Gemini’s raw text,
  - `debug.cleanedFirst2k`: what the sanitizer tried to parse,
  - `debug.stagesTried` and `stage`: which strategies ran,
  - Response header `x-extract-debug-stage`.

Common causes & quick fixes:

- **Key not loaded** → ensure `.env.local` is set and you restarted the dev server, or pass `-e GEMINI_API_KEY=...` to Docker.
- **Lint-only build failures** → use `eslint.ignoreDuringBuilds` temporarily (see §3.2), then fix lint rules.
- **Array vs object** → the route accepts `{ items: [...] }` **or** a bare array; both are normalized client-side.

---

## 7) Folder map

```
app/
  page.tsx                 # UI: upload, preview, actions, results
  api/
    parse/route.ts         # Fast heuristic parser (no AI)
    extract/route.ts       # Gemini + JSON Schema (robust sanitizer + ?debug=1)
components/                # UI parts (FileUpload, ResultDisplay, PDF preview)
lib/                       # pdf parsing + helpers
next.config.ts             # Next.js config (standalone output, aliases)
Dockerfile                 # Multi-stage build (deps → build → runner)
.env.local                 # GEMINI_API_KEY=...
```

---

## 8) Deploying to a Linux box (systemd) (optional)

```bash
# Build on the server
git clone https://github.com/<YOU>/<REPO>.git
cd <REPO>
echo "GEMINI_API_KEY=YOUR_REAL_KEY" > .env.local
npm ci && npm run build

# Create a systemd service
sudo tee /etc/systemd/system/pdf-extractor.service >/dev/null <<'EOF'
[Unit]
Description=PDF Extractor (Next.js)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/pdf-extractor
Environment=PORT=3000
EnvironmentFile=/opt/pdf-extractor/.env.local
ExecStart=/usr/bin/npm run start
Restart=on-failure
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
EOF

# Move repo to /opt and enable service
sudo mkdir -p /opt/pdf-extractor
sudo rsync -a . /opt/pdf-extractor/
sudo systemctl daemon-reload
sudo systemctl enable --now pdf-extractor

# (Optional) Put Nginx in front for TLS
```

---

## 9) Troubleshooting checklist

- **404/401/429 from Gemini**: check API key validity and quotas.
- **“Missing required env var: GEMINI_API_KEY”**: verify `.env.local` and restart; for Docker, ensure `-e` is set.
- **PDF too large**: route limits inline PDFs to ~18 MB; compress or split the file.
- **ESLint errors stop build**: fix the rule or temporarily use `eslint.ignoreDuringBuilds`.
- **Port already in use**: run with `PORT=4000 npm run dev` (or map different Docker port).

---

## 10) Updating dependencies

```bash
# npm
npm outdated && npm update
# yarn
yarn outdated && yarn upgrade
# pnpm
pnpm outdated && pnpm up -L
```

---

## 11) Security notes

- Do **not** commit `.env.local`.
- Keep `GEMINI_API_KEY` in your host’s secret manager for production.
- Uploaded PDFs are sent to Gemini for extraction; follow your data policy.

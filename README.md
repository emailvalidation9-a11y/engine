# 📧 Email Validation Engine

A high-performance, standalone email validation engine with real-time single and bulk processing capabilities. Validates email addresses through multi-layer checks including syntax, DNS, SMTP, and HTTP provider-specific verification.

---

## ✨ Features

### Core Validation Pipeline
- **Syntax Check** — RFC 5322 compliant regex, local-part length limits, domain format validation
- **MX Record Lookup** — Multi-resolver DNS queries (Google, Cloudflare, OpenDNS) with A-record fallback per RFC 5321 §5
- **DNS Extras** — SPF and DMARC record detection, IPv4/IPv6 availability
- **SMTP Verification** — Direct mailbox probe with STARTTLS upgrade, multi-port support (25, 587, 465), and intelligent retry logic
- **HTTP Provider Fallback** — API-based verification for Google, Microsoft, and Yahoo when SMTP is blocked
- **Catch-All Detection** — Identifies domains that accept mail for any address
- **Disposable Domain Detection** — 100+ known throwaway email providers
- **Role Account Detection** — Identifies addresses like `admin@`, `info@`, `support@`, etc.
- **Free Provider Detection** — Flags Gmail, Yahoo, Outlook, and 40+ other free providers
- **Blacklist Awareness** — Detects IP/domain-based SMTP rejections from anti-spam gateways

### Provider Intelligence
Recognizes and applies optimized strategies for 18+ email providers:
Google, Microsoft, Yahoo, Apple, ProtonMail, Zoho, Yandex, GMX, Fastmail, Mail.ru, Mimecast, Proofpoint, Barracuda, Symantec, GoDaddy, Rackspace, AWS SES, SendGrid

### Processing Modes
| Mode | Description |
|------|-------------|
| **Single** | Validate one email via API or web UI |
| **Bulk (JSON)** | Submit up to 100,000 emails as a JSON array |
| **Bulk (CSV)** | Upload a CSV file with auto-detected encoding |
| **Job Tracking** | Monitor async bulk jobs and download results |

### Additional Highlights
- 🔄 Auto-detected CSV encoding (UTF-8, Latin-1, Shift_JIS, etc.) via `chardet` + `iconv-lite`
- 📊 Admin dashboard for monitoring active/completed/failed jobs
- 🧹 Automatic job cleanup (completed jobs purged after 1 hour)
- 💾 In-memory MX and DNS caching with 10-minute TTL
- 🛡️ Robust error handling — ECONNRESET, timeouts, and unhandled rejections won't crash the server
- 📦 Packageable as a standalone Windows `.exe` via `pkg`

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or later (for development)
- No prerequisites needed for the standalone `.exe`

### Run from Source

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or with auto-reload (development)
npm run dev
```

The server starts on **http://localhost:3000** by default.

### Run as Standalone Executable

```bash
# Build the .exe
npm run build

# Run it — no Node.js required on the target machine
dist/EmailValidator.exe
```

The `.exe` bundles everything (Node.js runtime, dependencies, web UI) into a single file. Just copy and run.

#### Startup Options

```bash
# Add to Windows startup (auto-start on login)
EmailValidator.exe --install

# Remove from Windows startup
EmailValidator.exe --uninstall
```

### Run with Docker

```bash
# Single instance
docker build -t email-validator .
docker run -p 3000:3000 email-validator

# Multi-instance with Nginx load balancer
docker-compose up -d
```

---

## 🌐 API Reference

### Single Email Validation

```http
POST /v1/validate
Content-Type: application/json

{
  "email": "user@example.com",
  "options": {
    "skip_smtp": false
  }
}
```

**Response:**
```json
{
  "email": "user@example.com",
  "syntax": true,
  "disposable": false,
  "role": false,
  "free": true,
  "mx": ["alt1.gmail-smtp-in.l.google.com"],
  "provider": "google",
  "mailbox_verified": true,
  "catchall": false,
  "status": "valid",
  "score": 95
}
```

### Bulk Validation (JSON)

```http
POST /v1/validate/bulk
Content-Type: application/json

{
  "emails": ["user1@gmail.com", "user2@yahoo.com"],
  "options": { "skip_smtp": false }
}
```

**Response:**
```json
{ "jobId": "abc-123-def", "status": "queued" }
```

### Bulk Validation (CSV Upload)

```http
POST /v1/validate/bulk/csv
Content-Type: multipart/form-data

csvFile: <file>
emailColumn: "email"
options: "{}"
```

### Parse CSV Headers

```http
POST /v1/csv/headers
Content-Type: multipart/form-data

csvFile: <file>
```

### Job Status

```http
GET /v1/jobs/:jobId
```

### Job Results (JSON)

```http
GET /v1/jobs/:jobId/results
```

### Job Results (CSV Download)

```http
GET /v1/jobs/:jobId/results/csv
```

### Health Check

```http
GET /health
```

### Clear Cache

```http
POST /v1/cache/clear
```

---

## 🗂️ Project Structure

```
engine/
├── app.js              # Express server, API routes, bulk processing
├── validator.js         # Core validation engine (syntax, DNS, SMTP, HTTP)
├── launcher.js          # Packaged .exe entry point with path setup
├── package.json         # Dependencies and build scripts
├── Dockerfile           # Docker image definition
├── docker-compose.yml   # Multi-instance deployment with Nginx
├── public/
│   ├── index.html       # Web UI — single, bulk, CSV, job tracking
│   ├── admin.html       # Admin dashboard — job monitoring
│   ├── styles.css       # UI styles
│   └── script.js        # Frontend logic
├── uploads/             # Temporary CSV upload directory
└── dist/
    └── EmailValidator.exe  # Built standalone executable
```

---

## ⚙️ Configuration

| Environment Variable | Default | Description |
|----------------------|---------|-------------|
| `PORT` | `3000` | Server port |
| `INSTANCE_ID` | `default` | Instance identifier (for multi-instance setups) |
| `NODE_ENV` | — | Set to `production` for Docker deployments |

---

## 📝 License

Proprietary — All rights reserved.

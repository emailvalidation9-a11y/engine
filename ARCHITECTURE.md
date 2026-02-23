# Kimi — Email Validation SaaS Platform
## Complete System Architecture

---

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USERS / CLIENTS                            │
│                    (Browser / API Consumers)                        │
└──────────────────┬──────────────────────┬───────────────────────────┘
                   │ HTTPS :5173          │ REST API :5000
                   ▼                      ▼
┌──────────────────────────┐  ┌──────────────────────────────────────┐
│   🟦 FRONTEND APP        │  │   🟩 BACKEND API                     │
│   React + Vite + TS      │──│   Node.js + Express                  │
│   Port 5173              │  │   Port 5000                          │
└──────────────────────────┘  └──────┬──────────┬──────────┬─────────┘
                                     │          │          │
                   ┌─────────────────┘          │          └────────────┐
                   ▼                            ▼                      ▼
    ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐
    │  🟪 MongoDB Atlas    │  │  🟧 Validation Engine │  │  🔴 Stripe       │
    │  Database            │  │  Node.js + Express    │  │  Payments        │
    │  (Cloud)             │  │  Port 3000            │  │  Subscriptions   │
    └──────────────────────┘  └──────────┬────────────┘  └──────────────────┘
                                         │
                              ┌──────────┴───────────┐
                              ▼                      ▼
                   ┌─────────────────┐    ┌─────────────────┐
                   │  📡 Remote MX   │    │  🌐 HTTP APIs   │
                   │  SMTP Port 25   │    │  Microsoft      │
                   │  DNS Queries    │    │  Yahoo           │
                   └─────────────────┘    └─────────────────┘
```

---

## 🟦 Frontend App — `app/` (Port 5173)

**Stack:** React 18 + Vite + TypeScript + Shadcn UI + Tailwind CSS

### Pages & Routes

| Section | Route | Component |
|---------|-------|-----------|
| **Public** | `/` | Landing |
| | `/pricing` | Pricing |
| | `/docs` | Documentation |
| | `/about` | About |
| | `/contact` | Contact |
| | `/blog` | Blog |
| | `/privacy` | Privacy Policy |
| | `/terms` | Terms of Service |
| | `/gdpr` | GDPR Policy |
| **Auth** | `/login` | Login |
| | `/register` | Register |
| | `/forgot-password` | Forgot Password |
| | `/reset-password/:token` | Reset Password |
| | `/verify-email` | Verify Email |
| | `/verify-email/:token` | Verify Email Callback |
| | `/setup` | Initial Admin Setup |
| **Dashboard** | `/dashboard` | Dashboard Home |
| | `/validate/single` | Single Email Verify |
| | `/validate/bulk` | Bulk CSV Verify |
| | `/history` | Validation Logs |
| | `/api-keys` | API Key Management |
| | `/billing` | Plans & Billing |
| | `/settings` | Account Settings |
| **Admin** | `/admin` | Admin Overview |
| | `/admin/users` | User Management |
| | `/admin/users/:id` | User Profile |
| | `/admin/jobs` | Job Management |
| | `/admin/transactions` | Transactions |
| | `/admin/api-keys` | API Key Management |
| | `/admin/activity` | Activity Logs |
| | `/admin/servers` | Validation Servers |
| | `/admin/pricing` | Pricing Config |
| | `/admin/blog` | Blog CMS |
| | `/admin/inbox` | Contact Messages |
| | `/admin/config` | Site Config |
| | `/admin/settings` | Admin Settings |

### State Management

```
AuthContext (JWT)
├── user: { id, name, email, credits, total_validations, plan, role }
├── login(email, password) → stores JWT in localStorage
├── register(name, email, password)
├── logout() → clears JWT
└── refreshUser() → GET /api/auth/me → updates user state
```

### API Client (`services/api.ts`)

```
Axios Instance → baseURL: /api
├── Request Interceptor: Attaches Bearer JWT from localStorage
├── Response Interceptor: Handles 401 (token expiry)
├── authApi: login, register, getMe, updateProfile, changePassword, forgotPassword, resetPassword
├── validationApi: validateSingle, validateBulk, getJobs, getJob, cancelJob
├── apiKeysApi: getKeys, createKey, updateKey, deleteKey
├── billingApi: getPlans, createCheckout, purchaseCredits, cancelSubscription, getTransactions
├── accountApi: getActivityLog, getUsageStats, exportResultsCSV, deleteAccount
└── publicApi: getBlogPosts, getSettings, getPublicPlans, submitContact
```

---

## 🟩 Backend API — `backend/` (Port 5000)

**Stack:** Node.js + Express + Mongoose + JWT + bcrypt + Stripe + Nodemailer

### Middleware

```
protect(req, res, next)
├── Extracts Bearer token from Authorization header
├── Verifies JWT signature + expiry
├── Loads user from MongoDB
├── Checks user is_active
└── Sets req.user

restrictTo(...roles)
└── Checks req.user.role ∈ allowed roles (user, admin)
```

### API Routes & Controllers

```
/api/auth
├── POST   /register          → register (public)
├── POST   /login             → login (public)
├── GET    /me                → getMe (protected)
├── PUT    /profile           → updateProfile (protected)
├── PUT    /password          → changePassword (protected)
├── POST   /logout            → logout (protected)
├── POST   /forgot-password   → forgotPassword (public)
├── POST   /reset-password/:t → resetPassword (public)
├── GET    /verify-email/:t   → verifyEmail (public)
├── POST   /resend-verification → resendVerification (protected)
├── GET    /setup/status      → setupStatus (public)
└── POST   /setup             → setupAdmin (public, one-time)

/api/validate
├── POST   /single            → validateSingle (protected)
│   ├── Check credits ≥ 1
│   ├── Deduct 1 credit
│   ├── Call Engine POST /v1/validate
│   ├── Create ValidationJob (type: single, status: completed)
│   ├── Record usage + activity log
│   └── Return result + updated user credits
├── POST   /bulk              → validateBulk (protected)
│   ├── Select engine via weighted round-robin
│   ├── Forward file to Engine POST /v1/validate/bulk/csv
│   ├── Create ValidationJob (type: bulk, status: queued)
│   └── Return job_id + estimated time
├── GET    /jobs              → getJobs (protected, paginated)
├── GET    /jobs/:id          → getJob (protected)
│   ├── Fetch status from Engine GET /v1/jobs/:engineJobId
│   ├── On completion: deduct credits, record usage, send email
│   └── Send webhook if configured
├── GET    /jobs/:id/results  → getJobResults (protected)
└── DELETE /jobs/:id          → cancelJob (protected)

/api/keys
├── GET    /                  → listKeys (protected)
├── POST   /                  → createKey (protected)
├── PUT    /:id               → updateKey (protected)
└── DELETE /:id               → deleteKey (protected)

/api/billing
├── GET    /plans             → getPlans (protected)
├── POST   /checkout          → createCheckout → Stripe (protected)
├── POST   /credits           → purchaseCredits → Stripe (protected)
├── POST   /cancel            → cancelSubscription (protected)
└── GET    /transactions      → getTransactions (protected, paginated)

/api/account
├── GET    /activity          → getActivityLog (protected, paginated)
├── GET    /usage             → getUsageStats (protected)
├── GET    /export/:jobId     → exportResultsCSV (protected)
└── DELETE /                  → deleteAccount (protected, GDPR)

/api/admin (protected + admin role)
├── GET    /stats             → dashboard stats
├── GET    /users             → list users (paginated)
├── GET    /users/:id         → user details
├── PUT    /users/:id         → update user (credits, role, active)
├── DELETE /users/:id         → delete user
├── GET    /jobs              → all jobs
├── GET    /transactions      → all transactions
├── GET    /api-keys          → all API keys
├── GET    /activity          → all activity logs
├── CRUD   /blog              → blog post management
├── CRUD   /pricing           → pricing plan management
├── CRUD   /servers           → validation server management
└── CRUD   /settings          → site settings management
```

---

## 🟪 MongoDB Atlas — Database

### Collections & Models

```
Users
├── name, email, password (bcrypt hashed)
├── role (user | admin)
├── credits (Number, default: 100)
├── total_validations (Number)
├── plan { name, credits_limit, renewal_date }
├── stripe { customer_id, subscription_id, status }
├── email_verified, verification_token, verification_expire
├── reset_password_token, reset_password_expire
├── is_active (Boolean)
└── created_at, updated_at

ValidationJobs
├── user_id → Users
├── api_key_id → ApiKeys (nullable)
├── type (single | bulk)
├── engine_job_id (String)
├── source (dashboard | api)
├── status (queued | processing | completed | failed | cancelled)
├── total_emails, processed_emails, progress_percentage
├── valid_count, invalid_count, catch_all_count
├── disposable_count, role_based_count, unknown_count
├── credits_used, credits_reserved
├── file_info { original_filename, stored_path, file_size }
├── result_file { path, download_url, expires_at }
├── server_used, webhook_url, webhook_sent
├── input_data (Mixed - stores email for single validations)
├── error_message
└── created_at, completed_at

ApiKeys
├── user_id → Users
├── name, key (hashed), preview (first 8 chars)
├── is_active, usage_count
├── rate_limit_per_minute
└── last_used_at, created_at

Transactions
├── user_id → Users
├── type (subscription | credit_purchase | refund)
├── amount, currency
├── stripe_payment_id, stripe_invoice_id
├── plan_name, credits_added
├── status (pending | completed | failed | refunded)
└── created_at

ActivityLogs
├── user_id → Users
├── action (login | validation_single | validation_bulk | password_change | ...)
├── details (Mixed)
├── ip_address, user_agent
└── created_at

UsageStats
├── user_id → Users
├── date (Date)
├── single_count, bulk_count, api_count
├── credits_used
└── created_at

ValidationServers
├── name, url
├── isActive, isHealthy
├── weight (for load balancing)
├── totalRequests, successRate, avgResponseTime
├── region, lastHealthCheck
└── created_at

PricingPlans
├── name, display_name, price, interval
├── credits, features[]
├── stripe_price_id, stripe_product_id
├── is_active, sort_order
└── created_at

BlogPosts, ContactMessages, SiteSettings, Coupons, DisposableDomains
```

---

## 🟧 Validation Engine — `Engine/` (Port 3000)

**Stack:** Node.js + Express + Fastify (validator.js)

### API Endpoints

```
POST /v1/validate                → Single email validation
POST /v1/validate/bulk           → Bulk validation (JSON array)
POST /v1/validate/bulk/csv       → Bulk validation (CSV upload)
POST /v1/csv/headers             → Parse CSV headers
GET  /v1/jobs/:jobId             → Get job status
GET  /v1/jobs/:jobId/results     → Get job results (JSON)
GET  /v1/jobs/:jobId/results/csv → Download results (CSV)
POST /v1/cache/clear             → Clear all caches
```

### Validation Pipeline (`validator.js`)

```
validateEmail(email, options)
│
├── 1. SYNTAX CHECK
│   └── RFC 5322 regex validation
│
├── 2. MX/DNS LOOKUP
│   ├── Multi-resolver: Google (8.8.8.8), Cloudflare (1.1.1.1), OpenDNS
│   ├── Caching: MX results cached with TTL
│   └── Fallback: Try A record if no MX found
│
├── 3. DNS EXTRAS
│   └── SPF, DMARC, DKIM record checks
│
├── 4. SMTP PROBE
│   ├── Connect to MX host on port 25/465/587
│   ├── EHLO → MAIL FROM → RCPT TO
│   ├── Analyze response codes (250 = valid, 550 = invalid)
│   └── Detect: greylisting, rate limiting, blacklisting
│
├── 5. HTTP FALLBACK (if SMTP blocked)
│   ├── Microsoft: login.microsoftonline.com API
│   └── Yahoo: login.yahoo.com API
│
├── 6. PROVIDER IDENTIFICATION
│   └── Pattern matching: Google, Microsoft, Yahoo, iCloud, Zoho, etc.
│
├── 7. CATCH-ALL DETECTION
│   └── Test random address → if accepted, domain is catch-all
│
├── 8. DISPOSABLE DOMAIN CHECK
│   └── Match against 100+ known disposable providers
│
├── 9. ROLE-BASED CHECK
│   └── Detect: admin@, info@, support@, webmaster@, etc.
│
├── 10. FREE PROVIDER CHECK
│   └── Gmail, Yahoo, Outlook, iCloud, ProtonMail, etc.
│
├── 11. DETERMINE STATUS
│   ├── valid → deliverable mailbox confirmed
│   ├── invalid → mailbox does not exist
│   ├── catch_all → domain accepts everything
│   ├── disposable → temporary email service
│   ├── role_based → generic/group address
│   └── unknown → inconclusive result
│
└── 12. CALCULATE SCORE (0-100)
    ├── +40 valid syntax
    ├── +20 MX records found
    ├── +30 SMTP verified
    ├── -30 disposable domain
    ├── -10 role-based address
    ├── -10 catch-all domain
    └── -5 free provider
```

### Bulk Processing

```
CSV Upload
├── Parse CSV → Extract email column
├── Create Job (in-memory Map)
├── Background Worker:
│   ├── Process emails sequentially (with concurrency limits)
│   ├── Update job progress (completed / total)
│   └── Store results in job.results[]
├── Job Status Polling: GET /v1/jobs/:id
└── Results Download: GET /v1/jobs/:id/results/csv
    └── Generates CSV with original columns + validation results
```

### Caching

```
MX Cache:    Map<domain, { records, timestamp }>  (TTL: 60s cleanup)
DNS Cache:   Map<domain, { spf, dmarc, dkim }>    (TTL: 60s cleanup)
Jobs Map:    Map<jobId, { status, results, ... }>  (in-memory)
```

---

## 🔴 External Services

### Stripe
```
Payment Flow:
1. User clicks "Upgrade" or "Buy Credits" in frontend
2. Backend creates Stripe Checkout Session
3. User redirected to Stripe hosted payment page
4. On success → Stripe webhook → Backend updates user credits/plan
5. Transaction record created in MongoDB
```

### Email (Nodemailer)
```
Transactional Emails:
├── Welcome email (on registration)
├── Email verification link
├── Password reset link
├── Bulk job completion notification
├── Low credit warning
└── Account deletion confirmation
```

---

## 🔄 Key Data Flows

### Single Email Validation
```
User → Frontend → POST /api/validate/single → Backend
  ├── Check credits ≥ 1 → Deduct 1 credit
  ├── Select engine (weighted round-robin from ValidationServers)
  ├── POST /v1/validate → Engine
  │   └── Pipeline: syntax → MX → SMTP → fallback → scoring
  ├── Create ValidationJob (status: completed)
  ├── Log activity + record usage
  ├── Return { result, user: { credits, total_validations } }
  └── Frontend calls refreshUser() → sidebar updates
```

### Bulk Email Validation
```
User → Frontend → POST /api/validate/bulk (FormData) → Backend
  ├── Select engine (weighted round-robin)
  ├── Forward file → POST /v1/validate/bulk/csv → Engine
  │   └── Engine parses CSV, creates job, returns jobId
  ├── Create ValidationJob (status: queued)
  └── Return job_id

Frontend polls GET /api/validate/jobs/:id every 5s
  ├── Backend fetches from Engine GET /v1/jobs/:engineJobId
  ├── On completion:
  │   ├── Deduct credits = total_emails
  │   ├── Record usage + log activity
  │   ├── Send completion email
  │   └── Fire webhook (if configured)
  └── Frontend shows progress bar → results summary
```

### Authentication Flow
```
Register:
  POST /api/auth/register → hash password → save user → send verification email → return JWT

Login:
  POST /api/auth/login → verify password → return JWT + user data
  Frontend stores JWT in localStorage → Axios attaches to all requests

Protected Request:
  Request → protect middleware → extract JWT → verify → load user → proceed

Password Reset:
  POST /api/auth/forgot-password → generate token → send email
  POST /api/auth/reset-password/:token → verify token → update password
```

---

## ⚙️ Environment Configuration

### Backend `.env`
```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...
JWT_EXPIRE=30d
VALIDATION_ENGINE_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
FRONTEND_URL=http://localhost:5173
```

### Frontend `.env`
```
VITE_API_URL=http://localhost:5000/api
```

### Engine `.env`
```
PORT=3000
```

---

## 🚀 Running the Platform

```bash
# Terminal 1 - Validation Engine
cd Engine && npm run dev        # → http://localhost:3000

# Terminal 2 - Backend API
cd backend && npm run dev       # → http://localhost:5000

# Terminal 3 - Frontend App
cd app && npm run dev           # → http://localhost:5173
```

---

*Last updated: February 24, 2026*

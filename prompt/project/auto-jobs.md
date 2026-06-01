# Role
You are a senior full-stack engineer building a personal, single-user job-application
automation tool for the user's OWN job search across four Chinese job platforms. The
system has two parts: a Chrome browser extension (Manifest V3) and a local
Node.js + TypeScript script. Reverse-engineer all platform JSON APIs strictly from the
provided HAR files — never invent or guess endpoints, params, or headers.
# Context & Inputs
- HAR files are the AUTHORITATIVE API spec — one per platform:
  - `boss.har`    → Boss直聘 (zhipin.com)
  - `zhilian.har` → 智联招聘
  - `liepin.har`  → 猎聘
  - `51job.har`   → 前程无忧 (51job)
- Each HAR captures the real flow: search job list → open job detail → send
  application / greeting message.
- Reference job-list URL (Boss): https://www.zhipin.com/web/geek/jobs?city=101280100&position=100101
- All four platforms ship in this project, behind ONE shared pipeline + a pluggable
  `Platform` adapter interface. Platform-specific logic (endpoints, signing, field
  mapping) lives only inside each adapter.
# Execution model (HYBRID — important)
Some requests can be replayed server-side from Node; others carry dynamic signatures or
anti-bot params that can only be produced inside the live page context. Design for BOTH:
- `ServerExecutor`: replays an API request directly from the Node script (cookies/headers
  captured from the extension).
- `PageExecutor`: the Node script tells the extension "run this request for platform X
  with these params"; the extension executes it in the authenticated page/content-script
  context (so the page's own signing logic applies) and returns the JSON to the script.
- Per request, the adapter declares which executor it needs. The apply/greeting step
  defaults to `PageExecutor` unless the HAR proves a clean server-side replay works.
# Step 0 — Analyze BEFORE coding (mandatory)
1. Parse each HAR and write `docs/api-<platform>.md` documenting, per relevant request:
   method, URL, query params, required headers (highlight auth/cookie/signature fields),
   request body, and the response fields the pipeline consumes (jobId, title, JD text,
   HR/recruiter id, encrypted ids, pagination cursors, etc.).
2. For each request, classify executor as `server` or `page`, and justify it (e.g.
   "signed `zp_token` header regenerated client-side → page executor").
3. Output a short implementation plan + a file/folder tree, THEN start coding.
# Deliverables
## 1. Config (`config.yaml` + documented `config.example.yaml`)
- `ai`: baseURL, apiKey (from env), model, temperature, timeout, maxRetries
- `matchPrompt`: the job-vs-resume matching analysis prompt template
- `delays`: random per-step delay ranges {min,max} ms for list / detail / ai / apply
- `limits`: total applies per run, daily cap, max requests/minute (rate limit)
- `match.threshold`: score 0-100 at/above which to actually submit
- `resume.path`: local resume file (.md or .txt)
- `dryRun`: boolean — when true, NEVER submit; only log the intended action
- `platforms`: which of the four are enabled this run
- misc: log level, log file path, blacklist keywords / blacklist companies
## 2. Local HTTP server (Fastify or Express, bound to 127.0.0.1 ONLY)
- Endpoint to receive {platform, auth/session, current search filters} from the extension
- Endpoint(s) implementing the `PageExecutor` round-trip (script ⇄ extension request relay)
- Status/health endpoint; CORS restricted to the extension origin only
- Boots and idles, waiting for the extension to push a session before running the pipeline
## 3. Apply pipeline (shared core, runs after a session is received)
For the active platform's adapter:
- Query job list (handle pagination) → for each job:
  - Fetch detail (extract JD text) → read local resume → call OpenAI-compatible AI with
    `matchPrompt`
  - AI MUST return STRICT JSON, schema-validated:
    `{ "matchScore": number, "recommend": boolean, "mismatches": string[],
       "conclusion": string, "greeting": string }`
  - If `matchScore >= match.threshold` AND not `dryRun` → send greeting/application via
    the adapter (using server or page executor as declared)
  - Insert randomized human-like delays (from config) between EVERY step
  - Enforce limits (total / daily / per-minute); stop cleanly when any cap is hit
  - Persist a dedupe store (SQLite or JSON keyed by platform+jobId) so re-runs never
    double-apply; resumable after interruption
  - One failed job must be caught, logged, and skipped — never crash the run
## 4. Browser extension (Chrome MV3)
- Content script + background service worker:
  - On a supported job-list page, capture session/auth + current search filters and POST
    them to the local server
  - Implement the `PageExecutor` side: receive a relay request from the script, execute
    it in page context, return the response
- Popup UI: "Send to script" button, local-server connection status, basic run feedback
## 5. Logging
- Structured logs: timestamp, platform, jobId, title, matchScore, decision, action,
  AI conclusion (one record per processed job)
- Console + rotating file
- End-of-run summary: applied / skipped(reason) / errors counts
# AI integration
- Use the OpenAI Chat Completions request/response shape so ANY OpenAI-compatible endpoint
  works. apiKey from env, never hardcoded.
- Force JSON output (response_format=json_object when supported, else robust JSON
  extraction) and validate against the schema. On malformed output, retry up to
  `maxRetries`, then skip the job and log the failure.
# Technical constraints
- TypeScript strict mode. Module boundaries:
  `core/` (pipeline, scheduler, dedupe), `platforms/` (4 adapters + shared interface),
  `server/`, `ai/`, `config/`, `extension/`.
- Server binds to localhost only. Mask secrets in ALL logs (cookies, tokens, apiKey).
- Idempotent & resumable. Graceful per-job error isolation.
- `README.md`: setup, loading the extension, configuring, running, and a clear note that
  this is a personal-use tool and the user is responsible for complying with each
  platform's Terms of Service and rate limits.
# Acceptance criteria
- `docs/api-*.md` accurately reflect each HAR, including the executor classification.
- With `dryRun: true`, an end-to-end run on Boss直聘 logs:
  list fetched → details fetched → AI match JSON → correct submit/skip decision per
  threshold — WITHOUT sending any real application.
- Changing threshold / delays / limits / prompt / enabled platforms takes effect with NO
  code edits.
- Extension delivers a session to the local server and the pipeline starts; the
  `PageExecutor` relay successfully returns a real response for at least one signed request.
# Working method
- HAR analysis → API docs (with executor classification) → plan + file tree →
  implement in vertical slices: config → server → adapter interface → Boss adapter →
  `maxRetries`, then skip the job and log the failure.
# Technical constraints
- TypeScript strict mode. Module boundaries:
  `core/` (pipeline, scheduler, dedupe), `platforms/` (4 adapters + shared interface),
  `server/`, `ai/`, `config/`, `extension/`.
- Server binds to localhost only. Mask secrets in ALL logs (cookies, tokens, apiKey).
- Idempotent & resumable. Graceful per-job error isolation.
- `README.md`: setup, loading the extension, configuring, running, and a clear note that
  this is a personal-use tool and the user is responsible for complying with each
  platform's Terms of Service and rate limits.
# Acceptance criteria
- `docs/api-*.md` accurately reflect each HAR, including the executor classification.
- With `dryRun: true`, an end-to-end run on Boss直聘 logs:
  list fetched → details fetched → AI match JSON → correct submit/skip decision per
  threshold — WITHOUT sending any real application.
- Changing threshold / delays / limits / prompt / enabled platforms takes effect with NO
  code edits.
- Extension delivers a session to the local server and the pipeline starts; the
  `PageExecutor` relay successfully returns a real response for at least one signed request.
# Working method
- HAR analysis → API docs (with executor classification) → plan + file tree →
  implement in vertical slices: config → server → adapter interface → Boss adapter →
  pipeline → AI → extension → logging. Get Boss直聘 fully working (incl. one page-executor
  request) BEFORE adding the other three adapters.
- After each slice, state exactly what you verified. Reuse the shared pipeline for all
  four platforms; only adapters differ.

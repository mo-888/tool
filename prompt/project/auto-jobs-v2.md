# Role
You are a senior browser-extension engineer specializing in Manifest V3 (Chromium + Firefox),
reverse-engineering web JSON APIs from HAR captures, resilient DOM automation, and anti-bot evasion hygiene.
# Mission
Analyze the four HAR files in `./har/` (boss.har, zhilian.har, liepin.har, 51job.har) to extract each
platform's JSON API contracts, then build a cross-browser MV3 extension that automates resume delivery
across BOSS直聘, 智联招聘 (zhilian), 猎聘 (liepin), and 前程无忧/51job — behind a unified, pluggable
per-platform adapter. Ship all four platforms in v1.
# Phase 1 — HAR Analysis (DO THIS FIRST; STOP for my review before any extension code)
For each .har, write a Markdown report to `./docs/api/<platform>.md` covering:
- Job-LIST endpoint(s): URL, method, pagination params, response shape.
- Job-DETAIL endpoint(s): URL, params, fields (title, company, salary, location, full JD text).
- APPLY / "say-hello" endpoint(s): URL, method, required headers, request body, CSRF/token/signature fields.
- AUTH model: cookies, tokens, signature/encryption params — and how each is obtained per request.
- A field-mapping table: raw platform fields → the single internal `Job` schema below. Explicitly FLAG any
  field that the API does NOT expose and must instead be read from the DOM.
- A per-platform recommendation for the 3-tier strategy below, justified by what the HAR shows.
Also write `./docs/api/_overview.md` summarizing commonalities, risks, and unknowns to resolve live.
Then PAUSE and wait for my review.
# Architecture — 3-Tier Hybrid Adapter (core requirement)
Each platform implements one `PlatformAdapter`; the core pipeline is platform-agnostic.
Per action, the adapter declares a strategy with an automatic FALLBACK CHAIN:
- Tier 1 — LIST: DOM-first. Read the already-rendered job list on the active list page; auto-paginate by
  driving the page's own "next page" control (avoids extra requests, naturally throttled, lowest risk-control footprint).
- Tier 2 — DETAIL + APPLY: API-direct, using endpoints reconstructed from the HAR (fast, structured).
- Tier 3 — FALLBACK: when an API call returns a risk-control / blocked / captcha / abnormal response,
  automatically downgrade THAT action to DOM-driven automation (open detail in-page, click apply, type greeting).
Adapter interface (TypeScript):
  matchUrl(href): boolean
  listJobs(ctx): AsyncIterable<JobRef>          // Tier 1 DOM, with pagination
  getDetail(ref): Promise<Job>                  // Tier 2 API → Tier 3 DOM fallback
  apply(job, greeting): Promise<ApplyResult>    // Tier 2 API → Tier 3 DOM fallback
  detectRiskControl(resp): boolean              // triggers downgrade
The orchestrator (service worker) owns the run loop; content scripts execute DOM tiers and report back
via message passing. Document the chosen tier per action per platform.
# Tech Stack & Cross-Browser
- TypeScript throughout. UI (popup + options) in a lightweight framework — Preact or Svelte (pick one, justify briefly).
- Build with Vite + CRXJS (or @samrum/vite-plugin-web-extension) for MV3 HMR and clean bundling.
- Use `webextension-polyfill` so all extension APIs use the `browser.*` namespace and run on Chromium AND Firefox.
- Target Chromium MV3 first (Chrome/Edge); also produce a Firefox-compatible manifest/build. Note any per-browser
  divergence (e.g. service-worker vs. event-page background, host_permissions, alarms behavior) in the README.
- Storage: `browser.storage.local` for config; IndexedDB (via a thin wrapper, e.g. idb) for delivery logs
  (high volume, queryable, exportable). NEVER hardcode secrets; the AI API key lives only in user config.
# Functional Requirements
1) Options/Config page:
   - AI config: OpenAI-compatible Base URL, model name, API key, temperature, request timeout (ms).
   - Resume: a single PLAIN-TEXT textarea (the user pastes raw resume text).
   - Match-analysis prompt template: editable, with placeholders that get filled with resume + job before the AI call.
   - Per-step random delay range: min/max ms (used to throttle every platform interaction; human-like cadence).
   - Max jobs to apply per run.
   - Match-score threshold for auto-apply.
   - Error policy (applies to bad-AI-JSON and timeout independently): { skip this job | retry up to 3 | pause whole flow }.
   - Misc: enable/disable per platform, schedule on/off + daily time.
2) Auto-Apply flow — triggered by an injected "Auto Apply" button on a job-list page
   (e.g. https://www.zhipin.com/web/geek/jobs?city=101280100&position=100101), OR by a schedule:
   - Iterate the list (Tier 1 DOM) with auto-pagination until the per-run limit is hit.
   - For each job: getDetail → render prompt template with {resume, jobInfo} → call AI (OpenAI Chat Completions
     format) → parse STRICT JSON → if matchScore ≥ threshold AND shouldApply → apply(greeting).
   - Write ONE structured log record per job regardless of outcome (applied / skipped / error / below-threshold).
   - AI MUST return strict JSON: { matchScore, shouldApply, mismatches, conclusion, greeting }.
3) Real-time run UI (popup or injected panel):
   - Progress bar (processed / total), CURRENT job title + company, live per-step status text.
   - Manual PAUSE / RESUME / STOP — each takes effect at the next step boundary (no mid-request kill).
4) Logging & export:
   - In-extension log viewer with filters: platform, date range, decision/outcome, match-score range, keyword.
   - Export FILTERED logs to CSV and JSON.
5) Background & scheduling:
   - Use `browser.alarms` for scheduled runs (e.g. daily auto-apply).
   - CRITICAL: MV3 service workers are NOT persistent (idle-killed). Design the run loop to SURVIVE worker
     termination: persist run state (cursor, processed count, pause/stop flags) to storage and RESUME from
     alarms/storage. Do NOT assume a long-lived background context. Explain this design in the README.
# Data Schemas
- JobRef: { platform, jobId, listUrl }
- Job: { platform, jobId, title, company, salary, location, jdText, raw? }
- AIResult (STRICT): { matchScore: 0-100, shouldApply: boolean, mismatches: string[],
                       conclusion: string, greeting: string }
- LogRecord: { ts, platform, jobId, title, company, matchScore, decision, applied: boolean,
               tierUsed, error?, aiRaw? }
# Error Handling & Resilience
- Validate every AI response against AIResult; on malformed/partial JSON apply the configured error policy
  (skip | retry≤3 | pause). On retry, use backoff and keep within configured delays.
- AI/network timeout honors the configured timeout + retry count.
- detectRiskControl → downgrade to Tier 3 DOM for that action; if DOM also fails, apply the error policy.
- Rate-limit EVERY platform interaction using the configured random delay range; never burst.
- Detect logged-out / blocked / captcha → PAUSE the run with a clear status message (never auto-bypass captcha).
# Compliance & Safety (surface to the user, do not decide for them)
- Automating these platforms may violate their Terms of Service and trigger account risk-control.
- Default delays MUST be conservative; expose them as config. Add a one-time disclaimer in the UI.
- Do not implement captcha-solving or detection-evasion beyond human-like pacing.
# Deliverables
1) `./docs/api/*.md` (Phase 1, reviewed before coding).
2) Full extension source: manifest(s), service worker orchestrator, 4 platform adapters, content scripts,
   options + popup UI, storage layer, AI client, logging + export.
3) README: setup, build (Chromium + Firefox), load-unpacked, architecture overview, MV3-persistence note,
   per-browser caveats, and a known-limitations / compliance section.
# Working Method
Work in phases and PAUSE at each gate:
  (a) Phase 1 HAR reports → my review.
  (b) Propose file tree + the PlatformAdapter interface + the run-loop state machine → my OK.
  (c) Implement core pipeline + BOSS直聘 adapter end-to-end first, then zhilian / liepin / 51job.
State assumptions explicitly. Keep modules focused (~200 lines where reasonable). Match a consistent code style.
Ask before any destructive or irreversible action.
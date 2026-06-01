Final English Prompt

Role: Senior Full-Stack Automation Engineer

Project Overview
Build a Multi-Platform Job Application Automation System with two components:
Browser Extension: Captures auth tokens/search filters from job platforms; communicates via Local WebSocket.
Local Automation Script (Python): Reads local resume, orchestrates AI matching, and executes automated applications across 4 platforms using API specs defined in JSON reference files.

API Reference Files (READ AS DOCUMENTATION)
The following JSON files contain the complete API specifications (endpoints, methods, headers, request/response schemas). Read these files directly as API documentation — do NOT perform reverse engineering or traffic analysis:
boss.har → Boss Zhipin API specs
zhilian.har → ZhiLian API specs
liepin.har → Liepin API specs
51job.har → 51job API specs

Use these specs to implement platform adapters exactly as documented.

Architecture Requirements

Unified Platform Adapter Pattern
Implement abstract base class JobPlatformAdapter with methods: search_jobs(), get_job_detail(), send_greeting(), get_auth_headers().  
Create concrete adapters (BossAdapter, ZhiLianAdapter, LiepinAdapter, Job51Adapter) that implement these methods based on the JSON API specs. All 4 platforms must be supported concurrently.

Local WebSocket Communication
Server: Python websockets on ws://localhost:8765.
Client: Browser extension connects on startup.
Message Format (JSON):
    json
    {
      "type": "AUTH_UPDATE | FILTER_CHANGE | STATUS_REQUEST",
      "platform": "boss | zhilian | liepin | 51job",
      "payload": { /* tokens, filters, or status data */ }
    }
    Handle reconnection; show status in extension popup.

Resume Loading & AI Matching
Read resume from local file (resume_path in config; supports .txt, .md).
AI Analysis Prompt Template (configurable):
    > Compare resume and job description. Return ONLY valid JSON:
    > {"match_score": 0-100, "should_apply": bool, "mismatch_reasons": string[], "analysis_summary": string, "greeting_message": string}
Use OpenAI-compatible API; strict JSON parsing.

Configuration (config.yaml)
yaml
ai:
  api_key: ""
  model: "gpt-4o-mini"
  base_url: "https://api.openai.com/v1"
matching:
  resume_path: "./resume.md"
  min_match_score: 70
  prompt_template: "..." 
behavior:
  delay_range: [2, 5]       
  page_load_delay: [1, 3]
  max_daily_applications: 50
platforms:
  boss: { enabled: true }
  zhilian: { enabled: true }
  liepin: { enabled: true }
  51job: { enabled: true }

Automation Workflow (Per Platform)
Receive auth/filters via WebSocket.
adapter.search_jobs() with random delay.
For each job: adapter.get_job_detail() → AI analysis.
If match_score >= threshold AND should_apply: adapter.send_greeting(greeting_message).
Log structured JSON to logs/{platform}_{date}.log.
Respect per-platform daily limits.

Technical Constraints
Script: Python 3.10+, asyncio, websockets, httpx, PyYAML, openai SDK.
Extension: Vanilla JS + Manifest V3.
Security: Never log tokens; validate WebSocket origin.
Anti-Detection: Randomize delays per config; use headers exactly as specified in JSON API docs.
Error Handling: Retry failed requests (max 3x); skip on persistent failure; never crash the loop.

Deliverables
Complete source code: /extension/ and /script/.
README.md: Setup guide, config docs, WebSocket protocol spec.
Sample config.yaml with placeholders.

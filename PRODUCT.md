# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Glow Hong Kong reception team members at the Central salon. Situation: start of shift (or on the go), opening a bookmark on a desktop or phone browser to work down one client card at a time and send each reminder via a pre-filled WhatsApp link. They have no Node, no repo checkout, and must never hold Mindbody API credentials.

Secondary operator (repo-confirmed): the owner/developer, who runs the local CLI (`pnpm run dry-run`), owns Mindbody credentials as Azure app settings, and deploys from the workstation with `scripts/deploy-local.ps1`.

## Product Purpose

Automated WhatsApp reminders for Mindbody (MBO) appointments at Glow Hong Kong. The app fetches a target day's schedule from Mindbody, renders one message per client from `src/template.ejs`, and presents a hosted report where each card carries a `wa.me` click-to-chat link with the message pre-filled. Nothing is sent automatically — a human clicks and sends in WhatsApp.

Success means reception opens a bookmark, sees a fresh list for the right Hong Kong day, and sends every message without asking a developer for a run, a file, or credentials.

## Positioning

Unique by absence of alternatives: there is no integrated WhatsApp-reminder solution in Mindbody and no third-party solution available for this job, so the team otherwise depends on a developer hand-running a script and handing over a file.

The meaningfully different mechanism a neighbor could not truthfully copy: the same tested pipeline and EJS template serve both the local CLI dry-run and the hosted report, and sending stays human via `wa.me` links — no WhatsApp Business API, no template approval, no per-message cost.

## Operating Context

- Daily rhythm: timer run every morning at 9am Hong Kong time (`morningTimer`, `0 0 9 * * *`, `TZ=Asia/Hong_Kong`); reception works the stored scheduled list from a bookmark with instant load (no Mindbody calls at page load).
- Ad-hoc rhythm: day picker plus Today / Tomorrow / +2 / +3 chips for any other day (e.g. Monday list prepared Friday, post-holiday catch-up, re-send); first view generates synchronously and caches under that day's key, later views are instant; regenerate refreshes after schedule changes without touching the scheduled list.
- Systems of record and tools: Mindbody schedule/staff/clients (API key, site id, username/password in Azure app settings, never in repo); WhatsApp app via click-to-chat; Azure Functions app (Linux, Flex Consumption, Node 24, v4 model) with a private `reports` blob container read only through the authenticated function.
- Every date is a Hong Kong date. Target days resolve per invocation (`resolveTargetDay`, `scheduledTargetDay` = tomorrow in Hong Kong); a warm hosted process never reuses a module-load day.
- Local path stays intact: `pnpm install`, `pnpm run build` (`tsc` + copy `src/template.ejs` to `dist/`), `pnpm test` (vitest), `node dist/index.js --dry-run --html`.

## Capabilities and Constraints

Confirmed functionality:

- One card per client with rendered message, `wa.me` link pre-filled, and `mobile +..., home +...` header so the number used is visible (HK numbers get the `852` prefix; mobile preferred, home fallback); clients with no usable number are flagged for manual lookup.
- Suppression of non-`Booked` appointments; suppressed items listed separately with reasons.
- Conditional message lines: laser shave note only when a booking is in the Laser group; spray-tan prep note (exfoliation, loose dark clothing, open-toed shoes) only for Tanning.
- Scheduled vs. ad-hoc separation: ad-hoc days stored under their own `day-YYYY-MM-DD` keys with an explicit ad-hoc banner and their own URLs; the plain bookmark always shows the morning list.
- Freshness and failure signaling: spelled-out target day, generated-at line, stale warning past ~26h, red banner with error text when the last scheduled run failed (failed runs keep the old list).
- Access: single shared password (`REPORT_PASSWORD` app setting), ~30-day signed cookie, login page on expiry, wrong-password message; report unreadable without login even with the exact URL.
- Server-rendered UI: native date input plus quick chips, no client-side framework and no UI build step.
- Ad-hoc reports expire after roughly seven days via a storage lifecycle rule; the scheduled report is overwritten in place.

Constraints and non-goals: no automatic sending; no WhatsApp Cloud API / Meta verification / templates / billing; no per-user accounts, SSO, roles, or send audit; no in-UI template or rules editing; no push/email/SMS; single site, Hong Kong time only; English reminder copy only (no Chinese translation); CLI behavior unchanged.

## Brand Commitments

- Name: Glow Hong Kong — Glow Hair | Skin & Beauty | Aesthetics. Voice: polite, personal, service-led reminder copy with full address, directions, phone/WhatsApp numbers, 24-hour cancellation notice, and cancellation-policy link (`https://www.glowspa.hk/cancellation-sales-policy`).
- Factual business details from the live template and site: 8/F Silver Fortune Plaza, 1 Wellington Street, Central; entrance notes via Wyndham Street; Phone +852 25255198; WhatsApp +852 96802107.
- Binding reference volunteered for future design work: `https://glow.hk` (resolves to the Glow spa site, `glowspa.hk`). Recorded here as a constraint only; no visual direction is inferred from it during init.

## Evidence on Hand

- Real copy and data paths: `src/template.ejs` (reminder wording), `src/effect/render.ts` + `src/report/chrome.ts` (text/HTML reports, page furniture), `src/effect/whatsapp.ts` (phone display, `wa.me` links), `src/targetDay.ts` (day parsing, HK helpers).
- Plans and how-to: `docs/prd-hosted-reminders.md` (hosted-report PRD and user stories), `readme.md` (setup, CLI, `--date` specs), `README.deploy-local.md` (workstation deploy), `dry-runs/` (generated report artifacts).
- Absences future work must not fabricate: no testimonials, case studies, press quotes, benchmarks, pricing, or customer logos in the repo; no checked-in logo/image assets for the report UI.

## Product Principles

1. Reception works without a developer: bookmark opens, list loads instantly, any day is self-serve.
2. Never send the wrong day: spell the day out, mark ad-hoc views unmistakably, and warn loudly on stale or failed runs.
3. One message pipeline everywhere: the CLI and the hosted app share the same run, render, and template so tested copy is sent copy.
4. Privacy by construction: private storage, authenticated reads only, secrets in app settings — client names and numbers are never URL-reachable.
5. Hong Kong correctness first: per-invocation day resolution with the timezone set explicitly, on the timer and on every page.

## Accessibility & Inclusion

Reception uses personal phones as well as desktops: the report must stay readable and its WhatsApp links easy to tap on a small screen (server-rendered page, native date input, `role="alert"` on stale/failed banners). No product-specific accessibility standard has been established beyond this phone-usable requirement.

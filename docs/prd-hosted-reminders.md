# PRD: Hosted Reminder Report

## Problem Statement

The reminder app only runs as a command-line script on a workstation that has Node, the repo, and the Mindbody credentials in a `.env` file. To get tomorrow's reminders out, someone has to run `npm run dry-run:prod -- --html`, find the generated HTML file in `dry-runs/`, and get it in front of the reception team.

The reception team — the people who actually send the WhatsApp messages — cannot run any of this. They don't have Node, they don't have the repo, and they shouldn't have the Mindbody API credentials. Today they depend on a developer being present and handing over a file.

On top of that, the report is hard-wired to "tomorrow". When the team needs reminders for a different day — a Monday list prepared on Friday, a catch-up after a public holiday, a re-send — someone has to go back to the developer and ask for another run with a different `--date`.

The report itself contains client names and phone numbers, so whatever replaces the file handover must not be publicly reachable.

## Solution

Host the app as a small Azure Functions app (Linux, Flex Consumption plan) that the reception team reaches through a browser. No install, no Node, no credentials on their machines.

Two things happen:

1. **Every morning at 9am Hong Kong time**, a timer function runs the existing pipeline against Mindbody, renders the reminder report, and stores it in a private blob container as the *scheduled list*. Opening the bookmark is then instant — nothing is fetched from Mindbody at page-load time.
2. **A day picker in the browser** lets the team generate the report for any other day. The generated report is cached under that day's key, so the first view waits once and every later view of the same day is instant. Ad-hoc views are visually distinct from the scheduled list so nobody sends the wrong day's reminders by accident.

Sending does not change. Each client card still carries a `wa.me` click-to-chat link with the message pre-filled; the team clicks, and WhatsApp opens with the text ready to send. No WhatsApp Business API, no template approval, no per-message cost.

Access is a single shared password set as an app setting. One login gives a cookie that lasts about 30 days. The blob container is private — the report is only ever read through the authenticated function, so client names and phone numbers are never publicly exposed.

Cost is expected to stay very low at this usage level, with storage only a few kilobytes.

## User Stories

### Reception: opening the daily list

1. As a reception team member, I want to open a bookmark in my browser and see today's reminder list, so that I don't need anything installed on my workstation.
2. As a reception team member, I want the list to load instantly, so that I'm not waiting on Mindbody when I start my shift.
3. As a reception team member, I want to see when the list was generated, so that I know I'm working from fresh data.
4. As a reception team member, I want to see which day the list is for, spelled out ("Monday September 14th 2026"), so that I don't send reminders for the wrong day.
5. As a reception team member, I want one card per client with their rendered message and a WhatsApp link, so that I can work down the list sending each message.
6. As a reception team member, I want the WhatsApp link to open with the message already filled in, so that I don't copy and paste text.
7. As a reception team member, I want to see the client's mobile and home numbers on the card, so that I can tell which number the link would use.
8. As a reception team member, I want clients with no usable phone number clearly flagged, so that I know which ones need a manual lookup.
9. As a reception team member, I want cancelled and non-booked appointments excluded from the list, so that I don't message people who aren't coming in.
10. As a reception team member, I want suppressed appointments shown separately at the bottom, so that I can see what was left out and why.
11. As a reception team member, I want the laser shave instruction and spray-tan prep note to appear only on the clients who need them, so that the messages stay correct without me editing them.
12. As a reception team member, I want to use this on my phone as well as my desktop, so that I can send reminders from either.
13. As a reception team member, I want the page to be readable and the links easy to tap on a phone, so that I don't mis-tap while working through the list.

### Reception: choosing another day

14. As a reception team member, I want to pick any date from a date picker and generate that day's reminders, so that I don't have to ask a developer for a special run.
15. As a reception team member, I want quick buttons for Today, Tomorrow, +2 and +3, so that the common cases are one click.
16. As a reception team member, I want an obvious banner telling me I'm looking at an ad-hoc day and not the scheduled list, so that I never send the wrong day's reminders by mistake.
17. As a reception team member, I want the ad-hoc view to have its own URL, so that I can bookmark it or send it to a colleague.
18. As a reception team member, I want a previously generated day to open instantly, so that revisiting a day doesn't cost me another wait.
19. As a reception team member, I want a Regenerate button, so that I can refresh a day after the schedule changes.
20. As a reception team member, I want a clear message when I type a date that can't be understood, so that I can correct it rather than guessing what went wrong.
21. As a reception team member, I want to see "no reminders" plainly when a day has no bookings, so that I don't think the page is broken.
22. As a reception team member, I want generating another day to leave the scheduled morning list untouched, so that the plain bookmark still shows what it always showed.

### Reception: access

23. As a reception team member, I want to log in with a password the team shares, so that only the team can see client phone numbers.
24. As a reception team member, I want to stay logged in for weeks, so that I'm not typing the password every morning.
25. As a reception team member, I want to be shown the login page rather than an error when my session has expired, so that I know what to do.
26. As a reception team member, I want to see a message when I mistype the password, so that I can try again.
27. As a reception team member, I want the report to be unreadable without logging in, even if I have the exact URL, so that client numbers stay private.

### Owner / developer

28. As the owner, I want the daily run to happen automatically at 9am Hong Kong time, so that nobody has to remember to trigger it.
29. As the owner, I want the hosted app to use the same pipeline and template as the CLI, so that the messages the team sends are the ones I tested locally.
30. As the owner, I want the CLI (`npm run dry-run`) to keep working unchanged, so that I can still develop and test locally.
31. As the owner, I want Mindbody credentials to live in Azure app settings and never in the repo, so that they aren't exposed to the team or to git.
32. As the owner, I want the Azure pieces deployed from my workstation with the local deploy script, so that I'm not doing manual portal deploys and there's no CI pipeline to maintain for a single-operator app.
33. As the owner, I want to know when a scheduled run failed, so that I'm not relying on the team to notice.
34. As the owner, I want the page to warn visibly if the list is stale or the last run failed, so that a missed run is caught before the wrong messages go out.
35. As the owner, I want hosting to cost a pound or two a month at most, so that this doesn't become a line item.
36. As the owner, I want all dates and times computed in Hong Kong time regardless of where the server runs, so that "tomorrow" means tomorrow in Hong Kong.
37. As the owner, I want ad-hoc reports to expire after about a week, so that old client data doesn't accumulate in storage.
38. As the owner, I want the report generation to be testable without Azure or a real Mindbody account, so that I can change it with confidence.

## Implementation Decisions

### Platform

- **Azure Function app**, Linux, Flex Consumption plan, Node 24 with the v4 programming model. Storage and execution costs are expected to remain low at current volume.
- **Blob storage** in a private container for the cached reports. The function reads the blob and returns it as `text/html`; the blob itself is never public.
- **Deployed from the workstation** with `scripts/deploy-local.ps1` (local CI, no GitHub Actions workflow — decision recorded in #6), with Mindbody credentials and the report password as app settings.
- **App settings**: Mindbody API key, site id, username, password, report password, storage connection, and Hong Kong timezone.

### Modules

The pipeline is left alone as far as possible. The new work is a set of deep modules with the Azure-specific code pushed to thin adapters at the edge.

1. **Mindbody run** — fetches staff, schedule, session types and clients for a target day and returns the reminder domain data (appointment outputs plus the client records), with no rendering and no file access. Declares its needs as Effect services so it can be driven by test doubles. This is the existing pipeline, repackaged so it can be called per-invocation rather than at module load.

2. **Report rendering** — pure: takes the domain data plus a target day and an invocation time and returns the HTML report string (and the plain-text form). No disk access, no network. The existing report builders move here unchanged in behaviour.

3. **Report generation** — thin composition of *run* then *render*, returning the report in memory. The CLI dry-run becomes this plus a file write, so local behaviour is preserved and both entry points share one path.

4. **Target-day resolution** — resolves a user-supplied day spec into a target day. Reuses the existing parser, which already understands `+1`, `plus two`, `today`, `tomorrow`, weekday names, `2026-09-20` and `14 Sep 2026`. Gained: a per-invocation factory so the day is computed at run time instead of at module load (a hosted process stays warm across days, and a module-level "tomorrow" would go stale), and a single scheduled-day helper meaning "tomorrow" used by the timer.

5. **Cache key and staleness** — pure. Maps a target day to a storage key using its resolved `YYYY-MM-DD` label, so no user-supplied string ever reaches the storage layer. Also decides whether a report is stale, whether a requested day is the scheduled day or an ad-hoc one, and shapes the run-status record (generated-at time, target day, success flag, error text).

6. **Report store** — an Effect service with a small surface: read and write the scheduled report, read and write a report for a given day key, read and write the run status. Two implementations: the Azure blob one, and an in-memory one used by tests and local development. Everything above this line is storage-agnostic.

7. **Web chrome** — pure. Wraps a rendered report in the page furniture: the day picker, quick day buttons, the generated-at line, the regenerate link, and the banners (ad-hoc day, stale, last run failed). Injected into the report's markup so the locally generated dry-run file stays exactly as it is today.

8. **Session auth** — pure core: issue a signed session value from the shared password and a timestamp, verify one against the password and the current time using a constant-time comparison. The cookie handling (HttpOnly, Secure, SameSite=Lax, ~30 day lifetime) sits in the adapter. Login form and failure message are part of this module.

9. **Azure adapters** — deliberately shallow: a timer-triggered function that generates and stores the scheduled report and its status; an HTTP function that serves the report (scheduled by default, or a chosen day, or a forced regenerate); an HTTP function for the login form. No domain logic lives here.

### Behaviour decisions

- **Ad-hoc days do not overwrite the scheduled list.** The timer owns the scheduled report; ad-hoc views are stored under their own day key and are always shown with an ad-hoc banner. The plain bookmark continues to show the morning list.
- **Generation is synchronous.** An uncached day blocks the request until the report is ready (expected tens of seconds), then caches it. No queue, no polling, no Durable Functions. Revisit the choice only if runs start exceeding about a minute or people collide regularly.
- **The daily timer writes a status record alongside the report**, and the page shows a red banner when the last run failed or the report is older than about 26 hours.
- **The day picker offers a native date input plus quick chips**, all rendered server-side — no client-side framework and no build step for the UI.
- **The CLI is unchanged.** `npm run dry-run` and the `--html` flag keep working against the same rendering code.
- **Ad-hoc reports expire** via a storage lifecycle rule after roughly seven days; the scheduled report is overwritten in place.
- **The EJS reminder template ships with the build** and is resolved relative to the compiled module rather than the current working directory, since the deployed app has no `src/` folder and no repo checkout.

## Testing Decisions

**What makes a good test here:** it exercises a module through its public interface and asserts on external behaviour — the HTML produced, the day resolved, what was stored and under which key, whether a session value is accepted — and never on internal steps, private helpers, or how many times a collaborator was called. Tests use the existing Effect test layers rather than mocks that reach inside.

**Modules tested:**

- *Mindbody run* — driven through the existing HTTP/config/user test layers; asserts on the reminder data produced for a fixed target day.
- *Report rendering* — fixed domain data in, asserted HTML out (including the no-phone case, suppressed appointments, laser and tanning lines).
- *Report generation* — asserts it returns the report without touching storage, and that the CLI path still writes a file.
- *Target-day resolution* — extends the existing parser tests: offsets, keywords, weekday names, explicit dates, invalid input, and the per-invocation factory producing the right calendar day.
- *Cache key and staleness* — key derived from the resolved label (never from raw input), staleness boundaries, scheduled-versus-ad-hoc classification.
- *Report store* — exercised against the in-memory implementation: read/write the scheduled report, per-day cache hits and misses, status round-trip.
- *Web chrome* — asserts the nav bar and each banner state appear in the wrapped output and that the report body is preserved.
- *Session auth* — valid session accepted, expired rejected, wrong password rejected, tampered value rejected, login page rendered on failure.

**Not tested:** the Azure adapters (timer and HTTP handlers) — they are wiring only, and are verified by the deployment spike rather than by unit tests. The blob implementation of the report store is covered indirectly by the in-memory tests plus one manual end-to-end run.

**Prior art:** vitest specs under `test/`, Effect layers including the HTTP test double, config test layer and user test layer, and the existing target-day and dry-run specs closely followed for style.

## Out of Scope

- Actually sending WhatsApp messages — no WhatsApp Cloud API, no Meta business verification, no message templates, no per-message billing. Sending stays a human clicking a link.
- Per-user accounts, SSO, Entra/Microsoft login, role separation, or audit of who sent what.
- Editing the reminder template, service rules, or suppression rules through the UI.
- Push notifications, email fallbacks, or SMS.
- Multi-site or multi-location support, and multi-timezone support beyond Hong Kong.
- A native mobile app; the existing page is expected to be usable in a phone browser.
- Reminder history or reporting beyond the seven-day ad-hoc expiry.
- Removing the local CLI, or changing the local development workflow.
- Chinese-language messages (the reminder copy is English today; translation is not part of this).

## Further Notes

**Timezone is the main correctness risk.** Every date is computed from local time, and servers default to UTC. The app must run with Hong Kong time set explicitly, and the timer schedule should be written to match. Worth an explicit test that a run at, say, 23:00 UTC still targets the Hong Kong "tomorrow".

**The module-level "tomorrow" is a latent bug once hosted.** A warm function process is reused across timer ticks, so a day computed at first load would silently go stale after midnight. Computing the target day per invocation removes the class of bug.

**Runtime:** the pipeline makes one client request per client at a concurrency of five, so a busy day is dominated by those calls. Expected well inside practical timeout limits, but worth logging run duration on the first real runs; if it grows, batching the client lookups is the obvious lever.

**Cold starts:** the first request after idle adds a few seconds. Because the scheduled report is pre-generated and served from storage, the common path is a storage read, not a Mindbody run.

**Data protection:** the report holds client names and phone numbers. Keeping the container private and serving only through the authenticated function is deliberate — the report must never be reachable by URL alone. The report password and Mindbody credentials are app settings, never committed.

**Missed runs:** timer runs are reliable but not guaranteed. The status record plus the stale banner means a missed morning shows up as a visible warning rather than a silently outdated list.

**Follow-on, deliberately deferred:** making an ad-hoc day the list everyone sees, and showing a short history of recent days, both follow naturally from the same store if the team asks for them.

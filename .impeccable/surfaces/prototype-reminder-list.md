---
version: 1
slug: "prototype-reminder-list"
primary_target: ".impeccable/prototype-reminder-list.html"
related_targets: []
---

# Surface brief: prototype-reminder-list

Scope: standalone prototype `.impeccable/prototype-reminder-list.html` (review only, live report untouched).
Visitor mode: Operate — reception works one day top-to-bottom, tapping one wa.me link per client.

Audience / job / action: Glow HK reception at start of shift (desktop + phone). Job: send every reminder for the spelled-out day without developer help. Action: open wa.me, check, send; mark sent; copy on failure.
Proof / content: real template wording (Babor facial, laser shave note, spray-tan prep, follow-ups, missing-number, suppressed reasons), real business details (Silver Fortune Plaza, +852 25255198, +852 96802107, cancellation link). Synthetic client set labelled prototype.
Constraints: copy + wa.me flow preserved; spelled-out day + generated-at + stale/failed/ad-hoc states in words with role=alert/note; no auto-send; no new palette meaning (red = failure only, wash = ad-hoc only); single static file, vanilla JS only, no build step.

Chosen direction: Reception day-board with progress rail (grounded candidate 3, seed 56e051c0).
Memorable moment: sticky day header with live 0-of-6 rail; time gutter left, client slips right; sent ticks persist locally.

## Direction contract
THESIS: A paper day-sheet worked top to bottom — one day, one order, never lose place. Refuses the card-soup feed where every client looks equal and progress is invisible.
OWN-WORLD: Paper white, hairline rules, wash message blocks; time gutter in bold ink; status in words plus a 1px top discipline, never full-fill color; red reserved for failure, info wash for ad-hoc; system-ui only, no shadows, no webfont.
STORY: Reception sees which day, whether fresh, who is next. Filters to To-send / Needs attention / Sent; opens wa.me; copies on failure; marks sent; rail advances. Missing numbers and suppressed reasons stay visible.
FIRST VIEWPORT: Sticky board — title, spelled-out Thursday September 17th 2026, generated-at line, progress rail + count, search + All/To-send/Needs-attention/Sent chips. Below: time-ordered cards (time gutter + name/service + phones + Send/Copy/Mark-sent + collapsible message). Primary action (Send via WhatsApp) first in each card, 44px targets.
FORM: Grounded candidate 3 of 7 (salon day-sheet lineage); seed key 56e051c0, code-led build, no comp. Raises carried: stepwise sent-state (drawcord); hairline-only status edges (iridescent); fixed time slots + deliberate empties (seven-segment); rail-pattern state, never color-only (jackfield); persistent local sent history (scrawl); type-as-navigation with press-sized targets (metro).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

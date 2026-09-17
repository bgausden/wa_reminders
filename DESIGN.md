---
name: wa_reminders
description: Human-sent WhatsApp reminders for Glow Hong Kong, worked one card at a time.
colors:
  alert: "#cc0000"
  alert-text: "#ffffff"
  info-bg: "#eef4ff"
  info-border: "#9999cc"
  info-ink: "#223344"
  neutral-muted: "#555555"
  hairline: "#dddddd"
  wash: "#f6f6f6"
  missing: "#aa0000"
  label-ink: "#333333"
typography:
  headline:
    fontFamily: "system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
spacing:
  xs: "0.25rem"
  sm: "0.6rem"
  md: "1rem"
  lg: "1.5rem"
components:
  alert-banner:
    backgroundColor: "{colors.alert}"
    textColor: "{colors.alert-text}"
    rounded: "{rounded.sm}"
    padding: "0.6rem 0.8rem"
  info-note:
    backgroundColor: "{colors.info-bg}"
    textColor: "{colors.info-ink}"
    rounded: "{rounded.sm}"
    padding: "0.6rem 0.8rem"
  card:
    backgroundColor: "{colors.alert-text}"
    rounded: "{rounded.md}"
    padding: "1rem"
  form-control:
    rounded: "{rounded.sm}"
    padding: "0.25rem 0.5rem"
  login-field:
    rounded: "{rounded.sm}"
    padding: "0.6rem"
    width: "100%"
---

# Design System: wa_reminders

## Overview

**Creative North Star: "The Reception Desk"**

A quiet, warmly service-led operations tool, not spa marketing. Reception opens a bookmark at the start of shift (or on a phone between clients) and works down one client card at a time, tapping a pre-filled WhatsApp link per card. Everything on the page exists to answer three questions: which day is this, is it fresh, and who is next.

The aesthetic is plain server-rendered HTML with native controls and no client-side framework. Density is checklist-like but never cramped: a single centered column, generous card padding, 1rem tap-friendly controls, and color used sparingly so the red failure banner and the blue ad-hoc note always mean something. There are no brand assets in the repo (no logo, no imagery, no webfont); the voice of Glow Hong Kong lives in the reminder copy itself, while the chrome around it stays neutral and calm.

**Key Characteristics:**
- Single-column checklist worked top to bottom, one card per client.
- Warm service-led restraint: neutral paper, quiet greys, color reserved for status.
- Tidy and tap-friendly native controls usable on a phone with no build step.
- Freshness is explicit text (spelled-out day, generated-at line, stale/failed banners).

## Colors

Utilitarian status palette on neutral paper: one functional red for failure/staleness, one cool wash for ad-hoc information, quiet greys for everything else.

### Primary
- **Alert** (#cc0000, text #ffffff): stale-list and failed-run banners only (`role="alert"`). Its rarity is the point — it never decorates.

### Secondary
- **Info wash** (#eef4ff with #9999cc border, #223344 text): the ad-hoc day note (`role="note"`) marking a picked day as explicitly not the scheduled morning list.

### Neutral
- **Muted grey** (#555555): generated-at meta and quick-link hints (0.9rem supporting text).
- **Hairline** (#dddddd): card borders and the chrome header rule (`1px solid`).
- **Wash grey** (#f6f6f6): message `<pre>` background inside each card.
- **Label ink** (#333333): smoke-test page labels.
- **Missing red** (#aa0000): `No mobile number — manual lookup needed` and login error text.

### Named Rules
**The Two-Color Rule.** Only Alert red and the Info wash may carry meaning. Everything else stays grey, hairline, or paper. A screen showing both at once is already at maximum urgency.

## Typography

**Display Font:** system-ui (with sans-serif fallback)
**Body Font:** system-ui (with sans-serif fallback)

**Character:** Plain spoken-tool type. No webfont, no pairing contrast — weight and size do all the work so the page renders identically on a salon desktop and a personal phone.

### Hierarchy
- **Headline** (700, 1.25rem, 1.2): page titles (`Reminder list` on login, `No list for … yet`, report summary `h1`). Login pins it at 1.25rem.
- **Title** (600, 1.05rem, 1.4): the spelled-out target-day line (`Reminders for Monday September 14th 2026`) and per-card `h2` headers.
- **Body** (400, 1rem, 1.5): card copy, reminder `<pre>`, form controls, smoke page. Message text wraps (`pre-wrap`).
- **Label** (400, 0.9rem, 1.4): generated-at meta, quick links, chrome-links; error detail drops to 0.85rem regular inside the red banner.

### Named Rules
**The Spelled-Out Day Rule.** The target day is always fully written (`Reminders for …`, `Generated … at …`), never a bare `YYYY-MM-DD`. Relative labels (`tomorrow (Monday)`) render against invocation time so re-renders agree.

## Layout

Single centered column everywhere. Report, scheduled, day, and error pages cap at a wide-readable measure (60rem) with `margin: 2rem auto` and `padding: 0 1rem`; the login page narrows to a focused card-column (22rem, `margin: 3rem auto`); the smoke page sits between (620px card, `padding: 2rem` body, `1.5rem` card). Spacing rhythm is `.25rem → .6rem → 1rem → 1.5rem`: form controls breathe at `.25rem .5rem` (login fields `.6rem` full-width), banners/notes at `.6rem .8rem` with `.6rem` vertical margins, cards at `1rem` with `1rem` vertical rhythm. Responsive behavior is native, not breakpoint-driven: fluid width plus native date/text inputs and full-width login controls keep WhatsApp links tappable on a small screen with no media queries and no client-side framework.

## Elevation & Depth

Tonal layering, never shadow. The codebase ships zero `box-shadow`; depth comes from hairline borders (`1px solid #dddddd`), wash fills (`#f6f6f6` message blocks, `#eef4ff` ad-hoc notes), and the one bottom rule under the chrome header. Cards read as paper slips separated by border and padding, status reads as wash color — calm by default, loud only when stale or failed.

### Named Rules
**The Tonal Layer Rule.** Separate surfaces with border or wash tone, never shadow. If a new surface needs more emphasis, darken the wash or strengthen the border before reaching for elevation.

## Shapes

Gently rounded operational geometry. Cards, message blocks, and the smoke-test card use a friendly medium rounding (8px); banners and ad-hoc notes use a slightly tighter rounding (6px) so status reads as tape, not tile. Borders are always the hairline (`1px solid #dddddd`, info notes `#9999cc`); there is no clipping, no pill geometry, no sharp-brand corners. Inputs and buttons keep native edges with comfortable padding rather than a custom radius.

## Components

Tidy and tap-friendly: native elements, readable sizes, generous hit areas, full-width on the login gate.

### Chrome header (page furniture)
- **Character:** the honest reception slip — generated-at, spelled-out day, then banners, then tools.
- **Shape:** bottom hairline rule (`1px solid #dddddd`), `margin: 0 0 1rem`, `padding: 0 0 .75rem`.
- **Behavior:** spliced first inside `<body>` around the stored report; failed runs keep the old list under a red banner with the error in 0.85rem regular detail text.

### Buttons
- **Shape:** native edges (no custom radius in code).
- **Primary:** native button at 1rem with `.25rem .5rem` padding in day forms; login submit is full-width (`width: 100%`) with `.6rem` padding and `margin-top: 1.25rem`.
- **Hover / Focus:** browser-native only; no custom transition ships.
- **Secondary:** quick chips are plain links (`Scheduled · Today · Tomorrow · +2 · +3`) in 0.9rem muted grey beside the Generate button.

### Cards / Containers
- **Corner Style:** gently rounded (8px).
- **Background:** white/paper with message `<pre>` in wash grey (#f6f6f6, `padding: 1rem`, 8px radius, `pre-wrap`).
- **Shadow Strategy:** none — see Elevation & Depth.
- **Border:** hairline `1px solid #dddddd`.
- **Internal Padding:** `1rem` with `1rem` vertical rhythm between cards.

### Inputs / Fields
- **Style:** native text/date input at 1rem, `.25rem .5rem` padding; login password field full-width (100%, `box-sizing: border-box`) with `.6rem` padding and a block label (`margin: 1rem 0 .25rem`).
- **Focus:** browser-native outline; no custom ring ships.
- **Error / Disabled:** login errors render as plain red text (`.message`, #aa0000) above the form; day errors render the message inside a red banner (`role="alert"`).

### Banners & Notes (signature status pair)
- **Alert banner:** Alert red background, white 600 text, 6px rounding, `.6rem .8rem` padding; always carries `role="alert"` and states the cause in words (stale past ~26h, last-run failure). Never used decoratively.
- **Ad-hoc note:** Info wash background with info border and ink text, 6px rounding, `.6rem .8rem` padding, `role="note"`; always says the view is not the scheduled morning list. Never relies on color alone.

### Signature Component: client reminder card
One card per client: `h2` header naming client, staff, appointment ids, and the visible `mobile +…, home +…` phone header (missing renders as `-`); a WhatsApp click-to-chat link (`Send via WhatsApp to … (…)`, `target="_blank" rel="noopener"`) or the red missing-number notice; then the rendered EJS reminder in a wash `<pre>` (laser-shave and spray-tan prep lines appear conditionally). Suppressed non-`Booked` appointments list separately below with reasons.

## Do's and Don'ts

### Do:
- **Do** spell the day out and show generation time on every list view.
- **Do** state status reasons in words inside banners and notes — never rely on color alone.
- **Do** keep one message pipeline (CLI dry-run and hosted report share template and render) so tested copy is sent copy.
- **Do** keep controls native, 1rem, and tappable; keep login to one password field with no client-side script.
- **Do** keep the phone used visible in each card header (`mobile +…, home +…`).

### Don't:
- **Don't** use Alert red for anything except stale/failed runs, and don't add new palette colors without a Glow brand asset.
- **Don't** send automatically or add a WhatsApp API/templates layer — sending stays human via `wa.me` links.
- **Don't** add shadows, webfonts, icon packages, or a client-side framework to this tool.
- **Don't** show client names/numbers on any URL-reachable surface without the signed ~30-day login cookie.
- **Don't** invent testimonials, logos, benchmarks, or imagery — the repo ships none.

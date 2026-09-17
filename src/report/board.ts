/**
 * Shared prototype board: styles, brand header, and client-side behaviour.
 *
 * The CLI dry-run file (`buildDryRunHtmlReport`) and the hosted pages
 * (`wrapReport`) render from these same constants so tested copy is sent
 * copy and the preview matches the bookmark. Single-file output is kept:
 * the Glow SVG is inlined from `src/report/glowBrand.ts` (source of truth
 * `src/assets/glow-horizontal.svg`) and the script is vanilla JS with no
 * build step.
 */
import { escapeHtml } from '../effect/whatsapp.js'
import { GLOW_BRAND_SVG } from './glowBrand.js'

export const BRAND_SUB = 'Glow Hong Kong · Hair | Skin &amp; Beauty | Aesthetics'

export const REPORT_STYLE =
  ':root{' +
  '--alert:#cc0000;--alert-text:#fff;' +
  '--info-bg:#eef4ff;--info-border:#9999cc;--info-ink:#223344;' +
  '--muted:#555;--hairline:#ddd;--wash:#f6f6f6;--missing:#aa0000;' +
  '--ink:#1a1a1a;--paper:#fff;--send:#1a1a1a;' +
  '--radius-sm:6px;--radius-md:8px}' +
  '*{box-sizing:border-box}' +
  'html{-webkit-text-size-adjust:100%}' +
  'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper);' +
  'max-width:60rem;margin:0 auto;padding:0 1rem 4rem;line-height:1.5}' +
  '::selection{background:#1a1a1a;color:#fff}' +
  ':focus-visible{outline:3px solid #1a1a1a;outline-offset:2px;border-radius:4px}' +
  '.brand{display:flex;align-items:center;gap:1rem;margin:.25rem 0 1.1rem;flex-wrap:wrap}' +
  '.brand svg{height:clamp(56px,7vw,72px);width:auto;flex:none;display:block}' +
  '.brand-sub{font-size:.9rem;color:var(--muted);line-height:1.4}' +
  '.board{position:sticky;top:0;background:var(--paper);border-bottom:1px solid var(--hairline);' +
  'padding:1.4rem 0 1rem;margin:0 -1rem;padding-left:1rem;padding-right:1rem;z-index:5}' +
  '.board h1{font-size:1.25rem;line-height:1.2;margin:0 0 .3rem;font-weight:700}' +
  '.board .day{font-size:1.05rem;font-weight:600;margin:.3rem 0 .25rem}' +
  '.meta{margin:.25rem 0 0;color:var(--muted);font-size:.9rem}' +
  '.progress{display:flex;align-items:center;gap:.6rem;margin:.9rem 0 .25rem}' +
  '.rail{flex:1;height:8px;border:1px solid var(--hairline);border-radius:8px;background:var(--wash);overflow:hidden}' +
  '.rail>span{display:block;height:100%;width:0;background:var(--ink)}' +
  '.progress strong{font-size:.9rem;white-space:nowrap}' +
  '.tools{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin:.8rem 0 0}' +
  '.tools input[type="search"]{font-size:1rem;padding:.5rem .7rem;border:1px solid var(--hairline);' +
  'border-radius:var(--radius-sm);min-width:min(100%,16rem);flex:1}' +
  '.chips{display:flex;gap:.4rem;flex-wrap:wrap}' +
  '.chip{font-size:.9rem;border:1px solid var(--hairline);background:var(--paper);border-radius:999px;' +
  'padding:.45rem .8rem;cursor:pointer;min-height:44px}' +
  '.chip[aria-pressed="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}' +
  '.banner,.chrome-banner{background:var(--alert);color:var(--alert-text);border-radius:var(--radius-sm);' +
  'padding:.6rem .8rem;margin:.6rem 0;font-weight:600}' +
  '.banner .detail,.chrome-banner .chrome-error{display:block;margin-top:.25rem;font-weight:400;font-size:.85rem}' +
  '.note,.chrome-note{background:var(--info-bg);border:1px solid var(--info-border);color:var(--info-ink);' +
  'border-radius:var(--radius-sm);padding:.6rem .8rem;margin:.6rem 0}' +
  '.list{display:grid;gap:1rem;margin-top:1rem}' +
  '.card{border:1px solid var(--hairline);border-radius:var(--radius-md);padding:1rem;' +
  'display:grid;grid-template-columns:4.5rem 1fr;gap:0 1rem;background:var(--paper)}' +
  '.time{font-weight:700;font-size:1rem;line-height:1.3}' +
  '.time small{display:block;font-weight:400;color:var(--muted);font-size:.8rem}' +
  '.card h2{font-size:1.05rem;line-height:1.4;margin:0 0 .2rem}' +
  '.phones{color:var(--muted);font-size:.9rem;margin:0 0 .6rem}' +
  '.tags{display:flex;gap:.35rem;flex-wrap:wrap;margin:0 0 .6rem}' +
  '.tag{font-size:.78rem;border:1px solid var(--hairline);border-radius:999px;padding:.15rem .55rem;color:var(--muted)}' +
  '.tag.attn{border-color:var(--missing);color:var(--missing)}' +
  '.actions{display:flex;flex-wrap:wrap;gap:.5rem;margin:.2rem 0 .7rem}' +
  '.btn{font-size:1rem;padding:.6rem .9rem;border-radius:var(--radius-sm);border:1px solid var(--ink);' +
  'min-height:44px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:.45rem}' +
  '.btn.primary{background:var(--send);color:#fff}' +
  '.btn.ghost{background:#fff;color:var(--ink)}' +
  '.btn[disabled]{opacity:.45;cursor:not-allowed}' +
  '.btn svg{width:18px;height:18px;flex:none}' +
  'pre{white-space:pre-wrap;background:var(--wash);padding:1rem;border-radius:var(--radius-md);margin:.4rem 0 0;' +
  'font-size:1rem;line-height:1.5;max-width:70ch}' +
  'details.msg{margin-top:.4rem}' +
  'details.msg summary{cursor:pointer;min-height:44px;display:inline-flex;align-items:center;color:var(--muted);font-size:.9rem}' +
  '.missing{color:var(--missing);font-weight:600}' +
  '.sent{border-color:var(--ink)}' +
  '.sent .state-line{font-size:.9rem;color:var(--muted)}' +
  '.state-line{font-size:.9rem;color:var(--muted)}' +
  '.suppressed{margin-top:2rem}' +
  '.suppressed ul{margin:.5rem 0;padding-left:1.2rem}' +
  '.chrome-form{margin:.75rem 0}.chrome-form input,.chrome-form button{font-size:1rem;padding:.25rem .5rem}' +
  '.chrome-quick{margin-left:.5rem;color:#555;font-size:.9rem}' +
  '.chrome-links{margin:.5rem 0;font-size:.9rem}' +
  'footer{margin-top:2rem;color:var(--muted);font-size:.9rem;border-top:1px solid var(--hairline);padding-top:1rem}' +
  '@media (max-width:560px){' +
  '.board{padding:1.1rem 1rem .9rem}' +
  '.brand{margin-bottom:.9rem}' +
  '.card{grid-template-columns:1fr}' +
  '.time{margin-bottom:.3rem}' +
  '.time small{display:inline;margin-left:.4rem}}'

export const WHATSAPP_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
  '<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.4A8.5 8.5 0 1 1 21 11.5z"/></svg>'

export const REPORT_FOOTER =
  '<footer>Glow Hong Kong · 8/F Silver Fortune Plaza, 1 Wellington Street, Central · ' +
  'Phone +852 25255198 · WhatsApp +852 96802107 · ' +
  '<a href="https://www.glowspa.hk/cancellation-sales-policy">Cancellation policy</a>.</footer>'

export interface BoardOptions {
  /** Page title, e.g. `Reminder list`. */
  title: string
  /** Spelled-out day line, e.g. `Reminders for Monday September 14th 2026`. */
  dayLine: string
  /** Meta line under the day: generated-at, list kind, counts. */
  metaLine: string
  /** Number of client cards on the page (progress rail denominator). */
  total: number
}

/**
 * Sticky day-board header: brand, title, spelled-out day, freshness meta,
 * progress rail, and search + filter chips. Day navigation (the GET day
 * form and quick links) is rendered separately by `serveDay.ts` and passed
 * through chrome `extra` — filtering chips and day navigation coexist.
 */
export const buildBoard = (opts: BoardOptions): string =>
  '<header class="board">\n' +
  `<div class="brand">${GLOW_BRAND_SVG}\n<span class="brand-sub">${BRAND_SUB}</span></div>\n` +
  `<h1>${escapeHtml(opts.title)}</h1>\n` +
  `<p class="day">${escapeHtml(opts.dayLine)}</p>\n` +
  `<p class="meta">${escapeHtml(opts.metaLine)}</p>\n` +
  '<div class="progress" aria-live="polite">\n' +
  '<div class="rail" aria-hidden="true"><span id="railFill"></span></div>\n' +
  `<strong id="progressText">0 of ${opts.total} sent</strong>\n</div>\n` +
  '<div class="tools">\n' +
  '<input type="search" id="q" placeholder="Filter by name, service, staff…" aria-label="Filter by name, service, staff">\n' +
  '<div class="chips" role="group" aria-label="Show">\n' +
  '<button class="chip" data-f="all" aria-pressed="true">All</button>\n' +
  '<button class="chip" data-f="todo" aria-pressed="false">To send</button>\n' +
  '<button class="chip" data-f="attn" aria-pressed="false">Needs attention</button>\n' +
  '<button class="chip" data-f="sent" aria-pressed="false">Sent</button>\n' +
  '</div>\n</div>\n</header>'

/**
 * Vanilla client behaviour: sent ticks (per-day localStorage key so one
 * day's ticks never leak into another), copy-to-clipboard fallback, and
 * search + filter chips driving the progress rail. No framework.
 */
export const reportScript = (storageKey: string): string => {
  const safeKey = storageKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return (
    '<script>(function(){' +
    `var KEY='${safeKey}';` +
    "var sent={};try{sent=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){sent={}}" +
    "var cards=Array.prototype.slice.call(document.querySelectorAll('.card'));" +
    "var q=document.getElementById('q'),rail=document.getElementById('railFill'),pt=document.getElementById('progressText');" +
    "var filter='all';" +
    'function save(){try{localStorage.setItem(KEY,JSON.stringify(sent))}catch(e){}}' +
    'function paint(){var n=0;cards.forEach(function(c){' +
    "var btn=c.querySelector('[data-sent]');if(!btn)return;" +
    "var id=btn.getAttribute('data-sent'),on=!!sent[id];" +
    "btn.setAttribute('aria-pressed',on?'true':'false');" +
    "btn.textContent=on?'Sent \\u2014 undo':'Mark sent';" +
    "var line=c.querySelector('[data-state]');if(line)line.textContent=on?'Sent in this browser \\u2014 still needs WhatsApp send to count.':'';" +
    "c.classList.toggle('sent',on);if(on)n++;});" +
    "if(rail)rail.style.width=(cards.length?n/cards.length*100:0)+'%';" +
    "if(pt)pt.textContent=n+' of '+cards.length+' sent';}" +
    'function applyFilter(){var term=q&&q.value?q.value.toLowerCase().trim():\'\';' +
    'cards.forEach(function(c){' +
    "var hay=(c.getAttribute('data-name')||'').toLowerCase();" +
    "var b=c.querySelector('[data-sent]');var id=b?b.getAttribute('data-sent'):'';" +
    'var isSent=!!sent[id],isAttn=c.getAttribute(\'data-attn\')===\'true\';' +
    'var ok=true;' +
    'if(term&&hay.indexOf(term)<0)ok=false;' +
    "if(filter==='todo'&&isSent)ok=false;" +
    "if(filter==='sent'&&!isSent)ok=false;" +
    "if(filter==='attn'&&(!isAttn||isSent))ok=false;" +
    "c.style.display=ok?'':'none';});}" +
    "document.querySelectorAll('[data-sent]').forEach(function(b){" +
    "b.addEventListener('click',function(){var id=b.getAttribute('data-sent');sent[id]=!sent[id];save();paint();applyFilter();});});" +
    "document.querySelectorAll('[data-copy]').forEach(function(b){" +
    "b.addEventListener('click',function(){" +
    "var el=document.getElementById(b.getAttribute('data-copy'));if(!el)return;" +
    'var t=el.textContent;' +
    "function done(ok){b.textContent=ok?'Copied':'Copy failed \\u2014 select manually';setTimeout(function(){b.textContent='Copy message'},1500);}" +
    'if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){done(true)},function(){done(false)})}' +
    "else{var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();" +
    "try{document.execCommand('copy');done(true)}catch(e){done(false)}ta.remove()}});});" +
    "document.querySelectorAll('.chip').forEach(function(ch){" +
    "ch.addEventListener('click',function(){filter=ch.getAttribute('data-f');" +
    "document.querySelectorAll('.chip').forEach(function(o){o.setAttribute('aria-pressed',o===ch?'true':'false')});" +
    'applyFilter();});});' +
    'if(q)q.addEventListener(\'input\',applyFilter);' +
    'paint();applyFilter();' +
    '})();</script>'
  )
}

/** localStorage key per day so ticks never leak across days. */
export const sentKeyForDay = (dayLabel: string | null): string =>
  dayLabel === null ? 'reminders-sent-dry-run' : `reminders-sent-${dayLabel}`

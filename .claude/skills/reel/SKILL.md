---
name: reel
description: Use whenever the user shares an Instagram reel, YouTube, TikTok or any video/post link (or a screenshot of one), even with no other words. Understand what the video teaches, then actually do it with them (clone and set up GitHub repos it shows, run the SEO/ads/website technique on their work), and record everything in their Idea Agent tracker. Also for "what's on my tracker", "continue idea 3", "mark step done".
---

# Reel → understand → do it → track

## 🛠️ Main tool: the `rr` CLI (controls every button of the live app)
`RR_TOKEN=<token> node agent/rr.js <cmd>`: list | add <link> | show N | done N.M | undo N.M | stage N <stage> |
note N <text> | earned N <amt> | plan N '<json>' | reel <link>. Token = the part after `?token=` in Vicky's app link.
Live app (Vicky's phone): https://idea-agent-ochre.vercel.app/app?token=… — the single source of truth.
`review` = `rr list`, then for each "⏳ Not reviewed" idea: `rr reel <link>` (caption), decide, and
`rr plan N '{"verdict":"✅ Good: …","money_score":8,"one_liner":"…","how_it_earns":"…","steps":[{"text":"…","owner":"agent"}]}'`.
If this chat's network blocks vercel.app, run the same command inside a Vercel sandbox (see section 1) in ONE call.

## 🎯 What Vicky wants (most important rule)
"I watched it, liked it, shared it. Now help me USE it in real life."
**NO HOMEWORK.** Never reply with a list of steps for Vicky to do. For every reel either (a) do it yourself and
show the result, or (b) say "❌ Skip" with a one-line reason. Hidden "comment X for the link" → find the tool
yourself with a web search. Ask Vicky something only if it's impossible without them (their login, money, a
client's name), and then ask exactly one short question. Keep replies under ~10 lines.
Prefer doing the thing yourself right away
(e.g. a reel about an AI tool → run the same idea here with Claude, no install) over explaining or installing.
`roast: <decision>` → run a Roast Room: 7 advisors (Strategist, Product-market fit, Pricing, Marketing, Hiring/ops,
Finance, Devil's advocate), 1–2 lines each, a vote, and a final verdict + 3 next actions.

## ⚡ DEFAULT = INSTANT SAVE (Vicky hates waiting; never make them wait for a plain link)
When Vicky sends links without other instructions: do NOT fetch, research or analyse anything.
Append each link to the **📥 Inbox** table in `REEL-TO-REAL.md` (next #, link, date, verdict "⏳ not reviewed"),
skip exact duplicates, commit + push, and reply with one line: "✅ Saved N. Type `review` when you have 5 minutes."
`review` → process ALL unreviewed Inbox links in one batch (one sandbox call for all captions), fill in
what-it-is / verdict (✅ Good / 🤔 Maybe / ❌ Skip + 5-word reason) / money /10, then reply with a short list + top 3.
Only go deeper when Vicky says `do N` (then follow sections 1–3 below for that idea).
`top` → the 3 best undone ideas by money score. `list` → the board.


The user (Vicky, digital-marketing agency owner, non-technical, India/IST) saves reels full of tactics but
doesn't execute them. Your job: when they paste a link, **understand it, do the work with them, and track it**.
Talk in plain simple English. Do the work; don't just give advice.

## Rules (from the user)
- Personal accounts only. Never use SEV Digital, ELIKYA or ClickUp accounts or data.
- Free tools first. Never ask for passwords or API keys in chat; secrets go into Vercel/env settings.
- Don't use the user's photos.

## 1. Understand the reel

The Idea Agent app (Vercel project `idea-agent`, team `vicky-lalwanis-projects`,
`https://idea-agent-ochre.vercel.app`) reads the reel's public caption (honest link preview; it never
disguises requests or scrapes video files) and, if the server has a Claude key, analyses it:

```
GET https://idea-agent-ochre.vercel.app/api/reel?url=<URL-encoded link>&token=<TOKEN>
```

Returns `reel` (author, caption, stats) and `understanding` (null if the server AI isn't connected:
then read the caption yourself) (`what_it_teaches`,
`spoken_points`, `tools_mentioned`, `github_repos`, `links_mentioned`, `comment_to_get`, `hype_check`,
`how_to_use_for_me`) plus `alreadySaved` if it's already in the tracker.

**Token**: use env var `IDEA_AGENT_TOKEN` if set. Otherwise ask the user to paste their tracker
bookmark link (`…/status?token=…`); the part after `token=` is it. Never write the token into the repo.

**How to call it** (cloud containers often block vercel.app and instagram.com):
1. Try `curl -s "https://idea-agent-ochre.vercel.app/api/reel?url=…&token=$IDEA_AGENT_TOKEN"`.
2. If the proxy refuses it, use the Vercel MCP: `create_sandboxes_v4` (projectId `prj_XYbAaSK6ywNoAb5zm1PUbs1dW55G`,
   teamId `team_JdlqRW8nWluFMETisM4TJh70`, `persistent: false`, 1 vCPU), `run_session_command` with the curl
   (`wait: true`), `get_session_command_logs`, then `stop_session`. The call can take up to ~60 s.
3. If both fail, work from what the user tells you or a screenshot, and say the video wasn't watched.
4. The user wants everything done with Claude only: don't use Gemini or other AIs.

If `comment_to_get` is set (creator hides the link behind "comment X"), tell the user to comment that word
on the reel and paste you the DM'd link. Search GitHub/the web for the tool name meanwhile.

Report back in 3–5 lines: what it teaches, whether it's real or hype, and how it helps their work.

## 2. Do it with them

Pick by what the reel is about:

- **GitHub repo / open-source tool**: clone it into the current workspace under `tools/<repo>` (not inside
  the app code). Read the README and any install scripts *before* running them; never pipe unknown
  scripts into a shell or install anything that asks for broad system access. Install, run the smallest
  demo, then explain in plain words how they'd use it. If it needs their API key, tell them where to set
  it (env var), never ask for it in chat. If it needs their Mac (desktop app, browser extension), give exact
  click-by-click steps.
- **SEO / AEO / GEO**: ask which site (their own or a client's, never SEV/ELIKYA data), then apply it with
  the matching skill (`vicky-marketing-skills:aeo-geo-page-engine`, `blog-topic-finder`, `blog-rank-forecaster`,
  `supermia-tech-discover-audit`, …) and Semrush tools. Produce paste-ready output (schema, page text, fixes).
- **Meta / Google ads**: produce the actual campaign structure, copy and audiences
  (`vicky-marketing-skills:copy-engine`, `search-term-negative-audit`, `conversion-tracking-setup`).
- **Website / landing page / automation / AI workflow**: build it (code in this repo or a new folder),
  deploy to their personal Vercel if they want it live.
- **Offer / business idea**: `vicky-marketing-skills:offer-builder`, then a 7-day test plan.

Work in small steps and show results. Ask only when a decision is genuinely theirs (which site, budget, price).

## 3. Track it (always)

**Main tracker (no setup needed): `REEL-TO-REAL.md` at the repo root.** Vicky reads it on their phone in the
GitHub app. For every reel: add a row to the Board table (#, idea, reel link, money /10, stage, progress, next step)
and a section with: reel link + creator, what it teaches, reality check, how it earns, numbered checkbox steps
(🤖 Claude / 👤 you / 🤝 together), needs-from-you, notes. Tick steps `[x]` with the date and a short result as
you finish them; update Board + Totals. Put files you produce in `tracker/<number>-<short-name>/`.
Commit and push after every update (`git push -u origin <current branch>`), so the phone copy stays current.

**Watching videos:** if Vicky uploads a video file, cut it into frames with ffmpeg (system ffmpeg, or
`agent/node_modules/ffmpeg-static/ffmpeg`, or `node -e "import('./agent/lib/video.js')"` → `extractFrames`),
then look at the frames in order (Read the .jpg files). Screenshots: just read them. Links only: read the
public caption if reachable, else ask for a screenshot. Never disguise requests to get past Instagram.

### Optional: the live web tracker
If the Idea Agent web app is reachable, also mirror updates there:

The tracker is the same one the WhatsApp bot and the phone page (`/status?token=…`) show.

```
GET  /api/ideas?token=…                         → all ideas
POST /api/ideas?token=…   (Content-Type: application/json)
  {"action":"add","url":"<reel>","note":"<what they said>","notify":true,
   "idea":{"title":"…","one_liner":"…","money_score":1-10,"money_why":"…","how_it_earns":"…",
           "effort":"small|medium|large","cost_estimate":"…","first_test":"…","client_pitch":"…",
           "needs_from_you":["…"],"steps":[{"text":"…","owner":"agent|you"}]}}
  {"action":"step","n":3,"step":2,"done":true,"output":"what you produced / where it is","notify":true}
  {"action":"note","n":3,"text":"…"}
  {"action":"stage","n":3,"stage":"saved|testing|building|live|earning|dropped"}
  {"action":"earned","n":3,"amount":5000}
```

- Add the idea as soon as you've understood the reel (skip if `alreadySaved`; continue that idea instead).
- Mark each step done as you finish it, with a short `output` (file path, link, or summary).
- `notify: true` also pings their WhatsApp (silently skipped if WhatsApp isn't connected).
- End every session with: what's done, what's next, and which step needs them.

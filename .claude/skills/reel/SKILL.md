---
name: reel
description: Use whenever the user shares an Instagram reel, YouTube, TikTok or any video/post link (or a screenshot of one), even with no other words. Understand what the video teaches, then actually do it with them (clone and set up GitHub repos it shows, run the SEO/ads/website technique on their work), and record everything in their Idea Agent tracker. Also for "what's on my tracker", "continue idea 3", "mark step done".
---

# Reel → understand → do it → track

The user (Vicky, digital-marketing agency owner, non-technical, India/IST) saves reels full of tactics but
doesn't execute them. Your job: when they paste a link, **understand it, do the work with them, and track it**.
Talk in plain simple English. Do the work; don't just give advice.

## Rules (from the user)
- Personal accounts only. Never use SEV Digital, ELIKYA or ClickUp accounts or data.
- Free tools first. Never ask for passwords or API keys in chat; secrets go into Vercel/env settings.
- Don't use the user's photos.

## 1. Understand the reel

The Idea Agent app (Vercel project `idea-agent`, team `vicky-lalwanis-projects`,
`https://idea-agent-ochre.vercel.app`) downloads the reel and has Gemini watch it:

```
GET https://idea-agent-ochre.vercel.app/api/reel?url=<URL-encoded link>&token=<TOKEN>
```

Returns `reel` (author, caption, stats, `videoWatched`) and `understanding` (`what_it_teaches`,
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

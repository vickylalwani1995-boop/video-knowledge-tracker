# Reel2Real 🎬 → 💡 → 🚀 → 🏆

**Stop saving reels. Start using them.**

Reel2Real turns the knowledge videos you save on Instagram and YouTube (AEO, GEO, SEO, Meta Ads,
Google Ads, social, AI, video creation) into a loop you actually finish:

| Stage | What you do | What the app does |
|---|---|---|
| **Save** | Share a reel from Instagram (or paste a link) | Auto-detects platform, removes duplicates, auto-tags the topic from the caption |
| **Watch** | Hit *Today's 3*: three picks from your queue | Prefers topics you've neglected lately so the backlog stays balanced |
| **Learn** | Write the ONE thing you learned + how you'd use it | Files it in your **Knowledge bank**, grouped by topic |
| **Apply** | Send that learning to a connected project (SuperMIA, RevEvolve, a client…) | Creates an **experiment**: Queued → Testing → Worked / Didn't work |
| **Prove** | Log the result ("CPL $42 → $27") | Shows it on the **Wins wall**; exports a per-project Playbook as Markdown |

There are no boards and no due dates, so it doesn't feel like project management. You get XP, a learning streak, and one dashboard (**Brain**)
that answers *"in the last 10 days I watched 20 videos — 3 were GEO, 2 were AEO, I applied 4, 2 worked"*,
plus **blind spots**: topics you keep saving but never actually learn.

## Use it

It's a static web app (no server, no account, no build step). Your data stays in your browser's local storage.
Export a JSON backup from ⚙︎ Settings from time to time.

```bash
npm start        # serves on http://localhost:5173
npm test         # unit tests for the tracking logic (node --test)
```

### Put it on your phone (needed for "Share → Reel2Real")

1. In GitHub: **Settings → Pages → Source: GitHub Actions**. Merging to `main` deploys to
   `https://<you>.github.io/video-knowledge-tracker/`.
2. **Android:** open that URL in Chrome → ⋮ → **Install app**. Reel2Real now shows up in Instagram's
   and YouTube's **Share** sheet. Share a reel, add a 3-word note, tap Save.
3. **iPhone** (iOS doesn't let web apps join the share sheet yet, so use a Shortcut):
   1. Safari → Share → **Add to Home Screen**.
   2. Shortcuts app → New Shortcut → turn on **Show in Share Sheet** (accepts URLs + text).
   3. Add action **URL**: `https://<you>.github.io/video-knowledge-tracker/?url=` then insert *Shortcut Input*.
   4. Add action **Open URLs**. Name it "Reel2Real".
   5. In Instagram: Share → **Reel2Real**. Add `&save=1` to the end of the URL to save straight to the queue with no extra tap.

Any link of the form `…/?url=<link>&text=<caption>` works, so bookmarklets and automations (n8n, Zapier) can feed it too.

## Files

| File | Purpose |
|---|---|
| `core.js` | Pure logic: URL normalisation, topic auto-tagging, stats, streak, XP, Today's picks, playbook export |
| `app.js` | UI: Today / Library / Lab / Brain views, dialogs, share-target intake |
| `styles.css` | Dark/light theme, mobile-first |
| `manifest.webmanifest`, `sw.js` | Installable PWA + Android share target + offline cache |
| `test/core.test.js` | Unit tests |

## Notes

- Instagram doesn't allow apps to read your *Saved* collection, so videos come in through Share or paste.
  The fastest habit: when you'd tap 🔖 Save, tap Share → Reel2Real instead.
- YouTube titles are fetched via the public noembed.com service. Instagram titles come from your note or caption.
- Add your own topics (e.g. *Email Marketing*) with auto-tag keywords in ⚙︎ Settings.

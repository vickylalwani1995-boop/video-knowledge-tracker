# Reel2Real 🎬 → 💡 → 🚀 → 🏆

**Stop saving reels. Start using them.**

Reel2Real turns the knowledge videos you save on Instagram and YouTube (AEO, GEO, SEO, Meta Ads,
Google Ads, social, AI, video creation) into a loop you actually finish:

| Stage | What you do | What the app does |
|---|---|---|
| **Save** | Share a reel from Instagram (or paste a link) | Auto-detects platform, removes duplicates, auto-tags the topic from the caption |
| **Watch** | Hit *Today's 3*: three picks from your queue | Prefers topics you've neglected lately so the backlog stays balanced |
| **Learn** | Write the ONE thing you learned + how you'd use it | Files it in your **Knowledge bank**, grouped by topic |
| **Apply** | Send that learning to a connected project (your website, a client, a side project — any name you like) | Creates an **experiment**: Queued → Testing → Worked / Didn't work |
| **Prove** | Log the result ("CPL $42 → $27") | Shows it on the **Wins wall**; exports a per-project Playbook as Markdown |

There are no boards and no due dates, so it doesn't feel like project management. You get XP, a learning streak, and one dashboard (**Brain**)
that answers *"in the last 10 days I watched 20 videos — 3 were GEO, 2 were AEO, I applied 4, 2 worked"*,
plus **blind spots**: topics you keep saving but never actually learn.

## Use it

**Web app (synced across laptop + phone):** https://claude.ai/artifact/9nhgghFcCHUDdHQ21RiCx9.
Sign in to claude.ai and open it on any device. Your data is saved privately to your Claude account.
Rebuild + republish with `npm run build:standalone` → `dist/reel2real-web.html`.


It's a static web app (no server, no account, no build step). Your data stays in your browser's local storage.
Export a JSON backup from ⚙︎ Settings from time to time.

```bash
npm start        # serves on http://localhost:5173
npm test         # unit tests for the tracking logic (node --test)
```

### Put it on your phone

1. In GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Every merge to `main`
   deploys to `https://vickylalwani1995-boop.github.io/video-knowledge-tracker/`.
2. **iPhone:** open that link in **Safari** → Share button → **Add to Home Screen** → Add.
   To save a reel: in Instagram tap **Share (paper plane) → Copy link**, open Reel2Real from your
   home screen, tap **📋 Paste link** (then tap iOS's "Paste" bubble), add a few words, tap **Save to queue**.
   Always open it from the home-screen icon, not Safari. iOS gives each one separate storage.
3. **YouTube** works the same way: Share → Copy link → 📋 Paste link. To bring in many at once, copy several links (one per line) and tap 📋 Paste link — they all go into the queue.
4. **Android:** open the link in Chrome → ⋮ → **Install app**. Reel2Real then appears in Instagram's and
   YouTube's **Share** sheet: Share → Reel2Real → Save.

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

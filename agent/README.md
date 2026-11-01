# 💡 Idea Agent (WhatsApp)

**Forward a reel and get back a plan. The agent tracks every idea until it makes money.**

You see a great tactic on Instagram (Meta ads, Google ads, SEO, a website trick, an AI automation).
Instead of saving it and forgetting it, you send it to your **Idea Agent** contact on WhatsApp. Within a minute it replies with:

- what the idea actually is, plus a **money score out of 10** with the reason
- how it earns (for you, or as a service you sell to clients) and what it costs
- the **cheapest 7-day test** that proves or kills it
- 4–8 numbered steps: 🤖 the agent does these, 👤 you do these
- a ready-to-use client pitch

It then keeps you moving: a **9 AM brief** with today's one thing (which also proves the agent is alive), an evening nudge,
a Sunday report, and a private tracker page you can open on your phone.

## What you send on WhatsApp

| Send | What happens |
|---|---|
| A reel / YouTube / any link (+ a few words if you like) | Saved as a new idea with a full plan |
| A **screenshot** of a reel or post | The agent reads the image and makes a plan from it (works best for Instagram) |
| `idea: sell AI receptionists to dentists` | Saves an idea you typed yourself |
| `list` · `top` · `next` | All ideas by stage · best 3 · the one thing to do today |
| `3` | Opens idea #3 |
| `do 3.2` | The agent **does** step 2 of idea 3: ad copy, landing page text, scripts, emails, setup checklists |
| `done 3.2` / `undo 3.2` | Tick a step / un-tick it |
| `move 3 live` | Stages: saved → testing → building → live → earning (or dropped) |
| `earned 3 5000` | Logs money made; the idea moves to 💰 Earning |
| `note 3 client said yes` · `drop 3` | Add a note · drop an idea |
| `status` | Is everything working? |
| Any question | "Which idea is fastest to money?" gets a real answer using your idea list |

Only **your** number can use it. Messages from anyone else are ignored.

## Set it up (about 30 minutes, once)

All accounts are your own, on your personal email. **Never paste keys or tokens into any chat (including Claude or Grok).**
You type them only into Vercel's Environment Variables screen.

### 1. Deploy the code to Vercel (free)
1. Sign in at **vercel.com** with your personal GitHub.
2. **Add New → Project →** import `video-knowledge-tracker`.
3. Set **Root Directory** to `agent`. Click **Deploy**.
4. Note your URL, e.g. `https://idea-agent-xyz.vercel.app`.

### 2. Add storage (free)
In the Vercel project: **Storage → Create / Connect → Upstash (Redis) → free plan → Connect to project.**
This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. Without it your ideas are lost on every restart.

### 3. Get the AI key
**platform.claude.com → API keys → Create key.** Add a few dollars of credit.
In Vercel: **Settings → Environment Variables →** `ANTHROPIC_API_KEY`.

### 4. Create the WhatsApp number (free test number from Meta)
1. **developers.facebook.com → My Apps → Create app → type "Business" → add the WhatsApp product.**
2. In **WhatsApp → API Setup**: add your personal number as a recipient and verify the code.
   Copy the **Phone number ID**. Create a **permanent token** (Business Settings → System users → Generate token with
   `whatsapp_business_messaging` permission). The temporary token on that page expires in 24 hours.
3. **App settings → Basic →** copy the **App secret**.
4. Add to Vercel Environment Variables:

| Name | Value |
|---|---|
| `WHATSAPP_TOKEN` | the permanent token |
| `WHATSAPP_PHONE_NUMBER_ID` | the Phone number ID |
| `WHATSAPP_APP_SECRET` | the App secret |
| `WHATSAPP_VERIFY_TOKEN` | any word you make up, e.g. `mango-rocket-77` |
| `OWNER_WHATSAPP` | your number with country code, digits only, e.g. `919876543210` |
| `CRON_SECRET` | any long random text (turns on the daily briefs) |
| `STATUS_TOKEN` | any long random text (password for your tracker page) |

5. Redeploy in Vercel (**Deployments → ⋯ → Redeploy**) so it picks up the variables.
6. Back in Meta: **WhatsApp → Configuration → Webhook → Edit**
   - Callback URL: `https://YOUR-URL.vercel.app/api/whatsapp`
   - Verify token: the same word as `WHATSAPP_VERIFY_TOKEN`
   - Click **Verify and save**, then **Manage → subscribe to `messages`**.
7. Save the test number in your phone as **Idea Agent** and send `hi`. You should get the menu back.

### 5. Make sure it stays alive
- Open `https://YOUR-URL.vercel.app/api/status`. It says `"ok": true` when everything is set up, and lists exactly what's missing when it isn't.
- Your tracker page: `https://YOUR-URL.vercel.app/api/status?token=YOUR_STATUS_TOKEN` (add it to your iPhone home screen).
- Free alert: at **uptimerobot.com**, add an HTTP monitor on `/api/status`. You get an email if it ever returns an error.
- If the 9 AM brief doesn't arrive, something is wrong. Send `status` or open the status page.

## Good to know

- **Instagram blocks bots from watching reels.** The agent tries to read the caption from the link; if it can't, it tells you.
  The fastest habit is to forward the link **and** a screenshot, or paste the caption.
- **WhatsApp's 24-hour rule:** a business number can only send free text within 24 hours of your last message to it.
  Replying to any brief keeps the window open. To get briefs even after a quiet day, create a message template in
  Meta (WhatsApp Manager → Message templates) with one body variable `{{1}}`, get it approved, and set `WHATSAPP_TEMPLATE` to its name.
- **Brief times** are set for India (9:00 AM, 8:00 PM, Sunday 7:00 PM IST) in `vercel.json`. Cron times are in UTC.
- **Cost:** Vercel, Upstash and the Meta test number are free. AI is pay-as-you-go: roughly $0.05–0.15 per new idea or `do` step
  with the default model (`claude-opus-5-5`). Set `AI_MODEL=claude-sonnet-5-5` in Vercel to cut that roughly in half.
- **Safety:** the AI automatically retries on a fallback model if a safety filter declines a message (for example, a reel about "hacking" ads).
  It never asks for passwords, and it won't plan spam, fake reviews or scraping other people's accounts.
- **Moving to a real business number later** (so it's not the Meta test number): add your own number in WhatsApp Manager.
  Nothing in the code changes; only `WHATSAPP_PHONE_NUMBER_ID` does.

## Try it without WhatsApp

```bash
cd agent
npm install
npm run chat                       # chat in the terminal exactly like WhatsApp
ANTHROPIC_API_KEY=... npm run chat # same, with the real AI brain
npm test                           # 28 automated tests
npm run dev                        # local server on http://localhost:3000/api/status
```

In `npm run chat`, type `/morning`, `/evening` or `/weekly` to preview the scheduled messages.

## How it's built

| File | Job |
|---|---|
| `api/whatsapp.js` | Webhook: Meta verification + incoming messages (signature-checked) |
| `api/cron.js` | 9 AM brief, evening nudge, Sunday report (called by Vercel Cron) |
| `api/status.js` | Public health check + private tracker page |
| `lib/agent.js` | Reads your message, runs the command or asks the AI, replies |
| `lib/ai.js` | Claude: analyse idea → plan, do a step, answer questions (offline fallback if no key) |
| `lib/ideas.js` | Idea tracking: stages, steps, ranking, what to do next |
| `lib/format.js` | WhatsApp message layouts |
| `lib/whatsapp.js` | Send/receive via WhatsApp Cloud API, screenshot download |
| `lib/preview.js` | Reads link titles/captions where the site allows it |
| `lib/store.js` | Upstash Redis storage (local file for development) |

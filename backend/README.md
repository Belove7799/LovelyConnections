# Coaching Platform — Backend Starter

Matches the Launch Guide PDF. Drop this folder into `backend/` in your repo
alongside your existing `frontend/` folder.

## Files

| File | What it does |
|---|---|
| `server.js` | Entry point — wires up routes, static frontend, and the cron job |
| `db.js` | PostgreSQL connection + creates tables on first run |
| `email.js` | Sends all emails via Gmail SMTP, logs each send |
| `cron.js` | Daily job that sends the right weekly email to each paying client |
| `routes/signup.js` | `POST /signup` — creates the user, sends the welcome email |
| `routes/payment.js` | `POST /payment-submitted` and `GET /confirm-payment` — manual Zelle/Cash App flow |
| `routes/followup.js` | `GET /send-followup` — one-click "they're joining" / "they need time" emails after a discovery call |
| `routes/materials.js` | `GET /materials?token=...` — the real access control for your video materials, checked before any Wistia embed is ever sent |

## How payment works (no Stripe)

There's no payment processor, so nothing here verifies money automatically.
The flow is:

1. Your site shows your Zelle info and Cash App `$cashtag` and asks the
   client to send payment there directly, outside your app.
2. The client fills a short "I've paid" form → `POST /payment-submitted`.
   This logs the claim, emails the client a "we're reviewing it"
   confirmation, and emails **you** (`ADMIN_EMAIL`) with the details and a
   one-click confirmation link.
3. You check your actual Zelle or Cash App activity yourself.
4. Once you've confirmed the money is really there, click the link in
   that email (`GET /confirm-payment?paymentId=...&key=...`). That's the
   only thing that grants access — it marks the payment paid, generates
   the client's personal `access_token`, and sends them their materials
   link.

**Don't click the confirm link until you've actually checked your Zelle or
Cash App account.** There's no way for the server to know on its own.

## Running locally

```bash
cp .env.example .env
# fill in .env with your real values
npm install
npm start
```

Visit `http://localhost:3000/health` — you should see `{"status":"ok"}`.

Generate a random `ADMIN_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

### Setting up Gmail sending (2 minutes, no DNS)

1. Turn on 2-Step Verification: myaccount.google.com/security
2. Create an app password: myaccount.google.com/apppasswords — choose "Mail," name it anything, copy the 16-character code.
3. Put your Gmail address in `GMAIL_USER` and that code in `GMAIL_APP_PASSWORD`.

### Setting up materials access (Wistia, token-gated)

Unlike the earlier Google Drive approach, this doesn't need any manual
per-client step — it's fully automatic. Here's how the pieces fit
together, and what you need to set up once:

**In Wistia:**
1. Upload your 8 weeks of videos into a Wistia **Channel**.
2. Open the Channel's **Embed & Share** panel, copy the ID from the embed
   code (the string after `wistia_async_`), and set it as
   `WISTIA_CHANNEL_ID` in `.env`.
3. In your Wistia account settings, turn on **Domain Restrictions** and
   add your real domain to the allowlist. This stops the video from
   playing anywhere except your own site — a second layer of protection
   on top of the token check below.

**In your backend (already built, nothing to configure):**
- When you confirm a payment, `routes/payment.js` generates a random,
  unique `access_token` for that client and saves it to their `users` row.
- Their access email links to `/materials?token=THEIR_TOKEN`.
- `routes/materials.js` looks up that exact token before rendering
  anything. No match, no embed — the person literally never receives the
  Wistia embed code in their browser, so there's nothing to copy or
  forward that would work for someone else.

**Why this is different from the Drive approach:** Drive's security came
from Google's own per-account permissions. Wistia doesn't have an
equivalent, so the access control had to move into your own server
instead — which is what `access_token` and `routes/materials.js` do.


## Calling the API from your frontend

```js
// Sign up
const res = await fetch('/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fullName: 'Jane Doe', email: 'jane@example.com' })
});
const { userId } = await res.json();

// Show them your Zelle/Cash App details on the page, then once they say
// they've sent it:
await fetch('/payment-submitted', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId,
    method: 'zelle', // or 'cashapp'
    referenceNote: 'Sent from Jane D., $299' // whatever helps you find it
  })
});
```

## A note on Zelle and Cash App for business

Zelle's terms generally discourage using a personal account to receive
business payments, and banks can flag or limit accounts used that way.
Cash App has a separate "Cash App for Business" account type built for
exactly this — it charges a small per-transaction fee (around 2.75%) but
is the legitimate path for receiving payment for services, and handles
reporting for you. Worth checking each app's current terms for your
situation — this isn't legal or financial advice.

## Deploying

Push this to GitHub, then follow the Launch Guide to deploy on Railway and
attach PostgreSQL. Set all the same variables from `.env.example` in
Railway's Variables tab (Railway fills in `DATABASE_URL` automatically once
you attach Postgres).

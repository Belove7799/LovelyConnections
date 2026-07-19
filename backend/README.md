# Coaching Platform — Backend Starter

Matches the Launch Guide PDF. Drop this folder into `backend/` in your repo
alongside your existing `frontend/` folder.

## Files

| File | What it does |
|---|---|
| `server.js` | Entry point — wires up routes, static frontend, and the cron job |
| `db.js` | PostgreSQL connection + creates tables on first run |
| `email.js` | Sends all emails via Resend's HTTPS API, logs each send |
| `cron.js` | Daily job that sends the right weekly email to each paying client |
| `routes/signup.js` | `POST /signup` — creates the user, sends the welcome email |
| `routes/payment.js` | `POST /payment-submitted` and `GET /confirm-payment` — manual Zelle/Cash App flow |
| `routes/followup.js` | `GET /send-followup` — one-click "they're joining" / "they need time" emails after a discovery call |
| `routes/materials.js` | `GET /materials?token=...` + `POST /materials/verify` — token gets you to an email-confirmation gate; the Wistia embed is only ever sent after the typed email matches the token |

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

### Setting up Resend (5-10 minutes, one-time DNS setup)

Switched from Gmail SMTP because Railway blocks outbound SMTP ports
(465/587) on the Free and Hobby plans — connecting to Gmail would just
hang forever with no error. Resend sends over HTTPS instead, which
Railway never blocks.

1. Sign up at resend.com — no credit card needed for the free tier
   (3,000 emails/month, 100/day, plenty for a new coaching business).
2. **Add and verify your domain.** Resend → Domains → Add Domain → enter
   your real domain (e.g. `lovelyconnectionss.com`).
3. Resend shows you a handful of DNS records (SPF, DKIM, and usually a
   tracking/return-path record). Add each one in Namecheap → Advanced DNS
   → Add New Record, exactly as Resend shows them — same pattern as the
   Railway custom-domain and Zoho setup you've already done.
4. Back in Resend, click **Verify DNS Records**. This can take anywhere
   from a few minutes to a few hours to propagate, same as any DNS change.
5. Once verified, go to **API Keys** → Create API Key. Copy it into
   `RESEND_API_KEY`.
6. Set `RESEND_FROM_EMAIL` to any address on your now-verified domain
   (e.g. `hello@lovelyconnectionss.com`) — it doesn't need to be a real
   inbox that receives mail, just an address on your verified domain.

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
- Opening that link only gets you to an **email confirmation gate** — the
  token alone isn't enough. The visitor has to type the email address on
  file, which is checked against the token server-side
  (`POST /materials/verify`). Only on a match does the server respond
  with anything about the actual video.
- This closes the "I forwarded the link to a friend" gap: a friend with
  the link still doesn't know the client's exact registered email, so
  they never get past the gate.

**Why this is different from the Drive approach:** Drive's security came
from Google's own per-account permissions. Wistia doesn't have an
equivalent, so the access control had to move into your own server
instead — the token gets someone to the door, the matching email is what
actually opens it.


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

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
   only thing that grants access — it marks the payment paid, starts their
   program progress, and sends them the materials/access email.

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

### Sharing materials access with each client (manual, ~30 seconds per client)

Your Drive folder is shared by exact email, not by public link, so only
people you've explicitly added can open it. Two reminders are built in so
you never forget the step:

- The moment a client submits a payment claim, your notification email
  includes a highlighted box reminding you to share the folder with their
  email once you confirm.
- The confirm-payment page itself repeats the reminder, with their exact
  email address, right after you click confirm.

To actually share it: open your materials folder in Google Drive → Share →
paste their email → set access to **Viewer** → Send. That's the whole
step — no API, no credentials, nothing in `.env` to configure for this
part.

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
# LovelyConnections

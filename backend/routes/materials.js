// routes/materials.js
// Two layers now, not one:
//   1. The token (from the emailed link) gets someone to the gate page.
//   2. The gate page never contains the Wistia embed at all — it only
//      appears after a second request (POST /materials/verify) confirms
//      the typed email matches the token in the database.
//
// This closes the "forward the link, anyone can watch" gap: a friend with
// the link still needs to know the client's exact registered email to
// ever receive the embed code from the server in the first place.

const express = require("express");
const router = express.Router();
const { pool } = require("../db");

function rejectionPage(message) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Access Link Invalid</title>
      <meta name="robots" content="noindex, nofollow">
      <style>
        body { font-family: -apple-system, sans-serif; background: #F5F0E6; color: #1E293B;
               display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .box { background: #fff; padding: 40px; border-radius: 16px; max-width: 420px; text-align: center;
               box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        h1 { font-size: 20px; margin-bottom: 12px; }
        p { color: #4a5568; line-height: 1.6; }
        a { color: #4A7043; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>This link isn't valid</h1>
        <p>${message}</p>
        <p>If you're a client and think this is a mistake, reply to any
        email from us or reach out at ${process.env.ADMIN_EMAIL || "our support email"}.</p>
      </div>
    </body>
    </html>
  `;
}

function gatePage(token) {
  // Note this page does NOT include the Wistia embed code anywhere, even
  // hidden with CSS. It's fetched separately, only after verifyEmail()
  // below gets a success response from the server.
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirm Your Access</title>
      <meta name="robots" content="noindex, nofollow">
      <style>
        body { font-family: -apple-system, sans-serif; background: #F5F0E6; color: #1E293B;
               display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
        .box { background: #fff; padding: 40px; border-radius: 16px; max-width: 420px; width: 100%;
               text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        .wide { max-width: 900px; }
        h1 { font-size: 20px; margin: 0 0 10px 0; color: #1F3A5F; }
        p { color: #4a5568; line-height: 1.6; margin: 0 0 18px 0; }
        input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e0;
                font-size: 15px; margin-bottom: 14px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; border-radius: 8px; border: none; background: #4A7043;
                 color: #fff; font-weight: 600; font-size: 15px; cursor: pointer; }
        button:disabled { opacity: 0.6; cursor: default; }
        #error { color: #c0392b; font-size: 13px; margin-top: -6px; display: none; }
        #videoWrap { display: none; }
        h2 { color: #1F3A5F; font-size: 20px; }
      </style>
    </head>
    <body>
      <div class="box" id="gateBox">
        <h1>Confirm Your Access</h1>
        <p>Enter the email address you registered with to unlock your program materials.</p>
        <input type="email" id="emailInput" placeholder="you@example.com" autocomplete="email">
        <button id="verifyBtn" onclick="verifyEmail()">Verify &amp; Unlock</button>
        <p id="error">That email doesn't match this access link. Double-check for typos, or reach out if you think this is a mistake.</p>
      </div>

      <div class="box wide" id="videoWrap">
        <h2 id="welcomeHeading"></h2>
        <p>All 8 weeks of your program are below, organized in order. Watch at your own pace.</p>
        <div id="videoTarget"></div>
      </div>

      <script>
        const token = ${JSON.stringify(token)};

        function verifyEmail() {
          const emailInput = document.getElementById('emailInput');
          const email = emailInput.value.trim();
          const btn = document.getElementById('verifyBtn');
          const errorEl = document.getElementById('error');
          errorEl.style.display = 'none';

          if (!email) return;
          btn.disabled = true;
          btn.textContent = 'Checking…';

          fetch('/materials/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, email })
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                document.getElementById('gateBox').style.display = 'none';
                document.getElementById('welcomeHeading').textContent = 'Welcome back, ' + data.firstName;
                document.getElementById('videoWrap').style.display = 'block';

                // Browsers do NOT execute <script> tags inserted via
                // innerHTML — so the Wistia loader script is added as a
                // real DOM element instead, which does execute.
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://fast.wistia.com/embed/channel/project/' + data.channelId + '/font.css';
                document.head.appendChild(link);

                const container = document.getElementById('videoTarget');
                container.className = 'wistia_channel wistia_async_' + data.channelId + ' mode=inline';
                container.style.cssText = 'min-height:520px;position:relative;width:100%;';

                const script = document.createElement('script');
                script.src = 'https://fast.wistia.com/assets/external/channel.js';
                script.async = true;
                document.body.appendChild(script);
              } else {
                errorEl.textContent = "That email doesn't match this access link. Double-check for typos, or reach out if you think this is a mistake.";
                errorEl.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Verify & Unlock';
              }
            })
            .catch(() => {
              errorEl.textContent = 'Something went wrong — please try again in a moment.';
              errorEl.style.display = 'block';
              btn.disabled = false;
              btn.textContent = 'Verify & Unlock';
            });
        }

        document.getElementById('emailInput').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') verifyEmail();
        });
      </script>
    </body>
    </html>
  `;
}

// Step 1: token gets you to the gate — nothing about the video is sent yet.
router.get("/materials", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(403).send(rejectionPage("No access token was provided."));
  }

  try {
    const result = await pool.query("SELECT id FROM users WHERE access_token = $1", [token]);
    if (result.rows.length === 0) {
      return res.status(403).send(rejectionPage("This link is invalid or has expired."));
    }
    res.send(gatePage(token));
  } catch (err) {
    console.error("Materials page error:", err);
    res.status(500).send(rejectionPage("Something went wrong loading this page. Please try again shortly."));
  }
});

// Step 2: the actual gate. Only returns the Wistia channel ID (and only
// that — never a pre-built embed blob) once token AND email both match
// the same paid user.
router.post("/materials/verify", async (req, res) => {
  const { token, email } = req.body || {};

  if (!token || !email) {
    return res.status(400).json({ success: false });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE access_token = $1 AND LOWER(email) = LOWER($2)",
      [token, email]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(403).json({ success: false });
    }

    const paidCheck = await pool.query(
      "SELECT 1 FROM payments WHERE user_id = $1 AND status = 'paid' LIMIT 1",
      [user.id]
    );
    if (paidCheck.rows.length === 0) {
      return res.status(403).json({ success: false });
    }

    res.json({
      success: true,
      firstName: (user.full_name || "there").split(" ")[0],
      channelId: process.env.WISTIA_CHANNEL_ID,
    });
  } catch (err) {
    console.error("Materials verification error:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;

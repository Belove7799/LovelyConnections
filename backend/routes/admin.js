// routes/admin.js
// A small set of admin-only utilities, protected the same way as your
// payment-confirm and follow-up links: a long secret in the URL, not a
// username/password login. Bookmark the GET link once (see README) and
// it always works — no session to expire, nothing to log into.
//
// Currently just one tool: transfer-access. Use it whenever a client
// loses their materials link, needs it resent to the same email, or
// needs their account moved to a new email address entirely.

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { pool } = require("../db");
const { sendAccessEmail } = require("../email");

function checkKey(key) {
  const expected = String(process.env.ADMIN_SECRET || "");
  const given = String(key || "");
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function page(bodyHtml) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin — Transfer Access</title>
      <meta name="robots" content="noindex, nofollow">
      <style>
        body { font-family: -apple-system, sans-serif; background: #F5F0E6; color: #1E293B;
               display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
        .box { background: #fff; padding: 40px; border-radius: 16px; max-width: 460px; width: 100%;
               box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        h1 { font-size: 20px; margin: 0 0 8px 0; color: #1F3A5F; }
        p { color: #4a5568; line-height: 1.6; font-size: 14px; }
        label { display: block; font-size: 13px; font-weight: 600; color: #1F3A5F; margin: 16px 0 6px 0; }
        input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e0; font-size: 14px; box-sizing: border-box; }
        button { width: 100%; margin-top: 20px; padding: 12px; border-radius: 8px; border: none;
                 background: #4A7043; color: #fff; font-weight: 600; font-size: 15px; cursor: pointer; }
        .result { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 14px; }
        .result.ok { background: #f4f7f4; color: #2f5233; border-left: 4px solid #4A7043; }
        .result.err { background: #FFF4E5; color: #8A5A00; border-left: 4px solid #E8A33D; }
      </style>
    </head>
    <body>
      <div class="box">${bodyHtml}</div>
    </body>
    </html>
  `;
}

// GET the form. Bookmark this exact URL (with your real key) once.
router.get("/admin/transfer-access", (req, res) => {
  const { key } = req.query;
  if (!checkKey(key)) {
    return res.status(403).send(page("<h1>Not authorized</h1><p>Missing or incorrect key.</p>"));
  }

  res.send(page(`
    <h1>Transfer Materials Access</h1>
    <p>Use this for a client who lost their materials link, or needs it
    moved to a new email. Enter the same address twice to just resend the
    same client's link to the email they already have on file.</p>
    <form method="POST" action="/admin/transfer-access">
      <input type="hidden" name="key" value="${key}">
      <label for="oldEmail">Old / current email on file</label>
      <input type="email" name="oldEmail" id="oldEmail" required placeholder="client@example.com">
      <label for="newEmail">New email to send access to</label>
      <input type="email" name="newEmail" id="newEmail" required placeholder="client-new@example.com">
      <button type="submit">Transfer Access</button>
    </form>
  `));
});

// Handle the transfer.
router.post("/admin/transfer-access", async (req, res) => {
  const { key, oldEmail, newEmail } = req.body || {};

  if (!checkKey(key)) {
    return res.status(403).send(page("<h1>Not authorized</h1><p>Missing or incorrect key.</p>"));
  }
  if (!oldEmail || !newEmail) {
    return res.send(page(`<h1>Missing info</h1><div class="result err">Both email fields are required.</div>`));
  }

  try {
    const userResult = await pool.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [oldEmail]);
    const user = userResult.rows[0];

    if (!user) {
      return res.send(page(`<h1>No match found</h1><div class="result err">No account found with the email "${oldEmail}". Double check for typos.</div>`));
    }

    // If the new email is already someone else's account, refuse — this
    // is the same UNIQUE constraint the database itself enforces, but
    // checking here first gives a clear message instead of a raw error.
    if (oldEmail.toLowerCase() !== newEmail.toLowerCase()) {
      const conflict = await pool.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2",
        [newEmail, user.id]
      );
      if (conflict.rows.length > 0) {
        return res.send(page(`<h1>Can't transfer</h1><div class="result err">"${newEmail}" already belongs to a different account. Choose a different new email, or resolve that account first.</div>`));
      }
    }

    // New token invalidates the old one automatically — anyone with the
    // old link (old token + old email) stops working the instant this runs.
    const newToken = crypto.randomBytes(24).toString("hex");
    const updated = await pool.query(
      "UPDATE users SET email = $1, access_token = $2 WHERE id = $3 RETURNING *",
      [newEmail, newToken, user.id]
    );
    const updatedUser = updated.rows[0];

    const paidCheck = await pool.query(
      "SELECT 1 FROM payments WHERE user_id = $1 AND status = 'paid' LIMIT 1",
      [user.id]
    );

    if (paidCheck.rows.length > 0) {
      await sendAccessEmail(updatedUser);
      return res.send(page(`
        <h1>Access transferred</h1>
        <div class="result ok">
          Done. "${oldEmail}" no longer has access. "${newEmail}" now has a
          fresh materials link, and the access email was just sent to them.
        </div>
      `));
    }

    return res.send(page(`
      <h1>Email updated</h1>
      <div class="result ok">
        Contact email changed from "${oldEmail}" to "${newEmail}". This
        account doesn't have a confirmed payment yet, so no materials email
        was sent — there's nothing to resend until they've paid.
      </div>
    `));
  } catch (err) {
    console.error("Transfer-access error:", err);
    res.status(500).send(page("<h1>Something went wrong</h1><div class=\"result err\">Check the server logs for details.</div>"));
  }
});

module.exports = router;

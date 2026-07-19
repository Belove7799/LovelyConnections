// routes/payment.js
// Replaces Stripe checkout + webhook with a manual flow: the client tells
// you they paid via Zelle or Cash App, you check your own Zelle/Cash App
// activity to confirm the money actually arrived, then click one link in
// your inbox to grant access. Nothing here can verify money automatically
// — that's the tradeoff for skipping a payment processor.

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { pool } = require("../db");
const {
  sendPaymentSubmittedEmail,
  sendAdminPaymentNotification,
  sendAccessEmail,
} = require("../email");

// 1. Client submits "I paid" after sending money via Zelle or Cash App.
// Accepts either a userId (if we recognize their browser from the
// discovery-call sign-up) or a fullName + email (if this is a different
// device — e.g. the coach texted them the private payment link after a
// phone call). Either way, a payments row gets created and you get an
// email to review and confirm.
router.post("/payment-submitted", async (req, res) => {
  const { userId, fullName, email, method, referenceNote } = req.body;

  if (!method) {
    return res.status(400).json({ error: "method is required." });
  }
  if (!["zelle", "cashapp"].includes(method)) {
    return res.status(400).json({ error: "method must be 'zelle' or 'cashapp'." });
  }
  if (!userId && !email) {
    return res.status(400).json({ error: "Either userId or email is required." });
  }

  try {
    let user;

    if (userId) {
      const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
      user = userResult.rows[0];
      if (!user) return res.status(404).json({ error: "User not found." });
    } else {
      // No userId — find or create the user by email so a payment can
      // still be recorded even if they never filled out the site form.
      const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      if (existing.rows.length > 0) {
        user = existing.rows[0];
      } else {
        const inserted = await pool.query(
          "INSERT INTO users (full_name, email) VALUES ($1, $2) RETURNING *",
          [fullName || null, email]
        );
        user = inserted.rows[0];
      }
    }

    const paymentResult = await pool.query(
      `INSERT INTO payments (user_id, method, reference_note, amount, status)
       VALUES ($1, $2, $3, $4, 'pending_review')
       RETURNING *`,
      [user.id, method, referenceNote || null, Number(process.env.PROGRAM_PRICE_CENTS || 29900)]
    );
    const payment = paymentResult.rows[0];

    // A signed-ish token so the admin confirm link can't be guessed by
    // anyone who doesn't have your ADMIN_SECRET.
    const confirmUrl =
      `${process.env.FRONTEND_URL || ""}` +
      `/confirm-payment?paymentId=${payment.id}&key=${process.env.ADMIN_SECRET}`;

    await sendPaymentSubmittedEmail(user);
    await sendAdminPaymentNotification({ user, payment, confirmUrl });

    res.json({ success: true, paymentId: payment.id });
  } catch (err) {
    console.error("Payment submission error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// 2. You click the link in your inbox after checking Zelle/Cash App
//    yourself. This is the ONLY thing that grants access — there is no
//    automatic verification, so don't click it until you've actually
//    confirmed the money landed.
router.get("/confirm-payment", async (req, res) => {
  const { paymentId, key } = req.query;

  if (!key || !crypto.timingSafeEqual(Buffer.from(String(key)), Buffer.from(String(process.env.ADMIN_SECRET || "")))) {
    return res.status(403).send("Invalid or missing confirmation key.");
  }

  try {
    const paymentResult = await pool.query("SELECT * FROM payments WHERE id = $1", [paymentId]);
    const payment = paymentResult.rows[0];
    if (!payment) return res.status(404).send("Payment not found.");

    if (payment.status === "paid") {
      return res.send("This payment was already confirmed — no action needed.");
    }

    await pool.query(
      "UPDATE payments SET status = 'paid', confirmed_at = NOW() WHERE id = $1",
      [payment.id]
    );

    await pool.query(
      `INSERT INTO progress (user_id, program_started_at, last_week_sent)
       VALUES ($1, NOW(), 0)
       ON CONFLICT (user_id)
       DO UPDATE SET program_started_at = NOW(), last_week_sent = 0, completed = FALSE`,
      [payment.user_id]
    );

    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [payment.user_id]);
    let user = userResult.rows[0];
    if (!user) {
      return res.send("Payment confirmed, but no matching user was found — nothing else to do.");
    }

    // Generate a per-client secret token that gates their materials page —
    // this is what actually lets your /materials route tell a paying
    // client apart from a stranger who found the URL. Reuse the existing
    // token if they somehow already have one (e.g. a re-confirmed payment).
    if (!user.access_token) {
      const token = crypto.randomBytes(24).toString("hex");
      const updated = await pool.query(
        "UPDATE users SET access_token = $1 WHERE id = $2 RETURNING *",
        [token, user.id]
      );
      user = updated.rows[0];
    }

    await sendAccessEmail(user);

    res.send(
      `Payment confirmed and access email sent to ${user.email}, including their materials link. You can close this tab.`
    );
  } catch (err) {
    console.error("Payment confirmation error:", err);
    res.status(500).send("Something went wrong confirming this payment.");
  }
});

module.exports = router;

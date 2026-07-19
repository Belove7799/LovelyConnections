// routes/signup.js
// Handles new visitors submitting the "Book Discovery Call" form. Creates
// the user record (including their phone/challenge/message so you have
// full context on each lead), fires the welcome email to them, and
// notifies you of the new lead. No password is collected here on purpose —
// see the guide's section on whether you actually need a login system.

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { sendWelcomeEmail, sendAdminNewLeadNotification } = require("../email");

router.post("/signup", async (req, res) => {
  const { fullName, email, phone, challenge, message } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    let user;
    if (existing.rows.length > 0) {
      // Returning visitor — update their details in case anything changed,
      // but don't re-send the welcome email or re-notify you of the "new" lead.
      const result = await pool.query(
        `UPDATE users SET full_name = $1, phone = $2, challenge = $3, message = $4
         WHERE email = $5 RETURNING *`,
        [fullName || existing.rows[0].full_name, phone || null, challenge || null, message || null, email]
      );
      user = result.rows[0];
    } else {
      const result = await pool.query(
        `INSERT INTO users (full_name, email, phone, challenge, message)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [fullName || null, email, phone || null, challenge || null, message || null]
      );
      user = result.rows[0];
      await sendWelcomeEmail(user);
      await sendAdminNewLeadNotification(user);
    }

    res.json({ success: true, userId: user.id });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

module.exports = router;

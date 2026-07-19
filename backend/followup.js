// routes/followup.js
// After a discovery call, you decide the outcome in the real conversation —
// this just handles sending the right email once you've decided. The two
// links live inside the "New discovery call request" email you already get
// when someone books, so there's nothing to look up or copy/paste.

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { pool } = require("../db");
const { sendCallJoinEmail, sendCallNurtureEmail } = require("../email");

router.get("/send-followup", async (req, res) => {
  const { userId, outcome, key } = req.query;

  const expected = String(process.env.ADMIN_SECRET || "");
  const given = String(key || "");
  if (!key || given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return res.status(403).send("Invalid or missing confirmation key.");
  }

  if (!["join", "nurture"].includes(outcome)) {
    return res.status(400).send("outcome must be 'join' or 'nurture'.");
  }

  try {
    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).send("User not found.");

    if (outcome === "join") {
      await sendCallJoinEmail(user);
      res.send(`Enrollment link sent to ${user.email}. You can close this tab.`);
    } else {
      await sendCallNurtureEmail(user);
      res.send(`No-pressure follow-up sent to ${user.email}. You can close this tab.`);
    }
  } catch (err) {
    console.error("Follow-up send error:", err);
    res.status(500).send("Something went wrong sending that email.");
  }
});

module.exports = router;

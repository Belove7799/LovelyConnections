// routes/feedback.js
// A simple public form clients use after a Live Session — feedback,
// questions they didn't want to ask in front of the group, or anything
// else on their mind. No token/login needed since this isn't sensitive
// paid content, just a message that comes straight to you.

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { sendFeedbackAcknowledgment, sendAdminFeedbackNotification } = require("../email");

function page(bodyHtml) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Session Feedback & Questions</title>
      <style>
        body { font-family: -apple-system, sans-serif; background: #F5F0E6; color: #1E293B;
               display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
        .box { background: #fff; padding: 40px; border-radius: 16px; max-width: 480px; width: 100%;
               box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        h1 { font-size: 22px; margin: 0 0 8px 0; color: #1F3A5F; }
        p { color: #4a5568; line-height: 1.6; font-size: 14px; }
        label { display: block; font-size: 13px; font-weight: 600; color: #1F3A5F; margin: 16px 0 6px 0; }
        input, textarea { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e0;
                           font-size: 14px; box-sizing: border-box; font-family: inherit; }
        textarea { resize: vertical; }
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

router.get("/feedback", (req, res) => {
  res.send(page(`
    <h1>Session Feedback & Questions</h1>
    <p>Have feedback on this week's Live Session, a question you didn't
    want to ask in front of everyone, or something else on your mind?
    Share it here — it comes straight to me, not buried in a group chat.</p>
    <form method="POST" action="/feedback">
      <label for="fullName">Your name</label>
      <input type="text" name="fullName" id="fullName" required>
      <label for="email">Your email</label>
      <input type="email" name="email" id="email" required>
      <label for="message">Your message</label>
      <textarea name="message" id="message" rows="6" required placeholder="Feedback, a private question, or anything else you'd like to share..."></textarea>
      <button type="submit">Send</button>
    </form>
  `));
});

router.post("/feedback", async (req, res) => {
  const { fullName, email, message } = req.body || {};

  if (!email || !message) {
    return res.send(page(`
      <h1>Missing info</h1>
      <div class="result err">Please include your email and a message.</div>
      <p><a href="/feedback">← Try again</a></p>
    `));
  }

  try {
    await pool.query(
      "INSERT INTO session_feedback (full_name, email, message) VALUES ($1, $2, $3)",
      [fullName || null, email, message]
    );

    await sendFeedbackAcknowledgment({ full_name: fullName, email });
    await sendAdminFeedbackNotification({ full_name: fullName, email, message });

    res.send(page(`
      <h1>Thank you!</h1>
      <div class="result ok">Your message has been sent. I'll follow up with you personally soon.</div>
    `));
  } catch (err) {
    console.error("Feedback submission error:", err);
    res.status(500).send(page(`
      <h1>Something went wrong</h1>
      <div class="result err">Please try again, or email me directly if this keeps happening.</div>
    `));
  }
});

module.exports = router;

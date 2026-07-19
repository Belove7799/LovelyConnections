// email.js
// All outgoing email goes through this one file, using Gmail's SMTP
// server. This is the simplest possible setup — no domain DNS records,
// no MX/SPF/DKIM configuration. Just a Gmail account and an app password.
// Every send is logged to email_logs so you can see what went out and
// debug the weekly sequence if something looks off.
//
// Limits: Gmail caps free accounts at 500 sends/day, which is far more
// than a new coaching business needs. Emails will show as being from
// your Gmail address (e.g. yourcoaching@gmail.com) rather than a
// professional @yourdomain.com address — that's the one tradeoff for
// skipping the domain email setup. You can switch to a custom-domain
// sender later without touching any other file in this project.

const nodemailer = require("nodemailer");
const { pool } = require("./db");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const BUSINESS_NAME = process.env.FROM_NAME || "Lovely Connections";
const COACH_NAME = process.env.COACH_NAME || "Danielle";
const FROM = `${BUSINESS_NAME} <${process.env.GMAIL_USER}>`;

// Wraps every email in the same simple, warm layout so they all feel like
// they come from the same place, and signs off consistently.
function layout(bodyHtml, signoff = "Warmly") {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1E293B; line-height: 1.6;">
      ${bodyHtml}
      <p style="margin-top: 32px;">
        ${signoff},<br>
        ${COACH_NAME}<br>
        <span style="color: #4A7043;">${BUSINESS_NAME}</span>
      </p>
    </div>
  `;
}

async function send({ to, subject, html, userId, emailType, signoff }) {
  await transporter.sendMail({ from: FROM, to, subject, html: layout(html, signoff) });

  if (userId && emailType) {
    await pool.query(
      "INSERT INTO email_logs (user_id, email_type) VALUES ($1, $2)",
      [userId, emailType]
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 1. WELCOME EMAIL — sent the moment someone books a discovery call
// ─────────────────────────────────────────────────────────────
function sendWelcomeEmail(user) {
  const firstName = (user.full_name || "there").split(" ")[0];
  const price = (Number(process.env.PROGRAM_PRICE_CENTS || 500000) / 100).toLocaleString("en-US");
  return send({
    to: user.email,
    subject: `You're booked! Excited to connect, ${firstName}`,
    userId: user.id,
    emailType: "welcome",
    html: `
      <p>Hi ${firstName},</p>
      <p>Thank you for reaching out to ${BUSINESS_NAME} — I'm genuinely glad you're here.
      Just choosing to reach out is already a step toward the harmony you're looking for.</p>
      <p>Taking this step isn't always easy, and I want you to know this call is a
      judgment-free space. We'll spend some time talking through what's going on
      for you right now, what you're hoping will feel different, and whether the
      program is a good fit — no pressure either way.</p>
      <p>Just so you have it going in: the full program is a $${price} investment.
      I'd rather you know that up front than be surprised by it on the call — we
      can talk through everything it includes and whether it's the right fit for you.</p>
      <p>I'll follow up shortly to confirm your discovery call details. In the
      meantime, if anything comes up before then, just reply to this email — it
      comes straight to me.</p>
      <p>Looking forward to talking soon.</p>
    `,
  });
}

// ─────────────────────────────────────────────────────────────
// 2a. AFTER THE CALL — they're ready to join
//     Includes the private join.html link (not published anywhere else).
// ─────────────────────────────────────────────────────────────
function sendCallJoinEmail(user) {
  const firstName = (user.full_name || "there").split(" ")[0];
  const joinUrl = `${process.env.FRONTEND_URL}/join`;
  return send({
    to: user.email,
    subject: "So glad you're joining — here's how to get started",
    userId: user.id,
    emailType: "call_join",
    signoff: "Love always",
    html: `
      <p>Hi ${firstName},</p>
      <p>Congratulations — you've chosen, like so many before you, to invest in
      yourself. That decision alone is the first real step toward the peace,
      clarity, and abundance you're looking for.</p>
      <p>It was so good talking with you. I meant it when I said I think this
      program can really help you get to where you want to be — and I'm honored
      you're trusting me to help you get there.</p>
      <p>Here's your next step: head to the link below to complete your
      enrollment. It walks you through payment and what happens right after.</p>
      <p><a href="${joinUrl}" style="color: #4A7043; font-weight: 600;">Complete your enrollment →</a></p>
      <p>Once your payment is received, I'll send everything you need — your
      program access, your first live call details, and a welcome gift to get
      you started: your Wellness Recovery Action Plan.</p>
      <p>If anything is unclear or you have a question before you send payment,
      just reply here — I'm happy to help.</p>
      <p>Circle today on your calendar. You just committed to your dreams —
      don't let anyone talk you out of it, no matter how well-intentioned. I'm
      so glad you're here.</p>
    `,
  });
}

// ─────────────────────────────────────────────────────────────
// 2b. AFTER THE CALL — they need more time / decided not to join now
//     Warm, no pressure, leaves the door open.
// ─────────────────────────────────────────────────────────────
function sendCallNurtureEmail(user) {
  const firstName = (user.full_name || "there").split(" ")[0];
  return send({
    to: user.email,
    subject: "No rush at all",
    userId: user.id,
    emailType: "call_nurture",
    html: `
      <p>Hi ${firstName},</p>
      <p>Thank you again for taking the time to talk with me. Whatever you
      decide, I want you to know that showing up for that conversation was
      already a meaningful step.</p>
      <p>Take the time you need — this only works if it's the right fit and the
      right moment for you, and there's absolutely no pressure. The door stays
      open whenever, or if, you're ready.</p>
      <p>If any questions come up in the meantime, or you'd like to talk again
      before deciding, just reply here.</p>
      <p>Wishing you well either way.</p>
    `,
  });
}

// ─────────────────────────────────────────────────────────────
// 3. AFTER JOINING — payment confirmed, program access granted
// ─────────────────────────────────────────────────────────────
function sendAccessEmail(user) {
  const firstName = (user.full_name || "there").split(" ")[0];
  const materialsUrl = `${process.env.FRONTEND_URL}/materials?token=${user.access_token}`;
  return send({
    to: user.email,
    subject: "You're officially in! 🎉",
    userId: user.id,
    emailType: "access_granted",
    signoff: "Love always",
    html: `
      <p>Hi ${firstName},</p>
      <p>Congratulations — your payment is confirmed and you are officially
      enrolled. I'm so glad to have you. Investing in yourself like this is
      never small — it's the first real step toward the peace, wisdom, and
      abundance you came looking for.</p>
      <p>Here's what to expect:</p>
      <ul style="padding-left: 20px; margin: 0 0 15px 0;">
        <li style="margin-bottom: 8px;">All 8 weeks of video lessons are unlocked for you right away on your personal materials page, organized week by week</li>
        <li style="margin-bottom: 8px;">We meet live for 2 hours a week, plus a dedicated Q&amp;A day, with full group access in between</li>
        <li>Your welcome gift, the Wellness Recovery Action Plan, is included in your materials — a great place to start today</li>
      </ul>
      <p><a href="${materialsUrl}" style="color: #4A7043; font-weight: 600;">Open your program materials →</a></p>
      <p>This link is personal to you — please don't forward it, since it's
      how the page knows it's really you.</p>
      <p>This week, take three minutes to write down exactly what work-life
      harmony looks like for you — the date nights, the family time, the
      space that's just yours. That clarity is where this journey begins.</p>
      <p>Each week I'll also send a short check-in and a bit of encouragement
      by email — those aren't new materials, just me showing up alongside you.
      If you ever have a question along the way, just reply — I'm here.</p>
      <p>Circle today on your calendar. You committed to your dreams — don't
      let anyone talk you out of it, no matter how well-intentioned.</p>
    `,
  });
}

// ─────────────────────────────────────────────────────────────
// 4. WEEKLY CHECK-IN & MOTIVATION
// ─────────────────────────────────────────────────────────────
function sendWeeklyEmail(user, weekNumber) {
  const firstName = (user.full_name || "there").split(" ")[0];
  const materialsUrl = `${process.env.FRONTEND_URL}/materials?token=${user.access_token}`;
  return send({
    to: user.email,
    subject: `Week ${weekNumber}: checking in`,
    userId: user.id,
    emailType: `week_${weekNumber}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>You've made it to Week ${weekNumber} — take a second to notice that.
      Showing up consistently is its own kind of progress, even on the weeks
      that felt harder than others.</p>
      <p>This is just a quick check-in and a little encouragement — you
      already have everything you need on your materials page, so no new
      link this week. If you'd like a refresher on Week ${weekNumber}'s
      lesson, it's the same personal link from day one.</p>
      <p><a href="${materialsUrl}" style="color: #4A7043; font-weight: 600;">Open your materials page →</a></p>
      <p>How did last week actually go for you? Hit reply and let me know —
      even a few lines helps me support you better, and I read every one.</p>
    `,
  });
}

// ─────────────────────────────────────────────────────────────
// 5. PROGRAM COMPLETION
// ─────────────────────────────────────────────────────────────
function sendCompletionEmail(user) {
  const firstName = (user.full_name || "there").split(" ")[0];
  return send({
    to: user.email,
    subject: "You did it 🎉",
    userId: user.id,
    emailType: "completion",
    html: `
      <p>Hi ${firstName},</p>
      <p>You've officially completed the program — congratulations. Finishing
      what you started, especially something that asks you to look inward and
      grow, is genuinely something to be proud of.</p>
      <p>I'd love to hear how the experience was for you and what's shifted,
      whenever you feel like sharing — just reply to this email.</p>
      <p>And please know this doesn't have to be goodbye: if you ever want
      additional support, have questions down the road, or just want to check
      in, my inbox is always open. Some of the people I've worked with come
      back for a single follow-up conversation months later, and that's more
      than welcome.</p>
      <p>Proud of you for seeing this through.</p>
    `,
  });
}

// ─────────────────────────────────────────────────────────────
// PAYMENT FLOW EMAILS
// ─────────────────────────────────────────────────────────────
function sendPaymentSubmittedEmail(user) {
  const firstName = (user.full_name || "there").split(" ")[0];
  return send({
    to: user.email,
    subject: "Got it — confirming your payment now",
    userId: user.id,
    emailType: "payment_submitted",
    html: `
      <p>Hi ${firstName},</p>
      <p>Thank you — I've received your payment submission and I'm confirming
      it now. You'll get an email with full program access as soon as that's
      done, usually within a few hours.</p>
    `,
  });
}

function sendAdminPaymentNotification({ user, payment, confirmUrl }) {
  return send({
    to: process.env.ADMIN_EMAIL,
    subject: `New payment to confirm: ${user.full_name || user.email}`,
    html: `
      <p>${user.full_name || "Someone"} (${user.email}) says they paid via
      <strong>${payment.method}</strong>.</p>
      <p>Reference they gave you: <strong>${payment.reference_note || "(none provided)"}</strong></p>
      <p>Amount expected: $${(Number(process.env.PROGRAM_PRICE_CENTS || 29900) / 100).toFixed(2)}</p>
      <p>Check your ${payment.method === "zelle" ? "Zelle" : "Cash App"} activity for a
      matching payment, then click below to grant access. Only click this once
      you've confirmed the money actually arrived.</p>
      <p><a href="${confirmUrl}" style="color: #4A7043; font-weight: 600;">Confirm payment and grant access →</a></p>
      <p style="margin-top: 20px; padding: 12px; background: #FFF4E5; border-left: 4px solid #E8A33D;">
        <strong>Two steps after you confirm:</strong><br>
        1. Share your materials Google Drive folder with <strong>${user.email}</strong> (Share → add as Viewer)<br>
        2. That's it — the access email above already tells them what to expect.
      </p>
    `,
  });
}

// ─────────────────────────────────────────────────────────────
// NEW LEAD NOTIFICATION — includes one-click links for after the call
// ─────────────────────────────────────────────────────────────
function sendAdminNewLeadNotification(user) {
  const base = `${process.env.FRONTEND_URL}/send-followup?userId=${user.id}&key=${process.env.ADMIN_SECRET}`;
  const joinUrl = `${base}&outcome=join`;
  const nurtureUrl = `${base}&outcome=nurture`;

  return send({
    to: process.env.ADMIN_EMAIL,
    subject: `New discovery call request: ${user.full_name || user.email}`,
    html: `
      <p>${user.full_name || "Someone"} (${user.email}) just booked a discovery call.</p>
      <p><strong>Phone:</strong> ${user.phone || "(not provided)"}</p>
      <p><strong>Primary challenge:</strong> ${user.challenge || "(not provided)"}</p>
      <p><strong>Message:</strong> ${user.message || "(none)"}</p>
      <hr style="border: none; border-top: 1px solid #e3ebe2; margin: 20px 0;">
      <p><strong>After your call with them</strong>, click one of these — it
      sends the right follow-up email automatically, no need to write it
      yourself:</p>
      <p>
        <a href="${joinUrl}" style="color: #4A7043; font-weight: 600;">✓ They're joining — send enrollment link</a><br>
        <a href="${nurtureUrl}" style="color: #7a56a8; font-weight: 600;">They need time — send a no-pressure follow-up</a>
      </p>
    `,
  });
}

module.exports = {
  sendWelcomeEmail,
  sendCallJoinEmail,
  sendCallNurtureEmail,
  sendAccessEmail,
  sendWeeklyEmail,
  sendCompletionEmail,
  sendPaymentSubmittedEmail,
  sendAdminPaymentNotification,
  sendAdminNewLeadNotification,
};

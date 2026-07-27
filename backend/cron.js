// cron.js
// Runs once a day and sends whichever weekly email each paying client is
// due for, based on how many weeks since their program started. Keeps
// state in the progress table so it never sends the same week twice and
// picks up correctly even if the server restarted in between.
//
// Also runs a second daily check: any payment claim still sitting
// unconfirmed after 48 business hours gets a reminder email — to the
// client (double check / resubmit) and to you (a nudge, plus the same
// confirm link from the original notification).

const cron = require("node-cron");
const { pool } = require("./db");
const {
  sendWeeklyEmail,
  sendCompletionEmail,
  sendUnconfirmedPaymentReminder,
  sendAdminUnconfirmedPaymentNudge,
} = require("./email");

const PROGRAM_LENGTH_WEEKS = Number(process.env.PROGRAM_LENGTH_WEEKS || 8);
const UNCONFIRMED_PAYMENT_REMINDER_HOURS = Number(process.env.UNCONFIRMED_PAYMENT_REMINDER_HOURS || 48);

function isWeekend(date) {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

// "48 business hours" means 48 hours of actual weekday time — a claim
// submitted Friday afternoon doesn't quietly age through the whole
// weekend the same way a Tuesday one would. This walks forward hour by
// hour, only counting hours that fall on a weekday.
function addBusinessHours(startDate, hoursToAdd) {
  let current = new Date(startDate);
  let remaining = hoursToAdd;
  while (remaining > 0) {
    current = new Date(current.getTime() + 60 * 60 * 1000);
    if (!isWeekend(current)) {
      remaining -= 1;
    }
  }
  return current;
}

async function runWeeklyEmailCheck() {
  console.log("Running weekly email check:", new Date().toISOString());

  const { rows } = await pool.query(`
    SELECT p.user_id, p.program_started_at, p.last_week_sent, p.completed,
           u.email, u.full_name, u.access_token
    FROM progress p
    JOIN users u ON u.id = p.user_id
    WHERE p.completed = FALSE
  `);

  for (const row of rows) {
    const weeksSinceStart = Math.floor(
      (Date.now() - new Date(row.program_started_at).getTime()) / (7 * 24 * 60 * 60 * 1000)
    );

    // weeksSinceStart of 0 means "less than a week in" — Week 1 material
    // already went out in the access email, so the sequence below starts
    // at Week 2.
    const dueWeek = weeksSinceStart + 1;

    if (dueWeek <= row.last_week_sent) continue; // already sent this week
    if (dueWeek < 2) continue; // Week 1 was covered by the access email

    const user = { id: row.user_id, email: row.email, full_name: row.full_name, access_token: row.access_token };

    try {
      if (dueWeek > PROGRAM_LENGTH_WEEKS) {
        if (!row.completed) {
          await sendCompletionEmail(user);
          await pool.query(
            "UPDATE progress SET completed = TRUE WHERE user_id = $1",
            [row.user_id]
          );
          console.log(`Completion email sent to user ${row.user_id}`);
        }
      } else {
        await sendWeeklyEmail(user, dueWeek);
        await pool.query(
          "UPDATE progress SET last_week_sent = $1 WHERE user_id = $2",
          [dueWeek, row.user_id]
        );
        console.log(`Week ${dueWeek} email sent to user ${row.user_id}`);
      }
    } catch (err) {
      console.error(`Failed to send weekly email to user ${row.user_id}:`, err);
      // Intentionally don't rethrow — one failed email shouldn't stop the
      // rest of the batch from sending.
    }
  }
}

async function runUnconfirmedPaymentCheck() {
  console.log("Running unconfirmed payment check:", new Date().toISOString());

  const { rows } = await pool.query(`
    SELECT p.*, u.email, u.full_name
    FROM payments p
    JOIN users u ON u.id = p.user_id
    WHERE p.status = 'pending_review' AND p.reminder_sent_at IS NULL
  `);

  for (const payment of rows) {
    const deadline = addBusinessHours(new Date(payment.submitted_at), UNCONFIRMED_PAYMENT_REMINDER_HOURS);
    if (new Date() < deadline) continue; // not old enough yet

    const user = { id: payment.user_id, email: payment.email, full_name: payment.full_name };

    try {
      const confirmUrl =
        `${process.env.FRONTEND_URL || ""}` +
        `/confirm-payment?paymentId=${payment.id}&key=${process.env.ADMIN_SECRET}`;

      await sendUnconfirmedPaymentReminder(user);
      await sendAdminUnconfirmedPaymentNudge({ user, payment, confirmUrl });

      await pool.query("UPDATE payments SET reminder_sent_at = NOW() WHERE id = $1", [payment.id]);
      console.log(`Unconfirmed-payment reminder sent for payment ${payment.id}`);
    } catch (err) {
      console.error(`Failed to send unconfirmed-payment reminder for payment ${payment.id}:`, err);
    }
  }
}

function startWeeklyEmailCron() {
  // Runs every day at 09:00 server time. Daily (not weekly) so a missed
  // run due to a deploy or restart still catches up the next day.
  cron.schedule("0 9 * * *", runWeeklyEmailCheck);
  console.log("Weekly email cron scheduled (daily at 09:00).");

  // Runs at a different time so the two jobs don't compete for the same
  // moment every day — otherwise identical daily pattern.
  cron.schedule("0 10 * * *", runUnconfirmedPaymentCheck);
  console.log("Unconfirmed-payment reminder cron scheduled (daily at 10:00).");
}

module.exports = {
  startWeeklyEmailCron,
  runWeeklyEmailCheck,
  runUnconfirmedPaymentCheck,
  addBusinessHours,
};


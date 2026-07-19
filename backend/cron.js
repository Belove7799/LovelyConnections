// cron.js
// Runs once a day and sends whichever weekly email each paying client is
// due for, based on how many weeks since their program started. Keeps
// state in the progress table so it never sends the same week twice and
// picks up correctly even if the server restarted in between.

const cron = require("node-cron");
const { pool } = require("./db");
const { sendWeeklyEmail, sendCompletionEmail } = require("./email");

const PROGRAM_LENGTH_WEEKS = Number(process.env.PROGRAM_LENGTH_WEEKS || 8);

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

function startWeeklyEmailCron() {
  // Runs every day at 09:00 server time. Daily (not weekly) so a missed
  // run due to a deploy or restart still catches up the next day.
  cron.schedule("0 9 * * *", runWeeklyEmailCheck);
  console.log("Weekly email cron scheduled (daily at 09:00).");
}

module.exports = { startWeeklyEmailCron, runWeeklyEmailCheck };

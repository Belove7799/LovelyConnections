// server.js
// Entry point. Wires together the frontend, the API routes, the database,
// and the weekly email cron job.

require("dotenv").config();
const express = require("express");
const path = require("path");

const { initDb } = require("./db");
const { startWeeklyEmailCron } = require("./cron");

const signupRoute = require("./routes/signup");
const paymentRoute = require("./routes/payment");
const followupRoute = require("./routes/followup");
const materialsRoute = require("./routes/materials");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API routes.
app.use("/", signupRoute);
app.use("/", paymentRoute);
app.use("/", followupRoute);
app.use("/", materialsRoute);

// Serve the static frontend (HTML/CSS/JS) — comment this out if you're
// hosting the frontend as a separate Railway service instead.
// The `extensions` option lets visitors (and your emails) use clean URLs
// like /join instead of /join.html — Express tries appending .html
// automatically if the exact path isn't found.
app.use(express.static(path.join(__dirname, "../frontend"), { extensions: ["html"] }));

// Simple health check — useful for confirming the deploy is alive.
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Lets static pages (like join.html) show the real price without needing
// to be edited by hand every time it changes — join.html fetches this on
// load. Only exposes what's safe to show publicly; never put anything
// sensitive here.
app.get("/api/program-info", (req, res) => {
  res.json({ priceCents: Number(process.env.PROGRAM_PRICE_CENTS || 500000) });
});

async function start() {
  try {
    await initDb();
    startWeeklyEmailCron();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();

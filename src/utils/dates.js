// Date helpers for Feature 6. All dates are plain "YYYY-MM-DD" strings in UTC, which
// matches how Sequelize stores DATEONLY columns, so every comparison uses one clock.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Today as "YYYY-MM-DD" (UTC).
function today() {
  return new Date().toISOString().slice(0, 10);
}

// Whole days from one "YYYY-MM-DD" date to another (negative if `to` is earlier).
function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);
}

module.exports = { today, daysBetween };

// Shared helpers for the JSON routes.
//
// route(fn) runs an async route handler. A broken business rule (an Error thrown by
// the team's classes, or a Sequelize validation error) becomes
//   400 { ok: false, message }
// so the page can show the message to the user. Anything unexpected becomes a 500.

const path = require("path");
const { ValidationError, UniqueConstraintError } = require("sequelize");

class UserError extends Error {}

function messageOf(error) {
  if (error instanceof UniqueConstraintError) {
    return "This record already exists.";
  }
  if (error instanceof ValidationError) {
    return error.errors.map((e) => e.message).join(" ");
  }
  return error.message;
}

// A rule the user can fix. A plain Error that carries a database error code (for example
// SQLITE_BUSY) is a system problem, not a user mistake, so it is not counted here.
function isRuleError(error) {
  return (
    error instanceof ValidationError ||
    error instanceof UserError ||
    error.name === "SupportError" ||
    (error.constructor === Error && !error.code)
  );
}

// "(Error in src/models/Employee.js, line 112)": the first line of the team's own code in
// the error's stack (for a SupportError, the stack of the original failure). Used by the
// Feature 6 routes so the team can find where a message came from.
const PROJECT_ROOT = path.join(__dirname, "..", "..", "..");

function locationOf(error) {
  const source = error && error.cause && error.cause.stack ? error.cause : error;
  const lines = String((source && source.stack) || "").split("\n").slice(1);
  for (const line of lines) {
    const match = line.match(/\(?((?:[A-Za-z]:)?[^():]+\.js):(\d+):\d+\)?\s*$/);
    if (!match) continue;
    const file = path.relative(PROJECT_ROOT, match[1]).split(path.sep).join("/");
    if (!file.startsWith("src/") || file === "src/web/api/respond.js" || file === "src/utils/supportGuard.js") continue;
    return `(Error in ${file}, line ${match[2]})`;
  }
  return "";
}

function withLocation(message, error) {
  const where = locationOf(error);
  return where ? `${message} ${where}` : message;
}

function route(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

// Express error handler (registered last in server.js).
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  // Feature 6 asked for every error message to end with where it happened.
  const located = (message) => (String(req.originalUrl).startsWith("/api/support") ? withLocation(message, error) : message);
  if (error.status === 403 || error.status === 404) {
    res.status(error.status).json({ ok: false, message: located(error.message) });
    return;
  }
  if (error.type === "entity.parse.failed") {
    res.status(400).json({ ok: false, message: "The request could not be read. Please try again." });
    return;
  }
  if (isRuleError(error)) {
    res.status(400).json({ ok: false, message: located(messageOf(error)), ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) });
    return;
  }
  console.error(error);
  res.status(500).json({ ok: false, message: located("Something went wrong. Please try again.") });
}

// Throw a message the user should see. fieldErrors ({ field: message }) marks the exact
// boxes on the form.
function fail(message, fieldErrors) {
  const error = new UserError(message);
  if (fieldErrors) error.fieldErrors = fieldErrors;
  throw error;
}

// Throw a "not allowed" (403) or "not found" (404) answer.
function deny(message, status = 403) {
  const error = new UserError(message);
  error.status = status;
  throw error;
}

// Convert a form value to a whole number (or null when empty).
function toInteger(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

module.exports = { route, errorHandler, fail, deny, UserError, toInteger, locationOf };

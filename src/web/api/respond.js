// Shared helpers for the JSON routes.
//
// route(fn) runs an async route handler. A broken business rule (an Error thrown by
// the team's classes, or a Sequelize validation error) becomes
//   400 { ok: false, message }
// so the page can show the message to the user. Anything unexpected becomes a 500.

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

function isRuleError(error) {
  return (
    error instanceof ValidationError ||
    error instanceof UserError ||
    error.name === "SupportError" ||
    error.constructor === Error
  );
}

function route(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

// Express error handler (registered last in server.js).
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  if (isRuleError(error)) {
    res.status(400).json({ ok: false, message: messageOf(error) });
    return;
  }
  console.error(error);
  res.status(500).json({ ok: false, message: "Something went wrong. Please try again." });
}

// Throw a message the user should see.
function fail(message) {
  throw new UserError(message);
}

// Convert a form value to a whole number (or null when empty).
function toInteger(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

module.exports = { route, errorHandler, fail, UserError, toInteger };

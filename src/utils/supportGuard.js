// Feature 6 safety net.
//
// guardMethods() wraps Feature 6 methods so that an UNEXPECTED failure (database busy,
// disk or connection problem, a bug) becomes one clear, friendly error instead of a crash:
//
//   "Something went wrong while processing the refund. Please try again. ..."
//
// Normal rule errors written by the team (for example "Return RET-1 was already Refunded.")
// and Sequelize validation errors are NOT changed, so callers still see the exact reason.
//
// Safe retries: when the database is only busy or locked, read-only methods and the
// refund (which runs in one transaction) are retried automatically a couple of times.
// Other methods are never retried automatically, because a second run could save twice.
//
// Power cut or lost connection: SQLite finishes a save completely or not at all, so after a
// restart every record is either fully saved or untouched. Nothing is left half-done.

const { ValidationError, ConnectionError, TimeoutError } = require("sequelize");

const RETRY_DELAYS_MS = [200, 500]; // two automatic retries for a busy database

// The one error type callers receive for an unexpected failure.
class SupportError extends Error {
  constructor(action, cause, retryable) {
    super(
      `Something went wrong while ${action}. Please try again. ` +
        "If the problem continues, tell your manager."
    );
    this.name = "SupportError";
    this.action = action;
    this.retryable = retryable; // true when trying again is likely to work
    this.cause = cause; // the original error, for developers
  }
}

function errorCode(error) {
  const code = error && ((error.original && error.original.code) || (error.parent && error.parent.code) || error.code);
  return code ? String(code) : "";
}

// Database busy or locked: the statement did not run, so running it again is safe.
function isBusy(error) {
  const code = errorCode(error);
  return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED";
}

// Trying again later is likely to work (busy, lost connection, timeout, disk I/O hiccup).
function isTransient(error) {
  const code = errorCode(error);
  return (
    isBusy(error) ||
    error instanceof ConnectionError ||
    error instanceof TimeoutError ||
    code.startsWith("SQLITE_IOERR") ||
    code === "SQLITE_CANTOPEN" ||
    code === "SQLITE_FULL"
  );
}

// True for errors that should reach the caller unchanged: our own plain Error messages
// and Sequelize validation errors.
function isExpected(error) {
  if (error instanceof SupportError || error instanceof ValidationError) {
    return true;
  }
  return error && error.constructor === Error && !errorCode(error);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wrap the async methods of a class prototype.
// methods: { methodName: { action: "processing the refund", retry: true|false } }
function guardMethods(Class, methods) {
  for (const [name, { action, retry = false }] of Object.entries(methods)) {
    const original = Class.prototype[name];
    if (typeof original !== "function") {
      throw new Error(`guardMethods: ${Class.name}.${name} does not exist.`);
    }

    Class.prototype[name] = async function guarded(...args) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await original.apply(this, args);
        } catch (error) {
          if (isExpected(error)) {
            throw error;
          }
          if (retry && isBusy(error) && attempt < RETRY_DELAYS_MS.length) {
            await sleep(RETRY_DELAYS_MS[attempt]);
            continue;
          }
          console.error(`[Feature 6] ${Class.name}.${name} failed (${errorCode(error) || error.message}).`);
          throw new SupportError(action, error, isTransient(error));
        }
      }
    };
  }
}

module.exports = { SupportError, guardMethods };

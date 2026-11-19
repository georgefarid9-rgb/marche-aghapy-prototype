// Stop a script safely when it is interrupted (Ctrl+C, closing the terminal, a crash).
// The database connection is closed first, so any save that was still in progress is
// rolled back instead of being left half-done. Run the script again to restart.
//
// Call it once at the top of a script: installGracefulShutdown(sequelize);

function installGracefulShutdown(sequelize) {
  let stopping = false;

  async function stop(message, exitCode) {
    if (stopping) {
      return;
    }
    stopping = true;
    console.error(`\n${message}`);
    try {
      await sequelize.close();
      console.error("Stopped safely. Unsaved changes were rolled back. Run it again to restart.");
    } catch (closeError) {
      console.error("Stopped, but the database could not be closed cleanly. Run it again to restart.");
    }
    process.exit(exitCode);
  }

  process.on("SIGINT", () => stop("Interrupted.", 130));
  process.on("SIGTERM", () => stop("Asked to stop.", 143));
  process.on("SIGHUP", () => stop("The terminal was closed.", 129));
  process.on("uncaughtException", (error) => stop(`Something went wrong: ${error.message}. Please try again.`, 1));
  process.on("unhandledRejection", (reason) =>
    stop(`Something went wrong: ${reason && reason.message ? reason.message : reason}. Please try again.`, 1)
  );
}

module.exports = installGracefulShutdown;

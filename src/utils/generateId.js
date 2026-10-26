// Build a readable unique id such as CASE-LZ3K9Q-4F2A.
// Used when a caller does not supply its own id (e.g. a new complaint case).
function generateId(prefix) {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${time}-${random}`;
}

module.exports = generateId;

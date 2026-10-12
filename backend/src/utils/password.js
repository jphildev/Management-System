// [SEC-01] Password hashing for user accounts.
// Uses Node's built-in crypto.scrypt with a random salt per password.
// Stored format: "<salt hex>:<hash hex>"

const crypto = require("crypto");

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

function assertPassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new TypeError("Password must be a non-empty string.");
  }
}

async function hashPassword(password) {
  assertPassword(password);
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  const hash = await scryptAsync(password, salt);
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  assertPassword(password);
  if (typeof stored !== "string" || !stored.includes(":")) return false;

  const [salt, hashHex] = stored.split(":");
  const storedHash = Buffer.from(hashHex, "hex");
  if (storedHash.length !== KEY_LENGTH) return false;

  const hash = await scryptAsync(password, salt);
  return crypto.timingSafeEqual(hash, storedHash);
}

module.exports = { hashPassword, verifyPassword };

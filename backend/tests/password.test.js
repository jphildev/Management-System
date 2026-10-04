// Run with: node --test backend/tests/password.test.js

const test = require("node:test");
const assert = require("node:assert");
const { hashPassword, verifyPassword } = require("../utils/password");

test("hash is not the plain password", async () => {
  const hash = await hashPassword("secret123");
  assert.notStrictEqual(hash, "secret123");
  assert.ok(!hash.includes("secret123"));
});

test("same password gives a different hash each time (random salt)", async () => {
  const a = await hashPassword("secret123");
  const b = await hashPassword("secret123");
  assert.notStrictEqual(a, b);
});

test("correct password verifies", async () => {
  const hash = await hashPassword("secret123");
  assert.strictEqual(await verifyPassword("secret123", hash), true);
});

test("wrong password fails", async () => {
  const hash = await hashPassword("secret123");
  assert.strictEqual(await verifyPassword("wrong-password", hash), false);
});

test("empty or invalid input is rejected", async () => {
  await assert.rejects(hashPassword(""), TypeError);
  await assert.rejects(hashPassword(undefined), TypeError);
  assert.strictEqual(await verifyPassword("secret123", "not-a-valid-hash"), false);
});

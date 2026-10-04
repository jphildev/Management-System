// Run with: node --test backend/tests/validate.test.js

const test = require("node:test");
const assert = require("node:assert");
const { validateRegister, validateLogin, validateRecord } = require("../middleware/validate");

// Minimal stand-ins for Express req/res/next.
function run(middleware, body) {
  const result = { status: null, body: null, nextCalled: false, req: { body } };
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(data) {
      result.body = data;
      return this;
    },
  };
  middleware(result.req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

const validUser = {
  fullName: "Juan Dela Cruz",
  email: "juan@example.com",
  username: "juan_01",
  password: "secret123",
};

test("register: valid input passes", () => {
  const result = run(validateRegister, { ...validUser });
  assert.strictEqual(result.nextCalled, true);
});

test("register: empty body returns 400 with every field error", () => {
  const result = run(validateRegister, {});
  assert.strictEqual(result.status, 400);
  assert.strictEqual(result.body.message, "Validation failed.");
  assert.deepStrictEqual(Object.keys(result.body.errors).sort(), ["email", "fullName", "password", "username"]);
});

test("register: short password is rejected", () => {
  const result = run(validateRegister, { ...validUser, password: "123" });
  assert.strictEqual(result.status, 400);
  assert.strictEqual(result.body.errors.password, "Password must be at least 6 characters.");
});

test("register: invalid email and username are rejected", () => {
  const result = run(validateRegister, { ...validUser, email: "not-an-email", username: "a b" });
  assert.strictEqual(result.status, 400);
  assert.ok(result.body.errors.email);
  assert.ok(result.body.errors.username);
});

test("register: whitespace-only fields count as missing", () => {
  const result = run(validateRegister, { ...validUser, fullName: "   " });
  assert.strictEqual(result.body.errors.fullName, "Full name is required.");
});

test("register: fields are trimmed but password is not", () => {
  const result = run(validateRegister, { ...validUser, username: "  juan_01  ", password: " secret123 " });
  assert.strictEqual(result.nextCalled, true);
  assert.strictEqual(result.req.body.username, "juan_01");
  assert.strictEqual(result.req.body.password, " secret123 ");
});

test("login: missing username and password returns 400", () => {
  const result = run(validateLogin, {});
  assert.strictEqual(result.status, 400);
  assert.ok(result.body.errors.username);
  assert.ok(result.body.errors.password);
});

test("login: valid input passes", () => {
  const result = run(validateLogin, { username: "juan_01", password: "secret123" });
  assert.strictEqual(result.nextCalled, true);
});

test("record: valid input passes and notes are optional", () => {
  assert.strictEqual(run(validateRecord, { name: "Maria", category: "Student" }).nextCalled, true);
  assert.strictEqual(run(validateRecord, { name: "Maria", category: "Student", notes: "Top of class" }).nextCalled, true);
});

test("record: missing name and category returns 400", () => {
  const result = run(validateRecord, { notes: "hello" });
  assert.strictEqual(result.status, 400);
  assert.strictEqual(result.body.errors.name, "Name is required.");
  assert.strictEqual(result.body.errors.category, "Category is required.");
});

test("record: too-long notes are rejected", () => {
  const result = run(validateRecord, { name: "Maria", category: "Student", notes: "x".repeat(501) });
  assert.strictEqual(result.status, 400);
  assert.ok(result.body.errors.notes);
});

test("missing request body is treated as empty", () => {
  const result = run(validateRecord, undefined);
  assert.strictEqual(result.status, 400);
});

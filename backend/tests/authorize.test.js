// Run with: node --test backend/tests/authorize.test.js

const test = require("node:test");
const assert = require("node:assert");
const { ROLES, authorize } = require("../middleware/authorize");

// Minimal stand-ins for Express req/res/next.
function run(middleware, user) {
  const result = { status: null, body: null, nextCalled: false };
  const req = { user };
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  middleware(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

test("no logged-in user gets 401", () => {
  const result = run(authorize(ROLES.ADMIN), undefined);
  assert.strictEqual(result.status, 401);
  assert.strictEqual(result.nextCalled, false);
});

test("user on an admin-only route gets 403", () => {
  const result = run(authorize(ROLES.ADMIN), { id: 1, role: ROLES.USER });
  assert.strictEqual(result.status, 403);
  assert.strictEqual(result.nextCalled, false);
});

test("admin on an admin-only route is allowed", () => {
  const result = run(authorize(ROLES.ADMIN), { id: 1, role: ROLES.ADMIN });
  assert.strictEqual(result.nextCalled, true);
  assert.strictEqual(result.status, null);
});

test("route allowing both roles lets admin and user through", () => {
  const middleware = authorize(ROLES.ADMIN, ROLES.USER);
  assert.strictEqual(run(middleware, { id: 1, role: ROLES.ADMIN }).nextCalled, true);
  assert.strictEqual(run(middleware, { id: 2, role: ROLES.USER }).nextCalled, true);
});

test("unknown role gets 403", () => {
  const result = run(authorize(ROLES.ADMIN, ROLES.USER), { id: 1, role: "guest" });
  assert.strictEqual(result.status, 403);
});

test("authorize() without roles throws", () => {
  assert.throws(() => authorize(), Error);
});

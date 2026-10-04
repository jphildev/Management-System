// Run with: node --test backend/tests/errorHandler.test.js

const test = require("node:test");
const assert = require("node:assert");
const { AppError, notFound, errorHandler, asyncHandler } = require("../middleware/errorHandler");

// Minimal stand-in for an Express res object.
function fakeRes() {
  return {
    statusCode: null,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

const req = { method: "GET", originalUrl: "/api/unknown" };

// Hide expected console.error output from 500 tests.
function silenceConsole(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = original;
  }
}

test("notFound passes a 404 AppError to the next handler", () => {
  let passed;
  notFound(req, fakeRes(), (err) => {
    passed = err;
  });
  assert.ok(passed instanceof AppError);
  assert.strictEqual(passed.statusCode, 404);
  assert.strictEqual(passed.message, "Route not found: GET /api/unknown");
});

test("AppError uses its own status and message", () => {
  const res = fakeRes();
  errorHandler(new AppError(404, "Record not found."), req, res, () => {});
  assert.strictEqual(res.statusCode, 404);
  assert.deepStrictEqual(res.body, { message: "Record not found." });
});

test("validation AppError includes field errors", () => {
  const res = fakeRes();
  const errors = { name: "Name is required." };
  errorHandler(new AppError(400, "Validation failed.", errors), req, res, () => {});
  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(res.body, { message: "Validation failed.", errors });
});

test("malformed JSON body returns 400", () => {
  const res = fakeRes();
  const err = Object.assign(new SyntaxError("Unexpected token"), { type: "entity.parse.failed", status: 400 });
  errorHandler(err, req, res, () => {});
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.message, "Invalid JSON in request body.");
});

test("unexpected error returns 500 without leaking details", () => {
  const res = fakeRes();
  silenceConsole(() => errorHandler(new Error("DB password is hunter2"), req, res, () => {}));
  assert.strictEqual(res.statusCode, 500);
  assert.deepStrictEqual(res.body, { message: "Something went wrong on the server." });
});

test("if a response was already sent, the error is passed on", () => {
  const res = fakeRes();
  res.headersSent = true;
  let passed;
  const err = new Error("late error");
  errorHandler(err, req, res, (e) => {
    passed = e;
  });
  assert.strictEqual(passed, err);
  assert.strictEqual(res.statusCode, null);
});

test("asyncHandler passes rejected promises to next", async () => {
  const err = new Error("async failure");
  const passed = await new Promise((resolve) => {
    asyncHandler(async () => {
      throw err;
    })(req, fakeRes(), resolve);
  });
  assert.strictEqual(passed, err);
});

test("asyncHandler does not call next when the handler succeeds", async () => {
  let nextCalled = false;
  await asyncHandler(async (rq, res) => {
    res.status(200).json({ ok: true });
  })(req, fakeRes(), () => {
    nextCalled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(nextCalled, false);
});

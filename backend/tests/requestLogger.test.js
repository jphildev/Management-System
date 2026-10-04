// Run with: node --test backend/tests/requestLogger.test.js

const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const { requestLogger, maskSensitive } = require("../middleware/requestLogger");

// Fake logger that records which level was used.
function fakeLogger() {
  const lines = { log: [], warn: [], error: [] };
  return {
    lines,
    log: (msg) => lines.log.push(msg),
    warn: (msg) => lines.warn.push(msg),
    error: (msg) => lines.error.push(msg),
  };
}

// Runs the middleware, then "finishes" the response with the given status.
function run({ method = "GET", url = "/api/records", body, status = 200 } = {}) {
  const logger = fakeLogger();
  const req = { method, originalUrl: url, body, ip: "::1" };
  const res = new EventEmitter();
  let nextCalled = false;

  requestLogger({ logger })(req, res, () => {
    nextCalled = true;
  });
  const beforeFinish = logger.lines.log.length + logger.lines.warn.length + logger.lines.error.length;

  res.statusCode = status;
  res.emit("finish");
  return { logger, nextCalled, beforeFinish };
}

test("logs method, url, status, duration and ip", () => {
  const { logger, nextCalled } = run({ method: "GET", url: "/api/records", status: 200 });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(logger.lines.log.length, 1);
  assert.match(logger.lines.log[0], /GET \/api\/records 200 - \d+ms - ip=::1/);
});

test("nothing is logged before the response finishes", () => {
  const { beforeFinish } = run();
  assert.strictEqual(beforeFinish, 0);
});

test("password in request body is masked", () => {
  const { logger } = run({
    method: "POST",
    url: "/api/login",
    body: { username: "juan_01", password: "secret123" },
  });
  const line = logger.lines.log[0];
  assert.ok(line.includes('"username":"juan_01"'));
  assert.ok(line.includes('"password":"***"'));
  assert.ok(!line.includes("secret123"));
});

test("GET requests do not log a body", () => {
  const { logger } = run({ method: "GET", body: { q: "x" } });
  assert.ok(!logger.lines.log[0].includes("body="));
});

test("4xx responses use warn, 5xx use error", () => {
  const notFound = run({ url: "/api/records/99", status: 404 });
  assert.strictEqual(notFound.logger.lines.warn.length, 1);
  assert.strictEqual(notFound.logger.lines.log.length, 0);

  const serverError = run({ status: 500 });
  assert.strictEqual(serverError.logger.lines.error.length, 1);
  assert.strictEqual(serverError.logger.lines.log.length, 0);
});

test("maskSensitive handles nested objects and does not change the original", () => {
  const original = { user: { password: "x", name: "A" }, confirm: "x" };
  const masked = maskSensitive(original);
  assert.deepStrictEqual(masked, { user: { password: "***", name: "A" }, confirm: "***" });
  assert.strictEqual(original.user.password, "x");
});

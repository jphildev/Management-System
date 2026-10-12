// Runs without a MongoDB server: real Mongoose models (defaults + validation),
// but find/create/count are swapped for in-memory fakes. Everything else
// (Express, middleware order, JWT, bcrypt) is the real code.
process.env.JWT_SECRET = 'test-secret';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Record = require('../src/models/Record');

// ---------- in-memory fakes ----------
const users = [];
const records = [];
const thenable = (getValue, extra = {}) => ({
  ...extra,
  select() { return this; },
  then(res, rej) { return Promise.resolve().then(getValue).then(res, rej); },
});
const matches = (doc, filter) =>
  Object.entries(filter).every(([k, v]) => {
    if (k === '$or') return v.some((f) => matches(doc, f));
    const field = doc[k];
    if (v instanceof RegExp) return Array.isArray(field) ? field.some((x) => v.test(x)) : v.test(field ?? '');
    return String(field) === String(v);
  });

User.findOne = (q) => thenable(() => users.find((u) => u.email === q.email) || null);
User.create = async (data) => {
  const doc = new User(data);
  await doc.validate();
  users.push(doc);
  return doc;
};
Record.create = async (data) => {
  const doc = new Record(data);
  await doc.validate();
  records.push(doc);
  return doc;
};
Record.find = (filter) => {
  let rows = records.filter((r) => matches(r.toObject(), filter));
  const q = {
    sort(spec) {
      const [key, dir] = Object.entries(spec)[0];
      rows = [...rows].sort((a, b) => (a[key] > b[key] ? 1 : -1) * dir);
      return q;
    },
    skip(n) { rows = rows.slice(n); return q; },
    limit(n) { rows = rows.slice(0, n); return q; },
    lean() { return q; },
    then(res, rej) { return Promise.resolve(rows.map((r) => r.toObject())).then(res, rej); },
  };
  return q;
};
Record.countDocuments = async (filter) => records.filter((r) => matches(r.toObject(), filter)).length;

// ---------- harness ----------
const app = require('../src/app');
const logs = [];
const origLog = console.log;
console.log = (...a) => { logs.push(a.join(' ')); };

let passed = 0;
const results = [];
const test = async (name, fn) => {
  try { await fn(); passed++; results.push(`  ok   ${name}`); }
  catch (e) { results.push(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body, token) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  // ----- contract checks -----
  await test('package.json has no "type": "module"', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    assert.equal(pkg.type, undefined);
  });
  await test('wiring order: json -> requestLogger -> routes -> notFound -> errorHandler', () => {
    const names = app._router.stack.map((l) => l.name);
    const idx = ['jsonParser', 'router', 'notFound', 'errorHandler'].map((n) => names.indexOf(n));
    assert.ok(idx.every((i) => i >= 0), `missing layer in ${names}`);
    assert.ok(idx.every((v, i) => i === 0 || v > idx[i - 1]), `bad order: ${names}`);
    // the requestLogger() result sits between jsonParser and the router
    const between = names.slice(idx[0] + 1, idx[1]);
    assert.equal(between.length, 1, `expected exactly one layer between json and routes: ${between}`);
  });
  await test('User schema: password String max 255, role defaults to "user"', () => {
    assert.equal(User.schema.path('password').options.maxlength, 255);
    assert.equal(new User({ name: 'x', email: 'x@x.io', password: 'h' }).role, 'user');
  });

  // ----- plumbing -----
  await test('GET /health -> 200', async () => assert.equal((await call('GET', '/health')).status, 200));
  await test('unknown route -> 404 JSON via notFound/errorHandler', async () => {
    const r = await call('GET', '/nope');
    assert.equal(r.status, 404);
    assert.match(r.body.message, /not found/i);
  });
  await test('malformed JSON -> 400 (express.json runs before errorHandler)', async () => {
    assert.equal((await call('POST', '/auth/login', '{bad json')).status, 400);
  });

  // ----- auth -----
  let alice;
  await test('register validation: missing fields / bad email / short password -> 400', async () => {
    assert.equal((await call('POST', '/auth/register', {})).status, 400);
    assert.equal((await call('POST', '/auth/register', { name: 'A', email: 'nope', password: 'password123' })).status, 400);
    assert.equal((await call('POST', '/auth/register', { name: 'A', email: 'a@a.io', password: 'short' })).status, 400);
  });
  await test('password limit is enforced in BYTES (bcrypt ignores bytes past 72)', async () => {
    const r = await call('POST', '/auth/register', { name: 'U', email: 'u@u.io', password: 'é'.repeat(40) }); // 40 chars = 80 bytes
    assert.equal(r.status, 400);
    assert.match(r.body.message, /72 bytes/);
  });
  await test('register -> 201, role "user" even if body asks for admin, password hashed', async () => {
    const r = await call('POST', '/auth/register', { name: 'Alice', email: 'Alice@Example.com', password: 'password123', role: 'admin' });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, 'user');
    assert.equal(r.body.user.email, 'alice@example.com');
    assert.equal(r.body.user.password, undefined);
    assert.ok(users[0].password.startsWith('$2') && users[0].password.length <= 255 && users[0].password !== 'password123');
    alice = r.body;
  });
  await test('register duplicate email -> 409', async () => {
    assert.equal((await call('POST', '/auth/register', { name: 'A2', email: 'alice@example.com', password: 'password123' })).status, 409);
  });
  await test('login bad password / unknown email -> 401', async () => {
    assert.equal((await call('POST', '/auth/login', { email: 'alice@example.com', password: 'wrongpass' })).status, 401);
    assert.equal((await call('POST', '/auth/login', { email: 'ghost@example.com', password: 'password123' })).status, 401);
  });
  await test('login with operator-injection object -> 400', async () => {
    assert.equal((await call('POST', '/auth/login', { email: { $ne: '' }, password: { $ne: '' } })).status, 400);
  });
  await test('login -> 200, token carries { id, role }, and req.user is set', async () => {
    logs.length = 0;
    const r = await call('POST', '/auth/login', { email: 'ALICE@example.com', password: 'password123' });
    assert.equal(r.status, 200);
    const payload = jwt.verify(r.body.token, process.env.JWT_SECRET);
    assert.equal(payload.id, alice.user.id);
    assert.equal(payload.role, 'user');
    // requestLogger runs on 'finish' and prints req.user, proving login set it
    await new Promise((s) => setTimeout(s, 20));
    assert.ok(logs.some((l) => l.includes('/auth/login') && l.includes(`user=${alice.user.id}(user)`)), logs.join('\n'));
  });

  // ----- records -----
  const bob = (await call('POST', '/auth/register', { name: 'Bob', email: 'bob@example.com', password: 'password123' })).body;
  const adminToken = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'admin' }, process.env.JWT_SECRET);

  await test('records without / bad / expired / alg=none token -> 401', async () => {
    assert.equal((await call('GET', '/records')).status, 401);
    assert.equal((await call('POST', '/records', { title: 'x' }, 'garbage')).status, 401);
    const expired = jwt.sign({ id: alice.user.id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: -10 });
    assert.equal((await call('GET', '/records', undefined, expired)).status, 401);
    const none = jwt.sign({ id: alice.user.id, role: 'admin' }, '', { algorithm: 'none' });
    assert.equal((await call('GET', '/records', undefined, none)).status, 401);
    const wrongSecret = jwt.sign({ id: alice.user.id, role: 'admin' }, 'not-the-secret');
    assert.equal((await call('GET', '/records', undefined, wrongSecret)).status, 401);
  });
  await test('mongoose ValidationError (title > 200 chars) -> 400, not 500', async () => {
    const r = await call('POST', '/records', { title: 'x'.repeat(201) }, alice.token);
    assert.equal(r.status, 400);
    assert.ok(Array.isArray(r.body.details) && r.body.details.length === 1);
  });
  await test('create record: missing title -> 400; valid -> 201 with createdBy', async () => {
    assert.equal((await call('POST', '/records', { description: 'x' }, alice.token)).status, 400);
    const r = await call('POST', '/records', { title: 'Quarterly Budget (Q3)', description: 'Finance planning', category: 'Finance', tags: ['budget', 'planning'] }, alice.token);
    assert.equal(r.status, 201);
    assert.equal(r.body.record.createdBy, alice.user.id);
  });
  await call('POST', '/records', { title: 'Team Offsite', description: 'Travel plans', category: 'HR', tags: ['travel'] }, alice.token);
  await call('POST', '/records', { title: 'Bob private note', tags: ['budget'] }, bob.token);

  await test('get records: users see only their own; admin sees all', async () => {
    assert.equal((await call('GET', '/records', undefined, alice.token)).body.pagination.total, 2);
    assert.equal((await call('GET', '/records', undefined, bob.token)).body.pagination.total, 1);
    assert.equal((await call('GET', '/records', undefined, adminToken)).body.pagination.total, 3);
  });
  await test('search: partial + case-insensitive on title, description, tags', async () => {
    const t = (q) => call('GET', `/records?search=${encodeURIComponent(q)}`, undefined, alice.token);
    assert.equal((await t('BUDG')).body.records.length, 1);      // title + tag, alice's only
    assert.equal((await t('travel')).body.records[0].title, 'Team Offsite'); // description + tag
    assert.equal((await t('zzz')).body.records.length, 0);
  });
  await test('search with regex special characters does not crash', async () => {
    const r = await call('GET', `/records?search=${encodeURIComponent('(Q3')}`, undefined, alice.token);
    assert.equal(r.status, 200);
    assert.equal(r.body.records.length, 1);
  });
  await test('search[$ne]=x object query -> 400', async () => {
    assert.equal((await call('GET', '/records?search[$ne]=x', undefined, alice.token)).status, 400);
  });
  await test('category filter, pagination and sort', async () => {
    assert.equal((await call('GET', '/records?category=finance', undefined, alice.token)).body.records.length, 1);
    const p = await call('GET', '/records?limit=1&page=2&sort=title', undefined, alice.token);
    assert.equal(p.body.records.length, 1);
    assert.deepEqual(p.body.pagination, { page: 2, limit: 1, total: 2, pages: 2 });
    assert.equal(p.body.records[0].title, 'Team Offsite');
    assert.equal((await call('GET', '/records?sort=password', undefined, alice.token)).status, 400);
  });

  server.close();
  console.log = origLog;
  console.log(results.join('\n'));
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(process.exitCode || 0);
})();

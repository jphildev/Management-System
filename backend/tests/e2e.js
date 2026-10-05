// End-to-end test against a REAL MongoDB (or compatible) server.
//   MONGODB_URI=mongodb://127.0.0.1:27017 npm run test:e2e
// Boots src/server.js as a child process, drives the HTTP API, and inspects the DB.
// Uses a throw-away database that is dropped at the end.
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const baseUri = process.env.MONGODB_URI;
if (!baseUri) { console.log('Set MONGODB_URI to run the e2e test.'); process.exit(2); }
const dbName = `core_app_e2e_${Date.now()}`;
const uri = baseUri.replace(/\/?(\?.*)?$/, `/${dbName}$1`);
const SECRET = 'e2e-secret';
const PORT = 5055;
const api = `http://127.0.0.1:${PORT}/api`;

let passed = 0, failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};
const call = async (method, url, body, token) => {
  const res = await fetch(api + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

(async () => {
  const server = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, MONGODB_URI: uri, JWT_SECRET: SECRET, PORT: String(PORT) },
  });
  let out = '';
  server.stdout.on('data', (d) => (out += d));
  server.stderr.on('data', (d) => (out += d));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start:\n' + out)), 15000);
    const iv = setInterval(() => { if (out.includes('API listening')) { clearTimeout(t); clearInterval(iv); resolve(); } }, 100);
    server.on('exit', () => reject(new Error('server exited early:\n' + out)));
  });

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  try {
    await test('server booted, connected to DB, /health ok', async () => {
      assert.match(out, /MongoDB connected/);
      assert.equal((await call('GET', '/health')).status, 200);
    });

    let alice, bob;
    await test('register persists a hashed password (<=255) and role "user"', async () => {
      const r = await call('POST', '/auth/register', { name: 'Alice', email: 'Alice@Example.com', password: 'password123', role: 'admin' });
      assert.equal(r.status, 201);
      alice = r.body;
      const row = await db.collection('users').findOne({ email: 'alice@example.com' });
      assert.ok(row, 'user row exists with lower-cased email');
      assert.equal(row.role, 'user');
      assert.match(row.password, /^\$2[aby]\$/);
      assert.ok(row.password.length <= 255 && row.password !== 'password123');
    });
    await test('unique email index exists and duplicate -> 409', async () => {
      const idx = await db.collection('users').indexes();
      assert.ok(idx.some((i) => i.key.email === 1 && i.unique), 'unique index on email');
      assert.equal((await call('POST', '/auth/register', { name: 'Dup', email: 'alice@example.com', password: 'password123' })).status, 409);
    });
    await test('race: two simultaneous registers of the same email -> one 201, one 409 (never 500)', async () => {
      const mk = () => call('POST', '/auth/register', { name: 'Race', email: 'race@example.com', password: 'password123' });
      const codes = (await Promise.all([mk(), mk()])).map((r) => r.status).sort();
      assert.deepEqual(codes, [201, 409]);
    });
    await test('login -> token with { id, role }; wrong password -> 401', async () => {
      const r = await call('POST', '/auth/login', { email: 'alice@example.com', password: 'password123' });
      assert.equal(r.status, 200);
      const p = jwt.verify(r.body.token, SECRET);
      assert.equal(p.id, alice.user.id);
      assert.equal(p.role, 'user');
      assert.equal((await call('POST', '/auth/login', { email: 'alice@example.com', password: 'nope-nope' })).status, 401);
    });

    bob = (await call('POST', '/auth/register', { name: 'Bob', email: 'bob@example.com', password: 'password123' })).body;

    await test('create record stores createdBy as ObjectId + timestamps', async () => {
      const r = await call('POST', '/records', { title: 'Quarterly Budget (Q3)', description: 'Finance planning', category: 'Finance', tags: ['budget', 'planning'] }, alice.token);
      assert.equal(r.status, 201);
      const row = await db.collection('records').findOne({ title: 'Quarterly Budget (Q3)' });
      assert.ok(row.createdBy instanceof mongoose.Types.ObjectId);
      assert.equal(String(row.createdBy), alice.user.id);
      assert.ok(row.createdAt && row.updatedAt);
    });
    await call('POST', '/records', { title: 'Team Offsite', description: 'Travel plans', category: 'HR', tags: ['travel'] }, alice.token);
    for (let i = 1; i <= 12; i++) await call('POST', '/records', { title: `Bulk item ${String(i).padStart(2, '0')}`, tags: ['bulk'] }, alice.token);
    await call('POST', '/records', { title: 'Bob private note', tags: ['budget'] }, bob.token);

    await test('get records scoped per user; pagination counts are right', async () => {
      const a = await call('GET', '/records?limit=5', undefined, alice.token);
      assert.equal(a.body.pagination.total, 14);
      assert.equal(a.body.pagination.pages, 3);
      assert.equal(a.body.records.length, 5);
      assert.equal((await call('GET', '/records', undefined, bob.token)).body.pagination.total, 1);
    });
    await test('default sort is newest first; sort=title works', async () => {
      const d = (await call('GET', '/records?limit=3', undefined, alice.token)).body.records;
      assert.equal(d[0].title, 'Bulk item 12');
      const t = (await call('GET', '/records?sort=title&limit=2', undefined, alice.token)).body.records;
      assert.equal(t[0].title, 'Bulk item 01');
    });
    // Regression guard only: FerretDB/SQLite returns ties in insertion order, so this passes even
    // without the _id tie-breaker. Real MongoDB does not guarantee tie order, hence the tie-breaker.
    await test('pagination is stable when sort values tie (same title x4, page size 1)', async () => {
      for (let i = 0; i < 4; i++) await call('POST', '/records', { title: 'Same title', category: 'tie' }, alice.token);
      const ids = [];
      for (let page = 1; page <= 4; page++) {
        const r = await call('GET', `/records?category=tie&sort=title&limit=1&page=${page}`, undefined, alice.token);
        ids.push(r.body.records[0]._id);
      }
      assert.equal(new Set(ids).size, 4, `duplicate/skipped rows across pages: ${ids}`);
      await db.collection('records').deleteMany({ category: 'tie' });
    });
    await test('over-long title -> 400 against real DB validation', async () => {
      assert.equal((await call('POST', '/records', { title: 'x'.repeat(201) }, alice.token)).status, 400);
    });
    await test('search: title / description / tag, partial + case-insensitive', async () => {
      const s = (q) => call('GET', `/records?search=${encodeURIComponent(q)}`, undefined, alice.token);
      assert.equal((await s('BUDG')).body.records.length, 1);           // title + tag; Bob's budget note excluded
      assert.equal((await s('travel')).body.records[0].title, 'Team Offsite');
      assert.equal((await s('plan')).body.records.length, 2);           // "planning" tag/desc + "Travel plans"
      assert.equal((await s('bulk')).body.pagination.total, 12);
      assert.equal((await s('zzz')).body.pagination.total, 0);
    });
    await test('search with regex metacharacters is treated literally', async () => {
      const s = (q) => call('GET', `/records?search=${encodeURIComponent(q)}`, undefined, alice.token);
      assert.equal((await s('(Q3')).body.records.length, 1);
      assert.equal((await s('.*')).body.pagination.total, 0);
    });
    await test('category filter + search[$ne] injection rejected', async () => {
      assert.equal((await call('GET', '/records?category=finance', undefined, alice.token)).body.records.length, 1);
      assert.equal((await call('GET', '/records?search[$ne]=x', undefined, alice.token)).status, 400);
    });
    await test('admin role (set in DB) is picked up at login and sees all records', async () => {
      await db.collection('users').updateOne({ email: 'bob@example.com' }, { $set: { role: 'admin' } });
      const l = await call('POST', '/auth/login', { email: 'bob@example.com', password: 'password123' });
      assert.equal(l.body.user.role, 'admin');
      assert.equal((await call('GET', '/records', undefined, l.body.token)).body.pagination.total, 15);
    });
    await test('unauthenticated -> 401; unknown route -> 404', async () => {
      assert.equal((await call('GET', '/records')).status, 401);
      assert.equal((await call('GET', '/nope')).status, 404);
    });
  } finally {
    await db.dropDatabase();
    await mongoose.disconnect();
    server.kill();
  }
  console.log(`\n${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

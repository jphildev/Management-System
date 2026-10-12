const jwt = require('jsonwebtoken');
const User = require('../models/User');
const HttpError = require('../utils/HttpError');
const { hashPassword, verifyPassword, isAcceptableLength, MAX_BYTES } = require('../utils/password');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

// [API-04] POST /api/auth/register
async function register(req, res) {
  const { name, email, password } = req.body || {};

  // typeof checks also block NoSQL operator injection like { "$ne": "" }.
  if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Name is required');
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    throw new HttpError(400, 'A valid email is required');
  }
  if (!isAcceptableLength(password)) {
    throw new HttpError(400, `Password must be at least 8 characters and at most ${MAX_BYTES} bytes`);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.findOne({ email: normalizedEmail })) {
    throw new HttpError(409, 'Email is already registered');
  }

  // role is deliberately NOT read from the body; the schema default ("user") applies.
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: await hashPassword(password),
  });

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}

// [API-04] POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw new HttpError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
  const ok = user && (await verifyPassword(password, user.password));
  if (!ok) throw new HttpError(401, 'Invalid email or password');

  // Integration contract: login sets req.user = { id, role }
  req.user = { id: user.id, role: user.role };

  res.json({ token: signToken(user), user: publicUser(user) });
}

module.exports = { register, login };

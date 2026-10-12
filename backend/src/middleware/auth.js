const jwt = require('jsonwebtoken');
const HttpError = require('../utils/HttpError');

// Verifies "Authorization: Bearer <token>" and sets req.user = { id, role }.
function protect(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Authentication required'));
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (err) {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

module.exports = { protect };

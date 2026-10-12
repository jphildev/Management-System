const HttpError = require('../utils/HttpError');

// Used as app.use(notFound). Hands a 404 to errorHandler.
// NOTE: placeholder; swap in the team's own version if one exists.
function notFound(req, res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = notFound;

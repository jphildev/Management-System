// [SEC-04] Error handling (404, validation, server errors).
// Every error response uses the same shape: { message, errors? }
// Wiring (after all routes):
//   app.use(notFound);
//   app.use(errorHandler);

class AppError extends Error {
  constructor(statusCode, message, errors) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    if (errors) this.errors = errors;
  }
}

function notFound(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl || req.url}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    const body = { message: err.message };
    if (err.errors) body.errors = err.errors;
    return res.status(err.statusCode).json(body);
  }

  // Malformed JSON from express.json()
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON in request body." });
  }

  // Other client errors that are safe to show (e.g. body too large)
  if (err && err.expose && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ message: err.message });
  }

  // Unexpected: log full details on the server, hide them from the client
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl || req.url}`, err);
  return res.status(500).json({ message: "Something went wrong on the server." });
}

// Passes errors from async route handlers to errorHandler.
// Usage: router.get("/records", asyncHandler(async (req, res) => { ... }));
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { AppError, notFound, errorHandler, asyncHandler };

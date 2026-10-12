// [SEC-07] Basic request/response logging.
// Logs one line per request when the response finishes:
//   [time] METHOD /url STATUS - 12ms - ip=... - body={...}
// Sensitive fields (passwords, tokens) are masked. Never logs raw passwords.
// Wiring (near the top, after express.json()):
//   app.use(requestLogger());

const SENSITIVE_FIELDS = ["password", "confirm", "confirmpassword", "token"];
const BODY_METHODS = ["POST", "PUT", "PATCH"];
const MAX_BODY_LENGTH = 1000;

function maskSensitive(value) {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (!value || typeof value !== "object") return value;

  const masked = {};
  for (const [key, val] of Object.entries(value)) {
    masked[key] = SENSITIVE_FIELDS.includes(key.toLowerCase()) ? "***" : maskSensitive(val);
  }
  return masked;
}

function formatBody(body) {
  const text = JSON.stringify(maskSensitive(body));
  return text.length > MAX_BODY_LENGTH ? `${text.slice(0, MAX_BODY_LENGTH)}...` : text;
}

function requestLogger({ logger = console } = {}) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();

    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const ip = req.ip || (req.socket && req.socket.remoteAddress) || "-";
      let line = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${ms.toFixed(0)}ms - ip=${ip}`;

      if (BODY_METHODS.includes(req.method) && req.body && Object.keys(req.body).length > 0) {
        line += ` - body=${formatBody(req.body)}`;
      }

      if (res.statusCode >= 500) logger.error(line);
      else if (res.statusCode >= 400) logger.warn(line);
      else logger.log(line);
    });

    next();
  };
}

module.exports = { requestLogger, maskSensitive };

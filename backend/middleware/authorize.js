// [SEC-02] Role-based access control (admin/user).
// Express middleware: expects the auth step (API-04) to set req.user = { id, role }.
// Usage: router.delete("/records/:id", authorize(ROLES.ADMIN), handler);

const ROLES = Object.freeze({
  ADMIN: "admin",
  USER: "user",
});

function authorize(...allowedRoles) {
  if (allowedRoles.length === 0) {
    throw new Error("authorize() needs at least one role.");
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action." });
    }

    next();
  };
}

module.exports = { ROLES, authorize };

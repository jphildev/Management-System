// [SEC-03] Backend input validation.
// Express middleware: on invalid input responds 400 with per-field errors,
// otherwise trims string fields on req.body and calls next().
// Usage: router.post("/register", validateRegister, handler);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function checkRegister(body) {
  const errors = {};
  const fullName = clean(body.fullName);
  const email = clean(body.email);
  const username = clean(body.username);
  const password = typeof body.password === "string" ? body.password : "";

  if (!fullName) errors.fullName = "Full name is required.";
  else if (fullName.length > 100) errors.fullName = "Full name must be at most 100 characters.";

  if (!email) errors.email = "Email is required.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Email must be a valid email address.";

  if (!username) errors.username = "Username is required.";
  else if (username.length < 3 || username.length > 30) errors.username = "Username must be 3 to 30 characters.";
  else if (!USERNAME_PATTERN.test(username)) errors.username = "Username can only contain letters, numbers, and underscores.";

  if (!password) errors.password = "Password is required.";
  else if (password.length < 6) errors.password = "Password must be at least 6 characters.";

  return errors;
}

function checkLogin(body) {
  const errors = {};
  if (!clean(body.username)) errors.username = "Username is required.";
  if (typeof body.password !== "string" || body.password.length === 0) errors.password = "Password is required.";
  return errors;
}

function checkRecord(body) {
  const errors = {};
  const name = clean(body.name);
  const category = clean(body.category);

  if (!name) errors.name = "Name is required.";
  else if (name.length > 100) errors.name = "Name must be at most 100 characters.";

  if (!category) errors.category = "Category is required.";
  else if (category.length > 50) errors.category = "Category must be at most 50 characters.";

  if (body.notes !== undefined && body.notes !== null && typeof body.notes !== "string") {
    errors.notes = "Notes must be text.";
  } else if (clean(body.notes).length > 500) {
    errors.notes = "Notes must be at most 500 characters.";
  }

  return errors;
}

// Passwords are not trimmed: spaces can be part of a password.
function trimBody(body) {
  for (const key of Object.keys(body)) {
    if (key !== "password" && typeof body[key] === "string") {
      body[key] = body[key].trim();
    }
  }
}

function makeValidator(check) {
  return (req, res, next) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const errors = check(body);

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ message: "Validation failed.", errors });
    }

    trimBody(body);
    req.body = body;
    next();
  };
}

module.exports = {
  validateRegister: makeValidator(checkRegister),
  validateLogin: makeValidator(checkLogin),
  validateRecord: makeValidator(checkRecord),
};

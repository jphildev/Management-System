
const AUTH_KEY = "mms_logged_in";

function isLoggedIn() {
  return sessionStorage.getItem(AUTH_KEY) === "true";
}

function setLoggedIn() {
  sessionStorage.setItem(AUTH_KEY, "true");
}

function clearSession() {
  sessionStorage.removeItem(AUTH_KEY);
}

const PROTECTED_PAGES = ["index.html", "dashboard.html", "records.html", ""];


const AUTH_PAGES = ["login.html", "register.html"];

function currentPage() {
  return (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
}


function enforceRouteGuard() {
  const page = currentPage();

  if (PROTECTED_PAGES.includes(page) && !isLoggedIn()) {
    window.location.replace("login.html");
    return false;
  }

  if (AUTH_PAGES.includes(page) && isLoggedIn()) {
    window.location.replace("index.html");
    return false;
  }

  return true;
}


function highlightActiveNavLink() {
  const current = currentPage();
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const href = (link.getAttribute("href") || "").toLowerCase();
    const isActive = href === current;
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}


function setupMobileNavToggle() {
  const toggle = document.getElementById("navToggle");
  const menu = document.getElementById("navMenu");
  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menu.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}


function setupLogout() {
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    clearSession();
    window.location.href = "login.html";
  });
}


function setupFormValidation() {

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      clearErrors(loginForm);
      let valid = true;
      valid = requireField(loginForm, "username", "Username is required.") && valid;
      valid = requireField(loginForm, "password", "Password is required.") && valid;
      if (valid) {
        setLoggedIn();
        window.location.href = "index.html";
      }
    });
  }


  const registerForm = document.getElementById("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      clearErrors(registerForm);
      let valid = true;
      valid = requireField(registerForm, "fullName", "Full name is required.")                     && valid;
      valid = requireField(registerForm, "email",    "Email is required.")                         && valid;
      valid = requireField(registerForm, "username", "Username is required.")                      && valid;
      valid = requireField(registerForm, "password", "Password must be at least 6 characters.", 6) && valid;

      const password = registerForm.elements["password"]?.value || "";
      const confirm  = registerForm.elements["confirm"]?.value  || "";
      if (!confirm) {
        showError(registerForm, "confirm", "Please confirm your password.");
        valid = false;
      } else if (password !== confirm) {
        showError(registerForm, "confirm", "Passwords do not match.");
        valid = false;
      }

      if (valid) {
        window.location.href = "login.html";
      }
    });
  }
}

function requireField(form, name, message, minLength) {
  const field = form.elements[name];
  if (!field) return true;
  const value = field.value.trim();
  if (!value || (minLength && value.length < minLength)) {
    showError(form, name, message);
    return false;
  }
  return true;
}

function showError(form, name, message) {
  const field = form.elements[name];
  if (!field) return;
  field.classList.add("invalid");
  const errorEl = document.getElementById(`${field.id}-error`);
  if (errorEl) errorEl.textContent = message;
}

function clearErrors(form) {
  form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  form.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
}


document.addEventListener("DOMContentLoaded", () => {
  if (!enforceRouteGuard()) return;

  highlightActiveNavLink();
  setupMobileNavToggle();
  setupFormValidation();
  setupLogout();
});

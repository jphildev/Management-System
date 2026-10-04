const RECORDS_KEY = "mms_records";
const PAGE_SIZE = 5;

let records = loadRecords();
let pageNumber = 1;
let editingId = null;
let viewingId = null;
let deletingId = null;

const $ = (id) => document.getElementById(id);

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(RECORDS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function setError(id, message) {
  const el = $(id);
  if (el) el.textContent = message;
}

function clearFormErrors(form) {
  form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  form.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
}

function validate(form, prefix) {
  clearFormErrors(form);
  const name = form.elements["name"].value.trim();
  const category = form.elements["category"].value.trim();
  let valid = true;

  if (!name) {
    form.elements["name"].classList.add("invalid");
    setError(`${prefix}-name-error`, "Name is required.");
    valid = false;
  }
  if (!category) {
    form.elements["category"].classList.add("invalid");
    setError(`${prefix}-category-error`, "Category is required.");
    valid = false;
  }
  return valid;
}

function getFiltered() {
  const q = $("record-search").value.trim().toLowerCase();
  const cat = $("record-filter").value;
  return records
    .filter((r) => !cat || r.category === cat)
    .filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.notes || "").toLowerCase().includes(q)
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function refreshCategoryFilter() {
  const select = $("record-filter");
  const previous = select.value;
  const categories = [...new Set(records.map((r) => r.category))].sort();
  select.innerHTML = '<option value="">All categories</option>';
  categories.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  });
  select.value = categories.includes(previous) ? previous : "";
}

function iconButton(label, svg, onClick, extraClass = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `icon-btn ${extraClass}`.trim();
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.innerHTML = svg;
  btn.addEventListener("click", onClick);
  return btn;
}

const ICONS = {
  view: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
  delete: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
};

function showLoading(isLoading) {
  $("records-loading").hidden = !isLoading;
  $("records-table-wrap").hidden = isLoading;
}

function render() {
  refreshCategoryFilter();

  const filtered = getFiltered();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (pageNumber > totalPages) pageNumber = totalPages;

  const start = (pageNumber - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  $("record-total").textContent = records.length;
  $("records-count").textContent = `${filtered.length} record${filtered.length === 1 ? "" : "s"} shown`;

  const body = $("records-body");
  body.innerHTML = "";

  if (pageItems.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "empty muted";
    td.style.textAlign = "center";
    td.textContent = records.length === 0 ? "No records yet. Add your first one above." : "No records match your search.";
    tr.appendChild(td);
    body.appendChild(tr);
  } else {
    pageItems.forEach((r) => {
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      const nameCell = document.createElement("div");
      nameCell.className = "name-cell";
      const avatar = document.createElement("span");
      avatar.className = "avatar";
      avatar.textContent = initials(r.name);
      const nameText = document.createElement("span");
      nameText.textContent = r.name;
      nameCell.append(avatar, nameText);
      nameTd.appendChild(nameCell);

      const catTd = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = r.category;
      catTd.appendChild(pill);

      const notesTd = document.createElement("td");
      notesTd.className = "notes";
      notesTd.textContent = r.notes ? (r.notes.length > 40 ? r.notes.slice(0, 40) + "…" : r.notes) : "—";

      const dateTd = document.createElement("td");
      dateTd.textContent = formatDate(r.createdAt);

      const actionsTd = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "row-actions";
      actions.append(
        iconButton("View record", ICONS.view, () => openView(r.id)),
        iconButton("Edit record", ICONS.edit, () => openEdit(r.id)),
        iconButton("Delete record", ICONS.delete, () => openDelete(r.id), "danger"),
      );
      actionsTd.appendChild(actions);

      tr.append(nameTd, catTd, notesTd, dateTd, actionsTd);
      body.appendChild(tr);
    });
  }

  showLoading(false);

  const pagination = $("records-pagination");
  pagination.hidden = filtered.length <= PAGE_SIZE;
  $("page-info").textContent = `Page ${pageNumber} of ${totalPages}`;
  $("page-prev").disabled = pageNumber <= 1;
  $("page-next").disabled = pageNumber >= totalPages;
}

function setupAddForm() {
  const form = $("record-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validate(form, "record")) return;

    records.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: form.elements["name"].value.trim(),
      category: form.elements["category"].value.trim(),
      notes: form.elements["notes"].value.trim(),
      createdAt: new Date().toISOString(),
    });
    saveRecords();

    form.reset();
    clearFormErrors(form);
    pageNumber = 1;
    render();
  });
}

function openEdit(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  editingId = id;
  const form = $("edit-form");
  clearFormErrors(form);
  form.elements["name"].value = r.name;
  form.elements["category"].value = r.category;
  form.elements["notes"].value = r.notes || "";
  $("edit-dialog").showModal();
}

function setupEditDialog() {
  const form = $("edit-form");
  $("edit-cancel").addEventListener("click", () => $("edit-dialog").close());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validate(form, "edit")) return;
    const r = records.find((x) => x.id === editingId);
    if (!r) return;
    r.name = form.elements["name"].value.trim();
    r.category = form.elements["category"].value.trim();
    r.notes = form.elements["notes"].value.trim();
    saveRecords();
    $("edit-dialog").close();
    render();
  });
}

function openView(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  viewingId = id;
  $("view-avatar").textContent = initials(r.name);
  $("view-title").textContent = r.name;
  $("view-category").textContent = r.category;
  $("view-notes").textContent = r.notes || "No notes added.";
  $("view-date").textContent = formatDate(r.createdAt);
  $("view-dialog").showModal();
}

function setupViewDialog() {
  $("view-close").addEventListener("click", () => $("view-dialog").close());
  $("view-edit").addEventListener("click", () => {
    $("view-dialog").close();
    openEdit(viewingId);
  });
}

function openDelete(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  deletingId = id;
  $("delete-message").textContent = `"${r.name}" will be permanently removed. This can't be undone.`;
  $("delete-dialog").showModal();
}

function setupDeleteDialog() {
  $("delete-cancel").addEventListener("click", () => $("delete-dialog").close());
  $("delete-confirm").addEventListener("click", () => {
    records = records.filter((x) => x.id !== deletingId);
    saveRecords();
    $("delete-dialog").close();
    render();
  });
}

function setupToolbar() {
  $("record-search").addEventListener("input", () => {
    pageNumber = 1;
    render();
  });
  $("record-filter").addEventListener("change", () => {
    pageNumber = 1;
    render();
  });
  $("page-prev").addEventListener("click", () => {
    if (pageNumber > 1) {
      pageNumber--;
      render();
    }
  });
  $("page-next").addEventListener("click", () => {
    pageNumber++;
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (!$("record-form")) return;
  setupAddForm();
  setupEditDialog();
  setupViewDialog();
  setupDeleteDialog();
  setupToolbar();
  showLoading(true);
  setTimeout(render, 600);
});
(() => {
  const KEY = "mms_records";
  const PAGE_SIZE = 5;

  const $ = (id) => document.getElementById(id);
  if (!$("record-form")) return;

  let records = [];
  let query = "";
  let category = "";
  let page = 1;
  let editId = null;
  let deleteId = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(records)); }

  function fetchRecords() {
    return new Promise((resolve) => setTimeout(() => resolve(load()), 600));
  }

  function setError(form, field, message) {
    const input = form.elements[field];
    input.classList.toggle("invalid", !!message);
    $(`${input.id}-error`).textContent = message || "";
  }

  function matches(r) {
    const q = query.toLowerCase();
    const text = `${r.name} ${r.category} ${r.notes}`.toLowerCase();
    return (!q || text.includes(q)) && (!category || r.category === category);
  }

  function renderFilterOptions() {
    const select = $("record-filter");
    const cats = [...new Set(records.map((r) => r.category).filter(Boolean))].sort();
    if (category && !cats.includes(category)) category = "";
    select.innerHTML = "";
    select.add(new Option("All categories", ""));
    cats.forEach((c) => select.add(new Option(c, c)));
    select.value = category;
  }

  function cell(text, className) {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) td.className = className;
    return td;
  }

  const ICONS = {
    edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  };

  function iconButton(label, icon, extra, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "icon-btn " + extra;
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = ICONS[icon];
    b.addEventListener("click", onClick);
    return b;
  }

  function initials(name) {
    const parts = name.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  function nameCell(name) {
    const td = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "name-cell";
    const av = document.createElement("span");
    av.className = "avatar";
    av.textContent = initials(name);
    const label = document.createElement("span");
    label.textContent = name;
    wrap.append(av, label);
    td.appendChild(wrap);
    return td;
  }

  function categoryCell(category) {
    const td = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "pill" + (category ? "" : " none");
    pill.textContent = category || "Uncategorized";
    td.appendChild(pill);
    return td;
  }

  function render() {
    renderFilterOptions();

    const filtered = records.filter(matches);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, pages);
    const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const body = $("records-body");
    body.innerHTML = "";

    if (!visible.length) {
      const tr = document.createElement("tr");
      const td = cell(
        records.length ? "No records match your search." : "No records yet. Add your first one above.",
        "empty"
      );
      td.colSpan = 5;
      tr.appendChild(td);
      body.appendChild(tr);
    }

    visible.forEach((r) => {
      const tr = document.createElement("tr");
      tr.append(
        nameCell(r.name),
        categoryCell(r.category),
        cell(r.notes, "notes"),
        cell(new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))
      );
      const actions = document.createElement("td");
      const wrap = document.createElement("div");
      wrap.className = "row-actions";
      wrap.append(
        iconButton("Edit record", "edit", "", () => openEdit(r.id)),
        iconButton("Delete record", "trash", "danger", () => openDelete(r.id))
      );
      actions.appendChild(wrap);
      tr.appendChild(actions);
      body.appendChild(tr);
    });

    $("record-total").textContent = records.length;
    $("records-count").textContent = `${filtered.length} ${filtered.length === 1 ? "record" : "records"} shown`;
    $("page-info").textContent = `Page ${page} of ${pages}`;
    $("page-prev").disabled = page <= 1;
    $("page-next").disabled = page >= pages;
    $("records-pagination").hidden = filtered.length <= PAGE_SIZE;
  }

  $("record-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.elements["name"].value.trim();
    const cat = form.elements["category"].value.trim();
    setError(form, "name", name ? "" : "Name is required.");
    setError(form, "category", cat ? "" : "Category is required.");
    if (!name || !cat) return;

    records.unshift({
      id: Date.now().toString(),
      name,
      category: form.elements["category"].value.trim(),
      notes: form.elements["notes"].value.trim(),
      createdAt: new Date().toISOString(),
    });
    save();
    form.reset();
    page = 1;
    render();
  });

  $("record-search").addEventListener("input", (e) => { query = e.target.value.trim(); page = 1; render(); });
  $("record-filter").addEventListener("change", (e) => { category = e.target.value; page = 1; render(); });
  $("page-prev").addEventListener("click", () => { page -= 1; render(); });
  $("page-next").addEventListener("click", () => { page += 1; render(); });

  const editDialog = $("edit-dialog");
  const editForm = $("edit-form");

  function openEdit(id) {
    const r = records.find((x) => x.id === id);
    if (!r) return;
    editId = id;
    editForm.elements["name"].value = r.name;
    editForm.elements["category"].value = r.category;
    editForm.elements["notes"].value = r.notes;
    setError(editForm, "name", "");
    setError(editForm, "category", "");
    editDialog.showModal();
  }

  editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = editForm.elements["name"].value.trim();
    const cat = editForm.elements["category"].value.trim();
    setError(editForm, "name", name ? "" : "Name is required.");
    setError(editForm, "category", cat ? "" : "Category is required.");
    if (!name || !cat) return;

    const r = records.find((x) => x.id === editId);
    if (r) {
      r.name = name;
      r.category = editForm.elements["category"].value.trim();
      r.notes = editForm.elements["notes"].value.trim();
      save();
    }
    editDialog.close();
    render();
  });
  $("edit-cancel").addEventListener("click", () => editDialog.close());

  const deleteDialog = $("delete-dialog");

  function openDelete(id) {
    const r = records.find((x) => x.id === id);
    if (!r) return;
    deleteId = id;
    $("delete-message").textContent = `"${r.name}" will be removed. This can't be undone.`;
    deleteDialog.showModal();
  }

  $("delete-confirm").addEventListener("click", () => {
    records = records.filter((x) => x.id !== deleteId);
    save();
    deleteDialog.close();
    render();
  });
  $("delete-cancel").addEventListener("click", () => deleteDialog.close());

  fetchRecords().then((data) => {
    records = data;
    $("records-loading").hidden = true;
    $("records-table-wrap").hidden = false;
    render();
  });
})();
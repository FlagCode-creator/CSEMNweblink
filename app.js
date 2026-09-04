/* Link Home — a personal, installable link launcher.
   Data lives in localStorage; images are downscaled to data URLs. */
(() => {
  "use strict";

  const STORAGE_KEY = "linkhome.items.v1";
  const SYNC_KEY = "linkhome.sync.v1";
  const MAX_ICON_PX = 256; // uploaded images are downscaled to this square

  /** @type {{id:string,name:string,url:string,icon:string}[]} */
  let items = [];
  let editing = false;
  /** @type {{url:string, token:string}|null} */
  let sync = null;

  // ---------- element refs ----------
  const $ = (sel) => document.querySelector(sel);
  const grid = $("#grid");
  const empty = $("#empty");
  const search = $("#search");
  const editBtn = $("#editBtn");
  const menuBtn = $("#menuBtn");
  const menu = $("#menu");
  const fab = $("#fabAdd");
  const dialog = $("#linkDialog");
  const form = $("#linkForm");
  const dialogTitle = $("#dialogTitle");
  const fName = $("#fName");
  const fUrl = $("#fUrl");
  const fIconData = $("#fIconData");
  const fId = $("#fId");
  const fFile = $("#fFile");
  const dropZone = $("#dropZone");
  const iconPreview = $("#iconPreview");
  const dropHint = $("#dropHint");
  const importFile = $("#importFile");
  const toastEl = $("#toast");
  const syncDialog = $("#syncDialog");
  const syncUrl = $("#syncUrl");
  const syncToken = $("#syncToken");
  const syncState = $("#syncState");
  const syncDot = $("#syncDot");

  // ---------- storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      items = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(items)) items = [];
    } catch {
      items = [];
    }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      toast("บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลอาจเต็ม (ลองใช้รูปเล็กลง)");
    }
  }

  // ---------- sync (Google Sheet via Apps Script) ----------
  function loadSync() {
    try {
      const raw = localStorage.getItem(SYNC_KEY);
      sync = raw ? JSON.parse(raw) : null;
      if (sync && !sync.url) sync = null;
    } catch { sync = null; }
  }
  function saveSync() {
    if (sync) localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
    else localStorage.removeItem(SYNC_KEY);
  }
  function setSyncStatus(state, msg) {
    // state: "off" | "ok" | "busy" | "err"
    syncDot.hidden = state === "off";
    syncDot.className = "sync-dot" + (state === "ok" ? " ok" : state === "busy" ? " busy" : state === "err" ? " err" : "");
    if (msg && syncState) syncState.textContent = msg;
  }

  // POST with text/plain avoids a CORS preflight against Apps Script.
  async function apiCall(payload) {
    if (!sync || !sync.url) throw new Error("no sync");
    const res = await fetch(sync.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ token: sync.token || "" }, payload)),
      redirect: "follow",
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "server error");
    return data;
  }

  async function pull() {
    if (!sync) return;
    setSyncStatus("busy", "กำลังดึงข้อมูลจากคลาวด์…");
    try {
      const data = await apiCall({ action: "list" });
      items = (data.items || [])
        .filter((x) => x && (x.name || x.url))
        .map((x) => ({ id: x.id || uid(), name: String(x.name || ""), url: normalizeUrl(x.url), icon: x.icon || "" }));
      save();
      render();
      setSyncStatus("ok", "ซิงก์แล้ว • " + timeNow());
    } catch (e) {
      setSyncStatus("err", "ดึงข้อมูลไม่ได้ (ใช้ข้อมูลในเครื่อง): " + e.message);
    }
  }

  async function push() {
    if (!sync) return;
    setSyncStatus("busy", "กำลังบันทึกขึ้นคลาวด์…");
    try {
      await apiCall({ action: "replaceAll", items });
      setSyncStatus("ok", "ซิงก์แล้ว • " + timeNow());
    } catch (e) {
      setSyncStatus("err", "บันทึกคลาวด์ไม่สำเร็จ (เก็บในเครื่องแล้ว): " + e.message);
      toast("ซิงก์ขึ้นคลาวด์ไม่สำเร็จ — ข้อมูลถูกเก็บในเครื่อง");
    }
  }

  // save locally, then push to cloud if configured
  function persist() {
    save();
    if (sync) push();
  }

  const timeNow = () => new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

  // ---------- helpers ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function normalizeUrl(u) {
    u = (u || "").trim();
    if (!u) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = "https://" + u;
    return u;
  }

  function hostOf(u) {
    try { return new URL(u).hostname; } catch { return ""; }
  }

  // deterministic pleasant gradient from a string, for letter fallbacks
  function colorFor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return `linear-gradient(135deg, hsl(${h} 70% 58%), hsl(${(h + 40) % 360} 70% 48%))`;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (toastEl.hidden = true), 2600);
  }

  // ---------- render ----------
  function render() {
    const q = search.value.trim().toLowerCase();
    const list = q
      ? items.filter((it) => it.name.toLowerCase().includes(q) || it.url.toLowerCase().includes(q))
      : items;

    grid.innerHTML = "";
    empty.hidden = items.length > 0;

    for (const it of list) {
      const tile = document.createElement("a");
      tile.className = "tile";
      tile.href = it.url;
      tile.target = "_blank";
      tile.rel = "noopener noreferrer";
      tile.dataset.id = it.id;
      tile.setAttribute("aria-label", it.name);

      const icon = document.createElement("div");
      icon.className = "tile-icon";
      if (it.icon) {
        const img = document.createElement("img");
        img.src = it.icon;
        img.alt = "";
        img.loading = "lazy";
        icon.appendChild(img);
      } else {
        const fb = document.createElement("div");
        fb.className = "tile-fallback";
        fb.style.background = colorFor(it.name || it.url);
        fb.textContent = (it.name || hostOf(it.url) || "?").trim().charAt(0).toUpperCase();
        icon.appendChild(fb);
      }

      const name = document.createElement("div");
      name.className = "tile-name";
      name.textContent = it.name;

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "✕";
      badge.title = "ลบ";
      badge.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeItem(it.id);
      });

      tile.append(badge, icon, name);
      grid.appendChild(tile);
    }
  }

  // ---------- CRUD ----------
  function removeItem(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    if (!confirm(`ลบ "${it.name}" ?`)) return;
    items = items.filter((x) => x.id !== id);
    persist();
    render();
  }

  function openDialog(item) {
    const isEdit = !!item;
    dialogTitle.textContent = isEdit ? "แก้ไขลิงก์" : "เพิ่มลิงก์";
    fId.value = isEdit ? item.id : "";
    fName.value = isEdit ? item.name : "";
    fUrl.value = isEdit ? item.url : "";
    setPreview(isEdit ? item.icon : "");
    dialog.showModal();
    setTimeout(() => fName.focus(), 50);
  }

  function setPreview(dataUrl) {
    fIconData.value = dataUrl || "";
    if (dataUrl) {
      iconPreview.src = dataUrl;
      iconPreview.hidden = false;
      dropHint.hidden = true;
    } else {
      iconPreview.removeAttribute("src");
      iconPreview.hidden = true;
      dropHint.hidden = false;
    }
  }

  form.addEventListener("submit", (e) => {
    // method="dialog": default already closes; we handle data first
    const name = fName.value.trim();
    const url = normalizeUrl(fUrl.value);
    if (!name || !url) return;

    const id = fId.value;
    if (id) {
      const it = items.find((x) => x.id === id);
      if (it) Object.assign(it, { name, url, icon: fIconData.value });
    } else {
      items.push({ id: uid(), name, url, icon: fIconData.value });
    }
    persist();
    render();
    // allow native dialog close
  });

  // ---------- image handling ----------
  function fileToIcon(file) {
    if (!file || !file.type.startsWith("image/")) {
      toast("ไฟล์นี้ไม่ใช่รูปภาพ");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => downscale(reader.result, setPreview);
    reader.readAsDataURL(file);
  }

  function downscale(srcDataUrl, cb) {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(MAX_ICON_PX, Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d");
      // cover-fit into square
      const scale = Math.max(side / img.width, side / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
      let out;
      try {
        out = canvas.toDataURL("image/webp", 0.9);
        if (!out.startsWith("data:image/webp")) throw new Error("no webp");
      } catch {
        out = canvas.toDataURL("image/png");
      }
      cb(out);
    };
    img.onerror = () => toast("อ่านรูปไม่สำเร็จ");
    img.src = srcDataUrl;
  }

  // ---------- drag & drop reorder (pointer based, works on touch) ----------
  let drag = null;
  grid.addEventListener("pointerdown", (e) => {
    if (!editing) return;
    const tile = e.target.closest(".tile");
    if (!tile || e.target.closest(".badge")) return;
    drag = {
      id: tile.dataset.id,
      el: tile,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      pointerId: e.pointerId,
    };
  });
  grid.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.active && Math.hypot(dx, dy) < 8) return;
    if (!drag.active) {
      drag.active = true;
      drag.el.classList.add("dragging");
      grid.setPointerCapture(drag.pointerId);
    }
    e.preventDefault();
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const target = over && over.closest(".tile");
    if (target && target !== drag.el) {
      const rect = target.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2 ||
        (Math.abs(e.clientY - (rect.top + rect.height / 2)) < 4 && e.clientX > rect.left + rect.width / 2);
      grid.insertBefore(drag.el, after ? target.nextSibling : target);
    }
  });
  function endDrag() {
    if (!drag) return;
    const wasActive = drag.active;
    drag.el.classList.remove("dragging");
    try { grid.releasePointerCapture(drag.pointerId); } catch {}
    if (wasActive) {
      // rebuild order from DOM
      const order = [...grid.querySelectorAll(".tile")].map((t) => t.dataset.id);
      items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      persist();
    }
    drag = null;
  }
  grid.addEventListener("pointerup", endDrag);
  grid.addEventListener("pointercancel", endDrag);

  // tap in edit mode = edit; normal click follows the link
  grid.addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    if (editing) {
      e.preventDefault();
      if (e.target.closest(".badge")) return;
      const it = items.find((x) => x.id === tile.dataset.id);
      if (it) openDialog(it);
    }
  });

  // ---------- edit mode ----------
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("editing", on);
    editBtn.setAttribute("aria-pressed", String(on));
    editBtn.querySelector(".btn-label").textContent = on ? "เสร็จ" : "แก้ไข";
  }

  // ---------- menu ----------
  function toggleMenu(force) {
    const show = force ?? menu.hidden;
    menu.hidden = !show;
    menuBtn.setAttribute("aria-expanded", String(show));
  }
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
      toggleMenu(false);
    }
  });

  // ---------- export / import ----------
  function exportData() {
    const blob = new Blob([JSON.stringify({ app: "link-home", version: 1, items }, null, 2)],
      { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `link-home-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("ส่งออกข้อมูลแล้ว");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const arr = Array.isArray(data) ? data : data.items;
        if (!Array.isArray(arr)) throw new Error("bad");
        const cleaned = arr
          .filter((x) => x && x.name && x.url)
          .map((x) => ({ id: x.id || uid(), name: String(x.name), url: normalizeUrl(x.url), icon: x.icon || "" }));
        if (!cleaned.length) throw new Error("empty");
        const merge = items.length && confirm("รวมกับข้อมูลเดิม? (กด Cancel เพื่อแทนที่ทั้งหมด)");
        items = merge ? items.concat(cleaned) : cleaned;
        persist();
        render();
        toast(`นำเข้า ${cleaned.length} ลิงก์แล้ว`);
      } catch {
        toast("ไฟล์ไม่ถูกต้อง");
      }
    };
    reader.readAsText(file);
  }

  // ---------- sync dialog ----------
  function openSyncDialog() {
    syncUrl.value = sync ? sync.url : "";
    syncToken.value = sync ? sync.token || "" : "";
    syncState.textContent = sync ? "เชื่อมต่ออยู่" : "ยังไม่ได้เชื่อมต่อ";
    syncDialog.showModal();
  }

  function readSyncInputs() {
    const url = syncUrl.value.trim();
    const token = syncToken.value.trim();
    if (!url) { toast("ใส่ Web app URL ก่อน"); return null; }
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
      if (!confirm("URL ไม่เหมือนของ Apps Script (script.google.com/.../exec) ใช้ต่อไหม?")) return null;
    }
    return { url, token };
  }

  $("#syncTest").addEventListener("click", async () => {
    const cfg = readSyncInputs();
    if (!cfg) return;
    const prev = sync;
    sync = cfg;
    syncState.textContent = "กำลังทดสอบ…";
    try {
      await apiCall({ action: "ping" });
      syncState.textContent = "✅ เชื่อมต่อสำเร็จ! กด ‘บันทึก & ซิงก์’ เพื่อเริ่มใช้";
    } catch (e) {
      syncState.textContent = "❌ เชื่อมต่อไม่ได้: " + e.message + " (ตรวจ URL/TOKEN และการ Deploy = Anyone)";
      sync = prev;
    }
  });

  $("#syncSave").addEventListener("click", async () => {
    const cfg = readSyncInputs();
    if (!cfg) return;
    sync = cfg;
    saveSync();
    setSyncStatus("busy", "กำลังเชื่อมต่อ…");
    // First connect: if cloud has data, pull it; otherwise push local up.
    try {
      const data = await apiCall({ action: "list" });
      const remote = (data.items || []).filter((x) => x && (x.name || x.url));
      if (remote.length && items.length) {
        const useRemote = confirm(`คลาวด์มี ${remote.length} ลิงก์, ในเครื่องมี ${items.length} ลิงก์\nกด OK = ใช้ของคลาวด์ / Cancel = อัปของในเครื่องขึ้นแทน`);
        if (useRemote) await pull(); else await push();
      } else if (remote.length) {
        await pull();
      } else {
        await push();
      }
      toast("เปิดการซิงก์แล้ว");
      syncDialog.close();
    } catch (e) {
      setSyncStatus("err", "เชื่อมต่อไม่สำเร็จ: " + e.message);
    }
  });

  $("#syncDisconnect").addEventListener("click", () => {
    sync = null;
    saveSync();
    setSyncStatus("off");
    toast("ปิดการซิงก์แล้ว (ข้อมูลยังอยู่ในเครื่อง)");
    syncDialog.close();
  });

  $("#closeSync").addEventListener("click", () => syncDialog.close());

  // ---------- events ----------
  editBtn.addEventListener("click", () => setEditing(!editing));
  menuBtn.addEventListener("click", () => toggleMenu());
  fab.addEventListener("click", () => openDialog(null));
  $("#emptyAddBtn").addEventListener("click", () => openDialog(null));
  search.addEventListener("input", render);

  menu.addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    toggleMenu(false);
    if (action === "add") openDialog(null);
    else if (action === "sync") openSyncDialog();
    else if (action === "export") exportData();
    else if (action === "import") importFile.click();
    else if (action === "reset") {
      if (confirm("ล้างลิงก์ทั้งหมด? การกระทำนี้ย้อนกลับไม่ได้")) {
        items = []; persist(); render(); toast("ล้างข้อมูลแล้ว");
      }
    }
  });
  importFile.addEventListener("change", (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    importFile.value = "";
  });

  // dialog buttons
  $("#closeDialog").addEventListener("click", () => dialog.close());
  $("#cancelBtn").addEventListener("click", () => dialog.close());
  $("#pickFile").addEventListener("click", () => fFile.click());
  $("#clearIcon").addEventListener("click", () => setPreview(""));
  $("#useFavicon").addEventListener("click", () => {
    const host = hostOf(normalizeUrl(fUrl.value));
    if (!host) { toast("ใส่ URL ก่อน"); return; }
    setPreview(`https://www.google.com/s2/favicons?domain=${host}&sz=128`);
    toast("ดึง favicon แล้ว (ต้องต่อเน็ตเพื่อแสดง)");
  });

  fFile.addEventListener("change", (e) => e.target.files[0] && fileToIcon(e.target.files[0]));
  dropZone.addEventListener("click", () => fFile.click());
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fFile.click(); }
  });
  ["dragenter", "dragover"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); }));
  dropZone.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) fileToIcon(f);
  });
  // paste image anywhere while dialog is open
  document.addEventListener("paste", (e) => {
    if (!dialog.open) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) { fileToIcon(item.getAsFile()); toast("วางรูปแล้ว"); }
  });

  // close menu on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleMenu(false);
  });

  // ---------- seed on first run ----------
  function seedIfEmpty() {
    if (localStorage.getItem(STORAGE_KEY) !== null) return;
    items = [
      { id: uid(), name: "GitHub", url: "https://github.com", icon: "" },
      { id: uid(), name: "YouTube", url: "https://youtube.com", icon: "" },
      { id: uid(), name: "Gmail", url: "https://mail.google.com", icon: "" },
    ];
    save();
  }

  // ---------- boot ----------
  load();
  loadSync();
  if (sync) {
    setSyncStatus("busy", "กำลังเชื่อมต่อ…");
    render();      // show cached data instantly
    pull();        // then refresh from cloud
  } else {
    setSyncStatus("off");
    seedIfEmpty();
    render();
  }

  // service worker (PWA / offline)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();

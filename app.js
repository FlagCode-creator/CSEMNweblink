/* Link Home — a personal, installable link launcher.
   Data lives in localStorage; images are downscaled to data URLs. */
(() => {
  "use strict";

  const STORAGE_KEY = "linkhome.items.v1";
  const SYNC_KEY = "linkhome.sync.v1";
  const ORDER_KEY = "linkhome.order.v1"; // per-viewer icon order (local only)
  const MAX_ICON_PX = 256; // uploaded images are downscaled to this square

  /** @type {{id:string,name:string,url:string,icon:string}[]} */
  let items = [];
  let editing = false;
  let reordering = false;   // iOS-like rearrange mode (entered by long-press)
  let order = [];           // preferred icon order for THIS device only
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

  // ---------- personal icon order (local to this device, never synced) ----------
  function loadOrder() {
    try { const r = localStorage.getItem(ORDER_KEY); const a = r ? JSON.parse(r) : []; order = Array.isArray(a) ? a : []; }
    catch { order = []; }
  }
  function saveOrder() { try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch {} }
  // items sorted by this viewer's saved order; unknown/new items keep their natural order at the end
  function orderedItems() {
    if (!order.length) return items.slice();
    const pos = new Map(order.map((id, i) => [id, i]));
    return items.slice().sort((a, b) => {
      const pa = pos.has(a.id) ? pos.get(a.id) : Infinity;
      const pb = pos.has(b.id) ? pos.get(b.id) : Infinity;
      return pa - pb;
    });
  }

  // ---------- sync (Google Sheet via Apps Script) ----------
  // Baked-in default from config.js (auto-sync on every device, no manual setup)
  function defaultSync() {
    const c = window.LINKHOME_CONFIG;
    return c && c.syncUrl ? { url: c.syncUrl, token: c.syncToken || "" } : null;
  }
  function loadSync() {
    try {
      const raw = localStorage.getItem(SYNC_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed === "off") { sync = null; return; }        // user turned it off
        if (parsed && parsed.url) { sync = parsed; return; }   // user's own override
      }
    } catch {}
    sync = defaultSync();   // no saved choice → use auto-sync config if present
  }
  function saveSync() {
    if (sync) localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
    else localStorage.setItem(SYNC_KEY, JSON.stringify("off")); // remember "off" so config doesn't re-enable
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
      const remote = (data.items || [])
        .filter((x) => x && (x.name || x.url))
        .map((x) => ({ id: x.id || uid(), name: String(x.name || ""), url: normalizeUrl(x.url), icon: x.icon || "" }));
      // Safety: if the cloud is empty but this device has links, seed the cloud
      // instead of wiping local data (avoids data loss on first-time sync).
      if (!remote.length && items.length) {
        await push();
        return;
      }
      // only re-render when the cloud data actually differs from what's shown
      if (JSON.stringify(remote) !== JSON.stringify(items)) {
        items = remote;
        save();
        render();
      }
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
    const base = orderedItems();
    const list = q
      ? base.filter((it) => it.name.toLowerCase().includes(q) || it.url.toLowerCase().includes(q))
      : base;

    grid.innerHTML = "";
    empty.hidden = items.length > 0;

    for (const it of list) {
      const tile = document.createElement("a");
      tile.className = "tile";
      tile.href = it.url;
      tile.target = "_blank";
      tile.rel = "noopener noreferrer";
      tile.dataset.id = it.id;
      tile.draggable = false; // we handle dragging ourselves (prevents native link drag)
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

  // ---------- reorder: iOS-like, PERSONAL layout saved locally ----------
  // Long-press an icon to enter rearrange mode (icons jiggle), then drag to move.
  // The new order is saved per-device (localStorage) and is NOT synced to the cloud,
  // so each visitor arranges their own home screen without changing anyone else's.
  let drag = null;
  let lp = null;             // pending long-press
  let suppressClick = false;

  function setReordering(on) {
    reordering = on;
    document.body.classList.toggle("reordering", on);
    if (on) toast("ลากไอคอนเพื่อจัดตำแหน่งของคุณเอง • แตะพื้นที่ว่างเมื่อเสร็จ");
  }

  function beginDrag(tile, x, y, pointerId, immediate) {
    drag = { el: tile, startX: x, startY: y, active: false, pointerId, clone: null, grabDX: 0, grabDY: 0 };
    if (immediate) activateDrag(x, y);
  }

  // lift the tile: make a floating copy that follows the pointer, leave a dashed gap
  function activateDrag(x, y) {
    if (!drag || drag.active) return;
    drag.active = true;
    const el = drag.el;
    const r = el.getBoundingClientRect();
    drag.grabDX = x - r.left;
    drag.grabDY = y - r.top;
    const clone = el.cloneNode(true);
    clone.className = "tile drag-clone";
    clone.style.width = r.width + "px";
    clone.style.height = r.height + "px";
    drag.clone = clone;
    document.body.appendChild(clone);
    moveClone(x, y);
    el.classList.add("placeholder");
    try { grid.setPointerCapture(drag.pointerId); } catch {}
  }

  function moveClone(x, y) {
    if (drag && drag.clone) {
      drag.clone.style.left = (x - drag.grabDX) + "px";
      drag.clone.style.top = (y - drag.grabDY) + "px";
    }
  }

  // nearest slot to the pointer — works in the gaps, not only on top of a tile
  function slotRef(x, y) {
    const tiles = [...grid.querySelectorAll(".tile:not(.placeholder)")];
    let best = null, bestD = Infinity;
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bestD) { bestD = d; best = { t, cx, cy, r }; }
    }
    if (!best) return null;
    const after = y > best.cy + best.r.height / 2 ||
      (y >= best.cy - best.r.height / 2 && x > best.cx);
    return after ? best.t.nextSibling : best.t;
  }

  // move the dragged tile to a new slot; slide the others there (FLIP animation)
  function reorderTo(ref) {
    const el = drag.el;
    if (ref === el || ref === el.nextSibling) return;
    const movers = [...grid.querySelectorAll(".tile")];
    const first = new Map(movers.map((t) => [t, t.getBoundingClientRect()]));
    grid.insertBefore(el, ref);
    for (const t of movers) {
      if (t === el) continue;
      const a = first.get(t), b = t.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (dx || dy) {
        t.style.transition = "none";
        t.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          t.style.transition = "transform .18s ease";
          t.style.transform = "";
        });
      }
    }
  }

  grid.addEventListener("dragstart", (e) => e.preventDefault()); // stop native <a> drag on desktop

  grid.addEventListener("pointerdown", (e) => {
    suppressClick = false;
    const tile = e.target.closest(".tile");
    if (!tile || e.target.closest(".badge")) return;
    if (search.value.trim()) return; // don't rearrange a filtered view

    if (editing || reordering) {
      beginDrag(tile, e.clientX, e.clientY, e.pointerId, false);
    } else {
      // hold ~0.4s to enter rearrange mode, then lift & drag this tile
      lp = {
        tile, x: e.clientX, y: e.clientY, pointerId: e.pointerId,
        timer: setTimeout(() => {
          lp = null;
          setReordering(true);
          beginDrag(tile, e.clientX, e.clientY, e.pointerId, true);
        }, 400),
      };
    }
  });

  grid.addEventListener("pointermove", (e) => {
    if (lp && lp.timer && e.pointerId === lp.pointerId) {
      if (Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.timer); lp = null; }
      return;
    }
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 8) return;
      activateDrag(e.clientX, e.clientY);
    }
    e.preventDefault();
    moveClone(e.clientX, e.clientY);
    reorderTo(slotRef(e.clientX, e.clientY));
  });

  function endPointer() {
    if (lp && lp.timer) { clearTimeout(lp.timer); lp = null; }
    if (!drag) return;
    const wasActive = drag.active;
    const { el, clone } = drag;
    try { grid.releasePointerCapture(drag.pointerId); } catch {}
    if (wasActive) {
      suppressClick = true;
      // save this device's personal order from the DOM (local only — never pushed)
      order = [...grid.querySelectorAll(".tile")].map((t) => t.dataset.id);
      saveOrder();
      // settle the lifted copy into its final slot, then clean up
      if (clone && el) {
        const r = el.getBoundingClientRect();
        clone.style.transition = "left .16s ease, top .16s ease, transform .16s ease";
        clone.style.left = r.left + "px";
        clone.style.top = r.top + "px";
        clone.style.transform = "scale(1)";
        setTimeout(() => { clone.remove(); el.classList.remove("placeholder"); }, 160);
      }
    } else {
      if (clone) clone.remove();
      if (el) el.classList.remove("placeholder");
    }
    drag = null;
  }
  grid.addEventListener("pointerup", endPointer);
  grid.addEventListener("pointercancel", endPointer);

  // Tap: edit mode opens the editor; rearrange mode ignores; otherwise follow the link.
  grid.addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
    if (reordering) { e.preventDefault(); return; }
    if (editing) {
      e.preventDefault();
      if (e.target.closest(".badge")) return;
      const it = items.find((x) => x.id === tile.dataset.id);
      if (it) openDialog(it);
    }
  });

  // tap empty space to leave rearrange mode
  document.addEventListener("pointerdown", (e) => {
    if (reordering && !drag && !e.target.closest(".tile") && !e.target.closest(".dialog") && !e.target.closest(".menu")) {
      setReordering(false);
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

  const helpDialog = $("#helpDialog");
  $("#helpBtn").addEventListener("click", () => helpDialog.showModal());
  $("#closeHelp").addEventListener("click", () => helpDialog.close());
  $("#helpOk").addEventListener("click", () => helpDialog.close());

  // show the logo image in the header if icons/logo.png exists; else keep the dot
  const brandLogo = $("#brandLogo");
  const brandDot = document.querySelector(".brand-dot");
  if (brandLogo) {
    const useLogo = () => { brandLogo.hidden = false; if (brandDot) brandDot.hidden = true; };
    brandLogo.addEventListener("load", useLogo);
    brandLogo.addEventListener("error", () => { brandLogo.hidden = true; });
    if (brandLogo.complete && brandLogo.naturalWidth > 0) useLogo();
  }

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

  // Escape closes menu / leaves rearrange / leaves edit mode
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    toggleMenu(false);
    if (reordering) setReordering(false);
    if (editing) setEditing(false);
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
  loadOrder();
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

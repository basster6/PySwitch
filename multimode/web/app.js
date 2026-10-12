// Captain Multimode editor: edits multimode profiles (JSON) and writes them, plus the firmware files,
// to a MIDI Captain drive using the File System Access API (Chrome / Edge).
import { presetsFor } from "./presets.js";
import { namespace, renderTemplate, evalValue } from "./pyeval.js";
import { t, lang, setLang, LANGS, pick, assign, applyStatic } from "./i18n.js";

// Mirrors multimode/overlay/lib/multimode/devices.py
const DEVICES = {
  nano4: { title: "MIDI Captain Nano 4", rows: [["1", "2"], ["A", "B"]] },
  mini6: { title: "MIDI Captain Mini 6", rows: [["1", "2", "3"], ["A", "B", "C"]] },
  mc10:  { title: "MIDI Captain 10", rows: [["1", "2", "3", "4", "Up"], ["A", "B", "C", "D", "Down"]] },
};

// Mirrors content/lib/pyswitch/colors.py
const COLORS = {
  WHITE: [255, 255, 255], YELLOW: [255, 255, 0], DARK_YELLOW: [130, 130, 0], ORANGE: [255, 125, 0],
  RED: [255, 0, 0], LIGHT_RED: [255, 100, 100], PINK: [255, 125, 70], PURPLE: [180, 0, 120],
  DARK_PURPLE: [100, 0, 65], LIGHT_GREEN: [100, 255, 100], GREEN: [0, 255, 0], DARK_GREEN: [73, 110, 41],
  TURQUOISE: [64, 242, 208], BLUE: [0, 0, 255], LIGHT_BLUE: [100, 100, 255], DARK_BLUE: [0, 0, 120],
  GRAY: [190, 190, 190], DARK_GRAY: [50, 50, 50], BLACK: [0, 0, 0], CYAN: [0, 255, 255],
};

// Titles are translation keys (see i18n.js), resolved when rendering
const TRIGGERS = [
  { id: "short", title: "trig.short" },
  { id: "long", title: "trig.long" },
  { id: "double", title: "trig.double", hint: "trig.doubleHint" },
];

// Operation types and their fields: [attribute, label key, placeholder (key if it starts with "f.")]
const OPS = {
  cc:     { title: "op.cc", fields: [["cc", "f.cc", "44"], ["val", "f.val", "127"], ["ch", "f.ch", "f.chDefault"]] },
  pc:     { title: "op.pc", fields: [["pc", "f.pc", "0"], ["ch", "f.ch", "f.chDefault"]] },
  note:   { title: "op.note", fields: [["note", "f.note", "60"], ["vel", "f.vel", "127"], ["ch", "f.ch", "f.chDefault"]] },
  raw:    { title: "op.raw", fields: [["raw", "f.raw", "176, 44, 127"]] },
  set:    { title: "op.set", fields: [["set", "f.var", "gig"], ["to", "f.to", "1"]] },
  toggle: { title: "op.toggle", fields: [["toggle", "f.var", "gig"]] },
  inc:    { title: "op.inc", fields: [["inc", "f.var", "sc"], ["by", "f.by", "1"], ["mod", "f.mod", ""], ["lo", "f.lo", "0"], ["min", "f.min", ""], ["max", "f.max", ""]] },
  mode:   { title: "op.mode", fields: [["mode", "f.target", "next"]] },
  if:     { title: "op.if", fields: [["if", "f.if", "gig"], ["then", "f.then", "[]"], ["else", "f.else", "[]"]] },
};
const ph = v => (v.startsWith("f.") ? t(v) : v);
const NAME_FIELDS = new Set(["set", "toggle", "inc", "mode"]);
const JSON_FIELDS = new Set(["then", "else"]);

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
};

const S = {
  dir: null,             // FileSystemDirectoryHandle of the device drive
  modes: null,           // modes.json
  profiles: {},          // name -> profile
  mode: null,            // selected profile name
  layer: 0,
  key: null,
  view: "usage",
  dirty: false,
};

const prof = () => S.profiles[S.mode];
const device = () => DEVICES[S.modes.device] || DEVICES.mini6;
const deviceKeys = () => device().rows.flat();

// Transient result message, fixed at the bottom so it is visible wherever the page is scrolled.
// Errors stay until closed.
let toastTimer = null;
function toast(text, kind = "ok") {
  const el = $("#toast");
  clearTimeout(toastTimer);
  el.className = "toast " + kind;
  el.replaceChildren(h("span", {}, text), h("button", { class: "icon", "aria-label": t("toast.close"), title: t("toast.close"), onclick: () => { el.hidden = true; } }, "✕"));
  el.hidden = false;
  if (kind !== "error") toastTimer = setTimeout(() => { el.hidden = true; }, 7000);
}

function notice(text, kind = "") {
  const n = $("#notice");
  n.hidden = !text;
  n.className = "notice " + kind;
  n.textContent = text || "";
}

function markDirty() {
  S.dirty = true;
  renderSaveState();
}

// Save button and the status line below it
function renderSaveState() {
  const b = $("#btnSave");
  b.disabled = !S.dir || S.saving;
  b.textContent = S.saving ? t("save.saving") : S.justSaved ? t("save.saved") : t("side.save");
  b.classList.toggle("dirty", !!(S.dir && S.dirty));
  const st = $("#saveState");
  st.className = "save-state" + (S.dirty ? " dirty" : "");
  st.textContent = !S.dir ? "" : S.dirty ? t("save.statusDirty")
    : S.lastSaved ? t("save.statusSaved", { time: S.lastSaved.toLocaleTimeString(document.documentElement.lang, { hour: "2-digit", minute: "2-digit" }) })
    : t("save.statusLoaded");
}

/* ---------- Loading ---------- */

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url + ": " + r.status);
  return r.json();
}

/* Descriptions are only used by the editor, so they live in a separate file on the device
   (profiles/<name>.desc.json) and the firmware never has to parse them. */

function splitDesc(p) {
  const prof = structuredClone(p);
  const desc = { layers: [] };
  if (prof.desc) { desc.profile = prof.desc; delete prof.desc; }
  for (const l of prof.layers || []) {
    const d = {};
    if (l.desc) { d.desc = l.desc; delete l.desc; }
    for (const [k, kd] of Object.entries(l.keys || {})) {
      if (kd.desc) { (d.keys = d.keys || {})[k] = kd.desc; delete kd.desc; }
    }
    desc.layers.push(d);
  }
  return [prof, desc];
}

function mergeDesc(p, desc) {
  if (!desc) return p;
  if (desc.profile) p.desc = desc.profile;
  (desc.layers || []).forEach((d, i) => {
    const l = p.layers?.[i];
    if (!l) return;
    if (d.desc) l.desc = d.desc;
    for (const [k, v] of Object.entries(d.keys || {})) if (l.keys?.[k]) l.keys[k].desc = v;
  });
  return p;
}

// Writes all profiles and returns { path: content } of the written files
async function writeProfiles(dir) {
  const files = {};
  for (const n of S.modes.modes) {
    const [prof, desc] = splitDesc(S.profiles[n]);
    files[`profiles/${n}.json`] = JSON.stringify(prof, null, 2) + "\n";
    files[`profiles/${n}.desc.json`] = JSON.stringify(desc, null, 1) + "\n";
  }
  files["profiles/modes.json"] = JSON.stringify(S.modes, null, 2) + "\n";
  for (const [path, text] of Object.entries(files)) await writeFile(dir, path, text);
  return files;
}

async function loadDefaults() {
  S.modes = await fetchJson("profiles/modes.json");
  const names = await fetchJson("profiles/index.json").catch(() => S.modes.modes);
  for (const n of names) {
    S.profiles[n] = mergeDesc(await fetchJson(`profiles/${n}.json`), await fetchJson(`profiles/${n}.desc.json`).catch(() => null));
  }
  S.mode = S.modes.modes[0];
  try { S.manifest = await fetchJson("firmware/manifest.json"); } catch { S.manifest = null; }
}

/* ---------- Device file access ---------- */

async function getHandle(dir, path, create = false) {
  const parts = path.split("/");
  let d = dir;
  for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i], { create });
  return d.getFileHandle(parts[parts.length - 1], { create });
}

async function readText(dir, path) {
  try { return await (await (await getHandle(dir, path)).getFile()).text(); }
  catch { return null; }
}

async function readBytes(dir, path) {
  try { return new Uint8Array(await (await (await getHandle(dir, path)).getFile()).arrayBuffer()); }
  catch { return null; }
}

async function writeFile(dir, path, data) {
  const fh = await getHandle(dir, path, true);
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

async function sha256(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function connect() {
  if (!("showDirectoryPicker" in window)) {
    notice(t("conn.unsupported"), "error");
    return;
  }
  let dir;
  try { dir = await window.showDirectoryPicker({ id: "midicaptain", mode: "readwrite" }); }
  catch { return; }

  const boot = await readText(dir, "boot_out.txt");
  if (!boot || !boot.includes("CircuitPython")) {
    notice(t("conn.noBootOut"), "error");
    return;
  }
  S.dir = dir;
  S.boot = boot.split("\n")[0].trim();
  S.cp = (S.boot.match(/CircuitPython (\d+)\.(\d+)\.?(\d*)/) || []).slice(1).map(Number);
  S.installed = (await readText(dir, "lib/multimode/VERSION"))?.trim() || null;
  S.kind = S.installed ? "multimode" : (await exists(dir, "lib/pyswitch")) ? "pyswitch" : "other";
  S.backup = null;
  S.skipBackup = false;
  S.installDone = false;
  if (S.kind !== "multimode") S.view = "install";

  const modesText = await readText(dir, "profiles/modes.json");
  if (modesText) {
    try {
      const modes = JSON.parse(modesText);
      const profiles = {};
      for (const n of modes.modes) {
        const text = await readText(dir, `profiles/${n}.json`);
        const desc = await readText(dir, `profiles/${n}.desc.json`);
        if (text) profiles[n] = mergeDesc(JSON.parse(text), desc ? JSON.parse(desc) : null);
      }
      S.modes = modes;
      Object.assign(S.profiles, profiles);
      S.mode = modes.modes.find(n => S.profiles[n]) || S.mode;
      S.layer = 0; S.key = null;
      notice(t("conn.loaded", { list: modes.modes.join(", ") }), "ok");
    } catch (e) {
      notice(t("conn.loadFailed", { e: e.message }), "error");
    }
  } else {
    notice("");
  }
  S.dirty = false;
  S.lastSaved = null;
  render();
  checkFirmware();
}

function validate() {
  const errs = [];
  for (const n of S.modes.modes) {
    const p = S.profiles[n];
    if (!p) { errs.push(t("val.missing", { n })); continue; }
    const names = new Set([...Object.keys(p.state || {}), ...(p.vars || []).map(v => v[0])]);
    for (const l of p.layers || []) {
      for (const [k, kd] of Object.entries(l.keys || {})) {
        const where = `${n} / ${l.name} / ${k}`;
        for (const tr of TRIGGERS) {
          const walk = ops => (ops || []).forEach(op => {
            const type = Object.keys(OPS).find(o => o in op);
            if (!type) errs.push(t("val.unknownOp", { where, op: JSON.stringify(op) }));
            for (const a of ["set", "toggle", "inc"]) {
              if (a in op && !names.has(op[a])) errs.push(t("val.unknownVar", { where, v: op[a] }));
            }
            if (op.mode && !["next", "prev", ...S.modes.modes].includes(op.mode)) errs.push(t("val.unknownMode", { where, v: op.mode }));
            walk(op.then); walk(op.else);
          });
          walk(kd[tr.id]);
        }
      }
    }
  }
  if (!S.modes.modes.includes(S.modes.default)) errs.push(t("val.default"));
  return errs;
}

async function save() {
  const errs = validate();
  if (errs.length) { toast(t("save.invalid", { list: errs.join(" · ") }), "error"); return; }
  if (!S.dir) { toast(t("save.connectFirst"), "error"); return; }
  S.saving = true;
  renderSaveState();
  try {
    const files = await writeProfiles(S.dir);
    // Read everything back, so a successful message really means the device has the data
    for (const [path, text] of Object.entries(files)) {
      if ((await readText(S.dir, path)) !== text) throw Object.assign(new Error(path), { mismatch: path });
    }
    S.dirty = false;
    S.lastSaved = new Date();
    S.justSaved = true;
    setTimeout(() => { S.justSaved = false; renderSaveState(); }, 2500);
    notice("");
    toast(t("save.verified", { n: Object.keys(files).length }), "ok");
  } catch (e) {
    toast(e.mismatch ? t("save.mismatch", { file: e.mismatch }) : t("save.failed", { e: e.message }), "error");
  }
  S.saving = false;
  render();
}

async function installFirmware(fromWizard = false) {
  if (!S.dir || !S.manifest) return;
  const files = S.manifest.files;
  let written = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      notice(t("fw.checking", { i: i + 1, n: files.length, path: f.path }));
      const cur = await readBytes(S.dir, f.path);
      if (cur && cur.length === f.size && await sha256(cur) === f.sha256) continue;
      const r = await fetch("firmware/" + f.path, { cache: "no-cache" });
      if (!r.ok) throw new Error(f.path + ": " + r.status);
      await writeFile(S.dir, f.path, new Uint8Array(await r.arrayBuffer()));
      written++;
    }
    if (fromWizard) { S.fwDiff = 0; return; }
    const hasProfiles = await readText(S.dir, "profiles/modes.json");
    if (!hasProfiles) await writeProfiles(S.dir);
    S.installed = S.manifest.version;
    S.fwDiff = 0;
    notice(t("fw.done", { v: S.manifest.version, n: written }), "ok");
  } catch (e) {
    if (fromWizard) throw e;
    notice(t("fw.failed", { e: e.message }), "error");
  }
  if (!fromWizard) render();
}

// Compares the firmware files on the device with the manifest of the latest build (the version file is
// ignored: it only names the build). Sets S.fwDiff to the number of differing files.
async function checkFirmware() {
  S.fwDiff = null;
  if (!S.dir || !S.manifest || S.kind !== "multimode") return;
  S.fwChecking = true;
  renderSide();
  let diff = 0;
  for (const f of S.manifest.files) {
    if (f.path === "lib/multimode/VERSION") continue;
    const cur = await readBytes(S.dir, f.path);
    if (!cur || cur.length !== f.size || await sha256(cur) !== f.sha256) diff++;
  }
  S.fwDiff = diff;
  S.fwChecking = false;
  renderSide();
}

/* ---------- Install wizard ---------- */

// Entries the operating system creates on the drive; never copied or deleted
const SYSTEM_ENTRIES = new Set([".fseventsd", ".Trashes", ".Spotlight-V100", "System Volume Information", ".metadata_never_index", ".DS_Store", "boot_out.txt"]);
// Kept on the device when cleaning up (the original firmware needs it for a later restore)
const KEEP_ENTRIES = new Set(["license", "License", "LICENSE"]);
const SUPPORTED_CP = 7;   // The .mpy libraries of PySwitch are bytecode version 5 (CircuitPython 7.x)

async function exists(dir, path) {
  let d = dir;
  for (const part of path.split("/")) {
    try { d = await d.getDirectoryHandle(part); }
    catch { try { await d.getFileHandle(part); return true; } catch { return false; } }
  }
  return true;
}

async function copyTree(src, dst, progress, skip = SYSTEM_ENTRIES) {
  let n = 0;
  for await (const [name, handle] of src.entries()) {
    if (skip.has(name) || name.startsWith("._")) continue;
    if (handle.kind === "directory") {
      n += await copyTree(handle, await dst.getDirectoryHandle(name, { create: true }), progress, skip);
    } else {
      const w = await (await dst.getFileHandle(name, { create: true })).createWritable();
      await w.write(await handle.getFile());
      await w.close();
      progress(++n, name);
    }
  }
  return n;
}

async function backupDevice() {
  let target;
  try { target = await window.showDirectoryPicker({ id: "mcbackup", mode: "readwrite", startIn: "documents" }); } catch { return; }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1-");
  const name = `midicaptain-backup-${stamp}`;
  try {
    const dst = await target.getDirectoryHandle(name, { create: true });
    await writeFile(dst, "boot_out.txt", (await readText(S.dir, "boot_out.txt")) || "");
    const n = await copyTree(S.dir, dst, (i, f) => notice(t("inst.backingUp", { i, f })));
    S.backup = { name, files: n };
    notice(t("inst.backedUp", { name, n }), "ok");
  } catch (e) {
    notice(t("inst.backupFailed", { e: e.message }), "error");
  }
  render();
}

async function cleanDevice() {
  const removed = [];
  for await (const [name] of S.dir.entries()) {
    if (SYSTEM_ENTRIES.has(name) || KEEP_ENTRIES.has(name) || name.startsWith("._")) continue;
    await S.dir.removeEntry(name, { recursive: true });
    removed.push(name);
  }
  return removed;
}

async function runInstall() {
  const clean = $("#instClean")?.checked;
  const dev = $("#instDevice")?.value || S.modes.device;
  try {
    if (clean) {
      notice(t("inst.cleaning"));
      await cleanDevice();
    }
    S.modes.device = dev;
    await installFirmware(true);
    await writeProfiles(S.dir);
    S.kind = "multimode";
    S.dirty = false;
    S.installDone = true;
    notice(t("inst.done"), "ok");
  } catch (e) {
    notice(t("inst.failed", { e: e.message }), "error");
  }
  render();
}

async function restoreBackup() {
  let src;
  try { src = await window.showDirectoryPicker({ id: "mcbackup", mode: "read" }); } catch { return; }
  if (!(await readText(src, "boot_out.txt")) || !(await exists(src, "code.py"))) {
    notice(t("inst.notBackup"), "error");
    return;
  }
  try {
    notice(t("inst.wiping"));
    await cleanDevice();
    const n = await copyTree(src, S.dir, (i, f) => notice(t("inst.restoring", { i, f })));
    S.kind = "other"; S.installed = null;
    notice(t("inst.restored", { n }), "ok");
  } catch (e) {
    notice(t("inst.restoreFailed", { e: e.message }), "error");
  }
  render();
}

function renderInstall() {
  const v = $("#view-install");
  const step = (n, title, state, ...body) => h("section", { class: "step " + state },
    h("div", { class: "step-no", "aria-hidden": "true" }, state === "done" ? "✓" : String(n)),
    h("div", { class: "step-body" }, h("h3", {}, title), ...body));

  if (!S.dir) {
    v.replaceChildren(
      h("p", { class: "lead" }, t("inst.lead")),
      step(1, t("inst.s1"), "todo",
        h("p", {}, t("inst.s1a"), h("b", {}, t("inst.s1b")), t("inst.s1c")),
        h("button", { class: "primary", onclick: connect }, t("conn.connect")),
        h("p", { class: "hint" }, t("inst.s1hint"))));
    return;
  }

  const cpOk = S.cp?.[0] === SUPPORTED_CP;
  const kindText = t("inst.kind." + S.kind);

  const cpBody = cpOk
    ? [h("p", {}, `${S.boot.replace("Adafruit ", "")} · ${kindText}`)]
    : [
        h("p", { class: "err" }, t("inst.cpBad", { v: S.cp.join(".") })),
        h("ol", {},
          h("li", {}, t("inst.cp1")),
          h("li", {}, h("a", { href: "https://adafruit-circuit-python.s3.amazonaws.com/index.html?prefix=bin/raspberry_pi_pico/en_US/", target: "_blank", rel: "noopener" }, "CircuitPython 7.3.3 (raspberry_pi_pico, en_US) .uf2"), t("inst.cp2")),
          h("li", {}, t("inst.cp3")),
          h("li", {}, t("inst.cp4"))),
      ];

  const backupDone = !!S.backup;
  const allowNoBackup = S.kind !== "other";
  const canInstall = cpOk && (backupDone || (allowNoBackup && S.skipBackup));

  v.replaceChildren(...[
    step(1, t("inst.check"), cpOk ? "done" : "warn", ...cpBody),
    step(2, t("inst.s2"), backupDone ? "done" : "todo",
      h("p", {}, t("inst.s2text")),
      h("button", { class: backupDone ? "" : "primary", onclick: backupDevice }, backupDone ? t("inst.backupAgain") : t("inst.backup")),
      backupDone ? h("p", { class: "hint" }, t("inst.backupSaved", { name: S.backup.name, n: S.backup.files })) : null,
      allowNoBackup && !backupDone ? h("label", { class: "field check" }, h("input", { type: "checkbox", id: "instSkip", checked: !!S.skipBackup, onchange: e => { S.skipBackup = e.target.checked; render(); } }), h("span", {}, t("inst.skip"))) : null),
    step(3, t("inst.s3"), S.installDone ? "done" : "todo",
      h("label", { class: "field" }, h("span", {}, t("inst.model")),
        h("select", { id: "instDevice" }, ...Object.entries(DEVICES).map(([id, d]) => h("option", { value: id, selected: id === S.modes.device }, d.title)))),
      h("label", { class: "field check" }, h("input", { type: "checkbox", id: "instClean", checked: S.kind !== "multimode" }),
        h("span", {}, t("inst.clean"))),
      h("p", { class: "hint" }, t("inst.writes", { v: S.manifest?.version || "?", n: S.manifest?.files.length || 0, m: S.modes.modes.length, list: S.modes.modes.join(", ") })),
      h("button", { class: "primary", disabled: !canInstall || !S.manifest, onclick: runInstall }, t("inst.go")),
      !cpOk ? h("p", { class: "hint" }, t("inst.needCp")) : (!canInstall ? h("p", { class: "hint" }, t("inst.needBackup")) : null)),
    step(4, t("inst.s4"), S.installDone ? "todo" : "later",
      h("ol", {},
        h("li", {}, t("inst.s4a")),
        h("li", {}, t("inst.s4b1"), h("b", {}, t("inst.s4b2")), t("inst.s4b3")),
        h("li", {}, t("inst.s4c")))),
    h("section", { class: "restore" },
      h("h3", {}, t("inst.restoreTitle")),
      h("p", { class: "hint" }, t("inst.restoreHint")),
      h("button", { class: "ghost", onclick: restoreBackup }, t("inst.restore"))),
  ].filter(Boolean));
}

/* ---------- Serial (Web Serial) ---------- */

async function serialSend(chunks) {
  if (!("serial" in navigator)) { notice(t("serial.unsupported"), "error"); return false; }
  let port;
  try { port = await navigator.serial.requestPort(); } catch { return false; }
  await port.open({ baudRate: 115200 });
  const w = port.writable.getWriter();
  const enc = new TextEncoder();
  for (const c of chunks) { await w.write(enc.encode(c)); await new Promise(r => setTimeout(r, 300)); }
  w.releaseLock();
  await port.close().catch(() => {});
  return true;
}

async function restart() {
  if (await serialSend(["\x03", "\x03", "\x04"])) notice(t("serial.restarted"), "ok");
}

async function enterUf2() {
  const cmds = ["\x03", "\x03", "\r", "import microcontroller\r", "microcontroller.on_next_reset(microcontroller.RunMode.UF2)\r", "microcontroller.reset()\r"];
  if (await serialSend(cmds)) notice(t("serial.uf2Done"), "ok");
}

async function flashUf2(file) {
  if (!file) return;
  let dir;
  try { dir = await window.showDirectoryPicker({ id: "rpirp2", mode: "readwrite" }); } catch { return; }
  if (!(await readText(dir, "INFO_UF2.TXT"))) { notice(t("serial.notRp2"), "error"); return; }
  try {
    await writeFile(dir, file.name, new Uint8Array(await file.arrayBuffer()));
    notice(t("serial.flashed"), "ok");
  } catch (e) {
    // The drive disappears as soon as the write completes, which can surface as an error
    notice(t("serial.flashMaybe", { e: e.message }));
  }
}

/* ---------- Rendering ---------- */

// Short text for an operation list, used when a key has no description
function summarize(ops) {
  return (ops || []).map(op => {
    if ("cc" in op) return `CC${op.cc}=${op.val ?? 127}`;
    if ("pc" in op) return `PC ${op.pc}`;
    if ("note" in op) return `Note ${op.note}`;
    if ("raw" in op) return `[${op.raw.join(" ")}]`;
    if ("set" in op) return `${op.set}←${op.to ?? 1}`;
    if ("toggle" in op) return t("sum.toggle", { v: op.toggle });
    if ("inc" in op) return `${op.inc} ${(op.by ?? 1) >= 0 ? "+" : ""}${op.by ?? 1}`;
    if ("mode" in op) return t("sum.mode", { v: op.mode });
    if ("if" in op) return t("sum.if", { v: op.if });
    return "?";
  }).join(", ");
}

function renderUsage() {
  const p = prof();
  const keys = deviceKeys();
  const bs = S.modes.bootSelect || {};
  const boot = [["1", t("usage.bootDrive")],
    ...Object.entries(bs).filter(([k]) => keys.includes(k)).map(([k, m]) => [k, t("usage.bootMode", { name: S.profiles[m]?.name || m })])];

  const sections = (p.layers || []).map((l, li) => {
    const rows = keys.map(k => {
      const kd = l.keys?.[k];
      if (!kd) return null;
      const cells = TRIGGERS.map(tr => {
        const d = pick(kd.desc?.[tr.id]);
        return h("td", { class: d ? "" : "auto" }, d || (kd[tr.id]?.length ? summarize(kd[tr.id]) : ""));
      });
      return h("tr", {}, h("th", { scope: "row" }, h("span", { class: "kname" }, k), h("span", { class: "klabel" }, previewText(kd.label))), ...cells);
    }).filter(Boolean);
    if (!rows.length) return null;
    return h("section", { class: "usage-layer" },
      h("h3", {}, l.name || t("layer.n", { n: li + 1 }), h("code", {}, l.when ? t("usage.when", { v: l.when }) : t("usage.always"))),
      l.desc ? h("p", {}, pick(l.desc)) : null,
      h("div", { class: "tablewrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, t("usage.key")), ...TRIGGERS.map(tr => h("th", { scope: "col" }, t(tr.title))))),
        h("tbody", {}, rows))));
  });

  $("#view-usage").replaceChildren(...[
    p.desc ? h("p", { class: "lead" }, pick(p.desc)) : null,
    h("section", { class: "usage-layer" },
      h("h3", {}, t("usage.boot")),
      h("ul", { class: "bootlist" }, boot.map(([k, t]) => h("li", {}, h("span", { class: "kname" }, k), t)))),
    ...sections,
    h("p", { class: "hint" }, t("usage.hint")),
  ].filter(Boolean));
}

// Expression namespace of the selected profile in its initial state (for previews)
let NS = {};
const refreshNs = () => { NS = prof() ? namespace(prof(), { DEVICE: S.modes.device, MODES_LIST: S.modes.modes }) : {}; };

function colorCss(v, depth = 0) {
  if (typeof v === "string") {
    if (COLORS[v]) return `rgb(${COLORS[v].join(",")})`;
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    if (depth > 2) return null;
    const r = evalValue(v, NS);
    return r === undefined ? null : colorCss(r, depth + 1);
  }
  if (Array.isArray(v) && v.length === 3 && typeof v[0] === "number") return `rgb(${v.join(",")})`;
  if (Array.isArray(v)) return colorCss(v[0], depth + 1);
  return null;
}

// Preview of a template in the initial state; expressions which cannot be evaluated show as "…"
const previewText = t => renderTemplate(t, NS) ?? String(t || "").replace(/\{([^}]*)\}/g, "…");

function resolveKey(key) {
  const layers = prof().layers || [];
  const own = layers[S.layer]?.keys?.[key];
  if (own) return { kd: own, inherited: false };
  for (const l of layers) if (l.keys?.[key]) return { kd: l.keys[key], inherited: true, from: l.name };
  return { kd: null, inherited: true };
}

function renderSide() {
  const devSel = $("#device");
  devSel.replaceChildren(...Object.entries(DEVICES).map(([id, d]) => h("option", { value: id, selected: id === S.modes.device }, d.title)));

  $("#modeList").replaceChildren(...S.modes.modes.map((n, i) => {
    const p = S.profiles[n];
    return h("li", { class: n === S.mode ? "sel" : "", onclick: () => { S.mode = n; S.layer = 0; S.key = null; render(); } },
      h("div", {},
        h("div", { class: "nm" }, p?.name || n),
        h("div", { class: "meta" }, `${n}.json${S.modes.default === n ? " · " + t("side.default") : ""}`)),
      h("div", { class: "tools" },
        h("button", { class: "icon", title: t("side.makeDefault"), "aria-label": t("side.makeDefault"), onclick: e => { e.stopPropagation(); S.modes.default = n; markDirty(); render(); } }, S.modes.default === n ? "★" : "☆"),
        h("button", { class: "icon", title: t("side.moveUp"), "aria-label": t("side.moveUp"), disabled: i === 0, onclick: e => { e.stopPropagation(); move(S.modes.modes, i, -1); markDirty(); render(); } }, "↑"),
        h("button", { class: "icon danger", title: t("side.removeMode"), "aria-label": t("side.removeMode"), disabled: S.modes.modes.length < 2, onclick: e => { e.stopPropagation(); removeMode(n); } }, "✕")));
  }));

  const keys = deviceKeys().filter(k => k !== "1");
  const bs = S.modes.bootSelect || (S.modes.bootSelect = {});
  $("#bootSelect").replaceChildren(h("span", { class: "hint", style: "grid-column:1/-1" }, t("side.bootKeys")),
    ...keys.flatMap(k => [
      h("span", {}, t("side.key", { k })),
      h("select", { onchange: e => { if (e.target.value) bs[k] = e.target.value; else delete bs[k]; markDirty(); } },
        h("option", { value: "" }, "—"),
        ...S.modes.modes.map(n => h("option", { value: n, selected: bs[k] === n }, n))),
    ]));

  $("#connState").textContent = S.dir ? t("conn.ok") : t("conn.none");
  $("#connState").classList.toggle("on", !!S.dir);
  renderSaveState();
  $("#fwVersion").textContent = S.manifest ? t("app.firmware", { v: S.manifest.version }) : "";
  $("#btnFirmware").disabled = !S.dir || !S.manifest || S.kind !== "multimode" || S.fwChecking;
  $("#btnFirmware").classList.toggle("primary", S.fwDiff > 0);

  const info = [];
  if (S.boot) info.push([t("side.os"), S.boot.replace("Adafruit CircuitPython ", "CircuitPython ")]);
  if (S.dir) info.push([t("side.installed"), S.installed || t("side.none")]);
  if (S.manifest) info.push([t("side.latest"), S.manifest.version]);
  if (S.dir && S.kind === "multimode" && S.manifest) {
    info.push([t("fw.state"), S.fwChecking ? t("fw.checkingShort") : S.fwDiff == null ? "?" : S.fwDiff === 0 ? t("fw.upToDate") : t("fw.outdated", { n: S.fwDiff })]);
  }
  $("#devInfo").replaceChildren(...info.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
}

function renderLayers() {
  const p = prof();
  const layers = p.layers || (p.layers = []);
  if (S.layer >= layers.length) S.layer = Math.max(0, layers.length - 1);

  $("#layers").replaceChildren(
    ...layers.map((l, i) => h("button", { class: i === S.layer ? "sel" : "", onclick: () => { S.layer = i; render(); } }, l.name || t("layer.n", { n: i + 1 }))),
    h("button", { class: "ghost", onclick: () => { layers.push({ name: t("layer.n", { n: layers.length + 1 }), when: "True", keys: {} }); S.layer = layers.length - 1; markDirty(); render(); } }, t("layer.add")));

  const l = layers[S.layer];
  if (!l) { $("#layerMeta").replaceChildren(); return; }
  $("#layerMeta").replaceChildren(
    h("label", { class: "field" }, h("span", {}, t("layer.name")),
      h("input", { id: "layerName", value: l.name || "", oninput: e => { l.name = e.target.value; markDirty(); renderLayersButtons(); } })),
    h("label", { class: "field" }, h("span", {}, t("layer.when")),
      h("input", { id: "layerWhen", class: "mono", value: l.when ?? "", placeholder: t("layer.whenPh"), oninput: e => { if (e.target.value.trim()) l.when = e.target.value; else delete l.when; markDirty(); } })),
    h("div", { class: "split" },
      h("button", { class: "icon", title: t("layer.earlier"), "aria-label": t("layer.earlier"), disabled: S.layer === 0, onclick: () => { move(layers, S.layer, -1); S.layer--; markDirty(); render(); } }, "←"),
      h("button", { class: "icon", title: t("layer.later"), "aria-label": t("layer.later"), disabled: S.layer === layers.length - 1, onclick: () => { move(layers, S.layer, 1); S.layer++; markDirty(); render(); } }, "→"),
      h("button", { class: "icon danger", title: t("layer.delete"), "aria-label": t("layer.delete"), onclick: () => { if (confirm(t("layer.confirmDelete", { name: l.name }))) { layers.splice(S.layer, 1); markDirty(); render(); } } }, "✕")),
    h("label", { class: "field", style: "grid-column:1/-1" }, h("span", {}, t("layer.desc") + " · " + LANGS[lang]),
      h("input", { id: "layerDesc", value: pick(l.desc), oninput: e => { const v = assign(l.desc, e.target.value); if (v) l.desc = v; else delete l.desc; markDirty(); } })),
    h("label", { class: "field", style: "grid-column:1/-1" }, h("span", {}, t("layer.main")),
      h("textarea", { id: "layerMain", class: "mono", rows: 2, oninput: e => {
        if (e.target.value) { l.screen = l.screen || {}; l.screen.main = e.target.value; }
        else if (l.screen) { delete l.screen.main; if (!Object.keys(l.screen).length) delete l.screen; }
        markDirty(); renderFace();
      } }, l.screen?.main ?? "")));
}

function renderLayersButtons() {
  [...$("#layers").children].forEach((b, i) => { const l = prof().layers[i]; if (l) b.textContent = l.name || t("layer.n", { n: i + 1 }); });
}

function renderFace() {
  const p = prof();
  const rows = device().rows;
  const screenDef = { ...(p.screen || {}), ...(p.layers[S.layer]?.screen || {}) };

  const slotRow = row => h("div", { class: "slots", style: `grid-template-columns:repeat(${row.length},1fr)` },
    ...row.map(k => {
      const { kd } = resolveKey(k);
      const bg = colorCss(kd?.color) || "#323232";
      return h("div", { class: "slot", style: `background:${bg};color:${contrast(bg)}` }, kd ? previewText(kd.label) : "");
    }));

  const screen = h("div", { class: "screen", "aria-label": t("face.screen") },
    slotRow(rows[0]),
    h("div", { class: "mainarea" }, previewText(screenDef.main || "")),
    h("div", { class: "bar", style: `background:${colorCss(screenDef.barColor) || "#202830"}` }, previewText(screenDef.bar || "")),
    slotRow(rows[1]));

  const swRow = row => h("div", { class: "row", style: `grid-template-columns:repeat(${row.length},minmax(64px,1fr))` },
    ...row.map(k => {
      const { kd, inherited } = resolveKey(k);
      const ring = colorCss(kd?.led) || colorCss(kd?.color) || (kd ? "#8a8f96" : "#333");
      const trig = TRIGGERS.filter(tr => kd?.[tr.id]?.length).map(tr => h("span", { title: t(tr.title) }, tr.id[0].toUpperCase()));
      return h("button", {
        class: "sw" + (inherited ? " inherit" : "") + (S.key === k ? " sel" : ""),
        style: `--ring:${ring};--glow:${kd ? ring : "transparent"}`,
        "aria-label": t("side.key", { k }),
        onclick: () => { S.key = k; render(); },
      }, h("div", { class: "cap" }, k), h("div", { class: "trig" }, trig));
    }));

  $("#face").replaceChildren(swRow(rows[0]), screen, swRow(rows[1]));
}

function contrast(css) {
  const m = css.match(/\d+/g);
  if (!m) return "#fff";
  const [r, g, b] = m.map(Number);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? "#111" : "#fff";
}

function renderEditor() {
  const ed = $("#editor");
  const layer = prof().layers[S.layer];
  if (!S.key || !layer) {
    ed.replaceChildren(h("div", { class: "ed-head" }, h("h2", {}, t("ed.title"))),
      h("p", { class: "empty" }, t("ed.empty")));
    return;
  }
  const key = S.key;
  const kd = layer.keys[key];
  const head = h("div", { class: "ed-head" },
    h("h2", {}, t("ed.head", { k: key, layer: layer.name })),
    kd ? h("button", { class: "ghost small danger", onclick: () => { delete layer.keys[key]; markDirty(); render(); } }, t("ed.removeHere")) : null);

  if (!kd) {
    const { from } = resolveKey(key);
    ed.replaceChildren(head,
      h("p", { class: "empty" }, from ? t("ed.inherits", { from }) : t("ed.undefined")),
      h("button", { class: "primary", onclick: () => { layer.keys[key] = { label: key, color: "WHITE", short: [] }; markDirty(); render(); } }, t("ed.addHere")));
    return;
  }

  const set = (attr, v) => { if (v === "" || v == null) delete kd[attr]; else kd[attr] = v; markDirty(); renderFace(); };

  const palette = h("div", { class: "palette", role: "group", "aria-label": t("ed.palette") },
    ...Object.keys(COLORS).map(n => h("button", { title: n, "aria-label": n, style: `background:${colorCss(n)}`, onclick: () => { kd.color = n; markDirty(); render(); } })));

  const colorInput = h("input", { id: "kColor", class: "mono", value: typeof kd.color === "string" ? kd.color : JSON.stringify(kd.color ?? ""), oninput: e => { set("color", parseColor(e.target.value)); swatch.style.background = colorCss(kd.color) || "repeating-linear-gradient(45deg,#888 0 4px,#bbb 4px 8px)"; } });
  const swatch = h("div", { class: "swatch", style: `background:${colorCss(kd.color) || "repeating-linear-gradient(45deg,#888 0 4px,#bbb 4px 8px)"}`, title: t("ed.exprSwatch") });

  ed.replaceChildren(head,
    h("label", { class: "field" }, h("span", {}, t("ed.label")),
      h("input", { id: "kLabel", class: "mono", value: kd.label ?? "", oninput: e => set("label", e.target.value) })),
    h("div", { class: "field" }, h("span", {}, t("ed.color")),
      h("div", { class: "colorrow" }, colorInput, swatch), palette),
    h("div", { class: "grid2" },
      h("label", { class: "field" }, h("span", {}, t("ed.led")),
        h("input", { id: "kLed", class: "mono", value: kd.led == null ? "" : (typeof kd.led === "string" ? kd.led : JSON.stringify(kd.led)), oninput: e => set("led", parseColor(e.target.value)) })),
      h("label", { class: "field" }, h("span", {}, t("ed.bright")),
        h("input", { id: "kBright", class: "mono", value: kd.bright ?? "", placeholder: "0.3", oninput: e => set("bright", parseValue(e.target.value)) }))),
    ...TRIGGERS.map(t => renderTrigger(kd, t)));
}

function renderTrigger(kd, tr) {
  const title = t(tr.title);
  const ops = kd[tr.id];
  const list = h("div", { class: "stack" });
  if (ops) ops.forEach((op, i) => list.append(renderOp(kd, tr.id, ops, i)));

  const presets = presetsFor(S.mode, prof().tag);
  const picker = h("select", { "aria-label": t("ed.addPresetAria", { trigger: title }) },
    h("option", { value: "" }, t("ed.addPreset")),
    ...presets.map((g, gi) => h("optgroup", { label: g.group }, ...g.items.map((it, ii) => h("option", { value: `${gi}:${ii}` }, it.name)))));
  picker.addEventListener("change", () => {
    if (!picker.value) return;
    const [gi, ii] = picker.value.split(":").map(Number);
    const it = presets[gi].items[ii];
    (kd[tr.id] = kd[tr.id] || []).push(...structuredClone(it.ops));
    for (const [v, init] of Object.entries(it.needs || {})) {
      const st = prof().state || (prof().state = {});
      if (!(v in st)) st[v] = init;
    }
    markDirty(); render();
  });

  // Descriptions are edited in the current UI language
  const desc = h("input", { placeholder: t("ed.desc", { lang: LANGS[lang] }), value: pick(kd.desc?.[tr.id]), "aria-label": t("ed.descAria", { trigger: title }),
    oninput: e => {
      kd.desc = kd.desc || {};
      const v = assign(kd.desc[tr.id], e.target.value);
      if (v) kd.desc[tr.id] = v; else delete kd.desc[tr.id];
      if (!Object.keys(kd.desc).length) delete kd.desc;
      markDirty();
    } });

  return h("section", { class: "trigger" },
    h("h3", {}, title, tr.hint ? h("small", {}, t(tr.hint)) : null),
    ops ? desc : null,
    ops?.length ? list : h("p", { class: "empty" }, t("ed.noOps")),
    h("div", { class: "addrow" }, picker,
      h("button", { class: "ghost", onclick: () => { (kd[tr.id] = kd[tr.id] || []).push({ cc: 0, val: 127 }); markDirty(); render(); } }, t("ed.addManual"))),
    ops && !ops.length ? h("button", { class: "ghost small", onclick: () => { delete kd[tr.id]; markDirty(); render(); } }, t("ed.removeTrigger", { trigger: title })) : null);
}

function renderOp(kd, trig, ops, i) {
  const op = ops[i];
  const node = $("#tplOp").content.firstElementChild.cloneNode(true);
  const type = Object.keys(OPS).find(t => t in op) || "cc";
  const sel = node.querySelector(".op-type");
  sel.setAttribute("aria-label", t("ed.opType"));
  for (const [id, d] of Object.entries(OPS)) sel.append(h("option", { value: id, selected: id === type }, t(d.title)));
  sel.addEventListener("change", () => {
    const def = OPS[sel.value];
    const [attr, , example] = def.fields[0];
    ops[i] = { [attr]: example === "" ? 0 : parseField(attr, example) };
    markDirty(); render();
  });

  const fields = node.querySelector(".op-fields");
  for (const [attr, labelKey, example] of OPS[type].fields) {
    const label = t(labelKey);
    const cur = op[attr];
    const value = cur == null ? "" : (attr === "raw" ? cur.join(", ") : JSON_FIELDS.has(attr) ? JSON.stringify(cur) : String(cur));
    const input = h("input", { value, placeholder: ph(example), "aria-label": label });
    input.addEventListener("change", () => {
      const v = input.value.trim();
      if (v === "") { delete op[attr]; }
      else {
        try { op[attr] = parseField(attr, v); input.setCustomValidity(""); }
        catch { input.setCustomValidity(t("f.notJson")); input.reportValidity(); return; }
      }
      markDirty(); renderFace();
    });
    fields.append(h("label", {}, label, input));
  }

  for (const [cls, key] of [["up", "ed.up"], ["down", "ed.down"], ["del", "ed.delete"]]) {
    const b = node.querySelector("." + cls);
    b.title = t(key); b.setAttribute("aria-label", t(key));
  }
  node.querySelector(".up").disabled = i === 0;
  node.querySelector(".down").disabled = i === ops.length - 1;
  node.querySelector(".up").addEventListener("click", () => { move(ops, i, -1); markDirty(); render(); });
  node.querySelector(".down").addEventListener("click", () => { move(ops, i, 1); markDirty(); render(); });
  node.querySelector(".del").addEventListener("click", () => { ops.splice(i, 1); markDirty(); render(); });
  return node;
}

function parseValue(v) {
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

function parseField(attr, v) {
  if (NAME_FIELDS.has(attr)) return v;
  if (JSON_FIELDS.has(attr)) return JSON.parse(v);
  if (attr === "raw") return v.split(",").map(s => parseValue(s.trim()));
  return parseValue(v);
}

function parseColor(v) {
  v = v.trim();
  if (!v) return "";
  if (v.startsWith("[")) { try { return JSON.parse(v); } catch { return v; } }
  return v;
}

function renderSettings() {
  const p = prof();
  $("#setTag").value = p.tag ?? "";
  $("#setChannel").value = p.channel ?? 1;
  $("#setHold").value = p.holdMs ?? 600;
  $("#setDouble").value = p.doubleMs ?? 500;
  $("#setPower").checked = !!p.power;
  $("#setState").value = JSON.stringify(p.state || {}, null, 1);
  $("#setConsts").value = JSON.stringify(p.consts || {}, null, 1);
  $("#setVars").value = JSON.stringify(p.vars || [], null, 1);
  $("#setBar").value = p.screen?.bar ?? "";
  $("#setBarColor").value = p.screen?.barColor ?? "";
  $("#setMain").value = p.screen?.main ?? "";
  $("#settingsErr").hidden = true;
}

function bindSettings() {
  const num = (id, attr) => $(id).addEventListener("change", e => { prof()[attr] = parseInt(e.target.value, 10); markDirty(); });
  num("#setChannel", "channel"); num("#setHold", "holdMs"); num("#setDouble", "doubleMs");
  $("#setTag").addEventListener("input", e => { prof().tag = e.target.value; $("#profTag").textContent = e.target.value; markDirty(); });
  $("#setPower").addEventListener("change", e => { prof().power = e.target.checked; markDirty(); });
  const js = (id, attr) => $(id).addEventListener("change", e => {
    try { prof()[attr] = JSON.parse(e.target.value); $("#settingsErr").hidden = true; markDirty(); }
    catch (err) { $("#settingsErr").hidden = false; $("#settingsErr").textContent = t("set.jsonError", { attr, e: err.message }); }
  });
  js("#setState", "state"); js("#setConsts", "consts"); js("#setVars", "vars");
  const scr = (id, attr) => $(id).addEventListener("input", e => {
    const p = prof(); p.screen = p.screen || {};
    if (e.target.value) p.screen[attr] = e.target.value; else delete p.screen[attr];
    markDirty();
  });
  scr("#setBar", "bar"); scr("#setBarColor", "barColor"); scr("#setMain", "main");
}

function render() {
  if (!S.profiles[S.mode]) S.mode = S.modes.modes[0];
  refreshNs();
  renderSide();
  const p = prof();
  if (!p) return;
  $("#profName").value = p.name ?? S.mode;
  $("#profTag").textContent = p.tag ?? "";
  for (const b of $("#viewTabs").children) b.setAttribute("aria-selected", b.dataset.view === S.view);
  for (const v of ["install", "usage", "keys", "settings", "json"]) $("#view-" + v).hidden = v !== S.view;
  if (S.view === "install") renderInstall();
  if (S.view === "usage") renderUsage();
  if (S.view === "keys") { renderLayers(); renderFace(); renderEditor(); }
  if (S.view === "settings") renderSettings();
  if (S.view === "json") { $("#jsonText").value = JSON.stringify(p, null, 2); $("#jsonErr").textContent = ""; }
  $("#editor").hidden = S.view !== "keys";
}

/* ---------- Mode list operations ---------- */

function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

function removeMode(n) {
  if (!confirm(t("mode.confirmRemove", { n }))) return;
  S.modes.modes = S.modes.modes.filter(m => m !== n);
  if (S.modes.default === n) S.modes.default = S.modes.modes[0];
  for (const [k, v] of Object.entries(S.modes.bootSelect || {})) if (v === n) delete S.modes.bootSelect[k];
  if (S.mode === n) S.mode = S.modes.modes[0];
  markDirty(); render();
}

function addMode() {
  const existing = Object.keys(S.profiles).filter(n => !S.modes.modes.includes(n));
  const hint = existing.length ? t("mode.unused", { list: existing.join(", ") }) : "";
  const name = (prompt(t("mode.prompt", { hint })) || "").trim();
  if (!name) return;
  if (!/^[a-z0-9_]+$/.test(name)) { notice(t("mode.badName"), "error"); return; }
  if (S.modes.modes.includes(name)) { notice(t("mode.exists", { n: name }), "error"); return; }
  if (!S.profiles[name]) {
    S.profiles[name] = {
      schema: 1, name, tag: name.slice(0, 3).toUpperCase(), channel: 1, holdMs: 600, doubleMs: 500, power: false,
      state: {}, consts: {}, vars: [],
      screen: { bar: "{MODE}", barColor: "DARK_GRAY", main: name },
      layers: [{ name: t("mode.baseLayer"), keys: {} }],
    };
  }
  S.modes.modes.push(name);
  S.mode = name; S.layer = 0; S.key = null;
  markDirty(); render();
}

function exportProfile() {
  const blob = new Blob([JSON.stringify(prof(), null, 2) + "\n"], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `${S.mode}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importProfile(file) {
  if (!file) return;
  try {
    const p = JSON.parse(await file.text());
    if (!Array.isArray(p.layers)) throw new Error(t("import.noLayers"));
    const name = file.name.replace(/\.json$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
    S.profiles[name] = p;
    if (!S.modes.modes.includes(name)) S.modes.modes.push(name);
    S.mode = name; S.layer = 0; S.key = null;
    notice(t("import.done", { n: name }), "ok");
    markDirty(); render();
  } catch (e) {
    notice(t("import.failed", { e: e.message }), "error");
  }
}

/* ---------- Boot ---------- */

function bind() {
  $("#btnConnect").addEventListener("click", connect);
  $("#btnSave").addEventListener("click", save);
  $("#btnFirmware").addEventListener("click", () => installFirmware());
  $("#btnAddMode").addEventListener("click", addMode);
  $("#btnExport").addEventListener("click", exportProfile);
  $("#fileImport").addEventListener("change", e => { importProfile(e.target.files[0]); e.target.value = ""; });
  $("#btnRestart").addEventListener("click", restart);
  $("#btnUf2").addEventListener("click", enterUf2);
  $("#fileUf2").addEventListener("change", e => { flashUf2(e.target.files[0]); e.target.value = ""; });
  $("#device").addEventListener("change", e => { S.modes.device = e.target.value; S.key = null; markDirty(); render(); });
  $("#profName").addEventListener("input", e => { prof().name = e.target.value; markDirty(); renderSide(); });
  for (const b of $("#viewTabs").children) b.addEventListener("click", () => { S.view = b.dataset.view; history.replaceState(null, "", "#" + S.view); render(); });
  $("#btnApplyJson").addEventListener("click", () => {
    try {
      const p = JSON.parse($("#jsonText").value);
      if (!Array.isArray(p.layers)) throw new Error(t("json.needLayers"));
      S.profiles[S.mode] = p; markDirty();
      $("#jsonErr").textContent = t("json.applied");
    } catch (e) { $("#jsonErr").textContent = e.message; }
  });
  bindSettings();

  const langSel = $("#lang");
  langSel.replaceChildren(...Object.entries(LANGS).map(([id, name]) => h("option", { value: id, selected: id === lang }, name)));
  langSel.addEventListener("change", () => { setLang(langSel.value); applyStatic(); render(); });

  window.addEventListener("beforeunload", e => { if (S.dirty && S.dir) { e.preventDefault(); e.returnValue = ""; } });
}

setLang(lang);
applyStatic();
bind();
// Deep link to a view: #usage, #keys, #settings, #json
const hashView = location.hash.slice(1);
if (["install", "usage", "keys", "settings", "json"].includes(hashView)) S.view = hashView;
if (hashView === "keys") S.key = "3";

loadDefaults()
  .then(() => {
    render();
    if (!("showDirectoryPicker" in window)) notice(t("conn.editOnly"));
  })
  .catch(e => notice(t("load.defaultsFailed", { e: e.message }), "error"));

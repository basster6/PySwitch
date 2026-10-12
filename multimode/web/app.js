// Captain Multimode editor: edits multimode profiles (JSON) and writes them, plus the firmware files,
// to a MIDI Captain drive using the File System Access API (Chrome / Edge).
import { presetsFor } from "./presets.js";
import { namespace, renderTemplate, evalValue } from "./pyeval.js";

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
  GRAY: [190, 190, 190], DARK_GRAY: [50, 50, 50], BLACK: [0, 0, 0],
};

const TRIGGERS = [
  { id: "short", title: "짧게 누르기" },
  { id: "long", title: "길게 누르기" },
  { id: "double", title: "더블 클릭", hint: "정의하면 짧게 누르기가 더블 클릭 간격만큼 늦게 실행돼요" },
];

// Operation types and their fields: [attribute, label, placeholder]
const OPS = {
  cc:     { title: "CC 전송", fields: [["cc", "CC 번호", "44"], ["val", "값", "127"], ["ch", "채널", "기본"]] },
  pc:     { title: "PC 전송", fields: [["pc", "프로그램", "0"], ["ch", "채널", "기본"]] },
  note:   { title: "노트 온", fields: [["note", "노트", "60"], ["vel", "벨로시티", "127"], ["ch", "채널", "기본"]] },
  raw:    { title: "원시 바이트", fields: [["raw", "바이트 (쉼표)", "176, 44, 127"]] },
  set:    { title: "변수 설정", fields: [["set", "변수", "gig"], ["to", "값/식", "1"]] },
  toggle: { title: "변수 토글", fields: [["toggle", "변수", "gig"]] },
  inc:    { title: "변수 증감", fields: [["inc", "변수", "sc"], ["by", "증감", "1"], ["mod", "순환(mod)", ""], ["lo", "시작값", "0"], ["min", "최소", ""], ["max", "최대", ""]] },
  mode:   { title: "모드 전환", fields: [["mode", "대상", "next"]] },
  if:     { title: "조건", fields: [["if", "조건식", "gig"], ["then", "참일 때 (JSON)", "[]"], ["else", "거짓일 때 (JSON)", "[]"]] },
};
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

function notice(text, kind = "") {
  const n = $("#notice");
  n.hidden = !text;
  n.className = "notice " + kind;
  n.textContent = text || "";
}

function markDirty() {
  S.dirty = true;
  $("#btnSave").textContent = S.dir ? "장치에 저장 •" : "장치에 저장";
}

/* ---------- Loading ---------- */

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url + ": " + r.status);
  return r.json();
}

async function loadDefaults() {
  S.modes = await fetchJson("profiles/modes.json");
  const names = await fetchJson("profiles/index.json").catch(() => S.modes.modes);
  for (const n of names) S.profiles[n] = await fetchJson(`profiles/${n}.json`);
  S.mode = S.modes.modes[0];
  try {
    const m = await fetchJson("firmware/manifest.json");
    S.manifest = m;
    $("#fwVersion").textContent = "펌웨어 " + m.version;
  } catch { S.manifest = null; }
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
    notice("이 브라우저는 드라이브 쓰기를 지원하지 않아요. 데스크톱 Chrome이나 Edge로 열어주세요.", "error");
    return;
  }
  let dir;
  try { dir = await window.showDirectoryPicker({ id: "midicaptain", mode: "readwrite" }); }
  catch { return; }

  const boot = await readText(dir, "boot_out.txt");
  if (!boot || !boot.includes("CircuitPython")) {
    notice("선택한 폴더에 boot_out.txt가 없어요. MIDICAPTAIN(또는 CIRCUITPY) 드라이브의 최상위 폴더를 선택하세요. 드라이브가 안 보이면 1번 스위치를 누른 채 전원을 켜세요.", "error");
    return;
  }
  S.dir = dir;
  S.boot = boot.split("\n")[0].trim();
  S.installed = (await readText(dir, "lib/multimode/VERSION"))?.trim() || null;

  const modesText = await readText(dir, "profiles/modes.json");
  if (modesText) {
    try {
      const modes = JSON.parse(modesText);
      const profiles = {};
      for (const n of modes.modes) {
        const t = await readText(dir, `profiles/${n}.json`);
        if (t) profiles[n] = JSON.parse(t);
      }
      S.modes = modes;
      Object.assign(S.profiles, profiles);
      S.mode = modes.modes.find(n => S.profiles[n]) || S.mode;
      S.layer = 0; S.key = null;
      notice(`장치 프로필을 불러왔어요: ${modes.modes.join(", ")}`, "ok");
    } catch (e) {
      notice("장치의 프로필을 읽지 못했어요 (" + e.message + "). 기본 프로필을 보여줍니다.", "error");
    }
  } else {
    notice("이 장치에는 아직 multimode 펌웨어가 없어요. '펌웨어 설치·업데이트'를 먼저 실행한 뒤 저장하세요.");
  }
  S.dirty = false;
  render();
}

function validate() {
  const errs = [];
  for (const n of S.modes.modes) {
    const p = S.profiles[n];
    if (!p) { errs.push(`${n}: 프로필 파일이 없어요`); continue; }
    const names = new Set([...Object.keys(p.state || {}), ...(p.vars || []).map(v => v[0])]);
    for (const l of p.layers || []) {
      for (const [k, kd] of Object.entries(l.keys || {})) {
        for (const t of TRIGGERS) {
          const walk = ops => (ops || []).forEach(op => {
            const type = Object.keys(OPS).find(t => t in op);
            if (!type) errs.push(`${n} / ${l.name} / ${k}: 알 수 없는 동작 ${JSON.stringify(op)}`);
            for (const a of ["set", "toggle", "inc"]) {
              if (a in op && !names.has(op[a])) errs.push(`${n} / ${l.name} / ${k}: 변수 '${op[a]}'가 state에 없어요`);
            }
            if (op.mode && !["next", "prev", ...S.modes.modes].includes(op.mode)) errs.push(`${n} / ${k}: 모드 '${op.mode}'가 없어요`);
            walk(op.then); walk(op.else);
          });
          walk(kd[t.id]);
        }
      }
    }
  }
  if (!S.modes.modes.includes(S.modes.default)) errs.push("기본 모드가 모드 목록에 없어요");
  return errs;
}

async function save() {
  const errs = validate();
  if (errs.length) { notice("저장하지 않았어요. 고칠 곳: " + errs.join(" · "), "error"); return; }
  if (!S.dir) { notice("먼저 장치 드라이브를 연결하세요."); return; }
  try {
    for (const n of S.modes.modes) await writeFile(S.dir, `profiles/${n}.json`, JSON.stringify(S.profiles[n], null, 2) + "\n");
    await writeFile(S.dir, "profiles/modes.json", JSON.stringify(S.modes, null, 2) + "\n");
    S.dirty = false;
    notice("저장했어요. 스위치를 누르지 않은 채 장치 전원을 다시 켜면 적용됩니다.", "ok");
  } catch (e) {
    notice("저장하지 못했어요: " + e.message + ". 드라이브가 연결돼 있는지 확인하세요.", "error");
  }
  render();
}

async function installFirmware() {
  if (!S.dir || !S.manifest) return;
  const files = S.manifest.files;
  let written = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      notice(`펌웨어 확인 중 ${i + 1}/${files.length}: ${f.path}`);
      const cur = await readBytes(S.dir, f.path);
      if (cur && cur.length === f.size && await sha256(cur) === f.sha256) continue;
      const r = await fetch("firmware/" + f.path, { cache: "no-cache" });
      if (!r.ok) throw new Error(f.path + ": " + r.status);
      await writeFile(S.dir, f.path, new Uint8Array(await r.arrayBuffer()));
      written++;
    }
    const hasProfiles = await readText(S.dir, "profiles/modes.json");
    if (!hasProfiles) {
      for (const n of S.modes.modes) await writeFile(S.dir, `profiles/${n}.json`, JSON.stringify(S.profiles[n], null, 2) + "\n");
      await writeFile(S.dir, "profiles/modes.json", JSON.stringify(S.modes, null, 2) + "\n");
    }
    S.installed = S.manifest.version;
    notice(`펌웨어 ${S.manifest.version} 설치 완료: 파일 ${written}개를 새로 썼어요 (나머지는 이미 최신).`, "ok");
  } catch (e) {
    notice("펌웨어 설치가 중간에 멈췄어요: " + e.message + ". 다시 실행하면 남은 파일만 씁니다.", "error");
  }
  render();
}

/* ---------- Serial (Web Serial) ---------- */

async function serialSend(chunks) {
  if (!("serial" in navigator)) { notice("이 브라우저는 Web Serial을 지원하지 않아요 (Chrome·Edge 필요).", "error"); return false; }
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
  if (await serialSend(["\x03", "\x03", "\x04"])) notice("재시작 명령을 보냈어요.", "ok");
}

async function enterUf2() {
  const cmds = ["\x03", "\x03", "\r", "import microcontroller\r", "microcontroller.on_next_reset(microcontroller.RunMode.UF2)\r", "microcontroller.reset()\r"];
  if (await serialSend(cmds)) notice("부트로더로 재시작했어요. RPI-RP2 드라이브가 나타나면 'CircuitPython .uf2 굽기'를 누르세요.", "ok");
}

async function flashUf2(file) {
  if (!file) return;
  let dir;
  try { dir = await window.showDirectoryPicker({ id: "rpirp2", mode: "readwrite" }); } catch { return; }
  if (!(await readText(dir, "INFO_UF2.TXT"))) { notice("RPI-RP2 드라이브가 아니에요 (INFO_UF2.TXT 없음).", "error"); return; }
  try {
    await writeFile(dir, file.name, new Uint8Array(await file.arrayBuffer()));
    notice("UF2를 썼어요. 장치가 자동으로 재시작합니다. 이후 1번 스위치를 누른 채 다시 켜고 펌웨어를 설치하세요.", "ok");
  } catch (e) {
    // The drive disappears as soon as the write completes, which can surface as an error
    notice("UF2 쓰기가 끝났거나 중단됐어요 (" + e.message + "). 장치가 재시작했다면 정상입니다.");
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
    if ("toggle" in op) return `${op.toggle} 토글`;
    if ("inc" in op) return `${op.inc} ${(op.by ?? 1) >= 0 ? "+" : ""}${op.by ?? 1}`;
    if ("mode" in op) return `모드 ${op.mode}`;
    if ("if" in op) return `조건(${op.if})`;
    return "?";
  }).join(", ");
}

function renderUsage() {
  const p = prof();
  const keys = deviceKeys();
  const bs = S.modes.bootSelect || {};
  const boot = [["1", "USB 드라이브 연결 (설정·펌웨어 변경용)"],
    ...Object.entries(bs).filter(([k]) => keys.includes(k)).map(([k, m]) => [k, `${S.profiles[m]?.name || m} 모드로 시작`])];

  const sections = (p.layers || []).map((l, li) => {
    const rows = keys.map(k => {
      const kd = l.keys?.[k];
      if (!kd) return null;
      const cells = TRIGGERS.map(t => {
        const txt = kd.desc?.[t.id] || (kd[t.id]?.length ? summarize(kd[t.id]) : "");
        return h("td", { class: kd.desc?.[t.id] ? "" : "auto" }, txt);
      });
      return h("tr", {}, h("th", { scope: "row" }, h("span", { class: "kname" }, k), h("span", { class: "klabel" }, previewText(kd.label))), ...cells);
    }).filter(Boolean);
    if (!rows.length) return null;
    return h("section", { class: "usage-layer" },
      h("h3", {}, l.name || `레이어 ${li + 1}`, l.when ? h("code", {}, `조건: ${l.when}`) : h("code", {}, "항상")),
      l.desc ? h("p", {}, l.desc) : null,
      h("div", { class: "tablewrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "키"), ...TRIGGERS.map(t => h("th", { scope: "col" }, t.title)))),
        h("tbody", {}, rows))));
  });

  $("#view-usage").replaceChildren(
    p.desc ? h("p", { class: "lead" }, p.desc) : null,
    h("section", { class: "usage-layer" },
      h("h3", {}, "전원 켤 때 누르고 있기"),
      h("ul", { class: "bootlist" }, boot.map(([k, t]) => h("li", {}, h("span", { class: "kname" }, k), t)))),
    ...sections,
    h("p", { class: "hint" }, "위쪽 레이어부터 조건이 맞는 첫 레이어가 키 동작을 정해요. 흐린 글씨는 설명이 없어 실제 MIDI 메시지로 대신 보여준 거예요. 설명은 '키 매핑' 탭에서 고칠 수 있어요."));
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
        h("div", { class: "meta" }, `${n}.json${S.modes.default === n ? " · 기본" : ""}`)),
      h("div", { class: "tools" },
        h("button", { class: "icon", title: "기본 모드로", "aria-label": "기본 모드로", onclick: e => { e.stopPropagation(); S.modes.default = n; markDirty(); render(); } }, S.modes.default === n ? "★" : "☆"),
        h("button", { class: "icon", title: "위로", "aria-label": "위로", disabled: i === 0, onclick: e => { e.stopPropagation(); move(S.modes.modes, i, -1); markDirty(); render(); } }, "↑"),
        h("button", { class: "icon danger", title: "모드에서 빼기", "aria-label": "모드에서 빼기", disabled: S.modes.modes.length < 2, onclick: e => { e.stopPropagation(); removeMode(n); } }, "✕")));
  }));

  const keys = deviceKeys().filter(k => k !== "1");
  const bs = S.modes.bootSelect || (S.modes.bootSelect = {});
  $("#bootSelect").replaceChildren(h("span", { class: "hint", style: "grid-column:1/-1" }, "부팅 키 (1번은 드라이브 연결용이라 제외)"),
    ...keys.flatMap(k => [
      h("span", {}, `키 ${k}`),
      h("select", { onchange: e => { if (e.target.value) bs[k] = e.target.value; else delete bs[k]; markDirty(); } },
        h("option", { value: "" }, "—"),
        ...S.modes.modes.map(n => h("option", { value: n, selected: bs[k] === n }, n))),
    ]));

  $("#connState").textContent = S.dir ? "장치 연결됨" : "장치 미연결";
  $("#connState").classList.toggle("on", !!S.dir);
  $("#btnSave").disabled = !S.dir;
  $("#btnSave").textContent = S.dirty && S.dir ? "장치에 저장 •" : "장치에 저장";
  $("#btnFirmware").disabled = !S.dir || !S.manifest;

  const info = [];
  if (S.boot) info.push(["OS", S.boot.replace("Adafruit CircuitPython ", "CircuitPython ")]);
  if (S.dir) info.push(["설치됨", S.installed || "없음"]);
  if (S.manifest) info.push(["최신", S.manifest.version]);
  $("#devInfo").replaceChildren(...info.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
}

function renderLayers() {
  const p = prof();
  const layers = p.layers || (p.layers = []);
  if (S.layer >= layers.length) S.layer = Math.max(0, layers.length - 1);

  $("#layers").replaceChildren(
    ...layers.map((l, i) => h("button", { class: i === S.layer ? "sel" : "", onclick: () => { S.layer = i; render(); } }, l.name || `레이어 ${i + 1}`)),
    h("button", { class: "ghost", onclick: () => { layers.push({ name: `레이어 ${layers.length + 1}`, when: "True", keys: {} }); S.layer = layers.length - 1; markDirty(); render(); } }, "+ 레이어"));

  const l = layers[S.layer];
  if (!l) { $("#layerMeta").replaceChildren(); return; }
  $("#layerMeta").replaceChildren(
    h("label", { class: "field" }, h("span", {}, "레이어 이름"),
      h("input", { id: "layerName", value: l.name || "", oninput: e => { l.name = e.target.value; markDirty(); renderLayersButtons(); } })),
    h("label", { class: "field" }, h("span", {}, "활성 조건 (Python 식, 비우면 항상)"),
      h("input", { id: "layerWhen", class: "mono", value: l.when ?? "", placeholder: "예: gig, not lp", oninput: e => { if (e.target.value.trim()) l.when = e.target.value; else delete l.when; markDirty(); } })),
    h("div", { class: "split" },
      h("button", { class: "icon", title: "앞으로", "aria-label": "앞으로", disabled: S.layer === 0, onclick: () => { move(layers, S.layer, -1); S.layer--; markDirty(); render(); } }, "←"),
      h("button", { class: "icon", title: "뒤로", "aria-label": "뒤로", disabled: S.layer === layers.length - 1, onclick: () => { move(layers, S.layer, 1); S.layer++; markDirty(); render(); } }, "→"),
      h("button", { class: "icon danger", title: "레이어 삭제", "aria-label": "레이어 삭제", onclick: () => { if (confirm(`'${l.name}' 레이어를 삭제할까요?`)) { layers.splice(S.layer, 1); markDirty(); render(); } } }, "✕")),
    h("label", { class: "field", style: "grid-column:1/-1" }, h("span", {}, "레이어 설명"),
      h("input", { id: "layerDesc", value: l.desc ?? "", oninput: e => { if (e.target.value) l.desc = e.target.value; else delete l.desc; markDirty(); } })),
    h("label", { class: "field", style: "grid-column:1/-1" }, h("span", {}, "이 레이어의 메인 화면 (비우면 프로필 기본값)"),
      h("textarea", { id: "layerMain", class: "mono", rows: 2, oninput: e => {
        if (e.target.value) { l.screen = l.screen || {}; l.screen.main = e.target.value; }
        else if (l.screen) { delete l.screen.main; if (!Object.keys(l.screen).length) delete l.screen; }
        markDirty(); renderFace();
      } }, l.screen?.main ?? "")));
}

function renderLayersButtons() {
  [...$("#layers").children].forEach((b, i) => { const l = prof().layers[i]; if (l) b.textContent = l.name || `레이어 ${i + 1}`; });
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

  const screen = h("div", { class: "screen", "aria-label": "화면 미리보기" },
    slotRow(rows[0]),
    h("div", { class: "mainarea" }, previewText(screenDef.main || "")),
    h("div", { class: "bar", style: `background:${colorCss(screenDef.barColor) || "#202830"}` }, previewText(screenDef.bar || "")),
    slotRow(rows[1]));

  const swRow = row => h("div", { class: "row", style: `grid-template-columns:repeat(${row.length},minmax(64px,1fr))` },
    ...row.map(k => {
      const { kd, inherited } = resolveKey(k);
      const ring = colorCss(kd?.led) || colorCss(kd?.color) || (kd ? "#8a8f96" : "#333");
      const trig = TRIGGERS.filter(t => kd?.[t.id]?.length).map(t => h("span", {}, t.id[0].toUpperCase()));
      return h("button", {
        class: "sw" + (inherited ? " inherit" : "") + (S.key === k ? " sel" : ""),
        style: `--ring:${ring};--glow:${kd ? ring : "transparent"}`,
        "aria-label": `키 ${k}`,
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
    ed.replaceChildren(h("div", { class: "ed-head" }, h("h2", {}, "키 편집")),
      h("p", { class: "empty" }, "가운데 기기 그림에서 스위치를 누르면 여기서 라벨, 색, 동작을 편집할 수 있어요."));
    return;
  }
  const key = S.key;
  const kd = layer.keys[key];
  const head = h("div", { class: "ed-head" },
    h("h2", {}, `키 ${key} · ${layer.name}`),
    kd ? h("button", { class: "ghost small danger", onclick: () => { delete layer.keys[key]; markDirty(); render(); } }, "이 레이어에서 삭제") : null);

  if (!kd) {
    const { from } = resolveKey(key);
    ed.replaceChildren(head,
      h("p", { class: "empty" }, from ? `이 레이어에는 정의가 없어서 '${from}' 레이어 설정을 따라요.` : "어느 레이어에도 정의가 없는 키예요."),
      h("button", { class: "primary", onclick: () => { layer.keys[key] = { label: key, color: "WHITE", short: [] }; markDirty(); render(); } }, "이 레이어에 키 정의 추가"));
    return;
  }

  const set = (attr, v) => { if (v === "" || v == null) delete kd[attr]; else kd[attr] = v; markDirty(); renderFace(); };

  const palette = h("div", { class: "palette", role: "group", "aria-label": "색 팔레트" },
    ...Object.keys(COLORS).map(n => h("button", { title: n, "aria-label": n, style: `background:${colorCss(n)}`, onclick: () => { kd.color = n; markDirty(); render(); } })));

  const colorInput = h("input", { id: "kColor", class: "mono", value: typeof kd.color === "string" ? kd.color : JSON.stringify(kd.color ?? ""), oninput: e => { set("color", parseColor(e.target.value)); swatch.style.background = colorCss(kd.color) || "repeating-linear-gradient(45deg,#888 0 4px,#bbb 4px 8px)"; } });
  const swatch = h("div", { class: "swatch", style: `background:${colorCss(kd.color) || "repeating-linear-gradient(45deg,#888 0 4px,#bbb 4px 8px)"}`, title: "식이면 줄무늬로 표시돼요" });

  ed.replaceChildren(head,
    h("label", { class: "field" }, h("span", {}, "라벨 템플릿 ({식} 자리에 값이 들어가요, 5자 이내 권장)"),
      h("input", { id: "kLabel", class: "mono", value: kd.label ?? "", oninput: e => set("label", e.target.value) })),
    h("div", { class: "field" }, h("span", {}, "색 (이름, #rrggbb 또는 식)"),
      h("div", { class: "colorrow" }, colorInput, swatch), palette),
    h("div", { class: "grid2" },
      h("label", { class: "field" }, h("span", {}, "LED (비우면 색과 같음)"),
        h("input", { id: "kLed", class: "mono", value: kd.led == null ? "" : (typeof kd.led === "string" ? kd.led : JSON.stringify(kd.led)), oninput: e => set("led", parseColor(e.target.value)) })),
      h("label", { class: "field" }, h("span", {}, "밝기 (0-1)"),
        h("input", { id: "kBright", class: "mono", value: kd.bright ?? "", placeholder: "0.3", oninput: e => set("bright", parseValue(e.target.value)) }))),
    ...TRIGGERS.map(t => renderTrigger(kd, t)));
}

function renderTrigger(kd, t) {
  const ops = kd[t.id];
  const list = h("div", { class: "stack" });
  if (ops) ops.forEach((op, i) => list.append(renderOp(kd, t.id, ops, i)));

  const presets = presetsFor(S.mode, prof().tag);
  const picker = h("select", { "aria-label": `${t.title}에 프리셋 추가` },
    h("option", { value: "" }, "프리셋에서 추가…"),
    ...presets.map((g, gi) => h("optgroup", { label: g.group }, ...g.items.map((it, ii) => h("option", { value: `${gi}:${ii}` }, it.name)))));
  picker.addEventListener("change", () => {
    if (!picker.value) return;
    const [gi, ii] = picker.value.split(":").map(Number);
    const it = presets[gi].items[ii];
    (kd[t.id] = kd[t.id] || []).push(...structuredClone(it.ops));
    for (const [v, init] of Object.entries(it.needs || {})) {
      const st = prof().state || (prof().state = {});
      if (!(v in st)) st[v] = init;
    }
    markDirty(); render();
  });

  const desc = h("input", { placeholder: "설명 (사용법 탭에 표시)", value: kd.desc?.[t.id] ?? "", "aria-label": `${t.title} 설명`,
    oninput: e => {
      kd.desc = kd.desc || {};
      if (e.target.value) kd.desc[t.id] = e.target.value; else delete kd.desc[t.id];
      if (!Object.keys(kd.desc).length) delete kd.desc;
      markDirty();
    } });

  return h("section", { class: "trigger" },
    h("h3", {}, t.title, t.hint ? h("small", {}, t.hint) : null),
    ops ? desc : null,
    ops?.length ? list : h("p", { class: "empty" }, "동작 없음"),
    h("div", { class: "addrow" }, picker,
      h("button", { class: "ghost", onclick: () => { (kd[t.id] = kd[t.id] || []).push({ cc: 0, val: 127 }); markDirty(); render(); } }, "+ 직접")),
    ops && !ops.length ? h("button", { class: "ghost small", onclick: () => { delete kd[t.id]; markDirty(); render(); } }, `${t.title} 정의 제거`) : null);
}

function renderOp(kd, trig, ops, i) {
  const op = ops[i];
  const node = $("#tplOp").content.firstElementChild.cloneNode(true);
  const type = Object.keys(OPS).find(t => t in op) || "cc";
  const sel = node.querySelector(".op-type");
  for (const [id, d] of Object.entries(OPS)) sel.append(h("option", { value: id, selected: id === type }, d.title));
  sel.addEventListener("change", () => {
    const def = OPS[sel.value];
    ops[i] = { [def.fields[0][0]]: def.fields[0][2] === "" ? 0 : parseField(def.fields[0][0], def.fields[0][2]) };
    markDirty(); render();
  });

  const fields = node.querySelector(".op-fields");
  for (const [attr, label, ph] of OPS[type].fields) {
    const cur = op[attr];
    const value = cur == null ? "" : (attr === "raw" ? cur.join(", ") : JSON_FIELDS.has(attr) ? JSON.stringify(cur) : String(cur));
    const input = h("input", { value, placeholder: ph, "aria-label": label });
    input.addEventListener("change", () => {
      const v = input.value.trim();
      if (v === "") { delete op[attr]; }
      else {
        try { op[attr] = parseField(attr, v); input.setCustomValidity(""); }
        catch { input.setCustomValidity("JSON 형식이 아니에요"); input.reportValidity(); return; }
      }
      markDirty(); renderFace();
    });
    fields.append(h("label", {}, label, input));
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
    catch (err) { $("#settingsErr").hidden = false; $("#settingsErr").textContent = `${attr}: JSON 형식 오류 (${err.message})`; }
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
  for (const v of ["usage", "keys", "settings", "json"]) $("#view-" + v).hidden = v !== S.view;
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
  if (!confirm(`'${n}' 모드를 목록에서 뺄까요? 장치의 JSON 파일은 지우지 않아요.`)) return;
  S.modes.modes = S.modes.modes.filter(m => m !== n);
  if (S.modes.default === n) S.modes.default = S.modes.modes[0];
  for (const [k, v] of Object.entries(S.modes.bootSelect || {})) if (v === n) delete S.modes.bootSelect[k];
  if (S.mode === n) S.mode = S.modes.modes[0];
  markDirty(); render();
}

function addMode() {
  const existing = Object.keys(S.profiles).filter(n => !S.modes.modes.includes(n));
  const hint = existing.length ? ` (목록에 없는 프로필: ${existing.join(", ")})` : "";
  const name = (prompt("새 모드의 파일 이름 (영문 소문자, 숫자, _)" + hint) || "").trim();
  if (!name) return;
  if (!/^[a-z0-9_]+$/.test(name)) { notice("파일 이름은 영문 소문자, 숫자, _만 쓸 수 있어요.", "error"); return; }
  if (S.modes.modes.includes(name)) { notice(`'${name}'은 이미 모드 목록에 있어요.`, "error"); return; }
  if (!S.profiles[name]) {
    S.profiles[name] = {
      schema: 1, name, tag: name.slice(0, 3).toUpperCase(), channel: 1, holdMs: 600, doubleMs: 500, power: false,
      state: {}, consts: {}, vars: [],
      screen: { bar: "{MODE}", barColor: "DARK_GRAY", main: name },
      layers: [{ name: "기본", keys: {} }],
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
    if (!Array.isArray(p.layers)) throw new Error("layers가 없어요");
    const name = file.name.replace(/\.json$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
    S.profiles[name] = p;
    if (!S.modes.modes.includes(name)) S.modes.modes.push(name);
    S.mode = name; S.layer = 0; S.key = null;
    notice(`'${name}' 프로필을 가져왔어요.`, "ok");
    markDirty(); render();
  } catch (e) {
    notice("가져오지 못했어요: " + e.message, "error");
  }
}

/* ---------- Boot ---------- */

function bind() {
  $("#btnConnect").addEventListener("click", connect);
  $("#btnSave").addEventListener("click", save);
  $("#btnFirmware").addEventListener("click", installFirmware);
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
      if (!Array.isArray(p.layers)) throw new Error("layers 배열이 필요해요");
      S.profiles[S.mode] = p; markDirty();
      $("#jsonErr").textContent = "적용했어요";
    } catch (e) { $("#jsonErr").textContent = e.message; }
  });
  bindSettings();
  window.addEventListener("beforeunload", e => { if (S.dirty && S.dir) { e.preventDefault(); e.returnValue = ""; } });
}

bind();
// Deep link to a view: #usage, #keys, #settings, #json
const hashView = location.hash.slice(1);
if (["usage", "keys", "settings", "json"].includes(hashView)) S.view = hashView;
if (hashView === "keys") S.key = "3";

loadDefaults()
  .then(() => {
    render();
    if (!("showDirectoryPicker" in window)) notice("편집은 되지만, 장치에 저장하려면 데스크톱 Chrome이나 Edge가 필요해요.");
  })
  .catch(e => notice("기본 프로필을 불러오지 못했어요: " + e.message, "error"));

// Evaluator for the Python expression subset used in profiles, for previews in the editor.
// Supports literals, names, lists/tuples, indexing, calls of a few builtins, arithmetic, comparisons,
// not/and/or, "x if c else y" and "'%02d' % x". The device itself runs real Python; this is only a preview.

const TOKEN = /\s*(?:(\d+\.\d*|\.\d+|\d+)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|([A-Za-z_]\w*)|(\/\/|==|!=|<=|>=|[-+*\/%<>()\[\],.]))/y;

function tokenize(src) {
  const out = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    if (/^\s*$/.test(src.slice(TOKEN.lastIndex))) break;
    const m = TOKEN.exec(src);
    if (!m) throw new SyntaxError("unexpected character at " + TOKEN.lastIndex);
    if (m[1]) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2]) out.push({ t: "str", v: m[2].slice(1, -1).replace(/\\n/g, "\n").replace(/\\(.)/g, "$1") });
    else if (m[3]) out.push({ t: ["if", "else", "and", "or", "not", "in", "True", "False", "None"].includes(m[3]) ? m[3] : "name", v: m[3] });
    else out.push({ t: m[4] });
  }
  out.push({ t: "end" });
  return out;
}

const truthy = v => !(v === 0 || v === false || v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0));

const BUILTINS = {
  str: v => typeof v === "boolean" ? (v ? "True" : "False") : String(v),
  int: v => Math.trunc(Number(v)),
  len: v => v.length,
  chr: v => String.fromCharCode(v),
  abs: Math.abs,
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
};

function pyMod(a, b) {
  if (typeof a === "string") {
    const args = Array.isArray(b) ? [...b] : [b];
    return a.replace(/%(0?)(\d*)(?:\.(\d+))?([dsf%])/g, (_, z, w, p, c) => {
      if (c === "%") return "%";
      let v = args.shift();
      let s = c === "d" ? String(Math.trunc(v)) : c === "f" ? Number(v).toFixed(p ? +p : 6) : String(v);
      return w ? s.padStart(+w, z ? "0" : " ") : s;
    });
  }
  return ((a % b) + b) % b;
}

export function pyEval(src, ns) {
  const tk = tokenize(src);
  let i = 0;
  const peek = () => tk[i];
  const take = t => { if (tk[i].t !== t) throw new SyntaxError(`expected '${t}'`); return tk[i++]; };

  const ternary = () => {
    const a = or();
    if (peek().t === "if") { i++; const c = or(); take("else"); const b = ternary(); return truthy(c) ? a : b; }
    return a;
  };
  const or = () => { let a = and(); while (peek().t === "or") { i++; const b = and(); a = truthy(a) ? a : b; } return a; };
  const and = () => { let a = not(); while (peek().t === "and") { i++; const b = not(); a = truthy(a) ? b : a; } return a; };
  const not = () => peek().t === "not" ? (i++, !truthy(not())) : cmp();
  const cmp = () => {
    let a = arith();
    for (;;) {
      const op = peek().t;
      if (!["==", "!=", "<", ">", "<=", ">=", "in"].includes(op)) return a;
      i++;
      const b = arith();
      a = op === "==" ? eq(a, b) : op === "!=" ? !eq(a, b) : op === "<" ? a < b : op === ">" ? a > b
        : op === "<=" ? a <= b : op === ">=" ? a >= b : (Array.isArray(b) ? b.some(x => eq(x, a)) : String(b).includes(a));
    }
  };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b) || (a === true && b === 1) || (a === false && b === 0) || (a === 1 && b === true) || (a === 0 && b === false);
  const arith = () => {
    let a = term();
    while (["+", "-"].includes(peek().t)) {
      const op = tk[i++].t; const b = term();
      a = op === "+" ? (Array.isArray(a) ? a.concat(b) : a + b) : a - b;
    }
    return a;
  };
  const term = () => {
    let a = unary();
    while (["*", "/", "//", "%"].includes(peek().t)) {
      const op = tk[i++].t; const b = unary();
      a = op === "*" ? (typeof a === "string" ? a.repeat(b) : a * b) : op === "/" ? a / b : op === "//" ? Math.floor(a / b) : pyMod(a, b);
    }
    return a;
  };
  const unary = () => peek().t === "-" ? (i++, -unary()) : peek().t === "+" ? (i++, +unary()) : postfix();
  const postfix = () => {
    let a = atom();
    for (;;) {
      if (peek().t === "[") {
        i++; const k = ternary(); take("]");
        const idx = typeof k === "number" && k < 0 ? a.length + k : (k === true ? 1 : k === false ? 0 : k);
        a = typeof a === "string" ? a[idx] : a[idx];
        if (a === undefined) throw new RangeError("index");
      } else if (peek().t === "(") {
        i++; const args = [];
        while (peek().t !== ")") { args.push(ternary()); if (peek().t === ",") i++; }
        take(")");
        if (typeof a !== "function") throw new TypeError("not callable");
        a = a(...args);
      } else return a;
    }
  };
  const atom = () => {
    const t = tk[i++];
    switch (t.t) {
      case "num": case "str": return t.v;
      case "True": return true;
      case "False": return false;
      case "None": return null;
      case "name":
        if (t.v in ns) return ns[t.v];
        if (t.v in BUILTINS) return BUILTINS[t.v];
        throw new ReferenceError(t.v);
      case "(": case "[": {
        const close = t.t === "(" ? ")" : "]";
        const items = []; let tuple = t.t === "[";
        while (peek().t !== close) { items.push(ternary()); if (peek().t === ",") { i++; tuple = true; } }
        take(close);
        return tuple ? items : items[0];
      }
      default: throw new SyntaxError("unexpected: " + t.t);
    }
  };

  const v = ternary();
  if (peek().t !== "end") throw new SyntaxError("trailing: " + peek().t);
  return v;
}

// Builds the expression namespace of a profile for its initial state
export function namespace(profile, extra = {}) {
  const ns = { ...(profile.consts || {}), ...(profile.state || {}), MODE: profile.tag || "", _pend: "", DEVICE: "", ...extra };
  for (const [name, expr] of profile.vars || []) {
    try { ns[name] = pyEval(expr, ns); } catch { ns[name] = undefined; }
  }
  return ns;
}

// Renders a "{expr}" template. Returns null if any part cannot be evaluated.
export function renderTemplate(template, ns) {
  if (template == null) return "";
  let ok = true;
  const s = String(template).replace(/\{([^}]*)\}/g, (_, e) => {
    try { const v = pyEval(e, ns); return typeof v === "boolean" ? (v ? "True" : "False") : String(v); }
    catch { ok = false; return "…"; }
  });
  return ok ? s : null;
}

export function evalValue(v, ns) {
  if (typeof v !== "string") return v;
  try { return pyEval(v, ns); } catch { return undefined; }
}

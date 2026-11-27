/* API Map engine: builds an endpoint model from observed traffic. Passive only — never sends requests. */
(function (global) {
  "use strict";

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const IDLIKE = /^(?:\d{3,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,64}|[A-Za-z0-9_-]{20,})$/i;
  const AUTH_HDR = new Set(["authorization", "cookie", "x-auth-token", "x-api-key", "x-access-token", "x-csrf-token", "x-xsrf-token"]);
  const SECRET_HDR = new Set(["authorization", "cookie", "set-cookie", "x-api-key", "x-auth-token", "x-access-token", "proxy-authorization"]);
  const NOISE = /\.(png|jpe?g|svg|gif|webp|avif|css|woff2?|ttf|otf|ico|map|mp4|webm|mp3)(\?|$)|\/rb_[0-9a-f-]{20,}|\/cdn-cgi\/|google-analytics\.com|googletagmanager|doubleclick|mc\.yandex|facebook\.(com|net)|connect\.facebook|tiktok|amplitude\.com|hotjar|clarity\.ms|sentry\.io\/api|\/collect\?|\/beacon/i;
  const STATIC_EXT = /\.(png|jpe?g|svg|gif|webp|css|woff2?|ttf|ico|map|mp4|html?)(\?|$)/i;

  // ---------- helpers ----------
  function segKind(s) {
    if (UUID.test(s)) return "{uuid}";
    if (/^\d{2,}$/.test(s)) return "{id}";
    if (/^[0-9a-f]{24,64}$/i.test(s)) return "{hash}";
    if (/^[A-Za-z0-9_-]{28,}$/.test(s) && /\d/.test(s)) return "{token}";
    if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(s)) return "{email}";
    return s;
  }
  function parseUrl(u) { try { return new URL(u); } catch (e) { return null; } }
  function normPath(pathname) {
    return pathname.split("/").filter(Boolean).map(s => segKind(decodeURIComponent(s))).join("/");
  }
  function siteOf(host) {
    const p = host.split(".");
    if (p.length <= 2) return host;
    const sld = p.slice(-2).join(".");
    return /^(com|co|org|net|gov|edu|ac)\.[a-z]{2}$/.test(sld) ? p.slice(-3).join(".") : sld;
  }
  function walk(o, p, out, depth) {
    out = out || []; depth = depth || 0;
    if (depth > 12 || out.length > 4000) return out;
    if (Array.isArray(o)) { o.slice(0, 40).forEach(v => walk(v, p + "[]", out, depth + 1)); }
    else if (o && typeof o === "object") { for (const k of Object.keys(o)) walk(o[k], p ? p + "." + k : k, out, depth + 1); }
    else if (typeof o === "string" || typeof o === "number") out.push([p, String(o)]);
    return out;
  }
  function tryJson(t) {
    if (!t) return null;
    const s = String(t).trim();
    if (!(s[0] === "{" || s[0] === "[")) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function parseBody(text, mime) {
    const j = tryJson(text);
    if (j) return j;
    if (text && /x-www-form-urlencoded/i.test(mime || "")) {
      const o = {}; new URLSearchParams(text).forEach((v, k) => { o[k] = v; }); return o;
    }
    return null;
  }
  function mask(v) {
    v = String(v || "");
    if (v.length <= 10) return "•••";
    return v.slice(0, 6) + "…" + "(" + v.length + ")";
  }
  function b64u(s) {
    try { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
      return decodeURIComponent(escape(atob(s))); } catch (e) { return null; }
  }
  function decodeJwt(tok) {
    const m = /^(eyJ[\w-]+)\.(eyJ[\w-]+)\.([\w-]*)$/.exec(tok || "");
    if (!m) return null;
    const h = tryJson(b64u(m[1])), p = tryJson(b64u(m[2]));
    if (!h || !p) return null;
    return { header: h, payload: p, sigLen: m[3].length };
  }
  function luhn(n) {
    let s = 0, alt = false;
    for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; }
    return s % 10 === 0;
  }

  // ---------- scoring ----------
  const RULES = [
    [/\{(id|uuid|hash|token|email|[a-z_]*id)\}/i, 3, "ID в пути"],
    [/(^|\/)(admin|internal|debug|test|staff|manager|operator|backoffice|superuser|actuator|_debug|graphql-playground)(\/|$|-)/i, 4, "служебный маршрут"],
    [/(upload|import|file|attach|document|avatar|image|media)/i, 3, "файлы / загрузка"],
    [/(export|download|report|backup|dump|logs?\b)/i, 2, "выгрузка данных"],
    [/(pay|card|transaction|wallet|refund|withdraw|transfer|balance|bonus|cashback|promo|coupon|subscription|invoice)/i, 2, "деньги / бонусы"],
    [/(auth|token|otp|password|reset|login|sms|verify|session|sso|oauth)/i, 2, "аутентификация"],
    [/(callback|webhook|redirect|return|proxy|fetch|url|link|hydrate|preview|render)/i, 3, "URL / перенаправление"],
    [/(user|profile|account|customer|client|address|order|application|passport|document)/i, 1, "персональные объекты"],
    [/graphql/i, 3, "GraphQL"],
    [/(openai|gpt|llm|chat|assistant|ai\/)/i, 2, "LLM-интеграция"],
  ];
  const FIELD_RULES = [
    [/^(url|uri|link|callback\w*|webhook\w*|redirect\w*|returnUrl|imageUrl|src|target)$/i, 3, "поле-URL"],
    [/^(role|roles|isAdmin|is_admin|admin|permissions?|status|state|verified|isVerified|level|tier|group)$/i, 3, "поле прав / статуса"],
    [/^(amount|price|sum|total|cost|discount|quantity|currency|balance|fee)$/i, 2, "поле суммы"],
    [/(userId|user_id|ownerId|customerId|clientId|accountId|cardId|orderId|cartId|iin|uuid)$/i, 2, "ID объекта в теле"],
  ];
  const WRITE = { POST: 1, PUT: 2, PATCH: 2, DELETE: 2 };

  function score(ep) {
    let s = 0; const why = [];
    for (const [rx, w, l] of RULES) if (rx.test(ep.path)) { s += w; why.push(l); }
    for (const m of ep.methods) if (WRITE[m]) { s += WRITE[m]; why.push("запись (" + m + ")"); break; }
    const fields = new Set([...ep.reqKeys, ...ep.queryKeys].map(k => k.split(".").pop().replace(/\[\]/g, "")));
    for (const f of fields) for (const [rx, w, l] of FIELD_RULES) if (rx.test(f)) { s += w; why.push(l + ": " + f); }
    const sev = { high: 3, med: 2, low: 1 };
    for (const f of ep.findings) { s += sev[f.sev] || 0; }
    if (ep.findings.some(f => f.type === "unauth")) why.push("данные без авторизации");
    if (ep.flowsIn.size) why.push("принимает ID из других ответов");
    return { score: s, why: [...new Set(why)] };
  }

  // ---------- static JS extraction ----------
  const Q = String.raw`(?:"([^"\n]{1,200}?)"|'([^'\n]{1,200}?)'|\x60([^\x60]{1,200}?)\x60)`;
  const JS_PATTERNS = [
    ["call", new RegExp(String.raw`\.(get|post|put|patch|delete)\(\s*` + Q, "g")],
    ["fetch", new RegExp(String.raw`\bfetch\(\s*` + Q, "g")],
    ["obj", new RegExp(String.raw`\b(?:endpoint|url|uri|path)\s*:\s*` + Q, "g")],
  ];
  const API_HINT = /(^\/?(api|v\d|graphql|rest|auth|oauth)\b)|(\/(api|v\d)\/)|^[a-z][\w-]*\/[\w{}\/.:-]+$/i;
  function jsEndpoints(text, src) {
    const out = [];
    if (!text || text.length > 12e6) return out;
    for (const [kind, rx] of JS_PATTERNS) {
      rx.lastIndex = 0; let m, n = 0;
      while ((m = rx.exec(text)) && n++ < 5000) {
        const q = m[m.length - 3] ?? m[m.length - 2] ?? m[m.length - 1];
        const raw = m[m.length - 3] || m[m.length - 2] || m[m.length - 1];
        if (!raw) continue;
        let p = raw.replace(/\$\{\s*([^}]*)\}/g, (_, x) => "{" + (String(x).split(".").pop().replace(/\W/g, "") || "x") + "}")
          .replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/\/:([A-Za-z_]\w*)/g, "/{$1}").replace(/\/\/+/g, "/");
        if (!p || p.length < 3 || /\s/.test(p) || STATIC_EXT.test(p) || !p.includes("/") || !API_HINT.test(p)) continue;
        const method = kind === "call" ? m[1].toUpperCase() : null;
        out.push({ path: p.replace(/^\/+/, ""), method, src, ctx: text.slice(Math.max(0, m.index - 100), m.index + 160).replace(/\s+/g, " ") });
      }
    }
    return out;
  }

  // ---------- detectors ----------
  const PII = [
    ["email", /^[\w.+-]+@[\w-]+\.[\w.-]+$/],
    ["телефон", /^\+?[78]\s?\(?7\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$|^\+?\d{11,13}$/],
    ["ИИН/ИНН", /^\d{12}$/],
  ];
  const PII_KEYS = /(email|phone|mobile|iin|inn|passport|birth|address|street|apartment|fio|full_?name|first_?name|last_?name|card|pan|cvv|password|secret|token|apikey|api_key)/i;
  const ERR_SIG = /(Traceback \(most recent call last\)|at [\w$.]+\([\w.]+\.java:\d+\)|SQLSTATE|syntax error at or near|ORA-\d{5}|Microsoft OLE DB|You have an error in your SQL syntax|Exception in thread|stack trace:|\bvar_dump\(|<b>Warning<\/b>:|Whoops, looks like something went wrong|Django Version:)/i;

  function hdrMap(arr) { const o = {}; (arr || []).forEach(h => { o[h.name.toLowerCase()] = h.value; }); return o; }

  class Engine {
    constructor() { this.reset(); }
    reset() {
      this.records = []; this.eps = new Map(); this.produced = new Map(); this.flows = new Map();
      this.findings = []; this.staticSeen = new Set(); this.tech = new Map(); this.jwts = new Map(); this.version = 0;
    }
    key(host, path) { return host + "/" + path; }
    static suffixMatch(stat, real) {
      const a = stat.split("/").filter(Boolean), b = real.split("/").filter(Boolean);
      if (!a.length || a.length > b.length) return false;
      for (let i = 1; i <= a.length; i++) {
        const x = a[a.length - i], y = b[b.length - i];
        if (!(x === y || x[0] === "{" || y[0] === "{")) return false;
      }
      return true;
    }
    /* find an observed endpoint on the same host whose real path ends with the static path */
    matchObserved(host, path) {
      let best = null;
      for (const ep of this.eps.values())
        if (ep.observed && ep.host === host && Engine.suffixMatch(path, ep.path) && (!best || ep.path.length < best.path.length)) best = ep;
      return best;
    }
    /* when a real request arrives, absorb static-only endpoints that describe it */
    absorbStatic(ep) {
      for (const [k, s] of this.eps) {
        if (s === ep || s.observed || s.host !== ep.host || !Engine.suffixMatch(s.path, ep.path)) continue;
        s.methods.forEach(m => ep.methods.add(m)); ep.static.push(...s.static.slice(0, 3 - ep.static.length));
        this.eps.delete(k);
      }
    }
    ensureEp(host, path, observed) {
      const k = this.key(host, path);
      let ep = this.eps.get(k);
      if (!ep) {
        ep = { key: k, host, path, methods: new Set(), count: 0, status: {}, reqKeys: new Set(), queryKeys: new Set(), resKeys: new Set(),
               authSeen: false, noAuthSeen: false, findings: [], flowsIn: new Set(), flowsOut: new Set(), recs: [],
               observed: false, static: [], first: Date.now(), isNew: true, mime: new Set() };
        this.eps.set(k, ep);
      }
      if (observed) ep.observed = true;
      return ep;
    }
    addFinding(ep, f) {
      const id = ep.key + "|" + f.type + "|" + (f.text || "");
      if (ep.findings.some(x => x.id === id)) return;
      f.id = id; f.ep = ep.key; f.t = Date.now(); ep.findings.push(f); this.findings.push(f);
    }

    /* rec: {id, t, method, url, status, reqHeaders[], reqBody, reqMime, resHeaders[], mime, resBody, initiator} */
    ingest(rec) {
      const u = parseUrl(rec.url);
      if (!u || !/^https?:$/.test(u.protocol)) return null;
      const mime = (rec.mime || "").toLowerCase();
      // JavaScript: static extraction only
      if (/javascript|ecmascript/.test(mime) || /\.m?js(\?|$)/.test(u.pathname)) {
        if (rec.resBody && !this.staticSeen.has(rec.url)) {
          this.staticSeen.add(rec.url);
          const name = u.pathname.split("/").pop() || u.host;
          for (const s of jsEndpoints(rec.resBody, name)) {
            const sp = normPath("/" + s.path);
            const ep = this.matchObserved(u.host, sp) || this.ensureEp(u.host, sp, false);
            if (s.method) ep.methods.add(s.method);
            if (ep.static.length < 3) ep.static.push({ src: s.src, ctx: s.ctx });
          }
          this.version++;
        }
        return null;
      }
      if (NOISE.test(rec.url)) return null;
      if (/^text\/html/.test(mime) && rec.method === "GET" && !/\/api\//.test(u.pathname)) return null;
      const path = normPath(u.pathname);
      const fresh = !this.eps.has(this.key(u.host, path));
      const ep = this.ensureEp(u.host, path, true);
      if (fresh) this.absorbStatic(ep);
      rec.ep = ep.key; rec.path = path; rec.host = u.host;
      this.records.push(rec); ep.recs.push(rec.id); ep.count++; ep.methods.add(rec.method);
      ep.status[rec.status] = (ep.status[rec.status] || 0) + 1; ep.mime.add(mime.split(";")[0]);
      const rh = hdrMap(rec.reqHeaders), sh = hdrMap(rec.resHeaders);
      const hasAuth = Object.keys(rh).some(h => AUTH_HDR.has(h));
      if (hasAuth) ep.authSeen = true; else ep.noAuthSeen = true;

      // request values
      const reqVals = [];
      u.searchParams.forEach((v, k) => { ep.queryKeys.add(k); reqVals.push(["?" + k, v]); });
      const rb = parseBody(rec.reqBody, rec.reqMime);
      if (rb) walk(rb, "", []).forEach(([p, v]) => { ep.reqKeys.add(p); reqVals.push([p, v]); });
      const rawSegs = u.pathname.split("/").filter(Boolean), normSegs = path.split("/");
      rawSegs.forEach((s, i) => { if (normSegs[i] && normSegs[i][0] === "{") reqVals.push([normSegs[i], decodeURIComponent(s)]); });

      // ID flows: value seen earlier in a response now sent in this request
      for (const [p, v] of reqVals) {
        if (!IDLIKE.test(v)) continue;
        const src = this.produced.get(v);
        if (src && src.ep !== ep.key) {
          const fk = src.ep + "→" + ep.key + "|" + src.field + "→" + p;
          const f = this.flows.get(fk) || { from: src.ep, to: ep.key, field: src.field + " → " + p, count: 0, sample: v.slice(0, 8) + "…" };
          f.count++; this.flows.set(fk, f);
          ep.flowsIn.add(src.ep); const se = this.eps.get(src.ep); if (se) se.flowsOut.add(ep.key);
        }
      }

      // response analysis
      const body = rec.resBody || "";
      const rj = /json/.test(mime) || /^\s*[\[{]/.test(body) ? tryJson(body) : null;
      const ok = rec.status >= 200 && rec.status < 300;
      if (rj) {
        const vals = walk(rj, "", []);
        const sens = new Set();
        for (const [p, v] of vals) {
          ep.resKeys.add(p);
          if (IDLIKE.test(v) && !this.produced.has(v)) this.produced.set(v, { ep: ep.key, field: p, rec: rec.id });
          const leaf = p.split(".").pop().replace(/\[\]/g, "");
          for (const [label, rx] of PII) if (rx.test(v) && (label !== "ИИН/ИНН" || /iin|inn|bin/i.test(leaf))) sens.add(label);
          if (/^\d{13,19}$/.test(v) && /card|pan|number/i.test(leaf) && luhn(v)) sens.add("номер карты");
          if (/^eyJ[\w-]+\.eyJ[\w-]+\./.test(v)) sens.add("JWT в ответе");
          if (PII_KEYS.test(leaf) && v && v.length > 2 && !/^(null|true|false)$/.test(v)) sens.add(leaf);
        }
        if (ok && sens.size) this.addFinding(ep, { sev: "med", type: "pii", text: "чувствительные поля в ответе: " + [...sens].slice(0, 8).join(", "), rec: rec.id });
        if (ok && !hasAuth && vals.length > 3 && sens.size)
          this.addFinding(ep, { sev: "high", type: "unauth", text: "персональные данные отданы на запрос без куки/токена", rec: rec.id });
      }
      if (ok && /\{(id|uuid|hash|token|email)\}/.test(path))
        this.addFinding(ep, { sev: "low", type: "idor", text: "объект по ID отвечает 2xx — проверить доступ к чужому ID", rec: rec.id });
      if (ERR_SIG.test(body.slice(0, 20000))) this.addFinding(ep, { sev: "med", type: "error", text: "в ответе стек/ошибка БД", rec: rec.id });
      // CORS
      const acao = sh["access-control-allow-origin"], origin = rh["origin"];
      if (acao && origin && acao === origin && /true/i.test(sh["access-control-allow-credentials"] || "") && parseUrl(origin) && parseUrl(origin).host !== u.host)
        this.addFinding(ep, { sev: "low", type: "cors", text: "CORS отражает Origin с credentials (" + origin + ")", rec: rec.id });
      if (acao === "*" && /true/i.test(sh["access-control-allow-credentials"] || ""))
        this.addFinding(ep, { sev: "low", type: "cors", text: "CORS * вместе с credentials", rec: rec.id });
      // secrets in URL
      u.searchParams.forEach((v, k) => {
        if (/(token|access_token|api_?key|password|secret|session|auth)/i.test(k) && v.length > 6)
          this.addFinding(ep, { sev: "med", type: "url-secret", text: "секрет в URL: ?" + k, rec: rec.id });
      });
      // GraphQL
      if (rb && typeof rb === "object" && typeof rb.query === "string" && /\b(query|mutation)\b/.test(rb.query))
        this.addFinding(ep, { sev: "low", type: "graphql", text: "GraphQL: " + (rb.operationName || rb.query.slice(0, 40)), rec: rec.id });
      // tech fingerprint
      for (const h of ["server", "x-powered-by", "via", "x-aspnet-version", "x-generator"])
        if (sh[h]) this.tech.set(h + ": " + sh[h], (this.tech.get(h + ": " + sh[h]) || 0) + 1);
      for (const h of Object.keys(sh)) {
        const m = /^x-(kong|envoy|amz|azure|goog|cache|served|backend|upstream|nginx|varnish|request-id)/.exec(h);
        if (m) this.tech.set("gateway: " + h, (this.tech.get("gateway: " + h) || 0) + 1);
      }
      // JWTs (in auth header or cookies)
      const cands = [];
      if (rh["authorization"]) cands.push(["Authorization", rh["authorization"].replace(/^Bearer\s+/i, "")]);
      (rh["cookie"] || "").split(/;\s*/).forEach(c => { const i = c.indexOf("="); if (i > 0) cands.push(["cookie " + c.slice(0, i), c.slice(i + 1)]); });
      for (const [where, tok] of cands) {
        const j = decodeJwt(tok);
        if (j && !this.jwts.has(where)) {
          const notes = [];
          if (/none/i.test(j.header.alg)) notes.push("alg none!");
          if (/^HS/i.test(j.header.alg)) notes.push("симметричная подпись (HS*)");
          if (j.payload.exp && j.payload.iat) notes.push("живёт " + Math.round((j.payload.exp - j.payload.iat) / 60) + " мин");
          this.jwts.set(where, { where, header: j.header, payload: j.payload, notes, ep: ep.key });
        }
      }
      ep.isNew = true; this.version++;
      return rec;
    }

    endpoint(k) { return this.eps.get(k); }
    list() {
      const arr = [];
      for (const ep of this.eps.values()) { const s = score(ep); ep.score = s.score; ep.why = s.why; arr.push(ep); }
      return arr.sort((a, b) => b.score - a.score || b.count - a.count);
    }
    tree(filterFn) {
      const root = { name: "root", children: new Map() };
      for (const ep of this.eps.values()) {
        if (filterFn && !filterFn(ep)) continue;
        let n = root.children.get(ep.host);
        if (!n) { n = { name: ep.host, children: new Map(), host: true }; root.children.set(ep.host, n); }
        for (const s of ep.path.split("/").filter(Boolean)) {
          let c = n.children.get(s); if (!c) { c = { name: s, children: new Map() }; n.children.set(s, c); } n = c;
        }
        n.ep = ep.key;
      }
      const conv = n => {
        const ch = [...n.children.values()].map(conv).sort((a, b) => a.name.localeCompare(b.name));
        const d = { name: n.name }; if (ch.length) d.children = ch; if (n.ep) d.ep = n.ep; if (n.host) d.host = true; return d;
      };
      return conv(root);
    }
    flowList() { return [...this.flows.values()].sort((a, b) => b.count - a.count); }

    // persistence (bodies truncated)
    dump() {
      return { v: 1, records: this.records.map(r => Object.assign({}, r, { resBody: (r.resBody || "").slice(0, 16000), reqBody: (r.reqBody || "").slice(0, 8000) })) };
    }
    static maskHeaders(arr) {
      return (arr || []).map(h => SECRET_HDR.has(h.name.toLowerCase()) ? { name: h.name, value: mask(h.value), masked: true } : h);
    }
  }

  // HAR import → records
  Engine.fromHarEntries = function (entries) {
    return entries.map((e, i) => ({
      id: "h" + i, t: Date.parse(e.startedDateTime) || i, method: e.request.method, url: e.request.url, status: e.response.status,
      reqHeaders: e.request.headers || [], reqBody: (e.request.postData || {}).text || "", reqMime: (e.request.postData || {}).mimeType || "",
      resHeaders: e.response.headers || [], mime: (e.response.content || {}).mimeType || "",
      resBody: (e.response.content || {}).encoding === "base64" ? "" : ((e.response.content || {}).text || ""),
      initiator: e._initiator || null, time: e.time || 0,
    }));
  };
  Engine.siteOf = siteOf; Engine.decodeJwt = decodeJwt; Engine.mask = mask;
  global.APIMapEngine = Engine;
})(typeof window !== "undefined" ? window : globalThis);

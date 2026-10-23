"use strict";
// LOTTE rent-a-car Gimhae Airport – Rental Guide (PWA) server. Node >= 18, one dependency (qrcode).
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QRCode = require("qrcode");

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || "8080", 10);
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const FORCE_SECURE = process.env.COOKIE_SECURE === "1";
const ORDER = ["en", "ja", "zh-CN", "zh-TW", "vi", "th", "ru"];
const GUIDE = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "guide.json"), "utf8"));
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- secrets & admin password ----------
function loadSecret() {
  if (process.env.SESSION_SECRET) return Buffer.from(process.env.SESSION_SECRET);
  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(SECRET_FILE, "utf8").trim());
}
const SECRET = loadSecret();
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, SCRYPT);
  return { alg: "scrypt", N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString("hex"), hash: h.toString("hex") };
}
function verifyPassword(pw, rec) {
  const h = crypto.scryptSync(String(pw), Buffer.from(rec.salt, "hex"), 64, { N: rec.N, r: rec.r, p: rec.p, maxmem: SCRYPT.maxmem });
  const want = Buffer.from(rec.hash, "hex");
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}
function loadAdmin() {
  if (process.env.ADMIN_PASSWORD) return hashPassword(process.env.ADMIN_PASSWORD); // hosted: set via env var
  if (fs.existsSync(ADMIN_FILE)) return JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"));
  const pw = crypto.randomBytes(18).toString("base64url"); // ~144 bits
  const pwFile = path.join(ROOT, "ADMIN_PASSWORD.txt");
  fs.writeFileSync(pwFile, pw + "\n", { mode: 0o600 }); fs.chmodSync(pwFile, 0o600);
  const rec = hashPassword(pw);
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(rec), { mode: 0o600 });
  console.log("Admin password generated and saved to ADMIN_PASSWORD.txt (chmod 600).");
  return rec;
}
const ADMIN = loadAdmin();

// ---------- settings ----------
const DEFAULTS = {
  qrBlock: false, pdf: true, install: true,
  langs: Object.fromEntries(ORDER.map((k) => [k, true])),
  officePhone: "+82 51 293 8000", officeHours: "08:00–21:00",
  csPhone: "+82-2-797-8000", csHours: "08:30–21:00",
  emPhone: "1588-1230",
  publicUrl: (process.env.PUBLIC_URL || "").trim().replace(/\/+$/, ""), // optional env default (survives restarts on hosts without a disk)
};
let settings = { ...DEFAULTS, langs: { ...DEFAULTS.langs } };
try { const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")); settings = { ...settings, ...s, langs: { ...settings.langs, ...(s.langs || {}) } }; } catch (e) {}
function saveSettings() { fs.writeFileSync(SETTINGS_FILE + ".tmp", JSON.stringify(settings, null, 2)); fs.renameSync(SETTINGS_FILE + ".tmp", SETTINGS_FILE); rebuildGuide(); }
const enabledLangs = () => { const l = ORDER.filter((k) => settings.langs[k]); return l.length ? l : ["en"]; };

// Apply admin-edited phones/hours to every language
let LIVE = GUIDE;
function rebuildGuide() {
  const reps = [[DEFAULTS.officePhone, settings.officePhone], [DEFAULTS.csPhone, settings.csPhone], [DEFAULTS.emPhone, settings.emPhone]].filter(([a, b]) => a !== b);
  const walk = (v) => typeof v === "string" ? reps.reduce((s, [a, b]) => s.split(a).join(b), v) : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
  const out = {};
  for (const k of ORDER) {
    const d = walk(GUIDE[k]);
    const rows = d.secs[0].b[0].r; // office contact table: [office, customer support, emergency]
    // Office row ends with a duration in brackets, e.g. "(13 hours)": drop it when hours change. Support row keeps "(Mon–Fri)".
    const setHours = (row, def, val, dropDuration) => {
      if (def === val) return;
      const [a, b] = val.split("–");
      row[1] = row[1].replace(/(\d{2}:\d{2})(\s*[–～~-]\s*)(\d{2}:\d{2})/, (m, x, sep) => a + sep + b);
      if (dropDuration) row[1] = row[1].replace(/\s*[（(][^（()）]*[）)]\s*$/, "");
    };
    setHours(rows[0], DEFAULTS.officeHours, settings.officeHours, true);
    setHours(rows[1], DEFAULTS.csHours, settings.csHours, false);
    out[k] = d;
  }
  LIVE = out;
}
rebuildGuide();

// ---------- helpers ----------
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
function parseCookies(req) { const o = {}; (req.headers.cookie || "").split(";").forEach((c) => { const i = c.indexOf("="); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return o; }
const isSecure = (req) => FORCE_SECURE || !!req.socket.encrypted || (TRUST_PROXY && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https");
const clientIp = (req) => (TRUST_PROXY && req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : req.socket.remoteAddress) || "?";
function cookie(req, name, value, opts = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${opts.path || "/"}; HttpOnly; SameSite=${opts.sameSite || "Lax"}`;
  if (opts.maxAge !== undefined) c += `; Max-Age=${opts.maxAge}`;
  if (isSecure(req)) c += "; Secure";
  return c;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SEC_HEADERS = {
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
function send(res, status, body, type = "text/html; charset=utf-8", extra = {}) {
  res.writeHead(status, { ...SEC_HEADERS, "Content-Type": type, ...extra });
  res.end(body);
}
function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")))));
    req.on("error", reject);
  });
}

// ---------- QR session (server-signed cookie, lasts for the browser session) ----------
function isQrSession(req) {
  if (!settings.qrBlock) return false;
  const v = parseCookies(req).gg_qr; if (!v) return false;
  const [id, sig] = v.split(".");
  if (!id || !sig) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign("qr:" + id));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- admin sessions & login rate limit ----------
const sessions = new Map(); // token -> {exp, csrf}
const SESSION_TTL = 8 * 3600 * 1000;
function adminSession(req) {
  const t = parseCookies(req).gg_admin; if (!t) return null;
  const s = sessions.get(t); if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(t); return null; }
  return s;
}
const attempts = new Map(); // ip -> {n, first, lockUntil}
const MAX_FAILS = 5, WINDOW = 15 * 60 * 1000, LOCK = 15 * 60 * 1000;
function rateLimited(ip) { const a = attempts.get(ip); return a && a.lockUntil > Date.now() ? Math.ceil((a.lockUntil - Date.now()) / 1000) : 0; }
function noteFail(ip) {
  const now = Date.now(); let a = attempts.get(ip);
  if (!a || now - a.first > WINDOW) a = { n: 0, first: now, lockUntil: 0 };
  a.n++; if (a.n >= MAX_FAILS) a.lockUntil = now + LOCK;
  attempts.set(ip, a);
}
setInterval(() => { const now = Date.now(); for (const [k, s] of sessions) if (s.exp < now) sessions.delete(k); for (const [k, a] of attempts) if (now - a.first > WINDOW && a.lockUntil < now) attempts.delete(k); }, 60000).unref();

// ---------- guide page ----------
// All enabled languages are rendered on the server; switching is radio + label + CSS (works even if
// JavaScript is blocked, fails, or an old script is cached). app.js only adds install/PDF buttons and memory.
const { panel } = require("./lib/render.js");
const ASSET_V = crypto.createHash("sha256").update(["app.js", "style.css", "pwa.css", "sw.js"].map((f) => fs.readFileSync(path.join(ROOT, "public", f))).join("|")).digest("hex").slice(0, 10);
function guidePage(req, url) {
  const qr = isQrSession(req);
  const langs = enabledLangs();
  const install = settings.install && !qr;
  const pdf = settings.pdf && !qr;
  const names = {}; for (const k of langs) names[k] = { name: LIVE[k].name, htmlLang: LIVE[k].htmlLang || k };
  const cfg = { qr, install, pdf, langs, pdfLangs: pdf ? langs : [] };
  const json = JSON.stringify({ cfg, names }).replace(/</g, "\\u003c");
  const ql = url && url.searchParams.get("lang");
  const first = langs.includes(ql) ? ql : langs.includes("en") ? "en" : langs[0];
  const v = "?v=" + ASSET_V;
  return `<!DOCTYPE html>
<html lang="${esc(names[first].htmlLang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#da291c">
<title>LOTTE rent-a-car Gimhae Airport – Rental Guide</title>
<link rel="icon" href="/icons/favicon-32.png">
${install ? `<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Gimhae Guide">` : ""}
<link rel="stylesheet" href="/style.css${v}"><link rel="stylesheet" href="/pwa.css${v}">
</head><body${qr ? ' class="qr"' : ""}>
${langs.map((k) => `<input type="radio" class="lr" name="lang" id="L-${k}" value="${k}"${k === first ? " checked" : ""} aria-label="${esc(names[k].name)}">`).join("\n")}
<header class="top"><div class="bar"><div class="brand"><img class="logo" src="/icons/icon-192.png" alt=""><div><div class="kicker">LOTTE rent-a-car</div><h1 id="title">${esc((LIVE.en || LIVE[first]).title)}</h1></div></div>
<nav class="langs" id="langs" aria-label="Language">${langs.length > 1 ? langs.map((k) => `<label for="L-${k}" data-k="${k}" lang="${esc(names[k].htmlLang)}">${esc(names[k].name)}</label>`).join("") : ""}</nav></div></header>
<div class="actions" id="actions" hidden></div>
<div class="hint" id="hint" hidden></div>
<main id="main">
${langs.map((k) => panel(k, LIVE[k])).join("\n")}
</main>
<script type="application/json" id="boot">${json}</script>
<script src="/app.js${v}"></script>
</body></html>`;
}

// ---------- admin pages ----------
function adminShell(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><link rel="stylesheet" href="/admin.css"></head>
<body><main class="adm"><h1>${esc(title)}</h1>${body}</main></body></html>`;
}
function loginPage(msg) {
  return adminShell("Admin sign-in", `${msg ? `<p class="err">${esc(msg)}</p>` : ""}
<form method="post" action="/admin/login" autocomplete="off"><label>Password <input type="password" name="password" required autofocus></label>
<button type="submit">Sign in</button></form>`);
}
function adminPage(s, req, msg) {
  const chk = (name, on, label) => `<label class="ck"><input type="checkbox" name="${name}" value="1"${on ? " checked" : ""}> ${esc(label)}</label>`;
  const inp = (name, label, val, ph = "") => `<label>${esc(label)} <input name="${name}" value="${esc(val)}" placeholder="${esc(ph)}"></label>`;
  const qrUrl = qrTarget(req);
  return adminShell("Guide settings (admin)", `${msg ? `<p class="ok">${esc(msg)}</p>` : ""}
<form method="post" action="/admin/settings">
<input type="hidden" name="csrf" value="${s.csrf}">
<fieldset><legend>Access</legend>
${chk("qrBlock", settings.qrBlock, "Block app install and PDF download for visitors who arrive via the QR code")}
${chk("pdf", settings.pdf, "Allow PDF downloads (normal visitors)")}
${chk("install", settings.install, "Allow app install (normal visitors)")}
</fieldset>
<fieldset><legend>Languages shown</legend>${ORDER.map((k) => chk("lang_" + k, settings.langs[k], `${GUIDE[k].name} (${k})`)).join("")}</fieldset>
<fieldset><legend>Office details shown in the guide</legend>
${inp("officePhone", "Gimhae Airport Office phone", settings.officePhone)}
${inp("officeHours", "Gimhae Airport Office hours (HH:MM–HH:MM)", settings.officeHours)}
${inp("csPhone", "Customer Support phone", settings.csPhone)}
${inp("csHours", "Customer Support hours (HH:MM–HH:MM)", settings.csHours)}
${inp("emPhone", "Emergency phone (24 h)", settings.emPhone)}
</fieldset>
<fieldset><legend>QR code</legend>
${inp("publicUrl", "Public site URL (https://…). Empty = use the address this page was opened with", settings.publicUrl, "https://guide.example.com")}
<p class="small">QR code target: <code>${esc(qrUrl)}</code></p>
<p><img src="/admin/qr.png?size=240" width="240" height="240" alt="QR code"></p>
<p><a class="btn" href="/admin/qr.png?download=1&amp;size=1024">Download QR code (PNG)</a></p>
</fieldset>
<button type="submit">Save settings</button>
</form>
<form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${s.csrf}"><button type="submit" class="sec">Sign out</button></form>`);
}
function qrTarget(req) {
  let base = settings.publicUrl;
  if (!base) base = (isSecure(req) ? "https" : "http") + "://" + (req.headers.host || "localhost:" + PORT);
  return base.replace(/\/+$/, "") + "/?src=qr";
}

// ---------- static ----------
const MIME = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
function serveStatic(res, rel, cache = "public, max-age=3600") {
  const p = path.normalize(path.join(ROOT, "public", rel));
  if (!p.startsWith(path.join(ROOT, "public") + path.sep)) return send(res, 404, "Not found", "text/plain");
  fs.readFile(p, (err, buf) => err ? send(res, 404, "Not found", "text/plain") : send(res, 200, buf, MIME[path.extname(p)] || "application/octet-stream", { "Cache-Control": cache }));
}

// ---------- router ----------
async function handle(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  // QR landing: any URL carrying ?src=qr marks this browser session, then the marker is stripped.
  if (req.method === "GET" && url.searchParams.get("src") === "qr" && !p.startsWith("/admin")) {
    const id = crypto.randomBytes(12).toString("base64url");
    url.searchParams.delete("src");
    const loc = (p === "/" || p === "/index.html" ? "/" : p) + (url.searchParams.toString() ? "?" + url.searchParams : "");
    return send(res, 302, "", "text/plain", { "Set-Cookie": cookie(req, "gg_qr", id + "." + sign("qr:" + id)), Location: loc, "Cache-Control": "no-store" });
  }

  if (req.method === "GET" && (p === "/" || p === "/index.html"))
    return send(res, 200, guidePage(req, url), undefined, { "Cache-Control": "no-cache", Vary: "Cookie" });

  if (req.method === "GET" && p === "/manifest.webmanifest") {
    if (!settings.install || isQrSession(req)) return send(res, 404, "Not found", "text/plain", { "Cache-Control": "no-store", Vary: "Cookie" });
    return send(res, 200, JSON.stringify({
      name: "LOTTE rent-a-car Gimhae Airport Guide", short_name: "Gimhae Guide", id: "/", start_url: "/?pwa=1", scope: "/",
      display: "standalone", background_color: "#ffffff", theme_color: "#da291c",
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
    }), MIME[".webmanifest"], { "Cache-Control": "no-cache", Vary: "Cookie" });
  }
  if (req.method === "GET" && p === "/sw.js") {
    if (!settings.install || isQrSession(req)) return send(res, 404, "Not found", "text/plain", { "Cache-Control": "no-store" });
    return serveStatic(res, "sw.js", "no-cache");
  }

  const pm = p.match(/^\/pdf\/([A-Za-z-]+)\.pdf$/);
  if (pm && req.method === "GET") {
    const k = pm[1];
    if (isQrSession(req)) return send(res, 403, "PDF download is not available for QR code visitors.", "text/plain; charset=utf-8", { "Cache-Control": "no-store" });
    if (!settings.pdf || !ORDER.includes(k) || !enabledLangs().includes(k)) return send(res, 403, "PDF download is disabled.", "text/plain; charset=utf-8", { "Cache-Control": "no-store" });
    const f = path.join(ROOT, "pdf", `guide_${k}.pdf`);
    return fs.readFile(f, (err, buf) => err ? send(res, 404, "Not found", "text/plain")
      : send(res, 200, buf, "application/pdf", { "Content-Disposition": `attachment; filename="LOTTE-rent-a-car-Gimhae-guide_${k}.pdf"`, "Cache-Control": "private, no-store" }));
  }

  // ----- admin -----
  if (p === "/admin" || p.startsWith("/admin/")) {
    const nocache = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
    const s = adminSession(req);
    if (req.method === "GET" && p === "/admin") return send(res, 200, s ? adminPage(s, req) : loginPage(), undefined, nocache);
    if (req.method === "POST" && p === "/admin/login") {
      const ip = clientIp(req);
      const wait = rateLimited(ip);
      if (wait) return send(res, 429, loginPage(`Too many failed attempts. Try again in ${Math.ceil(wait / 60)} min.`), undefined, { ...nocache, "Retry-After": String(wait) });
      let body; try { body = await readBody(req); } catch (e) { return send(res, 413, "Too large", "text/plain"); }
      if (!body.password || !verifyPassword(body.password, ADMIN)) {
        noteFail(ip);
        await new Promise((r) => setTimeout(r, 400));
        return send(res, 401, loginPage("Wrong password."), undefined, nocache);
      }
      attempts.delete(ip);
      const token = crypto.randomBytes(32).toString("base64url");
      sessions.set(token, { exp: Date.now() + SESSION_TTL, csrf: crypto.randomBytes(24).toString("base64url") });
      return send(res, 303, "", "text/plain", { ...nocache, Location: "/admin", "Set-Cookie": cookie(req, "gg_admin", token, { path: "/admin", sameSite: "Strict", maxAge: SESSION_TTL / 1000 }) });
    }
    if (!s) return send(res, req.method === "GET" ? 302 : 403, "", "text/plain", { ...nocache, Location: "/admin" });
    if (req.method === "GET" && p === "/admin/qr.png") {
      const size = Math.min(2048, Math.max(128, parseInt(url.searchParams.get("size") || "512", 10) || 512));
      const png = await QRCode.toBuffer(qrTarget(req), { type: "png", width: size, margin: 2, errorCorrectionLevel: "M" });
      const h = { ...nocache }; if (url.searchParams.get("download")) h["Content-Disposition"] = 'attachment; filename="gimhae-guide-qr.png"';
      return send(res, 200, png, "image/png", h);
    }
    if (req.method === "POST") {
      let body; try { body = await readBody(req); } catch (e) { return send(res, 413, "Too large", "text/plain"); }
      const a = Buffer.from(String(body.csrf || "")), b = Buffer.from(s.csrf);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(res, 403, "Bad request token", "text/plain", nocache);
      if (p === "/admin/logout") {
        sessions.delete(parseCookies(req).gg_admin);
        return send(res, 303, "", "text/plain", { ...nocache, Location: "/admin", "Set-Cookie": cookie(req, "gg_admin", "", { path: "/admin", sameSite: "Strict", maxAge: 0 }) });
      }
      if (p === "/admin/settings") {
        const errs = [];
        const phone = (v, d, n) => { v = String(v || "").trim(); if (/^[0-9+\-() ]{3,30}$/.test(v)) return v; errs.push(n); return d; };
        const hours = (v, d, n) => { v = String(v || "").trim().replace(/\s*[-~～]\s*/, "–"); const m = v.match(/^([01]\d|2[0-3]):([0-5]\d)–([01]\d|2[0-4]):([0-5]\d)$/); if (m) return v; errs.push(n); return d; };
        let pub = String(body.publicUrl || "").trim();
        if (pub) { try { const u = new URL(pub); if (!/^https?:$/.test(u.protocol)) throw 0; pub = u.origin + u.pathname.replace(/\/+$/, ""); } catch (e) { errs.push("Public site URL"); pub = settings.publicUrl; } }
        const next = {
          qrBlock: body.qrBlock === "1", pdf: body.pdf === "1", install: body.install === "1",
          langs: Object.fromEntries(ORDER.map((k) => [k, body["lang_" + k] === "1"])),
          officePhone: phone(body.officePhone, settings.officePhone, "Office phone"),
          officeHours: hours(body.officeHours, settings.officeHours, "Office hours"),
          csPhone: phone(body.csPhone, settings.csPhone, "Customer Support phone"),
          csHours: hours(body.csHours, settings.csHours, "Customer Support hours"),
          emPhone: phone(body.emPhone, settings.emPhone, "Emergency phone"),
          publicUrl: pub,
        };
        if (!ORDER.some((k) => next.langs[k])) { next.langs.en = true; errs.push("At least one language (English kept on)"); }
        settings = next; saveSettings();
        return send(res, 200, adminPage(s, req, errs.length ? "Saved. Not changed (invalid): " + errs.join(", ") : "Saved. Changes apply to all visitors now."), undefined, nocache);
      }
    }
    return send(res, 404, "Not found", "text/plain", nocache);
  }

  if (req.method === "GET" && /^\/(app\.js|style\.css|pwa\.css|admin\.css|icons\/[a-z0-9-]+\.png)$/.test(p)) return serveStatic(res, p.slice(1));
  if (req.method === "GET" && p === "/healthz") return send(res, 200, "ok", "text/plain");
  return send(res, 404, "Not found", "text/plain");
}

http.createServer((req, res) => { handle(req, res).catch((e) => { console.error(e); if (!res.headersSent) send(res, 500, "Server error", "text/plain"); else res.end(); }); })
  .listen(PORT, () => console.log(`Gimhae guide running on http://localhost:${PORT}`));

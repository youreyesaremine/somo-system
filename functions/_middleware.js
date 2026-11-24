/* SOMO System – site password (one shared PIN for everyone).
   The PIN is NOT in this file (the repository is public). Set it in Cloudflare:
   Pages project > Settings > Variables and Secrets > add  SITE_PIN  (type: Secret).
   Wrong tries are limited per device/IP using the SYNC KV namespace (if bound). */
const COOKIE = "somo_auth", DAYS = 30, MAX_TRIES = 5, BLOCK_MIN = 10;
const enc = new TextEncoder();

async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode("somo-site|" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)))].map(b => b.toString(16).padStart(2, "0")).join("");
}
function same(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function getCookie(req, name) { const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)")); return m ? m[1] : ""; }
async function validSession(req, pin) {
  const v = getCookie(req, COOKIE); const [exp, sig] = v.split(".");
  if (!exp || !sig || +exp < Date.now()) return false;
  return same(sig, await hmac(pin, exp));
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function page(msg, wait) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#1f3864"><meta name="robots" content="noindex"><title>SOMO System – Sign in</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef2f7;font-family:Roboto,"Segoe UI",Arial,sans-serif;color:#17202e;padding:20px}
@media(prefers-color-scheme:dark){body{background:#0f1620;color:#e8eef7}.b{background:#18212e!important;border-color:#2b3747!important}input{background:#111a25!important;color:#e8eef7!important;border-color:#2b3747!important}}
.b{width:100%;max-width:340px;background:#fff;border:1px solid #d6deea;border-radius:16px;padding:26px 20px;text-align:center}
.lg{width:64px;height:64px;border-radius:50%;background:#1f8f2e;color:#ffeb3b;font-weight:900;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;border:3px solid #ffeb3b;box-shadow:0 0 0 3px #1f8f2e;font-size:14px}
h1{font-size:20px;margin:6px 0 2px}p{margin:0 0 16px;color:#5d6b80;font-size:14px}
input{width:100%;height:56px;border-radius:12px;border:1.5px solid #d6deea;background:#f7f9fc;font-size:28px;font-weight:800;text-align:center;letter-spacing:12px;outline:none}
input:focus{border-color:#1f3864}button{width:100%;height:50px;margin-top:12px;border:none;border-radius:12px;background:#1f3864;color:#fff;font-size:16px;font-weight:800}
.e{color:#c62828;font-weight:700;font-size:13.5px;min-height:20px;margin-top:10px}</style></head>
<body><form class="b" method="POST" action="/login" autocomplete="off"><div class="lg">SOMO</div><h1>SOMO System</h1><p>Enter the access code</p>
<input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autofocus required ${wait ? "disabled" : ""}>
<button ${wait ? "disabled" : ""}>Sign in</button><div class="e">${esc(msg || "")}</div></form></body></html>`;
}
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", ...extra } });
const redirect = (to, cookie) => new Response(null, { status: 302, headers: { Location: to, "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  const pin = String(env.SITE_PIN || "").trim();
  if (!pin) return html(page("Access code is not set up yet (SITE_PIN)."), 503);

  if (url.pathname === "/logout") return redirect("/login", `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);

  if (url.pathname === "/login") {
    if (request.method === "GET") return (await validSession(request, pin)) ? redirect("/") : html(page(""));
    if (request.method !== "POST") return html(page(""), 405);
    const ip = request.headers.get("cf-connecting-ip") || "x", rk = "login-fail:" + ip, kv = env.SYNC;
    let f = { n: 0, until: 0 };
    if (kv) { try { f = (await kv.get(rk, "json")) || f; } catch (e) {} }
    if (Date.now() < f.until) return html(page(`Too many wrong tries. Try again in ${Math.ceil((f.until - Date.now()) / 60000)} min.`, true), 429);
    const form = await request.formData();
    const given = String(form.get("pin") || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).trim();
    if (same(await hmac(pin, "check"), await hmac(given, "check"))) {
      if (kv) { try { await kv.delete(rk); } catch (e) {} }
      const exp = String(Date.now() + DAYS * 864e5);
      return redirect("/", `${COOKIE}=${exp}.${await hmac(pin, exp)}; Path=/; Max-Age=${DAYS * 86400}; Secure; HttpOnly; SameSite=Lax`);
    }
    f.n++; if (f.n >= MAX_TRIES) { f.until = Date.now() + BLOCK_MIN * 60000; f.n = 0; }
    if (kv) { try { await kv.put(rk, JSON.stringify(f), { expirationTtl: 3600 }); } catch (e) {} }
    return html(page(f.until > Date.now() ? `Too many wrong tries. Wait ${BLOCK_MIN} min.` : `Wrong code (${MAX_TRIES - f.n} tries left)`), 401);
  }

  if (await validSession(request, pin)) return next();
  if (url.pathname.startsWith("/api/")) return new Response(JSON.stringify({ error: "login" }), { status: 401, headers: { "content-type": "application/json" } });
  return redirect("/login");
}

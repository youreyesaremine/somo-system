/* SOMO System – Cloud Sync endpoint (Cloudflare Pages Function).
   Needs a KV namespace bound to this Pages project with the variable name: SYNC
   Stores only encrypted data; the key never leaves the user's devices. */
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function onRequest({ request, env }) {
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[a-f0-9]{64}$/.test(id)) return J({ error: "bad id" }, 400);
  if (!env.SYNC) return J({ error: "KV namespace SYNC is not bound" }, 500);

  if (request.method === "GET") {
    const v = await env.SYNC.get(id);
    return new Response(v || "null", { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  if (request.method === "PUT") {
    const body = await request.text();
    if (body.length > 500000) return J({ error: "too large" }, 413);
    let o;
    try { o = JSON.parse(body); } catch (e) { return J({ error: "bad json" }, 400); }
    if (typeof o.t !== "number" || typeof o.c !== "string") return J({ error: "bad data" }, 400);
    const cur = await env.SYNC.get(id, "json");
    if (cur && cur.t > o.t) return J({ conflict: true, t: cur.t }, 409);
    await env.SYNC.put(id, JSON.stringify({ t: o.t, c: o.c }));
    return J({ ok: true, t: o.t });
  }
  return J({ error: "method not allowed" }, 405);
}

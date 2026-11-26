/* SOMO System – offline cache. Change VERSION whenever index.html is updated. */
const VERSION="somo-2026-11-26-3";
const FILES=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-maskable-512.png","./apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES)).catch(()=>{}).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==VERSION).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));});
const good=r=>r&&r.ok&&r.type==="basic"&&!r.redirected;     /* never cache a sign-in page */
self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==location.origin||url.pathname.includes("/api/")||/^\/(login|logout)/.test(url.pathname))return;   /* sign-in pages always live */   /* sync + sign-in always go to the network */
  if(req.mode==="navigate"){
    /* online: open the live page (lets Cloudflare Access ask for sign-in when needed); offline/slow: cached copy */
    e.respondWith((async()=>{
      const c=await caches.open(VERSION);
      try{
        const r=await Promise.race([fetch(req,{redirect:"manual"}),new Promise((_,rej)=>setTimeout(()=>rej(0),4000))]);
        if(r.type==="opaqueredirect")return r;
        if(good(r)){c.put("./index.html",r.clone());return r;}
        return (await c.match("./index.html"))||r;
      }catch(x){return (await c.match("./index.html"))||Response.error();}
    })());
    return;
  }
  e.respondWith(caches.open(VERSION).then(async c=>{
    const hit=await c.match(req,{ignoreSearch:true});
    const net=fetch(req).then(r=>{if(good(r))c.put(req,r.clone());return r;}).catch(()=>hit);
    return hit||net;
  }));
});

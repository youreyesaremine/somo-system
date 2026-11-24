/* SOMO System – offline cache. Change VERSION whenever index.html is updated. */
const VERSION="somo-2026-11-24-2";
const FILES=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-maskable-512.png","./apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==VERSION).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  if(new URL(e.request.url).pathname.includes("/api/"))return;   /* cloud sync always goes to the network */
  const isPage=e.request.mode==="navigate";
  e.respondWith(caches.open(VERSION).then(async c=>{
    const hit=await c.match(isPage?"./index.html":e.request,{ignoreSearch:true});
    const net=fetch(e.request).then(r=>{if(r&&r.ok&&new URL(e.request.url).origin===location.origin)c.put(isPage?"./index.html":e.request,r.clone());return r;}).catch(()=>hit);
    return hit||net;   /* offline first; refreshes the copy in the background when online */
  }));
});

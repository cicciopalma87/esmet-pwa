// Cache semplice: la shell funziona offline, i dati passano sempre dalla rete.
const V='esmet-0.8.1';
const SHELL=['./','index.html','css/app.css','js/config.js','js/app.js','vendor/supabase.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/logo.png','icons/bg-wave.jpg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));
});

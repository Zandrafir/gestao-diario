const CACHE_NAME = 'gestao-diario-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Remove caches antigos quando a nova versão assume
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(nomes =>
      Promise.all(nomes.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// PUSH REAL: mensagem enviada pela Edge Function 'push-chamada' chega aqui pelo
// sistema operacional mesmo com o app fechado. Mostramos a notificação nativa.
self.addEventListener('push', event => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch (e) { dados = { body: event.data && event.data.text() }; }
  const titulo = dados.title || '📋 Hora da Chamada';
  const opcoes = {
    body: dados.body || 'Não esqueça de fazer a chamada!',
    icon: dados.icon || 'https://img.icons8.com/fluency/192/graduation-cap.png',
    badge: 'https://img.icons8.com/fluency/192/graduation-cap.png',
    tag: dados.tag || 'chamada',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: dados.url || 'https://saladofuturoprofessor.educacao.sp.gov.br' }
  };
  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

// Notificação de lembrete de chamada (push real acima, ou motor local do
// index.html via registration.showNotification). Clicar nela foca o app já
// aberto (ou abre uma aba nova) direto no Sala do Futuro Professor.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if (client.navigate) client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

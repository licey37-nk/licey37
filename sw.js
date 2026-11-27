/* ============================================================
   L37 Notification Service Worker v1 — МБОУ «Лицей №37»
   Лёгкий Service Worker: только системные уведомления в шторку
   (notificationclick + фокусировка вкладки). Никакого кэша страниц.
   ============================================================ */

self.addEventListener('install', function (event) {
  try { self.skipWaiting(); } catch (e) {}
});

self.addEventListener('activate', function (event) {
  try { event.waitUntil(self.clients.claim()); } catch (e) {}
});

self.addEventListener('notificationclick', function (event) {
  try {
    event.notification.close();
    var data = event.notification.data || {};
    var target = data.open || '';
    var url = data.url || self.registration.scope;
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          try { client.postMessage({ l37NotifyOpen37: target }); } catch (e) {}
          try { return client.focus(); } catch (e) {}
        }
        try { return self.clients.openWindow(url + '#l37open=' + encodeURIComponent(target)); } catch (e) {}
      })
    );
  } catch (e) {}
});

self.addEventListener('notificationclose', function () {});

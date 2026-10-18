// sw.js - Service Worker для уведомлений
self.addEventListener('push', function(event) {
    const data = event.data.json();
    const options = {
        body: data.body,
        icon: data.icon || '/logo_worker.png',
        badge: data.badge || '/logo_worker.png',
        vibrate: [100, 50, 100],
        data: data.data,
        actions: data.actions
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

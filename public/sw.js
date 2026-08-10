// Service Worker for SCI CENTER
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('push', (event) => {
    let data = { title: '알림', body: '새로운 메시지가 도착했습니다.' };
    try {
        if (event.data) {
            data = event.data.json();
        }
    } catch (e) {
        data = { title: '알림', body: event.data ? event.data.text() : '새로운 공지사항이 도착했습니다.' };
    }

    const noticeId = data.noticeId || (data.data && data.data.noticeId);
    const targetUrl = data.url || (data.data && data.data.url) || (noticeId ? `/?noticeId=${noticeId}` : '/');

    const options = {
        body: data.body || '지금 바로 앱에서 확인해보세요!',
        icon: '/icon-512.png',
        badge: '/icon-512.png',
        data: {
            url: targetUrl,
            noticeId: noticeId
        },
        vibrate: [100, 50, 100]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'SCI CENTER', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const notificationData = event.notification.data || {};
    const urlToOpen = notificationData.url || (notificationData.noticeId ? `/?noticeId=${notificationData.noticeId}` : '/');

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if ('focus' in client) {
                    if ('navigate' in client) {
                        client.navigate(urlToOpen);
                    }
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

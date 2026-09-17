// MailSentinel AI - Firebase Cloud Messaging Service Worker
// Supports Web Push, background alerts, notification click handling, and deep linking

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

try {
  firebase.initializeApp({
    projectId: 'project-fb6003fc-15d3-429a-b8d',
    messagingSenderId: '445127289597',
    appId: '1:445127289597:web:91612cc1d229357c82ac94',
    apiKey: 'AIzaSyCjsc45qNgsrDmC6Jo345ulgUFVnAGDynY',
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[MailSentinel FCM SW] Background message received:', payload);
    const title = payload.notification?.title || payload.data?.title || 'MailSentinel Alert';
    const body = payload.notification?.body || payload.data?.body || 'Priority email security notification.';
    const emailId = payload.data?.emailId || payload.data?.id;
    const deliveryId = payload.data?.deliveryId;

    const notificationOptions = {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: payload.data?.tag || (emailId ? `mailsentinel-${emailId}` : `mailsentinel-${Date.now()}`),
      data: {
        emailId,
        deliveryId,
        url: emailId ? `/?emailId=${encodeURIComponent(emailId)}` : '/',
      },
      actions: [
        { action: 'open', title: 'Open Email' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };

    return self.registration.showNotification(title, notificationOptions);
  });
} catch (err) {
  console.warn('[MailSentinel FCM SW] Firebase messaging init in service worker:', err);
}

// Push event fallback
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      if (!data.notification && !data.data) return;
      const title = data.notification?.title || data.data?.title || 'MailSentinel Alert';
      const body = data.notification?.body || data.data?.body || 'New message alert.';
      const emailId = data.data?.emailId;
      const deliveryId = data.data?.deliveryId;

      event.waitUntil(
        self.registration.showNotification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: emailId ? `mailsentinel-${emailId}` : 'mailsentinel-alert',
          data: {
            emailId,
            deliveryId,
            url: emailId ? `/?emailId=${encodeURIComponent(emailId)}` : '/',
          },
        })
      );
    } catch (e) {
      // Ignore if not JSON
    }
  }
});

// Notification click handling & Deep Linking into the relevant MailSentinel email
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const emailId = event.notification.data?.emailId;
  const deliveryId = event.notification.data?.deliveryId;
  const targetUrl = event.notification.data?.url || (emailId ? `/?emailId=${encodeURIComponent(emailId)}` : '/');

  // Automatically acknowledge delivery on click if delivery ID is present
  if (deliveryId) {
    try {
      fetch(`/api/notifications/deliveries/${deliveryId}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAgent: navigator.userAgent }),
      }).catch(() => {});
    } catch (e) {}
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window and navigate to deep link
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Or open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

const CACHE_NAME = "pwa-action-tester-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// ============================================================================
// NOTIFICATION DISPLAY TEST ENTRY
// This is the fastest place to debug notification payload issues.
// The page sends a fully prepared test payload here, and the service worker
// shows the notification locally. If actions or duplicated metadata look wrong,
// inspect this path first.
// ============================================================================

self.addEventListener("message", (event) => {
  const payload = event.data;

  if (!payload) {
    return;
  }

  if (payload.type === "show-test-notification") {
    event.waitUntil(showLocalTestNotification(payload.notification));
    return;
  }

  if (payload.type === "refresh-app-shell") {
    event.waitUntil(refreshAppShell(event));
    return;
  }

  if (payload.type === "skip-waiting") {
    self.skipWaiting();
    replyToMessage(event, { ok: true });
  }
});

async function showLocalTestNotification(notification) {
  if (!notification || typeof notification !== "object") {
    return;
  }

  await self.registration.showNotification(notification.title, notification.options);
}

// ============================================================================
// NOTIFICATION CLICK TEST ENTRY
// This is the fastest place to debug Android action handling.
// The point of the test is to trust only event.action and log exactly what
// Android Chrome sends back for the tapped notification action.
// If Chrome reports the wrong action, or reports an empty string, inspect here.
// ============================================================================

self.addEventListener("notificationclick", (event) => {
  event.waitUntil(handleNotificationClick(event));
});

async function handleNotificationClick(event) {
  const notification = event.notification;
  const notificationData = notification.data || {};
  const expectedActions = Array.isArray(notificationData.expectedActions)
    ? notificationData.expectedActions
    : [];
  const selectedActionId = event.action || "";
  const selectedActionMeta = expectedActions.find((item) => item.action === selectedActionId) || null;

  const entry = {
    timestamp: new Date().toISOString(),
    selectedActionId,
    selectedActionMeta,
    testId: notificationData.testId || "unknown_test",
    notificationId: notificationData.notificationId || "unknown_notification",
    createdAt: notificationData.createdAt || null,
    receivedAt: new Date().toISOString(),
    notificationTitle: notification.title,
    notificationBody: notification.body,
    actions: notification.actions || [],
    notificationData,
  };

  notification.close();

  await focusOrOpenClient();
  await postEntryToClients(entry);
}

// ============================================================================
// APP SHELL AND OFFLINE SUPPORT
// Everything below is just enough caching for installability and simple offline
// testing. It is not where action-button bugs normally live.
// ============================================================================

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      const fallback = await caches.match("./index.html");
      if (fallback) {
        return fallback;
      }
      throw error;
    }
  })());
});

async function focusOrOpenClient() {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of clientList) {
    if ("focus" in client) {
      await client.focus();
      return client;
    }
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow("./");
  }

  return null;
}

async function postEntryToClients(entry) {
  let clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  if (clientList.length === 0) {
    await delay(700);
    clientList = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
  }

  await Promise.all(
    clientList.map((client) =>
      client.postMessage({
        type: "notification-click-result",
        entry,
      })
    )
  );
}

async function refreshAppShell(event) {
  try {
    await caches.delete(CACHE_NAME);
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    replyToMessage(event, {
      ok: true,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    replyToMessage(event, {
      ok: false,
      error: error.message,
    });
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function replyToMessage(event, payload) {
  const replyPort = event.ports && event.ports[0];
  if (replyPort) {
    replyPort.postMessage(payload);
  }
}

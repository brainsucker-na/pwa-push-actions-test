# PWA Notification Action Tester

Tiny static website for testing Android Chrome notification action buttons with a service worker. It uses only local `registration.showNotification(...)` calls. There is no backend, no push server, no Firebase, and no VAPID setup.

## Files

- `index.html`
- `app.js`
- `sw.js`
- `manifest.json`
- `icons/`

## What it does

- Registers a service worker
- Requests notification permission
- Shows environment info:
  - user agent
  - standalone / installed mode
  - notification permission
  - service worker status
- Triggers local test notifications with predefined or custom actions
- Handles `notificationclick` in the service worker
- Logs:
  - `event.action`
  - notification data
  - actions array
  - timestamps
  - test id
- Sends click results from the service worker back to the page with `client.postMessage(...)`
- Shows logs on the page
- Lets you copy or clear logs

## Run locally

You must serve the files over a local HTTP server. Do not open `index.html` directly from the filesystem.

### Option 1: Python

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### Option 2: npx serve

```bash
npx serve .
```

Then open the URL printed by `serve`.

## Secure context requirement

Service workers and notifications require a secure context.

- `http://localhost:8000` works when you open it on the same machine that runs the server.
- On Android Chrome, plain LAN URLs such as `http://192.168.x.x:8000` are not enough for service worker testing.
- For Android device testing, use either:
  - an HTTPS origin
  - a tunnel that gives you HTTPS
  - a server running directly on the Android device so you can use `localhost`

## Android Chrome test flow

1. Open the site in Chrome on Android.
2. Install it if you want standalone testing.
3. Tap `Register Service Worker`.
4. Tap `Request Notification Permission` and allow notifications.
5. Trigger one of the predefined notifications or a custom one.
6. Tap a notification action button on the device.
7. Inspect the on-page log for the service worker message containing the selected `event.action`.

## Important implementation notes

- Notification routing is based only on `event.action`.
- Expected action metadata is duplicated in `notification.data.expectedActions`.
- Every notification instance gets a unique `notificationId`.
- Every log entry includes timestamps.
- Offline support is minimal and intended only to satisfy basic installability and keep the app shell available.

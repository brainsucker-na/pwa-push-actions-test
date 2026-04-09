# PWA Notification Actions Test App

Tiny static website for testing PWA notification actions and inspecting what `event.action` reaches the service worker.

Test yourself:

https://brainsucker-na.github.io/pwa-push-actions-test/

One concrete issue this app helps demonstrate:

- on Chrome Android 146, whether used as an installed PWA or in a regular browser tab, tapping the first visible action button may return the second action id

Observed Android Chrome bug:

- the service worker defines notification `actions` correctly
- Android Chrome shows those action buttons correctly
- when the first visible button is tapped, `notificationclick` may deliver the second button's `event.action`
- the same test flow works correctly in Opera Android
- the same test flow works correctly in Chrome/Edge on Windows

Observed compatibility matrix:

- Works incorrectly: Chrome Android 146
- Works correctly: Opera Android
- Works correctly: Chrome Windows
- Works correctly: Edge Windows

The app uses only local notifications. There is no backend, no push server, no Firebase, and no VAPID setup.

## Files

- `index.html`
- `styles.css`
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
- Shows the last `event.action` returned by the service worker in the UI
- Includes an `Update PWA` button to refresh the installed app from the site

## Update button

Installed PWAs can keep serving cached app files. The `Update PWA` button exists so you can force the installed app to refresh itself from the current site version before testing again.

When pressed, it:

- checks for an updated service worker
- activates it immediately if a newer worker is waiting
- clears and rebuilds the cached app shell from network
- reloads the app

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
2. Optional: install it as a PWA from Chrome if you also want to test installed mode.
3. Tap `Register SW`.
4. Tap `Allow Notifications`.
5. Tap `Show test` on one of the predefined cases.
6. Tap an action button in the notification on the device.
7. Check the `Last Click Result` panel for the returned `event.action`.
8. Inspect the log panel for the full service worker payload.

## Expected demo outcome

- On Chrome Android 146: tapping the first visible action button may return the second action id instead.
- On Opera Android: the returned `event.action` should match the tapped button.
- On Chrome/Edge for Windows: the returned `event.action` should match the tapped button.

## Important implementation notes

- Notification routing is based only on `event.action`.
- Expected action metadata is duplicated in `notification.data.expectedActions`.
- Every notification instance gets a unique `notificationId`.
- Every log entry includes timestamps.
- Offline support is minimal and intended only to satisfy basic installability and keep the app shell available.

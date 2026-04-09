# PWA Notification Action Tester

Tiny static website created to demonstrate a notification action bug in an installed Android Chrome PWA.

Observed bug being demonstrated:

- the service worker defines notification `actions` correctly
- Android Chrome shows those action buttons correctly
- when the first visible button is tapped, `notificationclick` always delivers the second button's `event.action`
- the same test flow behaves correctly in Chrome/Edge on Windows

The app uses only local notifications. There is no backend, no push server, no Firebase, and no VAPID setup.

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
- Compares the expected action id for the button you chose to test against the actual `event.action`
- Shows a visible `MATCH` or `MISMATCH` result in the UI
- Includes an `Update PWA` button to refresh the installed app from the site

## Why the UI asks which button you are testing

The browser only gives the service worker `event.action`. It does not directly tell the page which visible button label the user intended to tap.

To make the bug obvious, each predefined test case has launch buttons such as:

- `Show, tap button #1`
- `Show, tap button #2`

When you start a test this way, the app stores the expected action id for that button inside `notification.data`. After the click comes back from the service worker, the page compares:

- expected action id
- actual `event.action`

If they differ, the UI shows `MISMATCH`, which means the bug was reproduced.

## Update button

Installed PWAs can keep serving cached app files. The `Update PWA` button exists so you can force the app to refresh itself from the current site version before testing again.

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
2. Install it as a PWA from Chrome.
3. Tap `Register Service Worker`.
4. Tap `Request Notification Permission` and allow notifications.
5. Use one of the predefined test buttons such as `Show, tap button #1`.
6. Tap that button in the notification on the device.
7. Check the `Last Click Result` panel:
   - `MATCH` means the returned `event.action` matched the intended button
   - `MISMATCH` means the returned `event.action` did not match the intended button
8. Inspect the log panel for the full service worker payload.

## Expected demo outcome

- On Chrome for Windows: the predefined button tests should normally show `MATCH`.
- On the affected installed Android Chrome PWA: tapping the first visible action button may show `MISMATCH` because the returned id belongs to the second action.

## Important implementation notes

- Notification routing is based only on `event.action`.
- Expected action metadata is duplicated in `notification.data.expectedActions`.
- The expected button for each test run is duplicated in `notification.data.expectedTap`.
- Every notification instance gets a unique `notificationId`.
- Every log entry includes timestamps.
- Offline support is minimal and intended only to satisfy basic installability and keep the app shell available.

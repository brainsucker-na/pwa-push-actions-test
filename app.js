const APP_VERSION = "1.0.0";
const LOG_STORAGE_KEY = "pwa-action-tester-logs";
const CUSTOM_TEST_ID = "custom_actions";

const predefinedTests = [
  {
    id: "two_actions",
    label: "first_action / second_action",
    title: "Two actions",
    body: "Tap button 1 or 2.",
    actions: [
      { action: "first_action", title: "First" },
      { action: "second_action", title: "Second" },
    ],
  },
  {
    id: "two_actions_reversed_titles",
    label: "Same ids, swapped titles",
    title: "Swapped titles",
    body: "Same ids, swapped labels.",
    actions: [
      { action: "first_action", title: "Second" },
      { action: "second_action", title: "First" },
    ],
  },
  {
    id: "one_action_only",
    label: "One action",
    title: "Single action",
    body: "Only one button.",
    actions: [{ action: "only_action", title: "Only" }],
  },
  {
    id: "no_actions",
    label: "No actions",
    title: "No action buttons",
    body: "Tap the body of the notification to test the default path.",
    actions: [],
  },
  {
    id: "same_titles_different_ids",
    label: "Same title, different ids",
    title: "Same titles",
    body: "Same title, different ids.",
    actions: [
      { action: "same_title_a", title: "Pick" },
      { action: "same_title_b", title: "Pick" },
    ],
  },
  {
    id: "trip_actions",
    label: "accept_trip / decline_trip",
    title: "Trip request",
    body: "Accept or decline.",
    actions: [
      { action: "accept_trip", title: "Accept" },
      { action: "decline_trip", title: "Decline" },
    ],
  },
];

const state = {
  registration: null,
  logs: loadLogs(),
  lastClickResult: null,
};

const elements = {
  displayMode: document.querySelector("#display-mode"),
  permissionStatus: document.querySelector("#permission-status"),
  serviceWorkerStatus: document.querySelector("#service-worker-status"),
  userAgent: document.querySelector("#user-agent"),
  registerButton: document.querySelector("#register-sw-button"),
  permissionButton: document.querySelector("#permission-button"),
  updatePwaButton: document.querySelector("#update-pwa-button"),
  refreshStatusButton: document.querySelector("#refresh-status-button"),
  customNotificationButton: document.querySelector("#custom-notification-button"),
  copyLogsButton: document.querySelector("#copy-logs-button"),
  clearLogsButton: document.querySelector("#clear-logs-button"),
  lastActionId: document.querySelector("#last-action-id"),
  lastActionTitle: document.querySelector("#last-action-title"),
  lastTestId: document.querySelector("#last-test-id"),
  lastNotificationId: document.querySelector("#last-notification-id"),
  lastClickedAt: document.querySelector("#last-clicked-at"),
  clickToast: document.querySelector("#click-toast"),
  toastCloseButton: document.querySelector("#toast-close-button"),
  toastActionId: document.querySelector("#toast-action-id"),
  toastActionTitle: document.querySelector("#toast-action-title"),
  toastTestId: document.querySelector("#toast-test-id"),
  testCases: document.querySelector("#test-cases"),
  logPanel: document.querySelector("#log-panel"),
  customTitle: document.querySelector("#custom-title"),
  customBody: document.querySelector("#custom-body"),
  customActions: document.querySelector("#custom-actions"),
};

state.lastClickResult = findLatestClickResult(state.logs);

renderTestCases();
renderLastClickResult();
renderLogs();
bindEvents();
boot();

async function boot() {
  updateEnvironmentInfo();
  await registerServiceWorker();
  await refreshServiceWorkerStatus();
}

function bindEvents() {
  elements.registerButton.addEventListener("click", async () => {
    await registerServiceWorker(true);
    await refreshServiceWorkerStatus();
  });

  elements.permissionButton.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      appendLog({
        source: "page",
        eventType: "permission-request",
        level: "error",
        message: "Notifications are not supported.",
      });
      updateEnvironmentInfo();
      return;
    }

    const result = await Notification.requestPermission();
    appendLog({
      source: "page",
      eventType: "permission-result",
      permission: result,
      message: `Permission: ${result}.`,
    });
    updateEnvironmentInfo();
  });

  elements.refreshStatusButton.addEventListener("click", async () => {
    updateEnvironmentInfo();
    await refreshServiceWorkerStatus();
  });

  elements.updatePwaButton.addEventListener("click", async () => {
    await updatePwaApplication();
  });

  elements.customNotificationButton.addEventListener("click", async () => {
    try {
      const actions = JSON.parse(elements.customActions.value || "[]");

      if (!Array.isArray(actions)) {
        throw new Error("Actions JSON must be an array.");
      }

      const normalizedActions = actions.map((item, index) => ({
        action: String(item.action ?? "").trim(),
        title: String(item.title ?? "").trim() || `Action ${index + 1}`,
      }));

      validateActions(normalizedActions);
      await showTestNotification({
        id: CUSTOM_TEST_ID,
        label: "Custom test",
        title: elements.customTitle.value.trim() || "Custom test",
        body: elements.customBody.value.trim() || "Tap a button and check the result.",
        actions: normalizedActions,
      });
    } catch (error) {
      appendLog({
        source: "page",
        eventType: "custom-notification-error",
        level: "error",
        message: error.message,
      });
    }
  });

  elements.copyLogsButton.addEventListener("click", async () => {
    const serialized = JSON.stringify(state.logs, null, 2);

    try {
      await navigator.clipboard.writeText(serialized);
      appendLog({
        source: "page",
        eventType: "copy-logs",
        message: `Copied ${state.logs.length} logs.`,
      });
    } catch (error) {
      appendLog({
        source: "page",
        eventType: "copy-logs-error",
        level: "error",
        message: `Copy failed: ${error.message}`,
      });
    }
  });

  elements.clearLogsButton.addEventListener("click", () => {
    state.logs = [];
    state.lastClickResult = null;
    persistLogs();
    renderLastClickResult();
    renderLogs();
    appendLog({
      source: "page",
      eventType: "clear-logs",
      message: "Logs cleared.",
    });
  });

  elements.toastCloseButton.addEventListener("click", () => {
    hideClickToast();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const payload = event.data;

      if (!payload || payload.type !== "notification-click-result") {
        return;
      }

      appendLog({
        source: "service-worker",
        eventType: "notificationclick",
        ...payload.entry,
      });
      updateLastClickResult(payload.entry);
      showClickToast(payload.entry);
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      refreshServiceWorkerStatus();
    });
  }

  const displayModeQuery = window.matchMedia("(display-mode: standalone)");
  if (typeof displayModeQuery.addEventListener === "function") {
    displayModeQuery.addEventListener("change", updateEnvironmentInfo);
  }

  window.addEventListener("focus", updateEnvironmentInfo);
  document.addEventListener("visibilitychange", updateEnvironmentInfo);
}

function renderTestCases() {
  elements.testCases.innerHTML = "";

  for (const testCase of predefinedTests) {
    const wrapper = document.createElement("article");
    wrapper.className = "case";

    const title = document.createElement("h3");
    title.textContent = testCase.label;

    const description = document.createElement("p");
    description.textContent = `${testCase.title} | actions: ${formatActions(testCase.actions)}`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Show test";
    button.addEventListener("click", async () => {
      await showTestNotification(testCase);
    });

    wrapper.append(title, description, button);
    elements.testCases.appendChild(wrapper);
  }
}

function renderLogs() {
  if (state.logs.length === 0) {
    elements.logPanel.textContent = `[${timestamp()}] Waiting for test activity...`;
    return;
  }

  elements.logPanel.textContent = state.logs
    .map((entry) => JSON.stringify(entry, null, 2))
    .join("\n\n");
  elements.logPanel.scrollTop = elements.logPanel.scrollHeight;
}

function renderLastClickResult() {
  if (!state.lastClickResult) {
    elements.lastActionId.textContent = "Waiting for click...";
    elements.lastActionTitle.textContent = "No click yet.";
    elements.lastTestId.textContent = "-";
    elements.lastNotificationId.textContent = "-";
    elements.lastClickedAt.textContent = "-";
    return;
  }

  const entry = state.lastClickResult;
  const selectedActionId = entry.selectedActionId || "(empty string)";
  const matchedTitle = entry.selectedActionMeta?.title || "No matching action";

  elements.lastActionId.textContent = selectedActionId;
  elements.lastActionTitle.textContent = matchedTitle;
  elements.lastTestId.textContent = entry.testId || "-";
  elements.lastNotificationId.textContent = entry.notificationId || "-";
  elements.lastClickedAt.textContent = entry.receivedAt || entry.timestamp || "-";
}

function appendLog(entry) {
  const normalized = {
    timestamp: timestamp(),
    appVersion: APP_VERSION,
    ...entry,
  };

  state.logs.push(normalized);
  persistLogs();
  renderLogs();
}

function updateLastClickResult(entry) {
  state.lastClickResult = entry;
  renderLastClickResult();
}

function showClickToast(entry) {
  const selectedActionId = entry.selectedActionId || "(empty string)";
  const matchedTitle = entry.selectedActionMeta?.title || "No matching action";

  elements.toastActionId.textContent = selectedActionId;
  elements.toastActionTitle.textContent = matchedTitle;
  elements.toastTestId.textContent = entry.testId || "-";
  elements.clickToast.classList.remove("flash");
  elements.clickToast.hidden = false;
  void elements.clickToast.offsetWidth;
  elements.clickToast.classList.add("flash");
}

function hideClickToast() {
  elements.clickToast.classList.remove("flash");
  elements.clickToast.hidden = true;
}

function persistLogs() {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(state.logs));
}

function loadLogs() {
  try {
    const value = localStorage.getItem(LOG_STORAGE_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function findLatestClickResult(logs) {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const entry = logs[index];
    if (entry?.source === "service-worker" && entry?.eventType === "notificationclick") {
      return entry;
    }
  }

  return null;
}

function timestamp() {
  return new Date().toISOString();
}

function updateEnvironmentInfo() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const permission = "Notification" in window ? Notification.permission : "unsupported";

  elements.displayMode.textContent = standalone ? "Standalone / installed" : "Browser tab";
  elements.permissionStatus.textContent = permission;
  elements.userAgent.textContent = navigator.userAgent;
}

async function registerServiceWorker(userInitiated = false) {
  if (!("serviceWorker" in navigator)) {
    appendLog({
      source: "page",
      eventType: "service-worker-unsupported",
      level: "error",
      message: "Service workers are not supported.",
    });
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    state.registration = registration;

    appendLog({
      source: "page",
      eventType: userInitiated ? "service-worker-register-manual" : "service-worker-register-auto",
      scope: registration.scope,
      message: "Service worker registered.",
    });

    return registration;
  } catch (error) {
    appendLog({
      source: "page",
      eventType: "service-worker-register-error",
      level: "error",
      message: `SW registration failed: ${error.message}`,
    });
    return null;
  }
}

async function refreshServiceWorkerStatus() {
  let registration = state.registration;

  if (!("serviceWorker" in navigator)) {
    elements.serviceWorkerStatus.innerHTML = '<span class="status-bad">Unsupported</span>';
    return;
  }

  if (!registration) {
    registration = await navigator.serviceWorker.getRegistration();
    state.registration = registration;
  }

  const isActive = Boolean(registration && registration.active);
  elements.serviceWorkerStatus.innerHTML = isActive
    ? '<span class="status-ok">Active</span>'
    : '<span class="status-bad">Not active</span>';
}

async function updatePwaApplication() {
  if (!("serviceWorker" in navigator)) {
    appendLog({
      source: "page",
      eventType: "update-pwa-error",
      level: "error",
      message: "Service workers are not supported.",
    });
    return;
  }

  appendLog({
    source: "page",
    eventType: "update-pwa-start",
    message: "Updating app...",
  });

  let registration = state.registration;
  if (!registration) {
    registration = await navigator.serviceWorker.getRegistration();
  }
  if (!registration) {
    registration = await navigator.serviceWorker.ready;
  }
  state.registration = registration;

  try {
    await registration.update();
    registration = (await navigator.serviceWorker.getRegistration()) || registration;

    if (registration.installing) {
      await waitForWorkerState(registration.installing, "installed");
      registration = (await navigator.serviceWorker.getRegistration()) || registration;
    }

    if (registration.waiting) {
      sendMessageToWorker(registration.waiting, { type: "skip-waiting" });
      await waitForControllerChange(2500);
      registration = (await navigator.serviceWorker.getRegistration()) || registration;
    }

    const activeWorker = registration.active || navigator.serviceWorker.controller;
    if (!activeWorker) {
      throw new Error("No active service worker is available to refresh cached files.");
    }

    const response = await sendMessageToWorker(activeWorker, { type: "refresh-app-shell" });

    appendLog({
      source: "page",
      eventType: "update-pwa-success",
      cacheRefreshedAt: response?.refreshedAt || null,
      message: "App updated. Reloading...",
    });

    window.location.reload();
  } catch (error) {
    appendLog({
      source: "page",
      eventType: "update-pwa-error",
      level: "error",
      message: `Update failed: ${error.message}`,
    });
  }
}

async function showTestNotification(testCase) {
  if (!("Notification" in window)) {
    appendLog({
      source: "page",
      eventType: "show-notification-error",
      level: "error",
      testId: testCase.id,
      message: "Notifications are not supported.",
    });
    return;
  }

  if (Notification.permission !== "granted") {
    appendLog({
      source: "page",
      eventType: "show-notification-error",
      level: "error",
      testId: testCase.id,
      message: "Allow notifications first.",
    });
    updateEnvironmentInfo();
    return;
  }

  let registration = state.registration;
  if (!registration) {
    registration = await navigator.serviceWorker.ready;
    state.registration = registration;
  }

  validateActions(testCase.actions);

  const notificationId = createNotificationInstanceId(testCase.id);
  const payload = buildNotificationPayload(testCase, notificationId);

  if (registration.active) {
    registration.active.postMessage({
      type: "show-test-notification",
      notification: payload,
    });
  } else {
    await registration.showNotification(payload.title, payload.options);
  }

  appendLog({
    source: "page",
    eventType: "show-notification",
    testId: payload.options.data.testId,
    notificationId,
    title: payload.title,
    actions: payload.options.actions,
    notificationData: payload.options.data,
    message: `Test shown: ${testCase.label}.`,
  });
}

function buildNotificationPayload(testCase, notificationId) {
  const expectedActions = testCase.actions.map((item) => ({
    action: item.action,
    title: item.title,
  }));

  return {
    title: testCase.title,
    options: {
      body: testCase.body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: `pwa-action-${testCase.id}`,
      renotify: true,
      requireInteraction: true,
      actions: expectedActions,
      data: {
        testId: testCase.id,
        notificationId,
        createdAt: timestamp(),
        label: testCase.label,
        body: testCase.body,
        expectedActions,
      },
    },
  };
}

function createNotificationInstanceId(testId) {
  const randomPart = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${testId}-${Date.now()}-${randomPart}`;
}

function sendMessageToWorker(target, payload) {
  return new Promise((resolve, reject) => {
    if (!target || typeof target.postMessage !== "function") {
      reject(new Error("The target service worker cannot receive messages."));
      return;
    }

    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const response = event.data || {};
      if (response.ok === false) {
        reject(new Error(response.error || "Service worker command failed."));
        return;
      }
      resolve(response);
    };

    target.postMessage(payload, [channel.port2]);
  });
}

function waitForWorkerState(worker, expectedState) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error("No service worker is available to watch."));
      return;
    }

    if (worker.state === expectedState) {
      resolve(worker);
      return;
    }

    const timeoutId = setTimeout(() => {
      worker.removeEventListener("statechange", handleStateChange);
      reject(new Error(`Timed out waiting for service worker state "${expectedState}".`));
    }, 4000);

    function handleStateChange() {
      if (worker.state === expectedState) {
        clearTimeout(timeoutId);
        worker.removeEventListener("statechange", handleStateChange);
        resolve(worker);
      } else if (worker.state === "redundant") {
        clearTimeout(timeoutId);
        worker.removeEventListener("statechange", handleStateChange);
        reject(new Error("Service worker became redundant during update."));
      }
    }

    worker.addEventListener("statechange", handleStateChange);
  });
}

function waitForControllerChange(timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      reject(new Error("Timed out waiting for the new service worker to take control."));
    }, timeoutMs);

    function handleControllerChange() {
      clearTimeout(timeoutId);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      resolve();
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
  });
}

function validateActions(actions) {
  if (!Array.isArray(actions)) {
    throw new Error("Actions must be an array.");
  }

  for (const item of actions) {
    if (!item || typeof item !== "object") {
      throw new Error("Each action must be an object.");
    }

    if (!item.action || !String(item.action).trim()) {
      throw new Error("Each action must include a non-empty action id.");
    }
  }
}

function formatActions(actions) {
  if (actions.length === 0) {
    return "none";
  }

  return actions
    .map((item, index) => `#${index + 1} "${item.title}" -> ${item.action}`)
    .join(", ");
}

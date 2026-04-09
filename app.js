const APP_VERSION = "1.0.0";
const LOG_STORAGE_KEY = "pwa-action-tester-logs";
const CUSTOM_TEST_ID = "custom_actions";

const predefinedTests = [
  {
    id: "two_actions",
    label: "Two actions: first_action / second_action",
    title: "Two action buttons",
    body: "Tap the first or second action button.",
    actions: [
      { action: "first_action", title: "First action" },
      { action: "second_action", title: "Second action" },
    ],
  },
  {
    id: "two_actions_reversed_titles",
    label: "Same ids, reversed titles",
    title: "Reversed button titles",
    body: "The action ids stay the same while titles swap positions.",
    actions: [
      { action: "first_action", title: "Second label" },
      { action: "second_action", title: "First label" },
    ],
  },
  {
    id: "one_action_only",
    label: "One action only",
    title: "Single action button",
    body: "Only one action should be available.",
    actions: [{ action: "only_action", title: "Only action" }],
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
    label: "Same titles, different ids",
    title: "Same titles, unique ids",
    body: "Both buttons share a title but use different action ids.",
    actions: [
      { action: "same_title_a", title: "Choose" },
      { action: "same_title_b", title: "Choose" },
    ],
  },
  {
    id: "trip_actions",
    label: "accept_trip / decline_trip",
    title: "Trip request",
    body: "Simulate a real-world action pair.",
    actions: [
      { action: "accept_trip", title: "Accept trip" },
      { action: "decline_trip", title: "Decline trip" },
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
  refreshStatusButton: document.querySelector("#refresh-status-button"),
  customNotificationButton: document.querySelector("#custom-notification-button"),
  copyLogsButton: document.querySelector("#copy-logs-button"),
  clearLogsButton: document.querySelector("#clear-logs-button"),
  lastActionId: document.querySelector("#last-action-id"),
  lastActionTitle: document.querySelector("#last-action-title"),
  lastTestId: document.querySelector("#last-test-id"),
  lastNotificationId: document.querySelector("#last-notification-id"),
  lastClickedAt: document.querySelector("#last-clicked-at"),
  lastClickPath: document.querySelector("#last-click-path"),
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
        message: "Notifications are not supported in this browser.",
      });
      updateEnvironmentInfo();
      return;
    }

    const result = await Notification.requestPermission();
    appendLog({
      source: "page",
      eventType: "permission-result",
      permission: result,
      message: `Notification permission is ${result}.`,
    });
    updateEnvironmentInfo();
  });

  elements.refreshStatusButton.addEventListener("click", async () => {
    updateEnvironmentInfo();
    await refreshServiceWorkerStatus();
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
        label: "Custom actions",
        title: elements.customTitle.value.trim() || "Custom notification test",
        body: elements.customBody.value.trim() || "Tap an action button and inspect the log.",
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
        message: `Copied ${state.logs.length} log entries to the clipboard.`,
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
    persistLogs();
    renderLogs();
    appendLog({
      source: "page",
      eventType: "clear-logs",
      message: "Logs were cleared.",
    });
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
    button.textContent = "Show notification";
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
    elements.lastActionTitle.textContent = "No click received yet.";
    elements.lastTestId.textContent = "-";
    elements.lastNotificationId.textContent = "-";
    elements.lastClickedAt.textContent = "-";
    elements.lastClickPath.textContent = "-";
    return;
  }

  const entry = state.lastClickResult;
  const selectedActionId = entry.selectedActionId || "(empty string)";
  const matchedTitle = entry.selectedActionMeta?.title || "No matching action metadata";
  const clickPath = entry.selectedActionId ? "Action button tap" : "Notification body tap / default";

  elements.lastActionId.textContent = selectedActionId;
  elements.lastActionTitle.textContent = matchedTitle;
  elements.lastTestId.textContent = entry.testId || "-";
  elements.lastNotificationId.textContent = entry.notificationId || "-";
  elements.lastClickedAt.textContent = entry.receivedAt || entry.timestamp || "-";
  elements.lastClickPath.textContent = clickPath;
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
      message: "Service workers are not supported in this browser.",
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
      message: `Service worker registered with scope ${registration.scope}.`,
    });

    return registration;
  } catch (error) {
    appendLog({
      source: "page",
      eventType: "service-worker-register-error",
      level: "error",
      message: `Service worker registration failed: ${error.message}`,
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

async function showTestNotification(testCase) {
  if (!("Notification" in window)) {
    appendLog({
      source: "page",
      eventType: "show-notification-error",
      level: "error",
      testId: testCase.id,
      message: "Notifications are not supported in this browser.",
    });
    return;
  }

  if (Notification.permission !== "granted") {
    appendLog({
      source: "page",
      eventType: "show-notification-error",
      level: "error",
      testId: testCase.id,
      message: `Notification permission must be granted before showing "${testCase.label}".`,
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
    message: `Displayed "${testCase.label}" locally with ${payload.options.actions.length} action(s).`,
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

  return actions.map((item) => `${item.action} -> ${item.title}`).join(", ");
}

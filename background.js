
const DEFAULTS = {
  preset: "web",
  filePrefix: "07-dang-nhap-lan-dau",
  stepNumber: 1,
  format: "webp",
  quality: 0.92,
  padding: 32,
  blur: 0.35,
  showArrow: true
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const missing = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (current[k] === undefined) missing[k] = v;
  }
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function injectSelection(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["selection.js"]
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id) await injectSelection(tab.id);
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "start-capture") return;
  const tab = await getActiveTab();
  if (tab?.id) await injectSelection(tab.id);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "START_FROM_POPUP") {
      const tab = await getActiveTab();
      if (!tab?.id) return sendResponse({ ok: false, error: "No active tab" });
      await injectSelection(tab.id);
      return sendResponse({ ok: true });
    }

    if (msg?.type === "SELECTION_DONE") {
      const tab = sender.tab || await getActiveTab();
      const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      const settings = await chrome.storage.local.get([
        "preset", "filePrefix", "stepNumber", "format", "quality", "padding", "blur", "showArrow"
      ]);

      await chrome.storage.local.set({
        v631Payload: {
          imageDataUrl,
          cropRectCss: msg.cropRectCss,
          badgesCss: msg.badgesCss || [],
          devicePixelRatio: msg.devicePixelRatio || 1,
          pageTitle: tab.title || "",
          pageUrl: tab.url || "",
          settings
        }
      });

      await chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
      return sendResponse({ ok: true });
    }
  })().catch((err) => {
    console.error(err);
    sendResponse({ ok: false, error: String(err) });
  });
  return true;
});

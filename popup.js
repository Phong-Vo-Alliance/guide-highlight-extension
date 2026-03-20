
const PRESETS = {
  web: { filePrefix: "07-dang-nhap-lan-dau", padding: 32, blur: 0.35, format: "webp", showArrow: true },
  mobile: { filePrefix: "35-checklist-mobile", padding: 20, blur: 0.30, format: "webp", showArrow: true },
  admin: { filePrefix: "48-tao-user-admin", padding: 36, blur: 0.40, format: "webp", showArrow: true }
};

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

const ids = Object.keys(DEFAULTS);
const els = {};
ids.forEach(id => els[id] = document.getElementById(id));

function applyPreset(name) {
  const p = PRESETS[name] || PRESETS.web;
  els.filePrefix.value = p.filePrefix;
  els.padding.value = p.padding;
  els.blur.value = p.blur;
  els.format.value = p.format;
  els.showArrow.checked = p.showArrow;
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(ids);
  const settings = { ...DEFAULTS, ...stored };
  ids.forEach(id => {
    const el = els[id];
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(settings[id]);
    else el.value = settings[id];
  });
}

async function saveSettings() {
  const data = {};
  ids.forEach(id => {
    const el = els[id];
    if (!el) return;
    if (el.type === "checkbox") data[id] = el.checked;
    else if (el.type === "number" || el.type === "range") data[id] = Number(el.value);
    else data[id] = el.value;
  });
  await chrome.storage.local.set(data);
}

els.preset.addEventListener("change", () => applyPreset(els.preset.value));

document.getElementById("saveBtn").addEventListener("click", async () => {
  await saveSettings();
  window.close();
});

document.getElementById("startBtn").addEventListener("click", async () => {
  await saveSettings();
  await chrome.runtime.sendMessage({ type: "START_FROM_POPUP" });
  window.close();
});

loadSettings();

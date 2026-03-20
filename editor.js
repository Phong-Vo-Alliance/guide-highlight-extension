
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

const el = {};
["preset","filePrefix","stepNumber","padding","blur","zoom","format","quality","showArrow","showAllBadges"]
  .forEach(id => el[id] = document.getElementById(id));

const canvas = document.getElementById("previewCanvas");
const ctx = canvas.getContext("2d");
const statusMeta = document.getElementById("statusMeta");

let payload = null;
let image = null;
let state = {
  cropRectPx: { left: 0, top: 0, width: 100, height: 100 },
  badgesPx: [],
  activeBadgeIndex: -1,
  activeHandle: null,
  draggingBadge: false,
  addingBadge: false,
  dpr: 1
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function px(v) { return Math.round(v); }

function getSettings() {
  return {
    preset: el.preset.value,
    filePrefix: (el.filePrefix.value || "").trim() || DEFAULTS.filePrefix,
    stepNumber: Math.max(1, Number(el.stepNumber.value) || 1),
    padding: Math.max(0, Number(el.padding.value) || 0),
    blur: clamp(Number(el.blur.value) || 0.35, 0, 0.65),
    zoom: clamp(Number(el.zoom.value) || 1, 0.5, 2),
    format: el.format.value || "webp",
    quality: clamp(Number(el.quality.value) || 0.92, 0.1, 1),
    showArrow: el.showArrow.checked,
    showAllBadges: el.showAllBadges.checked
  };
}

function persistSettings(settings) {
  const save = { ...settings };
  delete save.zoom;
  delete save.showAllBadges;
  return chrome.storage.local.set(save);
}

function applyPreset(name) {
  const p = PRESETS[name] || PRESETS.web;
  el.filePrefix.value = p.filePrefix;
  el.padding.value = p.padding;
  el.blur.value = p.blur;
  el.format.value = p.format;
  el.showArrow.checked = p.showArrow;
  render();
}

function getCropBox(settings) {
  const pad = Math.round(settings.padding * state.dpr);
  const r = state.cropRectPx;
  const cropX = Math.max(0, r.left - pad);
  const cropY = Math.max(0, r.top - pad);
  const cropW = Math.min(image.width - cropX, r.width + pad * 2);
  const cropH = Math.min(image.height - cropY, r.height + pad * 2);
  return { cropX, cropY, cropW, cropH };
}

function localRect(settings) {
  const { cropX, cropY } = getCropBox(settings);
  const r = state.cropRectPx;
  return { x: r.left - cropX, y: r.top - cropY, w: r.width, h: r.height };
}

function localBadges(settings) {
  const { cropX, cropY } = getCropBox(settings);
  return state.badgesPx.map(b => ({ x: b.x - cropX, y: b.y - cropY }));
}

function drawRoundedRect(x, y, w, h, r, c = ctx) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawArrow(x, y, rect, c = ctx) {
  let startX, startY;
  const distLeft = Math.abs(x - rect.x);
  const distRight = Math.abs((rect.x + rect.w) - x);
  const distTop = Math.abs(y - rect.y);
  const distBottom = Math.abs((rect.y + rect.h) - y);
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  if (minDist === distLeft) { startX = x - 80; startY = y; }
  else if (minDist === distRight) { startX = x + 80; startY = y; }
  else if (minDist === distTop) { startX = x; startY = y - 80; }
  else { startX = x; startY = y + 80; }

  startX = clamp(startX, 20, c.canvas.width - 20);
  startY = clamp(startY, 20, c.canvas.height - 20);

  c.save();
  c.strokeStyle = "#10B981";
  c.fillStyle = "#10B981";
  c.lineWidth = 4;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(startX, startY);
  c.lineTo(x, y);
  c.stroke();

  const angle = Math.atan2(y - startY, x - startX);
  const len = 14;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - len * Math.cos(angle - Math.PI / 6), y - len * Math.sin(angle - Math.PI / 6));
  c.lineTo(x - len * Math.cos(angle + Math.PI / 6), y - len * Math.sin(angle + Math.PI / 6));
  c.closePath();
  c.fill();
  c.restore();
}

function drawBadge(number, x, y, active = false, c = ctx) {
  const radius = 17;
  c.save();
  c.fillStyle = active ? "#0ea5e9" : "#10B981";
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = "#FFFFFF";
  c.font = "700 15px Inter, Arial, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(String(number), x, y + 1);
  c.restore();
}

function drawHandles(x, y, w, h, c = ctx) {
  const size = 12;
  const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
  c.save();
  c.fillStyle = "#10B981";
  pts.forEach(([px, py]) => c.fillRect(px - size / 2, py - size / 2, size, size));
  c.restore();
}

function updateStatus(hasBadge) {
  if (!hasBadge) {
    statusMeta.textContent = "Bước 2: hãy đặt badge để bắt đầu highlight. Khi chưa có badge, ảnh sẽ không bị tối và không có hiệu ứng.";
    return;
  }
  statusMeta.textContent = `Đang có ${state.badgesPx.length} badge. Badge đang chọn: ${state.activeBadgeIndex >= 0 ? state.activeBadgeIndex + 1 : "chưa chọn"}.`;
}

function renderBaseImage(targetCtx, cropX, cropY, cropW, cropH) {
  targetCtx.clearRect(0, 0, cropW, cropH);
  targetCtx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
}

function renderFinalAnnotations(targetCtx, settings, rect, badges, exportBadgeIndex) {
  const w = targetCtx.canvas.width;
  const h = targetCtx.canvas.height;

  targetCtx.save();
  targetCtx.fillStyle = `rgba(15, 23, 42, ${settings.blur})`;
  targetCtx.fillRect(0, 0, w, h);
  targetCtx.globalCompositeOperation = "destination-out";
  drawRoundedRect(rect.x, rect.y, rect.w, rect.h, 14, targetCtx);
  targetCtx.fill();
  targetCtx.restore();

  targetCtx.save();
  targetCtx.strokeStyle = "#10B981";
  targetCtx.fillStyle = "rgba(16, 185, 129, 0.08)";
  targetCtx.lineWidth = 3;
  drawRoundedRect(rect.x, rect.y, rect.w, rect.h, 14, targetCtx);
  targetCtx.fill();
  targetCtx.stroke();
  targetCtx.restore();

  let drawIndexes = [];
  if (exportBadgeIndex !== null) {
    drawIndexes = [exportBadgeIndex];
  } else if (settings.showAllBadges) {
    drawIndexes = badges.map((_, i) => i);
  } else if (state.activeBadgeIndex >= 0) {
    drawIndexes = [state.activeBadgeIndex];
  }

  drawIndexes.forEach((idx) => {
    const badge = badges[idx];
    if (!badge) return;
    if (settings.showArrow) drawArrow(badge.x, badge.y, rect, targetCtx);
    drawBadge(idx + 1, badge.x, badge.y, exportBadgeIndex === null && idx === state.activeBadgeIndex, targetCtx);
  });
}

function renderEditorGuides(targetCtx, rect) {
  targetCtx.save();
  targetCtx.strokeStyle = "#10B981";
  targetCtx.lineWidth = 2;
  drawRoundedRect(rect.x, rect.y, rect.w, rect.h, 14, targetCtx);
  targetCtx.stroke();
  targetCtx.restore();
  drawHandles(rect.x, rect.y, rect.w, rect.h, targetCtx);
}

function previewRender() {
  if (!payload || !image) return;
  const settings = getSettings();
  const { cropX, cropY, cropW, cropH } = getCropBox(settings);
  const rect = localRect(settings);
  const badges = localBadges(settings);
  const hasBadge = state.badgesPx.length > 0;

  canvas.width = cropW;
  canvas.height = cropH;
  canvas.style.transform = `scale(${settings.zoom})`;

  console.debug('[render:preview]', {
    badgeCount: state.badgesPx.length,
    isExport: false,
    showEditorGuides: true,
    activeBadgeIndex: state.activeBadgeIndex
  });

  renderBaseImage(ctx, cropX, cropY, cropW, cropH);
  if (hasBadge) {
    renderFinalAnnotations(ctx, settings, rect, badges, null);
  }
  renderEditorGuides(ctx, rect);
  updateStatus(hasBadge);
}

function exportRender(exportBadgeIndex = null) {
  if (!payload || !image) return null;
  const settings = getSettings();
  const { cropX, cropY, cropW, cropH } = getCropBox(settings);
  const rect = localRect(settings);
  const badges = localBadges(settings);
  const hasBadge = state.badgesPx.length > 0;

  console.debug('[render:export]', {
    badgeCount: state.badgesPx.length,
    isExport: true,
    showEditorGuides: false,
    exportBadgeIndex
  });

  const offscreen = document.createElement("canvas");
  offscreen.width = cropW;
  offscreen.height = cropH;
  const offCtx = offscreen.getContext("2d");

  renderBaseImage(offCtx, cropX, cropY, cropW, cropH);
  if (hasBadge) {
    renderFinalAnnotations(offCtx, settings, rect, badges, exportBadgeIndex);
  }

  const mime = settings.format === "png" ? "image/png" : "image/webp";
  return offscreen.toDataURL(mime, settings.quality);
}

function render() {
  previewRender();
}

function canvasPoint(evt) {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  return { x: (evt.clientX - bounds.left) * scaleX, y: (evt.clientY - bounds.top) * scaleY };
}

function hitBadge(px, py, settings) {
  const badges = localBadges(settings);
  for (let i = badges.length - 1; i >= 0; i--) {
    const dx = px - badges[i].x;
    const dy = py - badges[i].y;
    if (Math.sqrt(dx * dx + dy * dy) <= 22) return i;
  }
  return -1;
}

function hitHandle(px, py, settings) {
  const r = localRect(settings);
  const range = 10;
  const handles = { nw: [r.x, r.y], ne: [r.x + r.w, r.y], sw: [r.x, r.y + r.h], se: [r.x + r.w, r.y + r.h] };
  for (const [key, [hx, hy]] of Object.entries(handles)) {
    if (Math.abs(px - hx) <= range && Math.abs(py - hy) <= range) return key;
  }
  return null;
}

function addBadgeAtCanvasPoint(px, py, settings) {
  const { cropX, cropY } = getCropBox(settings);
  state.badgesPx.push({ x: px + cropX, y: py + cropY });
  state.activeBadgeIndex = state.badgesPx.length - 1;
  render();
}

function moveBadge(index, px, py, settings) {
  const { cropX, cropY } = getCropBox(settings);
  state.badgesPx[index] = { x: px + cropX, y: py + cropY };
  render();
}

function resizeCrop(handle, px, py, settings) {
  const { cropX, cropY } = getCropBox(settings);
  const absX = px + cropX;
  const absY = py + cropY;
  const minSize = 24 * state.dpr;

  let left = state.cropRectPx.left;
  let top = state.cropRectPx.top;
  let right = state.cropRectPx.left + state.cropRectPx.width;
  let bottom = state.cropRectPx.top + state.cropRectPx.height;

  if (handle.includes("n")) top = Math.min(absY, bottom - minSize);
  if (handle.includes("s")) bottom = Math.max(absY, top + minSize);
  if (handle.includes("w")) left = Math.min(absX, right - minSize);
  if (handle.includes("e")) right = Math.max(absX, left + minSize);

  state.cropRectPx = { left, top, width: right - left, height: bottom - top };
  render();
}

function safePrefix(prefix) {
  return (prefix || "guide").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-") || "guide";
}

function buildFilename(prefix, step, format) {
  const ext = format === "png" ? "png" : "webp";
  return `guide/${safePrefix(prefix)}-buoc-${String(step).padStart(2, "0")}.${ext}`;
}

async function downloadCurrent(exportBadgeIndex = null, stepOverride = null) {
  const settings = getSettings();
  await persistSettings(settings);

  const dataUrl = exportRender(exportBadgeIndex);
  if (!dataUrl) return;
  const step = stepOverride ?? settings.stepNumber;
  const fname = buildFilename(settings.filePrefix, step, settings.format);

  await chrome.downloads.download({
    url: dataUrl,
    filename: fname,
    saveAs: false
  });

  previewRender();
}

async function exportAllBadges() {
  const settings = getSettings();
  await persistSettings(settings);
  let step = settings.stepNumber;

  if (state.badgesPx.length === 0) {
    await downloadCurrent(null, step);
    step += 1;
  } else {
    for (let i = 0; i < state.badgesPx.length; i++) {
      await downloadCurrent(i, step);
      step += 1;
    }
  }

  el.stepNumber.value = step;
  await chrome.storage.local.set({ stepNumber: step });
  render();
}

async function loadPayload() {
  const stored = await chrome.storage.local.get("v631Payload");
  payload = stored.v631Payload;
  if (!payload) {
    document.getElementById("pageMeta").textContent = "Không tìm thấy ảnh chụp gần nhất.";
    return;
  }

  const settings = { ...DEFAULTS, ...(payload.settings || {}) };
  el.preset.value = settings.preset;
  el.filePrefix.value = settings.filePrefix;
  el.stepNumber.value = settings.stepNumber;
  el.padding.value = settings.padding;
  el.blur.value = settings.blur;
  el.format.value = settings.format;
  el.quality.value = settings.quality;
  el.showArrow.checked = settings.showArrow;
  document.getElementById("pageMeta").textContent = (payload.pageTitle ? payload.pageTitle + " • " : "") + (payload.pageUrl || "");

  state.dpr = payload.devicePixelRatio || 1;
  state.cropRectPx = {
    left: px(payload.cropRectCss.left * state.dpr),
    top: px(payload.cropRectCss.top * state.dpr),
    width: px(payload.cropRectCss.width * state.dpr),
    height: px(payload.cropRectCss.height * state.dpr)
  };
  state.badgesPx = (payload.badgesCss || []).map(b => ({ x: px(b.x * state.dpr), y: px(b.y * state.dpr) }));
  state.activeBadgeIndex = state.badgesPx.length ? 0 : -1;

  image = new Image();
  image.onload = () => render();
  image.src = payload.imageDataUrl;
}

canvas.addEventListener("mousedown", (evt) => {
  if (!image) return;
  const settings = getSettings();
  const p = canvasPoint(evt);

  if (state.addingBadge) {
    addBadgeAtCanvasPoint(p.x, p.y, settings);
    state.addingBadge = false;
    document.getElementById("addBadgeBtn").textContent = "Thêm badge";
    return;
  }

  const badgeIdx = hitBadge(p.x, p.y, settings);
  if (badgeIdx >= 0) {
    state.activeBadgeIndex = badgeIdx;
    state.draggingBadge = true;
    render();
    return;
  }

  const handle = hitHandle(p.x, p.y, settings);
  if (handle) {
    state.activeHandle = handle;
    return;
  }

  state.activeBadgeIndex = -1;
  render();
});

canvas.addEventListener("mousemove", (evt) => {
  if (!image) return;
  const settings = getSettings();
  const p = canvasPoint(evt);

  if (state.draggingBadge && state.activeBadgeIndex >= 0) {
    moveBadge(state.activeBadgeIndex, p.x, p.y, settings);
    return;
  }

  if (state.activeHandle) {
    resizeCrop(state.activeHandle, p.x, p.y, settings);
    return;
  }

  const handle = hitHandle(p.x, p.y, settings);
  const badgeIdx = hitBadge(p.x, p.y, settings);
  canvas.style.cursor = state.addingBadge ? "crosshair" : (handle ? "nwse-resize" : (badgeIdx >= 0 ? "grab" : "default"));
});

window.addEventListener("mouseup", () => {
  state.draggingBadge = false;
  state.activeHandle = null;
});

document.getElementById("addBadgeBtn").addEventListener("click", () => {
  state.addingBadge = !state.addingBadge;
  document.getElementById("addBadgeBtn").textContent = state.addingBadge ? "Đang thêm badge..." : "Thêm badge";
});

document.getElementById("removeSelectedBadgeBtn").addEventListener("click", () => {
  if (state.activeBadgeIndex < 0) return;
  state.badgesPx.splice(state.activeBadgeIndex, 1);
  state.activeBadgeIndex = Math.min(state.activeBadgeIndex, state.badgesPx.length - 1);
  render();
});

document.getElementById("removeLastBadgeBtn").addEventListener("click", () => {
  if (!state.badgesPx.length) return;
  state.badgesPx.pop();
  state.activeBadgeIndex = Math.min(state.activeBadgeIndex, state.badgesPx.length - 1);
  render();
});

document.getElementById("saveSingleBtn").addEventListener("click", async () => {
  await downloadCurrent(null);
  const next = Number(el.stepNumber.value) + 1;
  el.stepNumber.value = next;
  await chrome.storage.local.set({ stepNumber: next });
});

document.getElementById("saveAllBtn").addEventListener("click", exportAllBadges);

el.preset.addEventListener("change", () => applyPreset(el.preset.value));
Object.values(el).forEach(node => {
  node.addEventListener("input", render);
  node.addEventListener("change", render);
});

document.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && state.activeBadgeIndex >= 0) {
    e.preventDefault();
    state.badgesPx.splice(state.activeBadgeIndex, 1);
    state.activeBadgeIndex = Math.min(state.activeBadgeIndex, state.badgesPx.length - 1);
    render();
  }
});

loadPayload();

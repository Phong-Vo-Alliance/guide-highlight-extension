
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
  showArrow: true,
  showBadgeNumbers: true,
  highlightColor: "#10B981"
};

const el = {};
["preset","filePrefix","stepNumber","padding","blur","zoom","format","quality","showArrow","showBadgeNumbers","showAllBadges","highlightColor"]
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

// Convert a #RRGGBB hex color to rgba(r,g,b,alpha) string for canvas fills
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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
    showBadgeNumbers: el.showBadgeNumbers?.checked ?? true,
    showAllBadges: el.showAllBadges.checked,
    highlightColor: el.highlightColor?.value || DEFAULTS.highlightColor
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
  return state.badgesPx.map(b => ({
    x: b.x - cropX,
    y: b.y - cropY,
    // translate highlightPx bounds into the padded-canvas coordinate space
    highlightLocal: b.highlightPx ? {
      x: b.highlightPx.left  - cropX,
      y: b.highlightPx.top   - cropY,
      w: b.highlightPx.width,
      h: b.highlightPx.height
    } : null
  }));
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

function drawArrow(x, y, rect, color = "#10B981", c = ctx) {
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
  c.strokeStyle = color;
  c.fillStyle = color;
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

function drawBadge(number, x, y, active = false, color = "#10B981", c = ctx) {
  const radius = 17;
  c.save();
  c.fillStyle = active ? "#0ea5e9" : color;
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

function drawHandles(x, y, w, h, color = "#10B981", c = ctx) {
  const size = 12;
  const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
  c.save();
  c.fillStyle = color;
  pts.forEach(([px, py]) => c.fillRect(px - size / 2, py - size / 2, size, size));
  c.restore();
}

// Draw a highlight rectangle around a specific element (per-badge).
// Used in both preview and export to mark the UI element being annotated.
function drawHighlightRect(hRect, color = "#10B981", c = ctx) {
  c.save();
  c.strokeStyle = color;
  c.fillStyle = hexToRgba(color, 0.13);
  c.lineWidth = 2.5;
  drawRoundedRect(hRect.x, hRect.y, hRect.w, hRect.h, 8, c);
  c.fill();
  c.stroke();
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

// ─── PREVIEW ONLY: dim outside + highlight box + badges ──────────────────────
// Called only from previewRender(). NEVER used in export.
function renderFinalAnnotations(targetCtx, settings, rect, badges, exportBadgeIndex) {
  const w = targetCtx.canvas.width;
  const h = targetCtx.canvas.height;
  const color = settings.highlightColor || DEFAULTS.highlightColor;

  // 1. Dark overlay over the whole canvas
  targetCtx.save();
  targetCtx.fillStyle = `rgba(15, 23, 42, ${settings.blur})`;
  targetCtx.fillRect(0, 0, w, h);
  // 2. Punch a transparent hole so the crop region stays bright
  targetCtx.globalCompositeOperation = "destination-out";
  drawRoundedRect(rect.x, rect.y, rect.w, rect.h, 14, targetCtx);
  targetCtx.fill();
  targetCtx.restore();

  // 3. Highlight border around crop region (editor visual only) — uses user color
  targetCtx.save();
  targetCtx.strokeStyle = color;
  targetCtx.fillStyle = hexToRgba(color, 0.08);
  targetCtx.lineWidth = 3;
  drawRoundedRect(rect.x, rect.y, rect.w, rect.h, 14, targetCtx);
  targetCtx.fill();
  targetCtx.stroke();
  targetCtx.restore();

  // 4. Badges visible in preview
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
    // Draw element highlight rect first (underneath arrow + badge)
    if (badge.highlightLocal) drawHighlightRect(badge.highlightLocal, color, targetCtx);
    // Arrow direction reference: prefer the element rect, fall back to crop rect
    const arrowRef = badge.highlightLocal || rect;
    if (settings.showArrow) drawArrow(badge.x, badge.y, arrowRef, color, targetCtx);
    if (settings.showBadgeNumbers) drawBadge(idx + 1, badge.x, badge.y, exportBadgeIndex === null && idx === state.activeBadgeIndex, color, targetCtx);
  });
}

// ─── EXPORT ONLY: badge + arrow + element highlight drawn over already-cropped image ──
// No dim overlay, no big crop border, no editor guides.
// The offscreen canvas is already sized to the crop region.
function renderBadgeAndArrowOnly(targetCtx, settings, rect, badges, exportBadgeIndex) {
  const color = settings.highlightColor || DEFAULTS.highlightColor;
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
    // 1. Element highlight rect (if detected during badge placement)
    if (badge.highlightLocal) drawHighlightRect(badge.highlightLocal, color, targetCtx);
    // 2. Arrow — use element rect as direction reference when available
    const arrowRef = badge.highlightLocal || rect;
    if (settings.showArrow) drawArrow(badge.x, badge.y, arrowRef, color, targetCtx);
    // 3. Badge circle — skipped when showBadgeNumbers is off (highlight-only mode)
    if (settings.showBadgeNumbers) drawBadge(idx + 1, badge.x, badge.y, false, color, targetCtx);
  });
}

function renderEditorGuides(targetCtx, rect, color = "#10B981") {
  targetCtx.save();
  targetCtx.strokeStyle = color;
  targetCtx.lineWidth = 2;
  drawRoundedRect(rect.x, rect.y, rect.w, rect.h, 14, targetCtx);
  targetCtx.stroke();
  targetCtx.restore();
  drawHandles(rect.x, rect.y, rect.w, rect.h, color, targetCtx);
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
  renderEditorGuides(ctx, rect, settings.highlightColor || DEFAULTS.highlightColor);
  updateStatus(hasBadge);
}

// ─── EXPORT RENDER ────────────────────────────────────────────────────────────
// Produces a clean offscreen canvas:
//   • dimensions = cropRectPx exactly (NO padding — user exports inside the rectangle)
//   • NO dim overlay, NO crop border, NO handles, NO editor guides
//   • per-badge element highlight rect + badge + arrow via renderBadgeAndArrowOnly()
function exportRender(exportBadgeIndex = null) {
  if (!payload || !image) return null;
  const settings = getSettings();

  // Export is STRICTLY the selected cropRectPx — no padding expansion.
  // Padding is only for the editor preview (to show context around the crop box).
  const r = state.cropRectPx;
  const cropX = r.left;
  const cropY = r.top;
  const cropW = r.width;
  const cropH = r.height;

  // badge positions relative to the export canvas origin (cropRectPx.left/top)
  const badges = state.badgesPx.map(b => ({
    x: b.x - cropX,
    y: b.y - cropY,
    highlightLocal: b.highlightPx ? {
      x: b.highlightPx.left - cropX,
      y: b.highlightPx.top  - cropY,
      w: b.highlightPx.width,
      h: b.highlightPx.height
    } : null
  }));

  // rect covers the whole canvas — used as fallback direction ref for arrows
  const rect = { x: 0, y: 0, w: cropW, h: cropH };
  const hasBadge = state.badgesPx.length > 0;

  // ── Debug logging ────────────────────────────────────────────────────────────
  console.debug('[render:export] START', {
    exportCanvasWidth:  cropW,
    exportCanvasHeight: cropH,
    cropRect: { cropX, cropY, cropW, cropH },
    padding: settings.padding,
    paddingAppliedToExport: false,    // export never uses padding
    exportBadgeIndex,
    blurApplied: false,
    dimOverlayApplied: false,
    editorGuidesApplied: false,
    badgesTotal: state.badgesPx.length,
    badgesDrawn: exportBadgeIndex !== null
      ? 1
      : (settings.showAllBadges ? state.badgesPx.length : (state.activeBadgeIndex >= 0 ? 1 : 0))
  });
  // ────────────────────────────────────────────────────────────────────────────

  // Step 1 – offscreen canvas = exact crop region
  const offscreen = document.createElement("canvas");
  offscreen.width  = cropW;
  offscreen.height = cropH;
  const offCtx = offscreen.getContext("2d");

  // Step 2 – draw the cropped screenshot region only
  renderBaseImage(offCtx, cropX, cropY, cropW, cropH);

  // Step 3 – draw per-badge element highlight + badge + arrow (no dim, no frame)
  if (hasBadge) {
    renderBadgeAndArrowOnly(offCtx, settings, rect, badges, exportBadgeIndex);
  }

  // Step 4 – encode
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
  // Badges added manually in the editor have no element detection → highlightPx null
  state.badgesPx.push({ x: px + cropX, y: py + cropY, highlightPx: null });
  state.activeBadgeIndex = state.badgesPx.length - 1;
  render();
}

function moveBadge(index, px, py, settings) {
  const { cropX, cropY } = getCropBox(settings);
  // Spread existing badge to preserve highlightPx (and any future fields).
  // Without this, dragging a badge destroys its element-detection data.
  state.badgesPx[index] = { ...state.badgesPx[index], x: px + cropX, y: py + cropY };
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
  // Only use the base filename — browsers strip directory paths from <a download>
  return `${safePrefix(prefix)}-buoc-${String(step).padStart(2, "0")}.${ext}`;
}

// Convert a data URL to a Blob for use with URL.createObjectURL.
function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)[1];
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function downloadCurrent(exportBadgeIndex = null, stepOverride = null) {
  const settings = getSettings();

  // Render first (synchronous, before any await) so the result is ready
  const dataUrl = exportRender(exportBadgeIndex);
  if (!dataUrl) return;

  const step = stepOverride ?? settings.stepNumber;
  const fname = buildFilename(settings.filePrefix, step, settings.format);

  // Use <a download> — the only reliable way to name a downloaded file from an
  // extension page in MV3.  chrome.downloads.download() with a blob: URL created
  // in this page context is inaccessible to the browser's download internals,
  // causing it to fall back to the blob UUID as the filename.
  const blob    = dataUrlToBlob(dataUrl);
  const blobUrl = URL.createObjectURL(blob);
  const a       = document.createElement("a");
  a.href        = blobUrl;
  a.download    = fname;              // ← this attribute names the saved file
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

  await persistSettings(settings);   // persist after click so gesture isn't lost
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
  if (el.showBadgeNumbers) el.showBadgeNumbers.checked = settings.showBadgeNumbers ?? true;
  if (el.highlightColor) el.highlightColor.value = settings.highlightColor || DEFAULTS.highlightColor;
  document.getElementById("pageMeta").textContent = (payload.pageTitle ? payload.pageTitle + " • " : "") + (payload.pageUrl || "");

  state.dpr = payload.devicePixelRatio || 1;
  state.cropRectPx = {
    left: px(payload.cropRectCss.left * state.dpr),
    top: px(payload.cropRectCss.top * state.dpr),
    width: px(payload.cropRectCss.width * state.dpr),
    height: px(payload.cropRectCss.height * state.dpr)
  };
  state.badgesPx = (payload.badgesCss || []).map(b => ({
    x: px(b.x * state.dpr),
    y: px(b.y * state.dpr),
    // Convert CSS highlight rect → physical pixels (may be null for old payloads)
    highlightPx: b.highlight ? {
      left:   px(b.highlight.left   * state.dpr),
      top:    px(b.highlight.top    * state.dpr),
      width:  px(b.highlight.width  * state.dpr),
      height: px(b.highlight.height * state.dpr)
    } : null
  }));
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

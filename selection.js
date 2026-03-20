
(() => {
  if (window.__guideSelectV631) return;
  window.__guideSelectV631 = true;

  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "2147483647";
  root.style.cursor = "crosshair";
  root.style.userSelect = "none";
  root.style.fontFamily = "Inter, Arial, sans-serif";

  const veil = document.createElement("div");
  veil.style.position = "absolute";
  veil.style.inset = "0";
  veil.style.background = "rgba(15, 23, 42, 0.18)";
  root.appendChild(veil);

  const cropBox = document.createElement("div");
  cropBox.style.position = "absolute";
  cropBox.style.border = "2px solid #10B981";
  cropBox.style.borderRadius = "10px";
  cropBox.style.background = "transparent";
  cropBox.style.display = "none";
  root.appendChild(cropBox);

  const hud = document.createElement("div");
  hud.style.position = "fixed";
  hud.style.left = "50%";
  hud.style.bottom = "20px";
  hud.style.transform = "translateX(-50%)";
  hud.style.background = "rgba(15, 23, 42, 0.94)";
  hud.style.color = "#fff";
  hud.style.padding = "10px 14px";
  hud.style.borderRadius = "12px";
  hud.style.fontSize = "13px";
  hud.style.lineHeight = "1.45";
  hud.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
  hud.textContent = "Bước 1: kéo chọn vùng xuất ảnh. Sau đó thả chuột để chuyển sang bước đánh số.";
  root.appendChild(hud);

  document.documentElement.appendChild(root);

  let mode = "crop";
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let cropRectCss = null;
  const badgesCss = [];
  const badgeEls = [];
  let suppressNextClick = false;

  function updateCropRect(x1, y1, x2, y2) {
    const left = Math.max(0, Math.min(x1, x2));
    const top = Math.max(0, Math.min(y1, y2));
    const width = Math.max(1, Math.abs(x2 - x1));
    const height = Math.max(1, Math.abs(y2 - y1));
    cropRectCss = { left, top, width, height };
    cropBox.style.display = "block";
    cropBox.style.left = left + "px";
    cropBox.style.top = top + "px";
    cropBox.style.width = width + "px";
    cropBox.style.height = height + "px";
  }

  function isInsideCrop(x, y) {
    if (!cropRectCss) return false;
    return x >= cropRectCss.left &&
      x <= cropRectCss.left + cropRectCss.width &&
      y >= cropRectCss.top &&
      y <= cropRectCss.top + cropRectCss.height;
  }

  function renumberBadges() {
    badgeEls.forEach((badge, idx) => badge.textContent = String(idx + 1));
  }

  // Detect the most meaningful interactive element at CSS point (x, y).
  // Hides the overlay temporarily so elementFromPoint sees through to the page.
  function getHighlightForPoint(x, y) {
    // Temporarily remove overlay from layout — our z-index overlay would block
    // the hit test otherwise, returning our own DOM nodes instead of page elements.
    root.style.display = "none";
    let el = document.elementFromPoint(x, y);
    root.style.display = "";   // restore (removes inline style → reverts to block)

    if (!el || el === document.body || el === document.documentElement) return null;

    // Walk up max 6 levels to find a recognisable interactive / semantic element
    const INTERACTIVE = ["INPUT", "BUTTON", "SELECT", "TEXTAREA", "A", "LABEL",
                         "LI", "TD", "TH", "SUMMARY"];
    let cur = el;
    for (let i = 0; i < 6; i++) {
      if (!cur || cur === document.body) break;
      if (INTERACTIVE.includes(cur.tagName)) { el = cur; break; }
      cur = cur.parentElement;
    }

    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function addBadge(x, y) {
    // Auto-detect the page element at click point for per-badge highlight rect
    const highlight = getHighlightForPoint(x, y);

    const badge = document.createElement("div");
    badge.style.position = "absolute";
    badge.style.left = (x - 15) + "px";
    badge.style.top = (y - 15) + "px";
    badge.style.width = "30px";
    badge.style.height = "30px";
    badge.style.borderRadius = "999px";
    badge.style.background = "#10B981";
    badge.style.color = "#fff";
    badge.style.display = "flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.fontWeight = "700";
    badge.style.fontSize = "14px";
    badge.style.boxShadow = "0 4px 12px rgba(0,0,0,0.18)";
    root.appendChild(badge);
    badgesCss.push({ x, y, highlight });
    badgeEls.push(badge);
    renumberBadges();
    hud.textContent = `Bước 2: click để đánh số. Đã có ${badgesCss.length} điểm. Backspace hoặc Delete để xóa số cuối. Enter để mở editor.`;
  }

  function removeLastBadge() {
    if (!badgesCss.length) return;
    badgesCss.pop();
    const last = badgeEls.pop();
    if (last) last.remove();
    renumberBadges();
    hud.textContent = badgesCss.length
      ? `Bước 2: click để đánh số. Đã có ${badgesCss.length} điểm. Backspace hoặc Delete để xóa số cuối. Enter để mở editor.`
      : "Bước 2: click để đánh số từ 1. Backspace hoặc Delete để xóa số cuối. Enter để mở editor.";
  }

  function cleanup() {
    root.remove();
    window.__guideSelectV631 = false;
    document.removeEventListener("keydown", onKeyDown, true);
  }

  async function confirm() {
    if (!cropRectCss) return;

    // STEP 1 — hide the entire overlay BEFORE capturing.
    // captureVisibleTab() runs as soon as the message is received by
    // background.js, so the DOM must be visually gone first.
    root.style.visibility = "hidden";

    // STEP 2 — wait for the browser to fully repaint (two rAF = one full
    // composited frame, enough for Chrome's screenshot pipeline).
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    // STEP 3 — now capture: the overlay is invisible, screenshot is clean.
    const res = await chrome.runtime.sendMessage({
      type: "SELECTION_DONE",
      cropRectCss,
      badgesCss,
      devicePixelRatio: window.devicePixelRatio || 1
    });

    if (!res?.ok) alert("Không thể chụp ảnh. Vui lòng thử lại.");

    // STEP 4 — remove overlay from DOM now that capture is done.
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      cleanup();
      return;
    }
    if (e.key === "Enter") {
      confirm();
      return;
    }
    if (mode === "badge" && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      removeLastBadge();
    }
  }

  root.addEventListener("mousedown", (e) => {
    if (mode !== "crop" || e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    updateCropRect(startX, startY, startX, startY);
    e.preventDefault();
  });

  root.addEventListener("mousemove", (e) => {
    if (!dragging || mode !== "crop") return;
    updateCropRect(startX, startY, e.clientX, e.clientY);
  });

  root.addEventListener("mouseup", () => {
    if (!dragging || mode !== "crop") return;
    dragging = false;
    if (cropRectCss) {
      mode = "badge";
      suppressNextClick = true;
      requestAnimationFrame(() => { suppressNextClick = false; });
      hud.textContent = "Bước 2: click các điểm cần đánh số bên trong vùng đã chọn. Số bắt đầu từ 1. Backspace hoặc Delete để xóa số cuối. Enter để mở editor.";
    }
  });

  root.addEventListener("click", (e) => {
    if (mode !== "badge") return;
    if (suppressNextClick) return;
    if (!isInsideCrop(e.clientX, e.clientY)) return;
    addBadge(e.clientX, e.clientY);
  });

  document.addEventListener("keydown", onKeyDown, true);
})();

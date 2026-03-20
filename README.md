# StepShot — Chrome Extension v6.4.0

A Chrome extension for creating clean, numbered step-by-step guide images from screenshots — 10x faster than Photoshop or Figma.

---

## Features

- **Crop** — select any region directly on screen
- **Badge numbering** — click to place step markers (1, 2, 3…)
- **Visual editor** — drag badges, resize crop area, add/remove badges
- **Element highlight** — auto-detects and highlights the clicked UI element (input, button, etc.)
- **Export** — current image or all badges (one file per badge)
- **Standardized filenames** — `[prefix]-buoc-01.webp`
- **Configurable color** — badge, arrow, and highlight color are all customizable

---

## Workflow

### Step 1 — Crop
- Press `Alt+Shift+H` or click the extension icon
- Drag to select the export region
- Release mouse → moves to badge placement

> Only the region is selected. No effects applied yet.

### Step 2 — Place badges
- Click on each point of interest inside the selection
- Numbers auto-increment: 1 → 2 → 3…
- `Backspace / Delete` — remove last badge
- `Enter` — open editor
- `Escape` — cancel

### Step 3 — Editor
- Drag badges to reposition
- Drag corner handles to resize the crop area
- Add / remove badges
- Adjust settings (color, blur, padding, format…)

### Step 4 — Export
| Mode | Behavior |
|---|---|
| **Save current** | Exports with active badge visible |
| **Export all badges** | One file per badge, step number auto-increments |

---

## Output

Every exported image:
- Contains **only the selected crop region** — no padding bleed
- Has **no editor UI** (no green frame, no handles, no overlays)
- Shows exactly **one badge** per file (when exporting all)
- Is named `[prefix]-buoc-01.webp` automatically

---

## Settings

| Setting | Description |
|---|---|
| Preset | Web / Mobile / Admin (pre-fills common values) |
| File prefix | Base name for exported files |
| Step number | Starting step index |
| Padding | Extra pixels around crop in **preview only** |
| Blur | Dim intensity for area outside crop (preview) |
| Highlight color | Color for badge, arrow, and element highlight |
| Format | WebP / PNG |
| Quality | WebP compression quality (0.1–1.0) |
| Show arrow | Toggle arrow on/off |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Alt + Shift + H` | Start capture |
| `Enter` | Confirm / open editor |
| `Backspace / Delete` | Remove last badge |
| `Escape` | Cancel |

---

## Installation

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `guide-highlight-extension` folder

---

## Architecture (for developers / AI agents)

### State model
```js
state = {
  cropRectPx:       { left, top, width, height },  // physical pixels
  badgesPx:         [{ x, y, highlightPx }],        // physical pixels
  activeBadgeIndex: number
}
```

### Rendering pipeline

| Layer | Used in | Description |
|---|---|---|
| `renderBaseImage()` | Preview + Export | Draws the cropped screenshot |
| `renderFinalAnnotations()` | **Preview only** | Dim overlay + crop highlight + badges |
| `renderBadgeAndArrowOnly()` | **Export only** | Element highlight rect + arrow + badge |
| `renderEditorGuides()` | **Preview only** | Crop border + resize handles |

### Export rules (strict)
- Export canvas dimensions = `cropRectPx` exactly — **no padding**
- `renderEditorGuides()` is **never** called during export
- No dim overlay in export (image is already cropped — no "outside" area)
- One badge per export file

### Screenshot capture timing
The selection overlay is hidden (`visibility: hidden`) and two animation frames are awaited **before** `captureVisibleTab()` is called — ensuring the screenshot is clean with no overlay baked in.

### Download
Files are downloaded via `<a download>` with a Blob URL. `chrome.downloads.download()` is not used because blob URLs created in an extension page are inaccessible to the browser's download internals in MV3, causing filename fallback to the blob UUID.

---

## Acceptance Criteria

| Case | Expected |
|---|---|
| No badge | Image is at full brightness, no effects |
| Badge placed | Badge visible, element highlighted, no darkening of target |
| Export current | Clean crop, no green frame, no handles, no overlay |
| Export all | Each file = 1 badge, correct filename, no cross-badge bleed |

---

## Common Bugs to Avoid

| Bug | Root cause |
|---|---|
| Image too dark in export | `renderFinalAnnotations` called in export path |
| Green border in export | `renderEditorGuides` called in export path |
| Green border baked into screenshot | Overlay not hidden before `captureVisibleTab()` |
| Filename is UUID | Used `chrome.downloads.download()` with a blob URL |
| Export larger than selection | Used padded `getCropBox()` instead of raw `cropRectPx` |

# Text Teleprompter

[简体中文](README.md) | [English](README.en.md)

A transparent, always-on-top desktop teleprompter. The window floats over whatever you're doing — a shared screen, a camera preview, your slides — so you can read your script while keeping your eyes near the camera or your audience, instead of glancing down at your phone or a second screen.

Supports Markdown (`.md`), plain text (`.txt`), and Word (`.docx`).

## When this is useful

- **Live streaming / short-form video narration**: keep your script or outline next to the camera so you can read it without looking away
- **Recording courses, product demos, or talking-head videos**: long stretches of on-camera speaking where you don't want to lose your place or fumble for words
- **Screen-sharing video calls** (Zoom / Teams / Tencent Meeting): you want a script prompt without it showing up in what you're sharing, or blocking your slides
- **Pitch or talk rehearsal**: overlay your script or outline next to your slide editor/preview while you practice
- **Bilingual or scripted narration**: the script only shows on your own screen — it stays invisible to whatever you're sharing

If you want a document to scroll quietly in front of you without getting in the way of whatever else is on screen, that's what this is for.

## Features

- Open / drag-and-drop `.md`, `.txt`, or `.docx` files (`.docx` is converted via mammoth; `.txt` is rendered as plain text rather than parsed as Markdown, so `#`, `*`, etc. show up literally)
- 🔄 One-click reload of the currently open file — useful if the source document changed on disk
- Auto-scroll, with speed set in "characters per minute" and converted to an actual scroll speed based on the real rendered layout at the current font size and window width, not a rough guess
- Adjustable font size, opacity, and mirror-flip (for teleprompter glass rigs); resizing the window or changing font size keeps your current reading position anchored instead of jumping elsewhere in the document
- 🎨 One-click background detection: samples the real content behind the transparent window and switches between light and dark text/overlay for readability while staying visually unobtrusive
- Click-through mode: the text area can pass mouse clicks through to whatever's behind it, while the toolbar itself always stays clickable so you're never locked out
- System tray icon and global hotkeys so you can always get the window back, even if the toolbar is hidden or the window is minimized

## Download & run

### Download a prebuilt build (recommended, no dev setup needed)

Grab the latest build from [Releases](https://github.com/doniponi/text-teleprompter/releases):

- **Windows**: `文本提词器-x.x.x.exe` — double-click it, no installation, no Node.js required
- **macOS (Apple Silicon / M-series)**: `文本提词器-x.x.x-arm64-mac.zip`
- **macOS (Intel)**: `文本提词器-x.x.x-x64-mac.zip`

The macOS build isn't signed with a paid Apple Developer certificate, so on first launch Gatekeeper will say it "cannot verify the developer" — right-click the `.app` and choose Open (instead of double-clicking) to bypass that once. The macOS build has only been verified via automated CI (launch, click, scroll all checked programmatically) — nobody has run it hands-on on a real Mac yet, so please report anything odd.

### Run from source / development

Install dependencies once:

```bash
npm install
```

For everyday use, double-click `启动提词器.vbs` in the project folder (or a "文本提词器" desktop shortcut, if you've created one) to launch silently with no console window.

Run from the command line / for development:

```bash
npm install
npm start
```

You can also pass a file path directly:

```bash
npm start -- path/to/script.md
```

### Build your own exe

```bash
npm run build:win
```

The output is `dist/文本提词器-<version>.exe` — a single, install-free file you can distribute.

## Keyboard shortcuts

Global hotkeys — these work even when the window isn't focused, or while click-through is active:

| Shortcut | Action |
| --- | --- |
| `Ctrl+Alt+Space` | Play / pause auto-scroll |
| `Ctrl+Alt+↑` / `Ctrl+Alt+↓` | Adjust scroll speed |
| `Ctrl+Alt+T` | Toggle click-through |
| `Ctrl+Alt+H` | Show / hide the toolbar |
| `Ctrl+Alt+O` | Open a file |
| `Ctrl+Alt+R` | Restore the window if minimized |
| `Ctrl+Alt+C` | Reset text color/opacity to defaults |

**Double right-click** anywhere in the text area also toggles the toolbar, no shortcut needed.

If the toolbar is hidden or the window is minimized and you can't find your way back, use the system tray icon (under the taskbar's "show hidden icons" arrow — a terracotta square with a T and an upward arrow). The tray menu has play/pause, open file, reload current file, disable click-through, reset appearance, reset window position, show window, and quit.

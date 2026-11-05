# Errortune — Red Hacker Edition

A responsive React + Vite local media player interface. This is a **web app source project**, not a native Android/Kotlin project.

## Features

- Red/black Matrix-inspired interface.
- Import multiple audio/video files, or import a folder where the browser supports directory selection.
- Audio and video use separate HTML media elements.
- Favorites saved in localStorage.
- Media files and library metadata saved in IndexedDB (survives page reloads and browser restarts in the same browser profile).
- Search across media names and imported folder paths.
- Sort by name or newest first.
- Remove media from the local library.
- Full player, mini player, seek, previous/next, shuffle and repeat.
- JD creator profile with the original Instagram, GitHub and LinkedIn links.

## Run locally

Install Node.js 18 or newer, then:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build:

```bash
npm run build
npm run preview
```

## GitHub upload

Upload the contents of this folder to the root of a GitHub repository (keep `package.json`, `index.html`, `src/`, and this README). GitHub Pages can host the built site using a suitable Actions workflow; GitHub does not run the Vite source directly without a build step.

## Storage notes

Imported media is stored in the browser's IndexedDB, not uploaded to a server. Browser/site data clearing, private browsing cleanup, quota limits, or using a different browser/device can remove or make the library unavailable. Keep backups of original media files. Directory import depends on browser support; otherwise choose files individually.

## Format notes

Playback depends on the browser's media codec support. Some MKV/AVI/FLAC variants may be listed but may not play in every browser. This project does not bypass browser codec limitations.

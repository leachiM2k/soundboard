# Soundboard

A minimal, installable PWA soundboard for iPhone and other mobile devices. Record up to 9 sounds with your microphone, assign them to tiles, and trigger them instantly with a single tap.

**Live demo:** [rotmanov.de/soundboard](https://rotmanov.de/soundboard)

---

## Features

- **9 fixed tiles** in a 3×3 grid — tap to play, long-press to manage
- **Microphone recording** — record directly into a tile; recording stops automatically after 30 seconds
- **Persistent storage** — sounds survive page reloads and app restarts via IndexedDB
- **Rename tiles** — give every sound a custom label
- **PWA / installable** — add to Home Screen on iPhone for a full-screen, standalone experience
- **Offline support** — works without an internet connection once installed
- **Wake lock** — screen stays on while the app is in the foreground
- **Haptic feedback** — subtle vibration feedback on supported devices
- **iOS optimized** — respects safe-area insets, dynamic viewport height, and system font

---

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (vanilla, no framework) |
| Bundler | Vite 7 |
| PWA | vite-plugin-pwa (Workbox) |
| Storage | IndexedDB via idb-keyval |
| Audio | MediaRecorder API + Web Audio API |

---

## Run locally

```bash
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173) in your browser.

For **iPhone testing** over HTTPS, use [ngrok](https://ngrok.com):

```bash
# In one terminal
npm run dev

# In another terminal
ngrok http 5173
```

Open the `https://…ngrok-free.app` URL in Safari on your iPhone.

> Service worker and offline mode only activate in the production build:
> `npm run build && npx serve dist`

---

## Install as PWA (iPhone)

1. Open the demo URL in **Safari**
2. Tap the share icon
3. Select **"Add to Home Screen"**
4. Launch from your Home Screen — runs in full-screen standalone mode

---

## License

MIT

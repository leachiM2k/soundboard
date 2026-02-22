# Phase 3: PWA Shell and Offline - Research

**Researched:** 2026-02-22
**Domain:** Progressive Web App (PWA) — Service Worker, Web App Manifest, iOS Safari install, Screen Wake Lock
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**App icon & branding**
- Icon design: simple soundboard graphic — abstract grid or sound wave motif
- App name on Home Screen: "Soundboard"
- Background color: vibrant accent color (Claude picks one that fits the colorful tile aesthetic)
- Icon format: `apple-touch-icon` — let iOS apply its standard squircle rounding automatically
- Same background color used for splash screen (`background_color` in manifest)

**Install prompt behavior**
- Trigger: show after the user's first interaction (first tile tap) — not on page load
- Frequency: once per day — store last-shown timestamp in `localStorage`; suppress if shown within the last 24 hours
- Never show in standalone mode — check `navigator.standalone` on init and skip entirely if true
- Appearance: custom banner at the bottom of the screen (above the Safari toolbar), with an upward arrow and "Add to Home Screen" instruction text
- Dismissible with an X button; dismissal sets the timestamp (counts as "shown today")

**Offline fallback**
- Caching strategy: precache all assets on service worker install — app is fully offline after the first successful load
- Service worker scope: assets only (JS, CSS, HTML, icons); IndexedDB recordings are browser-managed, no SW interaction needed
- Custom offline fallback page: branded, brief message explaining the app needs to be opened online at least once first
- Update strategy: silent update on next reload — new SW activates when the user reopens the app, no prompt shown

**Standalone mode appearance**
- Status bar (`theme_color`): Claude's discretion — pick what looks best with the tile grid design
- `display: standalone` only — no fallback display modes needed
- No UI differences between standalone and browser mode, except the install banner is hidden in standalone
- Wake Lock: request Screen Wake Lock API during active recording to prevent screen sleep; release on recording stop or error

### Claude's Discretion
- Exact `theme_color` value for the manifest and `<meta name="theme-color">`
- Specific vibrant accent color for icon background
- Offline page copy and design
- Install banner copy and exact styling

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PWA-01 | App kann über Safari zum iPhone Home Screen hinzugefügt werden | Web App Manifest with `name`, `icons` (192x192 + 512x512), `display: standalone`, `start_url`; `apple-touch-icon` link in HTML head; `apple-mobile-web-app-capable` meta tag — all required for iOS Add to Home Screen eligibility |
| PWA-02 | App funktioniert offline nach der ersten Installation | Service worker with `generateSW` strategy via vite-plugin-pwa 1.2.0 precaches all static assets; `globPatterns: ['**/*.{js,css,html,ico,png,svg}']` covers the full app shell; IndexedDB recordings survive offline natively |
| PWA-03 | App zeigt einmaligen Hinweis "Zum Home Screen hinzufügen" im Safari-Browser-Modus | Custom banner component: check `navigator.standalone`, check localStorage timestamp, show after first tile tap; iOS does NOT support `beforeinstallprompt` event — must be 100% custom UI |
</phase_requirements>

## Summary

Phase 3 adds three distinct layers on top of the Phase 2 UI: (1) a Web App Manifest that makes the app installable on iOS Home Screen, (2) a service worker that precaches all static assets for full offline operation, and (3) a custom "Add to Home Screen" banner because iOS Safari does not support the `beforeinstallprompt` event.

The standard tool for this project is `vite-plugin-pwa` v1.2.0, which integrates directly with Vite 7 and Workbox 7 to auto-generate both the manifest and service worker from `vite.config.ts`. Using `registerType: 'autoUpdate'` and `strategies: 'generateSW'` delivers the locked silent-update behavior with zero custom service worker code. The manifest is configured inline in `vite.config.ts`; icons and `apple-touch-icon` are placed in `/public`.

iOS Safari has specific quirks that require attention: `apple-touch-icon` takes precedence over manifest icons for the Home Screen thumbnail, `background_color` in the manifest is ignored by iOS for splash screens, the Screen Wake Lock API was broken in standalone PWA mode until iOS 18.4 (now fixed), and the getUserMedia permission bug (WebKit #215884) is partially mitigated but microphone permissions may still not persist across sessions — this is deferred to v2 (RES-01) and is not a blocker for Phase 3.

**Primary recommendation:** Use `vite-plugin-pwa` 1.2.0 with `strategies: 'generateSW'` and `registerType: 'autoUpdate'`. Place a 180x180 PNG as `/public/apple-touch-icon.png` and configure manifest icons (192x192 + 512x512). Write the custom install banner in vanilla TypeScript as a thin UI module with no additional dependencies.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite-plugin-pwa | 1.2.0 | Generate service worker + web app manifest from vite.config.ts | Official Vite PWA integration; supports Vite 7; wraps Workbox 7; zero SW code needed for precache |
| workbox-build | 7.x (bundled) | Precache manifest generation, SW build | Included as dependency of vite-plugin-pwa; do not install separately |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vite-pwa/assets-generator | latest | Generate all icon sizes from a single source SVG | Use if creating icons programmatically from source art; optional if icons are hand-crafted |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vite-plugin-pwa | Hand-written service worker | More control but far more complexity; must manually wire Workbox or write fetch handlers; defeats precache automation |
| vite-plugin-pwa | serwist/vite | Drop-in alternative to vite-plugin-pwa, same Workbox foundation; no advantage for this project size |

**Installation:**
```bash
npm install -D vite-plugin-pwa
```

No other packages are needed. The install banner is vanilla TypeScript code, not a library.

## Architecture Patterns

### Recommended Project Structure
```
public/
├── apple-touch-icon.png      # 180x180 — iOS Home Screen icon
├── pwa-192x192.png           # PWA manifest icon
├── pwa-512x512.png           # PWA manifest icon (also used by splash)
└── offline.html              # Custom offline fallback page
src/
├── ui/
│   └── install-banner.ts     # New: install prompt banner module
├── main.ts                   # Wire install-banner and wake-lock
└── ...                       # Existing Phase 1+2 files
vite.config.ts                # Extended with VitePWA() plugin config
index.html                    # Add meta tags: apple-mobile-web-app-capable,
                              #   apple-touch-icon link, theme-color
```

### Pattern 1: generateSW with autoUpdate (Precache All Assets)

**What:** vite-plugin-pwa generates a service worker that caches every file matching `globPatterns` during install. On update, the new SW waits for next page load to activate (silent update).

**When to use:** Any PWA where the full app shell should be offline-capable after first visit. Correct choice here because all data is in IndexedDB (not network-fetched), so precaching the shell is sufficient.

**Example:**
```typescript
// vite.config.ts
// Source: https://vite-pwa-org.netlify.app/guide/
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    allowedHosts: ['.ngrok-free.app'],
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // globPatterns default is ['**/*.{js,css,html}']
      // Extend to include images and the offline page
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Serve offline.html when a navigation request fails offline
        navigateFallback: 'offline.html',
        // Do NOT intercept the root navigation (it is precached directly)
        navigateFallbackDenylist: [],
      },
      includeAssets: ['apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Soundboard',
        short_name: 'Soundboard',
        description: 'Record and play back sounds instantly.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#1a1a2e',       // Claude discretion — dark navy matches tile grid
        background_color: '#ff6b35',  // Claude discretion — vibrant orange accent
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
```

### Pattern 2: iOS-Specific HTML Head Tags

**What:** iOS Safari ignores many manifest fields and requires non-standard meta tags for Home Screen behavior.

**When to use:** Any PWA targeting iOS Safari — these are required, not optional.

**Example:**
```html
<!-- index.html <head> additions -->
<!-- Source: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ -->

<!-- Makes the app launch in standalone mode when added to Home Screen -->
<meta name="apple-mobile-web-app-capable" content="yes">

<!-- Title shown under the Home Screen icon (overrides <title> for this purpose) -->
<meta name="apple-mobile-web-app-title" content="Soundboard">

<!-- Status bar style in standalone mode -->
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

<!-- Theme color for Safari browser tab toolbar (also used by manifest) -->
<meta name="theme-color" content="#1a1a2e">

<!-- iOS Home Screen icon — takes precedence over manifest icons on iOS -->
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

### Pattern 3: Custom iOS Install Banner

**What:** Because iOS Safari has no `beforeinstallprompt` event, the install banner is a fully custom component. It shows after first tile tap, once per day, never in standalone mode.

**When to use:** Any iOS PWA that wants to guide users through the Add to Home Screen flow.

**Example:**
```typescript
// src/ui/install-banner.ts

const BANNER_LS_KEY = 'installBannerShownAt';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

function wasShownToday(): boolean {
  const ts = localStorage.getItem(BANNER_LS_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts, 10) < ONE_DAY_MS;
}

function markShown(): void {
  localStorage.setItem(BANNER_LS_KEY, String(Date.now()));
}

export function shouldShowInstallBanner(): boolean {
  return !isStandalone() && !wasShownToday();
}

export function showInstallBanner(): void {
  if (!shouldShowInstallBanner()) return;
  markShown();

  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.setAttribute('role', 'banner');
  banner.innerHTML = `
    <span class="install-banner-text">
      ↑ Tap <strong>Share</strong> then <strong>Add to Home Screen</strong>
    </span>
    <button class="install-banner-close" aria-label="Dismiss">✕</button>
  `;

  banner.querySelector('.install-banner-close')!.addEventListener('click', () => {
    banner.remove();
  });

  document.body.appendChild(banner);
}
```

### Pattern 4: Screen Wake Lock During Recording

**What:** Request a screen wake lock when recording starts; release it when recording stops or on error. Requires feature detection and graceful degradation.

**When to use:** Any recording flow where screen sleep would interrupt the user.

**Example:**
```typescript
// src/audio/wake-lock.ts (new file, or inline in recorder.ts)
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API

let wakeLock: WakeLockSentinel | null = null;

export async function acquireWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return; // Feature not supported
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // Wake lock request denied — non-fatal, continue recording
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}
```

### Anti-Patterns to Avoid

- **Showing the install banner on page load:** iOS users haven't engaged yet; showing it immediately is disruptive and ignored. Show after the first tile tap.
- **Using `beforeinstallprompt` for iOS:** This event does not fire in iOS Safari. Only Chrome/Edge on Android/desktop supports it.
- **Omitting `apple-touch-icon` from `<head>`:** Without the `<link rel="apple-touch-icon">` tag, iOS Safari generates a screenshot thumbnail for the Home Screen icon, which looks bad. Always include the explicit link.
- **Relying on `background_color` for iOS splash screen:** iOS ignores `background_color` in the manifest for generating splash screens. For a proper splash, you'd need `<link rel="apple-touch-startup-image">` — but this is not required by the phase spec.
- **Caching IndexedDB data in the service worker:** IndexedDB is managed by the browser and persists independently; the SW should only cache the static app shell.
- **Using `maximumFileSizeToCacheInBytes` default (2MB) without checking:** If any asset exceeds 2MB, the vite-plugin-pwa build will throw an error (as of v0.20.2). Audio files should never be in `/public` — they belong in IndexedDB.
- **Not including `offline.html` in `globPatterns`:** If `offline.html` is in `/public` but not matched by `globPatterns`, it won't be precached and the offline fallback won't work.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service worker with precache | Custom `fetch` event handler + cache logic | vite-plugin-pwa + workbox generateSW | Cache versioning, cleanup of stale caches, hash-based cache busting, max file size guards — all handled automatically |
| Manifest injection into HTML | Manual `<link rel="manifest">` in index.html | vite-plugin-pwa manifest option | Plugin injects the link, generates the manifest file, sets correct MIME type |
| Icon generation | Manual Photoshop/Figma export at every size | @vite-pwa/assets-generator CLI from single SVG | Generates 192x192, 512x512, maskable, apple-touch-icon from one source |
| Service worker registration | Manual `navigator.serviceWorker.register()` | vite-plugin-pwa with `injectRegister: 'auto'` | Handles registration, update lifecycle, and error paths |

**Key insight:** The service worker cache invalidation problem is genuinely hard. Workbox uses content hashes in filenames to bust stale caches and cleans up old cache entries on SW activation. Custom SW implementations almost always get this wrong on first attempt.

## Common Pitfalls

### Pitfall 1: `apple-touch-icon` Link Overrides Manifest Icons on iOS
**What goes wrong:** Developer puts icons only in the manifest. iOS Home Screen shows a blurry screenshot thumbnail.
**Why it happens:** iOS Safari still prefers `<link rel="apple-touch-icon">` over manifest icons. Even post iOS 15.4 (when manifest icon support was added), the link element takes precedence if present.
**How to avoid:** Always include `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` in `index.html` `<head>` pointing to a 180x180 PNG in `/public`.
**Warning signs:** Home Screen icon looks like a web page screenshot instead of the designed icon.

### Pitfall 2: `offline.html` Not Precached
**What goes wrong:** App appears to work offline, but when navigating to the root URL offline, the browser shows its own "You are offline" error page instead of the custom fallback.
**Why it happens:** `navigateFallback: 'offline.html'` only works if `offline.html` is in the precache manifest. If not matched by `globPatterns`, it is never cached.
**How to avoid:** Ensure `globPatterns` includes `**/*.html` (the default does), and `offline.html` is placed in the `public/` directory so Vite copies it to `dist/`.
**Warning signs:** Testing offline in DevTools shows browser default error, not branded page.

### Pitfall 3: Service Worker Not Updating Assets on App Changes
**What goes wrong:** Developer pushes a new build but testers see the old version.
**Why it happens:** With `registerType: 'autoUpdate'`, the new SW waits for all tabs to close before activating (default behavior without `skipWaiting`). In practice, `autoUpdate` maps to `skipWaiting: true` + `clientsClaim: true` in vite-plugin-pwa.
**How to avoid:** Trust `autoUpdate` — vite-plugin-pwa handles this correctly. Don't add conflicting `skipWaiting` / `clientsClaim` to the workbox config manually.
**Warning signs:** Stale assets appearing after deploy; check SW lifecycle in DevTools Application tab.

### Pitfall 4: Install Banner Shows in Standalone Mode
**What goes wrong:** User has already installed the app but still sees the "Add to Home Screen" banner every day.
**Why it happens:** Forgetting to check `navigator.standalone` (iOS-specific) or `matchMedia('(display-mode: standalone)')` before showing the banner.
**How to avoid:** Check both at banner initialization. The `isStandalone()` guard in Pattern 3 above covers this.
**Warning signs:** Users report seeing the banner inside the installed app.

### Pitfall 5: Screen Wake Lock Broken on Older iOS Standalone PWA (pre-18.4)
**What goes wrong:** Wake lock is requested successfully in Safari browser, but does nothing in standalone mode.
**Why it happens:** WebKit bug #254545 — Screen Wake Lock API did not work in Home Screen Web Apps until iOS 18.4 (fixed March 31, 2025).
**How to avoid:** Use feature detection + try/catch (Pattern 4). The lock failing silently is acceptable — recording continues, screen may sleep. This is non-fatal. Users on iOS 18.4+ get the fix automatically.
**Warning signs:** No JS errors but screen dims during recording on iOS < 18.4.

### Pitfall 6: maximumFileSizeToCacheInBytes Build Error
**What goes wrong:** `vite build` fails with an error about a file exceeding the 2MB precache limit.
**Why it happens:** Any file in the build output larger than 2097152 bytes (2MB) causes vite-plugin-pwa to throw since v0.20.2. Audio blobs should never be in the build output (they live in IndexedDB), but large icons or assets could trigger this.
**How to avoid:** Keep all icon PNGs under 2MB (a 512x512 PNG is typically under 100KB). If needed, raise the limit: `workbox: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 }`.
**Warning signs:** Build output contains a Workbox warning treated as an error.

## Code Examples

### Full vite.config.ts with VitePWA
```typescript
// Source: https://vite-pwa-org.netlify.app/guide/
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    allowedHosts: ['.ngrok-free.app'],
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'offline.html',
      },
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Soundboard',
        short_name: 'Soundboard',
        description: 'Record and play back sounds instantly.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#1a1a2e',
        background_color: '#ff6b35',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
```

### index.html Head Meta Tags for iOS
```html
<!-- Source: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Soundboard">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#1a1a2e">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

### navigator.standalone Detection
```typescript
// Source: https://web.dev/learn/pwa/detection
function isStandalone(): boolean {
  // iOS Safari proprietary property
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // Standard display-mode media query (works on Android + desktop Chrome)
  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayModeStandalone;
}
```

### Wake Lock Request and Release
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
let wakeLock: WakeLockSentinel | null = null;

async function acquireWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // NotAllowedError or other — non-fatal, recording continues
  }
}

async function releaseWakeLock(): Promise<void> {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}
```

### Offline Fallback Page (offline.html)
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Soundboard — Offline</title>
    <style>
      body {
        font-family: -apple-system, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100dvh;
        margin: 0;
        background: #1a1a2e;
        color: #fff;
        text-align: center;
        padding: 2rem;
      }
      h1 { font-size: 2rem; margin-bottom: 0.5rem; }
      p  { opacity: 0.7; max-width: 280px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <h1>Soundboard</h1>
    <p>Open the app online at least once to enable offline mode.</p>
  </body>
</html>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-written service worker fetch handler | vite-plugin-pwa + workbox generateSW | 2019 (Workbox) / 2021 (vite-plugin-pwa) | Eliminates cache versioning bugs; SW auto-generated from build output |
| Multiple apple-touch-icon sizes in HTML | Single 180x180 PNG via `<link rel="apple-touch-icon">` | ~2014 (iOS 8+) | No need for 57x57, 72x72, 114x114, 144x144 legacy sizes |
| Wake Lock broken in iOS standalone PWA | Wake Lock works in iOS standalone since iOS 18.4 | March 31, 2025 | Recording apps no longer need to workaround screen sleep in installed PWA mode |
| `navigator.standalone` only for iOS detection | `navigator.standalone` + `matchMedia('(display-mode: standalone)')` | ~2020 (display-mode support) | Cross-platform detection covers both iOS and Android |
| iOS manifest icon support absent | iOS 15.4+ reads manifest icons | March 2022 | `<link rel="apple-touch-icon">` still recommended to override and guarantee correct icon |

**Deprecated/outdated:**
- Legacy apple-touch-icon sizes (57x57, 72x72, 114x114, 144x144, 152x152): Not needed for modern iOS; one 180x180 size covers all current iPhones and iPads
- `apple-mobile-web-app-status-bar-style` with value `black`: Use `black-translucent` for full-bleed look with `viewport-fit=cover` (already in this project's viewport meta)
- `workbox-precaching` imported manually in SW: Done automatically by generateSW strategy
- `beforeinstallprompt` event for iOS: Never supported on iOS; do not check for it

## Open Questions

1. **getUserMedia permissions in standalone PWA**
   - What we know: WebKit bug #215884 is "RESOLVED CONFIGURATION CHANGED" but users still report permission persistence issues in standalone mode through 2026
   - What's unclear: Whether the current iOS version (iOS 18.x) has fully resolved permission persistence across sessions
   - Recommendation: Phase 3 does not need to solve this — RES-01 (v2) tracks it. Confirm on real device during Phase 3 verification. If permissions reset, document as known limitation.

2. **`background_color` splash screen on iOS**
   - What we know: iOS ignores `background_color` from the manifest for the launch splash screen; a proper iOS splash requires `<link rel="apple-touch-startup-image">` with specific media queries per device
   - What's unclear: Whether the phase goal (splash screen = same color as icon background) requires this
   - Recommendation: The CONTEXT.md says "same background color used for splash screen (`background_color` in manifest)" — this is iOS-limited but non-blocking. Skip `apple-touch-startup-image` (complex, out of scope); the manifest `background_color` still benefits Chrome/Android and future iOS behavior.

3. **Vite 7 + vite-plugin-pwa 1.2.0 known issues**
   - What we know: `@vite-pwa/create-pwa` v1.0.0 templates use Vite 7 + vite-plugin-pwa; changelog confirms Vite 6+ support from v0.21.1
   - What's unclear: Whether any Vite 7-specific edge cases exist in the current 1.2.0 release
   - Recommendation: Install and build early in Phase 3 execution to surface any incompatibilities before icon/banner work begins.

## Sources

### Primary (HIGH confidence)
- https://vite-pwa-org.netlify.app/guide/ — vite-plugin-pwa setup, configuration, strategies
- https://vite-pwa-org.netlify.app/guide/change-log — Vite 7 support confirmed in 1.x; Workbox 7.3.0
- https://developer.chrome.com/docs/workbox/modules/workbox-build#method-generateSW — workbox generateSW options (globPatterns, navigateFallback, maximumFileSizeToCacheInBytes defaults)
- https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API — Wake Lock API usage pattern, feature detection
- https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ — Apple's own meta tag documentation
- https://web.dev/learn/pwa/web-app-manifest — Manifest fields, icon requirements, display modes

### Secondary (MEDIUM confidence)
- https://firt.dev/notes/pwa-ios/ — iOS PWA limitations verified against Apple docs; apple-touch-icon precedence behavior
- https://bugs.webkit.org/show_bug.cgi?id=254545 — Screen Wake Lock in standalone PWA: RESOLVED FIXED in iOS 18.4
- https://bugs.webkit.org/show_bug.cgi?id=215884 — getUserMedia permission persistence: partially resolved, ongoing
- https://webkit.org/blog/16574/webkit-features-in-safari-18-4/ — Screen Wake Lock fix confirmed in Safari 18.4 release notes (via search)
- https://caniuse.com/wake-lock — Wake Lock: iOS Safari 16.4+ (browser); iOS 18.4+ (standalone PWA)

### Tertiary (LOW confidence)
- WebSearch results about iOS install banner best practices — general community consensus verified against MDN/web.dev

## Metadata

**Confidence breakdown:**
- Standard stack (vite-plugin-pwa 1.2.0 + Vite 7): HIGH — confirmed via changelog and create-pwa templates
- Manifest configuration: HIGH — verified against official vite-pwa docs and web.dev PWA manifest guide
- iOS-specific meta tags: HIGH — from Apple's own developer documentation
- Screen Wake Lock: HIGH — MDN + WebKit bug tracker (fixed iOS 18.4 confirmed)
- Install banner pattern: HIGH — iOS does not support beforeinstallprompt (well-documented limitation); navigator.standalone detection verified via MDN
- getUserMedia permission persistence: LOW — bug status is ambiguous; behavior may vary by iOS version

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days — vite-plugin-pwa is actively maintained but stable; iOS PWA behavior changes less frequently)

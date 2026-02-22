# Phase 3: PWA Shell and Offline - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the soundboard installable on the iPhone Home Screen and fully functional offline. Deliverables: web app manifest, service worker (precache), apple-touch-icon, a one-time-per-day install prompt banner, and a custom offline fallback page. No new audio or tile features — this phase is purely the PWA shell layer on top of the Phase 2 UI.

</domain>

<decisions>
## Implementation Decisions

### App icon & branding
- Icon design: simple soundboard graphic — abstract grid or sound wave motif
- App name on Home Screen: "Soundboard"
- Background color: vibrant accent color (Claude picks one that fits the colorful tile aesthetic)
- Icon format: `apple-touch-icon` — let iOS apply its standard squircle rounding automatically
- Same background color used for splash screen (`background_color` in manifest)

### Install prompt behavior
- Trigger: show after the user's first interaction (first tile tap) — not on page load
- Frequency: once per day — store last-shown timestamp in `localStorage`; suppress if shown within the last 24 hours
- Never show in standalone mode — check `navigator.standalone` on init and skip entirely if true
- Appearance: custom banner at the bottom of the screen (above the Safari toolbar), with an upward arrow and "Add to Home Screen" instruction text
- Dismissible with an X button; dismissal sets the timestamp (counts as "shown today")

### Offline fallback
- Caching strategy: precache all assets on service worker install — app is fully offline after the first successful load
- Service worker scope: assets only (JS, CSS, HTML, icons); IndexedDB recordings are browser-managed, no SW interaction needed
- Custom offline fallback page: branded, brief message explaining the app needs to be opened online at least once first
- Update strategy: silent update on next reload — new SW activates when the user reopens the app, no prompt shown

### Standalone mode appearance
- Status bar (`theme_color`): Claude's discretion — pick what looks best with the tile grid design
- `display: standalone` only — no fallback display modes needed
- No UI differences between standalone and browser mode, except the install banner is hidden in standalone
- Wake Lock: request Screen Wake Lock API during active recording to prevent screen sleep; release on recording stop or error

### Claude's Discretion
- Exact `theme_color` value for the manifest and `<meta name="theme-color">`
- Specific vibrant accent color for icon background
- Offline page copy and design
- Install banner copy and exact styling

</decisions>

<specifics>
## Specific Ideas

- Install banner sits above the Safari toolbar — bottom of viewport — with a pointing-up arrow (iOS's own "share" convention) so it's immediately clear what to do
- Wake Lock during recording is a quality-of-life touch — recording a 30-second sound shouldn't be interrupted by the screen going dark

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-pwa-shell-and-offline*
*Context gathered: 2026-02-22*

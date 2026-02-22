# Phase 2: Tile UI and Interaction - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the visible 3×3 tile grid on top of the Phase 1 audio/storage foundation. Users see tile state at a glance, tap to record/play, and long-press to manage recordings via an action sheet. Phase scope: grid layout, tile visual states, recording indicator, context menu (delete/re-record/rename), tile labeling, and haptic feedback.

</domain>

<decisions>
## Implementation Decisions

### Tile appearance
- Both color AND icon change to distinguish empty vs filled tiles
- Colorful/playful palette — filled tiles each get a distinct accent color (classic soundboard style)
- Empty tiles: neutral/dark background with a mic icon; no text
- Filled tiles display the recording duration as a small timestamp (e.g. "0:03")
- Playback state visual: Claude's discretion

### Recording indicator
- Animation style: Claude's discretion (pick what feels most iOS-native)
- Live timer shown on the tile during recording — counts elapsed time up
- Remaining time always visible during recording (countdown from 30s) so user always knows how much is left
- Post-recording transition (saving state): Claude's discretion based on how fast IndexedDB writes are

### Context menu
- iOS action sheet — bottom sheet, large tap targets, familiar pattern
- Button order: Re-record first, then Delete (red, destructive last — follows iOS HIG)
- Header shows tile context: name if set, otherwise tile position + duration
- Rename option added to action sheet (consistent entry point for labeling)
- Delete is immediate — no confirmation step

### Tile labeling
- Tiles have user-customizable names
- Names are set and edited via the context menu (long-press → Rename in action sheet)
- Name placement on tile: Claude's discretion (pick what works best with the colorful design)
- Empty unnamed tiles show only the mic icon — no placeholder text

### Claude's Discretion
- Playback state visual (how a tile looks while audio is playing)
- Recording animation style (pulsing border, background, or dot)
- Post-recording save transition
- Tile name placement within the tile layout
- Exact spacing, typography, shadow/corner radius details

</decisions>

<specifics>
## Specific Ideas

- Filled tiles should feel like a "classic soundboard" — bold, colorful, distinct colors per tile
- Context menu follows iOS HIG: destructive actions last, in red
- Recording state always shows a countdown from 30s — user should never be surprised by auto-stop

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-tile-ui-and-interaction*
*Context gathered: 2026-02-22*

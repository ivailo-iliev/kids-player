# Fluid Orientation-Only Layout Plan (No JS Sizing)

## Goals
- Use only two layout modes: portrait and landscape (no breakpoint ladder).
- Keep the player internals in one consistent structure across orientations.
- Keep tiles and album art square.
- Keep tile sizing fully CSS-driven with viewport units + clamping.
- Ensure no half/fractional tile columns are shown.
- Use one status bar for connection + output state.

---

## Tuned CSS Tokens

```css
:root {
  /* spacing + rhythm */
  --pad: clamp(0.5rem, 1.2vmin, 1rem);
  --gap: clamp(0.375rem, 0.9vmin, 0.75rem);
  --radius: clamp(0.4rem, 0.8vmin, 0.65rem);

  /* portrait fixed split (player + now-playing block) */
  --portrait-player-ratio: 0.36;

  /* player panel width behavior in landscape */
  --player-min: clamp(17rem, 28vmin, 20rem);
  --player-max: clamp(24rem, 36vmin, 30rem);

  /* media + controls */
  --art-size: clamp(7rem, 18vmin, 12rem);
  --control-size: clamp(2.75rem, 6vmin, 3.75rem);
  --icon-size: clamp(1.25rem, 2.6vmin, 1.8rem);

  /* tile bounds (used by orientation-specific preferred values below) */
  --tile-min: clamp(4.5rem, 10vmin, 5.5rem); /* ~72..88 */
  --tile-max: clamp(7rem, 14vmin, 8.5rem);   /* ~112..136 */
}
```

### Why these tuned values
- iPhone 15 portrait (393px wide) lands near 4 columns with normal app padding/gap.
- Slightly narrower phones (e.g., 360/375) still target 4 columns when possible.
- Very small widths (e.g., ~320) can collapse to 3 columns naturally.
- Tablets/desktops grow tile size to max before increasing column count.

---

## Layout Structure (same DOM in all cases)

```html
<div id="app">
  <section id="tilePanel">
    <div id="tileGrid" role="listbox" aria-label="Favorite items"></div>
  </section>

  <section id="playerPanel" aria-label="Now playing panel">
    <div id="statusBar">Connection • Output</div>
    <img id="albumArt" alt="Current album art" />
    <div id="controls">...</div>
    <ul id="trackList"></ul>
  </section>
</div>
```

- `statusBar` is a single combined status line.
- Player internals stay the same in portrait and landscape.

---

## Core CSS (orientation-only behavior)

```css
html,
body {
  margin: 0;
  inline-size: 100%;
  block-size: 100%;
}

#app {
  inline-size: 100dvw;
  block-size: 100dvh;
  padding: var(--pad);
  gap: var(--gap);
  display: grid;
  overflow: hidden;
  background: #000;
  color: #fff;
}

#tilePanel,
#playerPanel {
  min-inline-size: 0;
  min-block-size: 0;
}

#tilePanel {
  overflow: auto;
  overscroll-behavior: contain;
}

#tileGrid {
  display: grid;
  gap: var(--gap);
  align-content: start;
  /* column width set per orientation below */
}

.tile,
#albumArt {
  aspect-ratio: 1 / 1;
}

.tile {
  inline-size: 100%;
  object-fit: cover;
  border-radius: var(--radius);
}

#playerPanel {
  display: grid;
  gap: var(--gap);
  align-content: start;
}

#statusBar {
  font-size: clamp(0.75rem, 1.8vmin, 0.95rem);
  color: #bbb;
}

#albumArt {
  inline-size: var(--art-size);
  max-inline-size: 100%;
  object-fit: cover;
  border-radius: var(--radius);
}

#controls {
  display: flex;
  gap: var(--gap);
}

#controls .controlButton {
  inline-size: var(--control-size);
  block-size: var(--control-size);
}

#controls .icon {
  inline-size: var(--icon-size);
  block-size: var(--icon-size);
}
```

---

## Portrait (stacked, fixed ratio)

```css
@media (orientation: portrait) {
  #app {
    grid-template-columns: 1fr;
    grid-template-rows:
      calc((100dvh - (2 * var(--pad)) - var(--gap)) * var(--portrait-player-ratio))
      1fr;
  }

  #playerPanel {
    grid-row: 1;
  }

  #tilePanel {
    grid-row: 2;
  }

  /* Tile size anchored to portrait width */
  #tileGrid {
    grid-template-columns: repeat(
      auto-fit,
      minmax(clamp(var(--tile-min), 22dvw, var(--tile-max)), 1fr)
    );
  }
}
```

### Expected portrait behavior
- iPhone 15 portrait (393x852): ~4 columns.
- 375-wide phones: ~4 columns.
- 320-wide phones: may drop to 3 columns.
- Wider portrait tablets: tiles grow, then new columns appear.

---

## Landscape (side-by-side, player right)

```css
@media (orientation: landscape) {
  #app {
    grid-template-rows: 1fr;
    grid-template-columns:
      minmax(0, 1fr)
      clamp(var(--player-min), 30dvw, var(--player-max));
  }

  #tilePanel {
    grid-column: 1;
  }

  #playerPanel {
    grid-column: 2;
  }

  /* Tile size anchored to landscape height */
  #tileGrid {
    grid-template-columns: repeat(
      auto-fit,
      minmax(clamp(var(--tile-min), 15dvh, var(--tile-max)), 1fr)
    );
  }
}
```

### Expected landscape behavior
- Player stays on right and grows fluidly up to max.
- Tile pane takes all remaining width.
- Tile size tracks viewport height, so tiles stay usable on short landscape screens.

---

## Avoiding Half Tiles (CSS-only interpretation)

- This plan prevents half/fractional columns by using full grid tracks (`repeat(auto-fit, minmax(..., 1fr))`).
- The browser only lays out complete grid cells; no clipped half columns are produced.
- Normal scrolling can still show partial rows while actively scrolling, which is native and expected for scroll containers.

If "no half tiles" is intended to include "never show partial bottom row while scrolling", that would require either:
1) removing scrolling, or
2) JS quantization of row heights (explicitly out of scope).

---

## Rollout Steps
1. Replace current absolute panel CSS with the orientation-only grid shell.
2. Merge connection + output into one `#statusBar`.
3. Convert tile area to pure CSS grid scroll container.
4. Remove fixed-page tile assumptions from styling.
5. Tune `22dvw` (portrait) and `15dvh` (landscape) by ±1 if visual density needs adjustment.

---

## Screen-size sanity matrix (with tuned defaults)
- 320x568 portrait: 3-4 columns depending on safe-area + browser chrome.
- 375x812 portrait: typically 4 columns.
- 393x852 portrait (iPhone 15): 4 columns target.
- 430x932 portrait: 4 columns, larger tiles.
- 768x1024 portrait: 5-6 columns after tile max reaches cap.
- 1024x768 landscape: player capped right, tile pane ~5+ columns.
- 1366x1024 landscape: player near max, tiles expand then add columns.

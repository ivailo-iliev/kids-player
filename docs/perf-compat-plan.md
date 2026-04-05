# Performance Review and Execution Plan

## Scope reviewed
- `index.html`
- `app.js`
- `styles.css`
- `sw.js`

## Phase 1 — UI snappiness (implemented)

1. **Incremental DOM updates instead of full list rebuilds** ✅
   - Keep tile and track nodes stable.
   - Update only changed state (`selected`, `nowPlaying`, album art) where possible.

2. **Cap rendered tiles/tracks** ✅
   - Render only a window of visible tiles and tracks around the active index.
   - Keep complete datasets in memory.

3. **Defer non-critical data** ✅
   - Load first page of favorites categories first.
   - Continue additional pages in background and append without blocking interaction.

4. **Prevent overlapping healthchecks** ✅
   - Replace async `setInterval` with self-scheduling `setTimeout`.
   - Skip if a healthcheck is already in flight.

5. **Image rendering and fetch efficiency** ✅
   - Use fixed image dimensions for runtime-created and static images.
   - Prefer source image variants closest to rendered sizes.
   - Eagerly warm a subset of image cache to reduce browse-time image stalls.

## Phase 2 — Next improvements (pending)

6. **Artist track fetch batching with bounded concurrency**
   - Keep artist fallback fetches concurrent but bounded to avoid spikes.

7. **In-memory + localStorage response cache**
   - Cache favorites/context tracks with TTL and background refresh.

8. **Use `fields` query params where supported by Spotify APIs**
   - Request only needed properties to reduce payload size.

## Suggested implementation order for remaining work
1. Add bounded concurrency guard to artist fallback fetches.
2. Add lightweight API response caching.
3. Reduce API payload shape with `fields` where supported.

## Success metrics
- Time to first interactive tiles.
- Arrow-key tile navigation latency.
- Track step latency (next/prev).
- Memory usage after startup and after 10 minutes.

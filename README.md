# Kids Spotify Player (PWA)

Simple fullscreen Spotify player for kids with a two-panel layout and favorites-only playback.

## Setup

1. Create a Spotify app in the Spotify Developer Dashboard.
2. Add your kiosk URL (for local testing: `http://localhost:8080/`) as a Redirect URI.
3. Open `app.js` and replace `YOUR_SPOTIFY_CLIENT_ID` with your app client ID.
4. Serve this folder with any static server.

Example:

```bash
python3 -m http.server 8080
```

## Netlify Deployment

1. Create a Spotify app in the Spotify Developer Dashboard.
2. Add your Netlify site URL, for example `https://your-site.netlify.app/`, as a Spotify Redirect URI.
3. Open `app.js` and replace `YOUR_SPOTIFY_CLIENT_ID` with your Spotify app client ID before deploying.
4. Upload the repository to Netlify as a static site.

Notes:

- `netlify.toml` configures static publishing from the repo root.
- Security headers are set for the Spotify Web Playback SDK and API calls.
- `/sw.js`, `/index.html`, `/app.js`, `/styles.css`, and `/manifest.json` are marked for revalidation so clients pick up updates reliably.
- A catch-all redirect sends unknown routes to `/index.html`, which keeps the app safe if you later add client-side routes.

## PWA updates on Safari

The service worker checks for updates when the app starts, every five minutes, and whenever the installed PWA becomes visible again. When Safari activates an updated service worker, the app reloads once so the latest HTML, CSS, and JavaScript are requested while `localStorage` stays intact.

The service worker uses a network-first strategy for the app shell (`/`, `/index.html`, `/styles.css`, `/app.js`, and `/manifest.json`), so normal reloads after a deploy do not require uninstalling the PWA or clearing saved Spotify/session data.

## Behavior

- Left panel: mixed favorites tiles (liked songs, followed artists, playlists, liked albums).
- Right panel: now playing art, controls, and the current playable track list.
- Artist/open-ended playback: Spotify owns the next tracks and the list mirrors Spotify queue state.
- Single-song playback: next/prev replay the same song.
- Playlist/album playback: the app fetches the source tracks and keeps next/prev inside that context.
- Left panel navigation wraps to first tile after the end.
- Connection state machine handles authorizing/connecting/connected/disconnected/token-expired states, disables controls while disconnected, and auto-retries with backoff.

## Icons and placeholders

Google Material icon SVG paths are embedded into `styles.css` and tinted by CSS theme colors for active/inactive states.

Tile and album placeholders use the Genres icon generated in `app.js`, and PWA app icons (`assets/icons/app-192.svg`, `assets/icons/app-512.svg`) are genres-based.

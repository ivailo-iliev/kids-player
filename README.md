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

## Behavior

- Left panel: mixed favorites tiles (liked songs, followed artists, playlists, liked albums).
- Right panel: now playing art, controls, and current allowed track list.
- Artist playback: top tracks first, fallback to all artist tracks if top tracks are unavailable.
- Single-song playback: next/prev replay the same song.
- Playlist/album playback: loops when reaching the end.
- Left panel navigation wraps to first tile after the end.
- Connection state machine handles authorizing/connecting/connected/disconnected/token-expired states, disables controls while disconnected, and auto-retries with backoff.

## Icon placeholders

`assets/icons/*.svg` are placeholder SVG files. Replace them with your selected Google icon exports.

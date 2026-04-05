const SPOTIFY = {
  clientId: 'YOUR_SPOTIFY_CLIENT_ID',
  redirectUri: window.location.origin + window.location.pathname,
  scopes: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-library-read',
    'user-follow-read',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-read-playback-state',
    'user-modify-playback-state'
  ]
};

const CONNECTION_STATES = {
  INIT: 'init',
  AUTHORIZING: 'authorizing',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  TOKEN_EXPIRED: 'token_expired',
  ERROR: 'error'
};

const ALLOWED_CONNECTION_TRANSITIONS = {
  [CONNECTION_STATES.INIT]: [
    CONNECTION_STATES.AUTHORIZING,
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.DISCONNECTED,
    CONNECTION_STATES.ERROR
  ],
  [CONNECTION_STATES.AUTHORIZING]: [
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.TOKEN_EXPIRED,
    CONNECTION_STATES.ERROR
  ],
  [CONNECTION_STATES.CONNECTING]: [
    CONNECTION_STATES.CONNECTED,
    CONNECTION_STATES.DISCONNECTED,
    CONNECTION_STATES.TOKEN_EXPIRED,
    CONNECTION_STATES.ERROR
  ],
  [CONNECTION_STATES.CONNECTED]: [
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.DISCONNECTED,
    CONNECTION_STATES.TOKEN_EXPIRED,
    CONNECTION_STATES.ERROR
  ],
  [CONNECTION_STATES.DISCONNECTED]: [
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.TOKEN_EXPIRED,
    CONNECTION_STATES.ERROR
  ],
  [CONNECTION_STATES.TOKEN_EXPIRED]: [
    CONNECTION_STATES.AUTHORIZING,
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.ERROR
  ],
  [CONNECTION_STATES.ERROR]: [
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.AUTHORIZING,
    CONNECTION_STATES.DISCONNECTED
  ]
};

const STATUS_ICONS = {
  [CONNECTION_STATES.INIT]: 'assets/icons/connecting.svg',
  [CONNECTION_STATES.AUTHORIZING]: 'assets/icons/connecting.svg',
  [CONNECTION_STATES.CONNECTING]: 'assets/icons/connecting.svg',
  [CONNECTION_STATES.CONNECTED]: 'assets/icons/connected.svg',
  [CONNECTION_STATES.DISCONNECTED]: 'assets/icons/disconnected.svg',
  [CONNECTION_STATES.TOKEN_EXPIRED]: 'assets/icons/disconnected.svg',
  [CONNECTION_STATES.ERROR]: 'assets/icons/disconnected.svg'
};

const state = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
  player: null,
  deviceId: null,
  isPlaying: false,
  connection: CONNECTION_STATES.INIT,
  connectionDetail: 'Starting...',
  reconnectAttempts: 0,
  reconnectTimerId: null,
  healthcheckTimerId: null,
  selectedTileIndex: 0,
  favoritesTiles: [],
  currentList: [],
  currentIndex: 0,
  currentSourceType: null
};

const ui = {
  tileGrid: document.getElementById('tileGrid'),
  navPrev: document.getElementById('navPrev'),
  navNext: document.getElementById('navNext'),
  connectionIcon: document.getElementById('connectionIcon'),
  connectionText: document.getElementById('connectionText'),
  albumArt: document.getElementById('albumArt'),
  trackList: document.getElementById('trackList'),
  btnPrev: document.getElementById('btnPrev'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  btnNext: document.getElementById('btnNext'),
  playPauseIcon: document.getElementById('playPauseIcon')
};

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }

  bindUiEvents();
  transitionConnection(CONNECTION_STATES.AUTHORIZING, 'Checking Spotify authorization...');

  await loadTokensFromStorage();
  await maybeCompleteAuthRedirect();

  if (!state.accessToken) {
    await startAuthFlow();
    return;
  }

  const refreshed = await ensureValidToken();
  if (!refreshed) {
    transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify token expired. Reauthorizing...');
    await startAuthFlow();
    return;
  }

  transitionConnection(CONNECTION_STATES.CONNECTING, 'Connecting to Spotify...');
  await initSpotifyPlayer();

  try {
    await loadFavorites();
    renderTiles();
    updateTrackList();
  } catch (error) {
    transitionConnection(CONNECTION_STATES.ERROR, 'Could not load favorites');
  }

  startHealthchecks();
}

function bindUiEvents() {
  ui.navPrev.addEventListener('click', () => moveSelection(-1));
  ui.navNext.addEventListener('click', () => moveSelection(1));

  ui.btnPlayPause.addEventListener('click', onTogglePlayPause);
  ui.btnPrev.addEventListener('click', () => onTrackStep(-1));
  ui.btnNext.addEventListener('click', () => onTrackStep(1));

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('online', onBrowserOnline);
  window.addEventListener('offline', onBrowserOffline);
}

function onBrowserOnline() {
  if (state.connection !== CONNECTION_STATES.CONNECTED) {
    scheduleReconnect('Network restored');
  }
}

function onBrowserOffline() {
  transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Network offline');
}

function onKeyDown(event) {
  const cols = 5;

  if (event.key === 'ArrowLeft') {
    moveSelection(-1);
  } else if (event.key === 'ArrowRight') {
    moveSelection(1);
  } else if (event.key === 'ArrowUp') {
    moveSelection(-cols);
  } else if (event.key === 'ArrowDown') {
    moveSelection(cols);
  } else if (event.key === 'Enter' || event.key === ' ') {
    playSelectedTile();
  } else if (event.key === 'MediaTrackNext') {
    onTrackStep(1);
  } else if (event.key === 'MediaTrackPrevious') {
    onTrackStep(-1);
  } else if (event.key === 'MediaPlayPause') {
    onTogglePlayPause();
  }
}

function canControlPlayback() {
  return state.connection === CONNECTION_STATES.CONNECTED && state.player && state.deviceId;
}

function moveSelection(delta) {
  if (!state.favoritesTiles.length) {
    return;
  }

  const count = state.favoritesTiles.length;
  state.selectedTileIndex = ((state.selectedTileIndex + delta) % count + count) % count;
  renderTiles();
}

async function playSelectedTile() {
  if (!canControlPlayback()) {
    return;
  }

  const tile = state.favoritesTiles[state.selectedTileIndex];
  if (!tile) {
    return;
  }

  if (tile.type === 'song') {
    state.currentList = [tile.track];
    state.currentIndex = 0;
    state.currentSourceType = 'song';
  } else if (tile.type === 'playlist' || tile.type === 'album') {
    state.currentList = await fetchContextTracks(tile.type, tile.id);
    state.currentIndex = 0;
    state.currentSourceType = tile.type;
  } else if (tile.type === 'artist') {
    state.currentList = await fetchArtistTracks(tile.id);
    state.currentIndex = 0;
    state.currentSourceType = 'artist';
  }

  if (!state.currentList.length) {
    return;
  }

  await playTrackAtIndex(0);
}

async function onTrackStep(direction) {
  if (!canControlPlayback() || !state.currentList.length) {
    return;
  }

  if (state.currentSourceType === 'song') {
    state.currentIndex = 0;
    await playTrackAtIndex(0);
    return;
  }

  const count = state.currentList.length;
  state.currentIndex = ((state.currentIndex + direction) % count + count) % count;
  await playTrackAtIndex(state.currentIndex);
}

async function onTogglePlayPause() {
  if (!canControlPlayback()) {
    return;
  }

  try {
    await state.player.togglePlay();
  } catch (error) {
    transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Playback device unavailable');
    scheduleReconnect('Playback toggle failed');
  }
}

function renderTiles() {
  ui.tileGrid.innerHTML = '';

  state.favoritesTiles.forEach((tile, index) => {
    const img = document.createElement('img');
    img.className = 'tile' + (index === state.selectedTileIndex ? ' selected' : '');
    img.src = tile.image || 'assets/placeholders/tile-placeholder.svg';
    img.alt = tile.type;
    img.setAttribute('role', 'option');
    img.setAttribute('aria-selected', index === state.selectedTileIndex ? 'true' : 'false');

    img.addEventListener('click', async () => {
      state.selectedTileIndex = index;
      renderTiles();
      await playSelectedTile();
    });

    ui.tileGrid.appendChild(img);
  });
}

function updateTrackList() {
  ui.trackList.innerHTML = '';

  state.currentList.forEach((track, index) => {
    const li = document.createElement('li');
    li.textContent = track.name;
    if (index === state.currentIndex) {
      li.classList.add('nowPlaying');
    }
    ui.trackList.appendChild(li);
  });

  const current = state.currentList[state.currentIndex];
  if (current && current.image) {
    ui.albumArt.src = current.image;
  }
}

function transitionConnection(nextState, detail) {
  const current = state.connection;
  const allowedNext = ALLOWED_CONNECTION_TRANSITIONS[current] || [];

  if (current !== nextState && allowedNext.indexOf(nextState) === -1) {
    state.connection = CONNECTION_STATES.ERROR;
    state.connectionDetail = 'Invalid connection transition';
  } else {
    state.connection = nextState;
    state.connectionDetail = detail || state.connectionDetail;
  }

  if (nextState === CONNECTION_STATES.CONNECTED) {
    state.reconnectAttempts = 0;
    clearReconnectTimer();
  }

  updateConnectionUi();
}

function updateConnectionUi() {
  ui.connectionIcon.src = STATUS_ICONS[state.connection] || STATUS_ICONS[CONNECTION_STATES.DISCONNECTED];
  ui.connectionText.textContent = state.connectionDetail;

  const disableControls = state.connection !== CONNECTION_STATES.CONNECTED;
  ui.btnPrev.disabled = disableControls;
  ui.btnPlayPause.disabled = disableControls;
  ui.btnNext.disabled = disableControls;
}

function scheduleReconnect(reason) {
  if (state.reconnectTimerId || state.connection === CONNECTION_STATES.CONNECTED) {
    return;
  }

  state.reconnectAttempts += 1;
  const delayMs = Math.min(30000, 1000 * Math.pow(2, state.reconnectAttempts));

  transitionConnection(CONNECTION_STATES.CONNECTING, reason + ' - retrying in ' + Math.round(delayMs / 1000) + 's');

  state.reconnectTimerId = window.setTimeout(async () => {
    clearReconnectTimer();
    await reconnectPlayer();
  }, delayMs);
}

function clearReconnectTimer() {
  if (state.reconnectTimerId) {
    clearTimeout(state.reconnectTimerId);
    state.reconnectTimerId = null;
  }
}

async function reconnectPlayer() {
  if (!navigator.onLine) {
    transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Network offline');
    return;
  }

  const tokenOk = await ensureValidToken();
  if (!tokenOk) {
    transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify token expired');
    return;
  }

  try {
    if (state.player) {
      await state.player.connect();
    } else {
      await initSpotifyPlayer();
    }

    if (!state.deviceId) {
      transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Spotify device not ready');
      scheduleReconnect('Device still unavailable');
      return;
    }

    transitionConnection(CONNECTION_STATES.CONNECTED, 'Spotify connected');
  } catch (error) {
    transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Reconnect failed');
    scheduleReconnect('Reconnect failed');
  }
}

function startHealthchecks() {
  if (state.healthcheckTimerId) {
    clearInterval(state.healthcheckTimerId);
  }

  state.healthcheckTimerId = window.setInterval(async () => {
    if (!navigator.onLine) {
      transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Network offline');
      return;
    }

    const tokenOk = await ensureValidToken();
    if (!tokenOk) {
      transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify token expired');
      return;
    }

    if (state.connection !== CONNECTION_STATES.CONNECTED) {
      scheduleReconnect('Healthcheck detected disconnected state');
      return;
    }

    const devices = await spotifyGet('/me/player/devices');
    const deviceList = devices.devices || [];
    const deviceReady = deviceList.some((device) => device.id === state.deviceId);

    if (!deviceReady) {
      transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Spotify device lost');
      scheduleReconnect('Device missing in healthcheck');
    }
  }, 15000);
}

async function loadFavorites() {
  const [likedSongs, playlists, artists, albums] = await Promise.all([
    fetchAll('/me/tracks?limit=50', (item) => ({
      type: 'song',
      id: item.track.id,
      image: getImage(item.track.album.images),
      track: normalizeTrack(item.track)
    })),
    fetchAll('/me/playlists?limit=50', (item) => ({
      type: 'playlist',
      id: item.id,
      image: getImage(item.images)
    })),
    fetchAll('/me/following?type=artist&limit=50', (item) => ({
      type: 'artist',
      id: item.id,
      image: getImage(item.images)
    }), true),
    fetchAll('/me/albums?limit=50', (item) => ({
      type: 'album',
      id: item.album.id,
      image: getImage(item.album.images)
    }))
  ]);

  state.favoritesTiles = likedSongs.concat(playlists, artists, albums);
}

async function initSpotifyPlayer() {
  await waitForSpotifySdk();

  state.player = new Spotify.Player({
    name: 'Kids Player',
    getOAuthToken: (cb) => cb(state.accessToken),
    volume: 0.9
  });

  state.player.addListener('ready', ({ device_id: deviceId }) => {
    state.deviceId = deviceId;
    transitionConnection(CONNECTION_STATES.CONNECTED, 'Spotify connected');
  });

  state.player.addListener('not_ready', () => {
    transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Spotify disconnected');
    scheduleReconnect('Device became unavailable');
  });

  state.player.addListener('initialization_error', () => {
    transitionConnection(CONNECTION_STATES.ERROR, 'Spotify initialization error');
    scheduleReconnect('Player init error');
  });

  state.player.addListener('authentication_error', () => {
    transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify authentication error');
  });

  state.player.addListener('account_error', () => {
    transitionConnection(CONNECTION_STATES.ERROR, 'Spotify Premium account required');
  });

  state.player.addListener('player_state_changed', (sdkState) => {
    if (!sdkState) {
      return;
    }

    state.isPlaying = !sdkState.paused;
    ui.playPauseIcon.src = state.isPlaying ? 'assets/icons/pause.svg' : 'assets/icons/play.svg';
  });

  await state.player.connect();
}

function waitForSpotifySdk() {
  return new Promise((resolve) => {
    if (window.Spotify) {
      resolve();
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => resolve();
  });
}

async function playTrackAtIndex(index) {
  state.currentIndex = index;
  const track = state.currentList[index];
  if (!track || !state.deviceId) {
    return;
  }

  const payload = {
    uris: [track.uri],
    position_ms: 0
  };

  const response = await fetch('https://api.spotify.com/v1/me/player/play?device_id=' + encodeURIComponent(state.deviceId), {
    method: 'PUT',
    headers: spotifyHeaders(),
    body: JSON.stringify(payload)
  });

  if (response.status === 401) {
    const tokenOk = await ensureValidToken(true);
    if (tokenOk) {
      await playTrackAtIndex(index);
      return;
    }
    transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify authorization expired');
    return;
  }

  if (!response.ok) {
    transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Spotify play request failed');
    scheduleReconnect('Play request failed');
    return;
  }

  updateTrackList();
}

async function fetchContextTracks(type, id) {
  const endpoint = type === 'playlist'
    ? '/playlists/' + id + '/tracks?limit=100'
    : '/albums/' + id + '/tracks?limit=50';

  const data = await spotifyGet(endpoint);
  const items = data.items || [];

  if (type === 'playlist') {
    return items
      .filter((entry) => entry.track && entry.track.uri)
      .map((entry) => normalizeTrack(entry.track));
  }

  const album = await spotifyGet('/albums/' + id);
  const image = getImage(album.images);

  return items
    .filter((track) => track && track.uri)
    .map((track) => ({
      uri: track.uri,
      name: track.name,
      image
    }));
}

async function fetchArtistTracks(artistId) {
  const top = await spotifyGet('/artists/' + artistId + '/top-tracks?market=from_token');
  const topTracks = (top.tracks || []).map(normalizeTrack);
  if (topTracks.length) {
    return topTracks;
  }

  const albumsData = await spotifyGet('/artists/' + artistId + '/albums?include_groups=album,single&limit=50');
  const albums = albumsData.items || [];
  const trackMap = {};

  for (let i = 0; i < albums.length; i += 1) {
    const album = albums[i];
    const tracksData = await spotifyGet('/albums/' + album.id + '/tracks?limit=50');
    const tracks = tracksData.items || [];
    const image = getImage(album.images);

    tracks.forEach((track) => {
      if (!trackMap[track.id]) {
        trackMap[track.id] = {
          uri: track.uri,
          name: track.name,
          image
        };
      }
    });
  }

  return Object.values(trackMap);
}

function normalizeTrack(track) {
  return {
    uri: track.uri,
    name: track.name,
    image: getImage(track.album && track.album.images)
  };
}

function getImage(images) {
  return images && images.length ? images[0].url : 'assets/placeholders/tile-placeholder.svg';
}

async function spotifyGet(path) {
  const response = await fetch('https://api.spotify.com/v1' + path, {
    headers: spotifyHeaders()
  });

  if (response.status === 401) {
    const tokenOk = await ensureValidToken(true);
    if (tokenOk) {
      return spotifyGet(path);
    }
    transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify authorization expired');
    return {};
  }

  if (!response.ok) {
    transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Spotify API unavailable');
    return {};
  }

  return response.json();
}

function spotifyHeaders() {
  return {
    Authorization: 'Bearer ' + state.accessToken,
    'Content-Type': 'application/json'
  };
}

async function fetchAll(path, mapper, followingArtists) {
  const collection = [];
  let nextPath = path;

  while (nextPath) {
    const data = await spotifyGet(nextPath.replace('https://api.spotify.com/v1', ''));

    if (followingArtists) {
      const artists = data.artists || {};
      (artists.items || []).forEach((item) => collection.push(mapper(item)));
      nextPath = artists.next;
    } else {
      (data.items || []).forEach((item) => collection.push(mapper(item)));
      nextPath = data.next;
    }
  }

  return collection;
}

async function maybeCompleteAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) {
    return;
  }

  const verifier = localStorage.getItem('spotify_pkce_verifier');
  if (!verifier) {
    transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Missing PKCE verifier');
    return;
  }

  const body = new URLSearchParams({
    client_id: SPOTIFY.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: SPOTIFY.redirectUri,
    code_verifier: verifier
  });

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!tokenRes.ok) {
    transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify authorization failed');
    return;
  }

  const tokenData = await tokenRes.json();
  saveTokens(tokenData);
  window.history.replaceState({}, document.title, SPOTIFY.redirectUri);
}

async function startAuthFlow() {
  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);

  localStorage.setItem('spotify_pkce_verifier', verifier);

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', SPOTIFY.clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', SPOTIFY.redirectUri);
  authUrl.searchParams.set('scope', SPOTIFY.scopes.join(' '));
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', challenge);

  window.location.assign(authUrl.toString());
}

async function ensureValidToken(forceRefresh) {
  const expired = Date.now() >= state.expiresAt - 30000;
  if (!forceRefresh && !expired) {
    return true;
  }

  if (!state.refreshToken) {
    return false;
  }

  const body = new URLSearchParams({
    client_id: SPOTIFY.clientId,
    grant_type: 'refresh_token',
    refresh_token: state.refreshToken
  });

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!tokenRes.ok) {
    return false;
  }

  const tokenData = await tokenRes.json();
  saveTokens({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || state.refreshToken,
    expires_in: tokenData.expires_in
  });

  return true;
}

function saveTokens(tokenData) {
  state.accessToken = tokenData.access_token;
  state.refreshToken = tokenData.refresh_token || state.refreshToken;
  state.expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

  localStorage.setItem('spotify_access_token', state.accessToken);
  localStorage.setItem('spotify_refresh_token', state.refreshToken || '');
  localStorage.setItem('spotify_expires_at', String(state.expiresAt));
}

async function loadTokensFromStorage() {
  state.accessToken = localStorage.getItem('spotify_access_token');
  state.refreshToken = localStorage.getItem('spotify_refresh_token');
  state.expiresAt = Number(localStorage.getItem('spotify_expires_at') || 0);
}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i += 1) {
    value += chars[randomValues[i] % chars.length];
  }

  return value;
}

async function sha256Base64Url(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let value = '';

  for (let i = 0; i < bytes.length; i += 1) {
    value += String.fromCharCode(bytes[i]);
  }

  return btoa(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

init();

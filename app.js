const SPOTIFY = {
  clientId: '0e8b935d749e40a987ed4e401a446af0',
  redirectUri: window.location.origin + window.location.pathname,
  apiProxyBase: '/.netlify/functions/spotify-api',
  tokenProxyUrl: '/.netlify/functions/spotify-token',
  scopes: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-library-read',
    'user-follow-read',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-read-currently-playing',
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
  [CONNECTION_STATES.INIT]: new Set([
    CONNECTION_STATES.AUTHORIZING,
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.DISCONNECTED,
    CONNECTION_STATES.ERROR
  ]),
  [CONNECTION_STATES.AUTHORIZING]: new Set([
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.TOKEN_EXPIRED,
    CONNECTION_STATES.ERROR
  ]),
  [CONNECTION_STATES.CONNECTING]: new Set([
    CONNECTION_STATES.CONNECTED,
    CONNECTION_STATES.DISCONNECTED,
    CONNECTION_STATES.TOKEN_EXPIRED,
    CONNECTION_STATES.ERROR
  ]),
  [CONNECTION_STATES.CONNECTED]: new Set([
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.DISCONNECTED,
    CONNECTION_STATES.TOKEN_EXPIRED,
    CONNECTION_STATES.ERROR
  ]),
  [CONNECTION_STATES.DISCONNECTED]: new Set([
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.TOKEN_EXPIRED,
    CONNECTION_STATES.ERROR
  ]),
  [CONNECTION_STATES.TOKEN_EXPIRED]: new Set([
    CONNECTION_STATES.AUTHORIZING,
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.ERROR
  ]),
  [CONNECTION_STATES.ERROR]: new Set([
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.AUTHORIZING,
    CONNECTION_STATES.DISCONNECTED
  ])
};

const STATUS_ICON_CLASSES = {
  [CONNECTION_STATES.INIT]: 'icon-connecting',
  [CONNECTION_STATES.AUTHORIZING]: 'icon-connecting',
  [CONNECTION_STATES.CONNECTING]: 'icon-connecting',
  [CONNECTION_STATES.CONNECTED]: 'icon-connected',
  [CONNECTION_STATES.DISCONNECTED]: 'icon-disconnected',
  [CONNECTION_STATES.TOKEN_EXPIRED]: 'icon-disconnected',
  [CONNECTION_STATES.ERROR]: 'icon-disconnected'
};

const GENRES_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'><rect width='320' height='320' fill='#1f1f1f'/><circle cx='160' cy='160' r='112' fill='#111'/><path fill='#9e9e9e' d='M162 216c12-12 12-29 12-48v-86h37v-24h-55v78c-4-2-9-4-13-4-17 0-30 12-30 30s13 30 30 30c17 0 30-13 30-30zm-2 67c-28 0-53-11-73-30-19-20-30-45-30-73s11-53 30-73c20-19 45-30 73-30s53 11 73 30c19 20 30 45 30 73s-11 53-30 73c-20 19-45 30-73 30z'/></svg>"
  );

const TILE_IMAGE_SIZE = 100;
const TILE_IMAGE_DOWNLOAD_SIZE = 100;
const ALBUM_ART_IMAGE_SIZE = 160;
const IMAGE_CACHE_WARM_BATCH = 24;
const MAX_RENDERED_TILES = 30;
const MAX_RENDERED_TRACKS = 40;
const TILES_PER_PAGE = 20;

const state = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
  player: null,
  deviceId: null,
  market: 'US',
  isPlaying: false,
  connection: CONNECTION_STATES.INIT,
  connectionDetail: 'Starting...',
  reconnectAttempts: 0,
  reconnectTimerId: null,
  healthcheckTimerId: null,
  selectedTileIndex: 0,
  favoritesTiles: [],
  tileNodes: [],
  tileNodeIndices: [],
  currentList: [],
  trackNodes: [],
  trackNodeIndices: [],
  currentIndex: 0,
  currentSourceType: null,
  contextTrackCache: {},
  artistTrackCache: {},
  playSelectionRequestId: 0,
  healthcheckInFlight: false,
  queueSyncInFlight: false,
  queueSyncPending: false,
  queueSyncCurrentTrack: null,
  renderedConnectionIconClass: '',
  renderedConnectionActive: false,
  renderedConnectionDetail: '',
  renderedControlsDisabled: null,
  renderedAlbumArtSrc: '',
  renderedStatusMessage: '',
  startupStep: 'boot'
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

let spotifySdkReadyResolve = null;

function onSpotifyWebPlaybackSDKReady() {
  if (spotifySdkReadyResolve) {
    spotifySdkReadyResolve();
    spotifySdkReadyResolve = null;
  }
}

function describeError(error) {
  if (!error) {
    return 'Unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error.name && error.message) {
    return error.name + ': ' + error.message;
  }

  if (error.message) {
    return error.message;
  }

  return String(error);
}

function logStartupError(scope, error) {
  console.error(scope, error);
}

function failStartup(detail, error) {
  if (error) {
    logStartupError(detail, error);
  }

  if (
    state.connection === CONNECTION_STATES.ERROR &&
    state.connectionDetail &&
    state.connectionDetail !== 'Invalid connection transition' &&
    state.connectionDetail !== detail
  ) {
    return;
  }

  transitionConnection(CONNECTION_STATES.ERROR, detail);
}

function getStorageItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    throw new Error('Browser storage unavailable while reading ' + key + ' (' + describeError(error) + ')');
  }
}

function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    throw new Error('Browser storage unavailable while writing ' + key + ' (' + describeError(error) + ')');
  }
}

function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    const detail = 'Startup failed during ' + state.startupStep + ': ' + describeError(event.error || event.message);
    failStartup(detail, event.error || event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const detail = 'Startup failed during ' + state.startupStep + ': ' + describeError(event.reason);
    failStartup(detail, event.reason);
  });
}

function isPortrait() {
  return window.matchMedia('(orientation: portrait)').matches;
}

function scrollTilePageBy(direction) {
  ui.tileGrid.scrollBy({ left: direction * ui.tileGrid.clientWidth, behavior: 'smooth' });
}

function setStartupStep(step) {
  state.startupStep = step;
}

async function init() {
  installGlobalErrorHandlers();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  }

  bindUiEvents();
  setAlbumArtImage(createFallbackImage(ALBUM_ART_IMAGE_SIZE));
  ui.btnPlayPause.classList.remove('is-active');
  transitionConnection(CONNECTION_STATES.AUTHORIZING, 'Checking Spotify authorization...');

  try {
    setStartupStep('loading saved session');
    loadTokensFromStorage();

    setStartupStep('processing Spotify redirect');
    await maybeCompleteAuthRedirect();

    if (!state.accessToken) {
      transitionConnection(CONNECTION_STATES.AUTHORIZING, 'Opening Spotify login...');
      setStartupStep('opening Spotify login');
      await startAuthFlow();
      return;
    }

    transitionConnection(CONNECTION_STATES.AUTHORIZING, 'Refreshing Spotify session...');
    setStartupStep('refreshing Spotify session');
    const refreshed = await ensureValidToken();
    if (!refreshed) {
      transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify token expired. Reauthorizing...');
      setStartupStep('reopening Spotify login');
      await startAuthFlow();
      return;
    }

    transitionConnection(CONNECTION_STATES.AUTHORIZING, 'Loading Spotify account...');
    setStartupStep('loading Spotify account');
    await loadUserMarket();
    transitionConnection(CONNECTION_STATES.CONNECTING, 'Connecting to Spotify...');
    setStartupStep('connecting Spotify player');
    await initSpotifyPlayer();

    try {
      setStartupStep('loading favorites');
      await loadFavorites();
      renderTiles();
      updateTrackList();
    } catch (error) {
      failStartup('Could not load favorites', error);
      return;
    }

    startHealthchecks();
  } catch (error) {
    failStartup('Startup failed during ' + state.startupStep + ': ' + describeError(error), error);
  }
}

function bindUiEvents() {
  ui.navPrev.addEventListener('click', () => {
    if (isPortrait()) scrollTilePageBy(-1);
    else moveSelection(-1);
  });
  ui.navNext.addEventListener('click', () => {
    if (isPortrait()) scrollTilePageBy(1);
    else moveSelection(1);
  });
  ui.tileGrid.addEventListener('click', onTileGridClick);

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

async function onTileGridClick(event) {
  const tileNode = event.target.closest('.tile');
  if (!tileNode || !ui.tileGrid.contains(tileNode)) {
    return;
  }

  const tileIndex = Number(tileNode.dataset.index);
  if (Number.isNaN(tileIndex)) {
    return;
  }

  const previousIndex = state.selectedTileIndex;
  state.selectedTileIndex = tileIndex;
  updateSelectedTileUi(previousIndex, state.selectedTileIndex);
  await playSelectedTile();
}

function canControlPlayback() {
  return state.connection === CONNECTION_STATES.CONNECTED && state.player && state.deviceId;
}

function moveSelection(delta) {
  if (!state.favoritesTiles.length) {
    return;
  }

  const previousIndex = state.selectedTileIndex;
  const count = state.favoritesTiles.length;
  state.selectedTileIndex = ((state.selectedTileIndex + delta) % count + count) % count;
  updateSelectedTileUi(previousIndex, state.selectedTileIndex);
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
    await addTrackToQueue(tile.track);
    return;
  }

  state.playSelectionRequestId += 1;
  state.currentList = [];
  state.currentIndex = 0;
  state.currentSourceType = tile.type;
  clearTrackList();
  setAlbumArtImage(tileToAlbumArtImage(tile));

  await playContextUri('spotify:' + tile.type + ':' + tile.id);
}

async function onTrackStep(direction) {
  if (!canControlPlayback()) {
    return;
  }

  try {
    if (direction < 0) {
      await state.player.previousTrack();
    } else {
      await state.player.nextTrack();
    }
  } catch (error) {
    transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Playback device unavailable');
    scheduleReconnect('Track step failed');
  }
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

function renderPortraitPages() {
  const prevScroll = ui.tileGrid.scrollLeft;

  state.tileNodes = [];
  state.tileNodeIndices = [];
  ui.tileGrid.innerHTML = '';

  let page = null;
  state.favoritesTiles.forEach((tile, i) => {
    if (i % TILES_PER_PAGE === 0) {
      page = document.createElement('div');
      page.className = 'tile-page';
      ui.tileGrid.appendChild(page);
    }
    const img = document.createElement('img');
    applyTileNodeState(img, i, tile, i === state.selectedTileIndex);
    state.tileNodes.push(img);
    state.tileNodeIndices.push(i);
    page.appendChild(img);
  });

  ui.tileGrid.scrollLeft = prevScroll;
}

function renderTiles() {
  if (isPortrait()) {
    renderPortraitPages();
    return;
  }

  const visibleIndices = getWindowedIndices(state.favoritesTiles.length, state.selectedTileIndex, MAX_RENDERED_TILES);
  const needsRebuild =
    state.tileNodes.length !== visibleIndices.length ||
    !sameIndices(state.tileNodeIndices, visibleIndices);

  if (needsRebuild) {
    state.tileNodes = [];
    state.tileNodeIndices = visibleIndices.slice();
    ui.tileGrid.innerHTML = '';

    const fragment = document.createDocumentFragment();
    visibleIndices.forEach((tileIndex) => {
      const tile = state.favoritesTiles[tileIndex];
      const img = document.createElement('img');
      img.width = TILE_IMAGE_SIZE;
      img.height = TILE_IMAGE_SIZE;
      img.decoding = 'async';
      img.setAttribute('role', 'option');
      applyTileNodeState(img, tileIndex, tile, tileIndex === state.selectedTileIndex);

      state.tileNodes.push(img);
      fragment.appendChild(img);
    });

    ui.tileGrid.appendChild(fragment);
    return;
  }

  for (let i = 0; i < state.tileNodes.length; i += 1) {
    const tileIndex = state.tileNodeIndices[i];
    const tile = state.favoritesTiles[tileIndex];
    applyTileNodeState(state.tileNodes[i], tileIndex, tile, tileIndex === state.selectedTileIndex);
  }
}

function applyTileNodeState(img, tileIndex, tile, selected) {
  const nextClassName = 'tile' + (selected ? ' selected' : '');
  const nextSrc = tile.image || GENRES_PLACEHOLDER;

  if (img.className !== nextClassName) {
    img.className = nextClassName;
  }
  if (img.src !== nextSrc) {
    img.src = nextSrc;
  }
  if (img.width !== TILE_IMAGE_SIZE) {
    img.width = TILE_IMAGE_SIZE;
  }
  if (img.height !== TILE_IMAGE_SIZE) {
    img.height = TILE_IMAGE_SIZE;
  }
  if (img.alt !== tile.type) {
    img.alt = tile.type;
  }
  if (img.dataset.index !== String(tileIndex)) {
    img.dataset.index = String(tileIndex);
  }
  if (img.getAttribute('aria-selected') !== (selected ? 'true' : 'false')) {
    img.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
}

function updateSelectedTileUi(previousIndex, nextIndex) {
  if (previousIndex === nextIndex) {
    return;
  }

  const previousRendered = state.tileNodeIndices.indexOf(previousIndex);
  const nextRendered = state.tileNodeIndices.indexOf(nextIndex);

  if (previousRendered === -1 || nextRendered === -1) {
    renderTiles();
    return;
  }

  const previousNode = state.tileNodes[previousRendered];
  if (previousNode) {
    previousNode.classList.remove('selected');
    previousNode.setAttribute('aria-selected', 'false');
  }

  const nextNode = state.tileNodes[nextRendered];
  if (nextNode) {
    nextNode.classList.add('selected');
    nextNode.setAttribute('aria-selected', 'true');
    if (isPortrait()) {
      nextNode.scrollIntoView({ block: 'nearest', inline: 'start' });
    }
  }
}

function updateTrackList() {
  const visibleIndices = getWindowedIndices(state.currentList.length, state.currentIndex, MAX_RENDERED_TRACKS);
  const needsRebuild =
    state.trackNodes.length !== visibleIndices.length ||
    !sameIndices(state.trackNodeIndices, visibleIndices);

  if (needsRebuild) {
    state.trackNodes = [];
    state.trackNodeIndices = visibleIndices.slice();
    ui.trackList.innerHTML = '';
    const fragment = document.createDocumentFragment();

    visibleIndices.forEach((trackIndex) => {
      const track = state.currentList[trackIndex];
      const li = document.createElement('li');
      li.textContent = track.name;
      if (trackIndex === state.currentIndex) {
        li.classList.add('nowPlaying');
      }
      state.trackNodes.push(li);
      fragment.appendChild(li);
    });

    ui.trackList.appendChild(fragment);
  } else {
    updateRenderedTrackSelection();
    updateRenderedTrackText();
  }

  const current = state.currentList[state.currentIndex];
  setAlbumArtImage(current ? trackToAlbumArtImage(current) : createFallbackImage(ALBUM_ART_IMAGE_SIZE));
}

function clearTrackList() {
  state.trackNodes = [];
  state.trackNodeIndices = [];
  ui.trackList.innerHTML = '';
}

function updateTrackListFromPlayerState(sdkState) {
  const currentTrack = sdkState.track_window && sdkState.track_window.current_track;

  if (!currentTrack) {
    clearTrackList();
    setAlbumArtImage(createFallbackImage(ALBUM_ART_IMAGE_SIZE));
    return;
  }

  setStatusMessage(state.connectionDetail);
  syncQueueState(normalizePlayerTrack(currentTrack));
}

function normalizePlayerTrack(track) {
  const image = normalizeAlbumArt(track.album && track.album.images);
  return {
    uri: track.uri,
    name: track.name,
    image: image.url,
    imageWidth: image.width,
    imageHeight: image.height
  };
}

function updateRenderedTrackSelection() {
  for (let i = 0; i < state.trackNodes.length; i += 1) {
    const trackIndex = state.trackNodeIndices[i];
    state.trackNodes[i].classList.toggle('nowPlaying', trackIndex === state.currentIndex);
  }
}

function updateRenderedTrackText() {
  for (let i = 0; i < state.trackNodes.length; i += 1) {
    const trackIndex = state.trackNodeIndices[i];
    const nextText = state.currentList[trackIndex] ? state.currentList[trackIndex].name : '';
    if (state.trackNodes[i].textContent !== nextText) {
      state.trackNodes[i].textContent = nextText;
    }
  }
}

async function syncQueueState(currentTrack) {
  state.queueSyncCurrentTrack = currentTrack;

  if (state.queueSyncInFlight) {
    state.queueSyncPending = true;
    return;
  }

  state.queueSyncInFlight = true;
  try {
    const queueData = await spotifyGet('/me/player/queue', { allowResourceErrors: true });
    const queueTracks = queueData && queueData.queue ? queueData.queue.map(normalizeQueueTrack) : [];
    state.currentList = [state.queueSyncCurrentTrack].concat(queueTracks);
    state.currentIndex = 0;
    updateTrackList();
  } finally {
    state.queueSyncInFlight = false;
    if (state.queueSyncPending) {
      state.queueSyncPending = false;
      syncQueueState(state.queueSyncCurrentTrack);
    }
  }
}

function normalizeQueueTrack(track) {
  return normalizePlayerTrack(track);
}

function setAlbumArtImage(image) {
  if (state.renderedAlbumArtSrc === image.url) {
    return;
  }

  ui.albumArt.src = image.url;
  ui.albumArt.width = image.width;
  ui.albumArt.height = image.height;
  state.renderedAlbumArtSrc = image.url;
}

function setStatusMessage(message) {
  if (state.renderedStatusMessage === message) {
    return;
  }

  ui.connectionText.textContent = message;
  state.renderedStatusMessage = message;
}

function scheduleImageWarmCache(tiles) {
  const tileSource = tiles || state.favoritesTiles;
  if (!tileSource.length) {
    return;
  }

  const allImages = tileSource
    .map((tile) => tile.image)
    .filter((url) => !!url)
    .slice(0, IMAGE_CACHE_WARM_BATCH);

  window.setTimeout(() => {
    allImages.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, 0);
}

function sameIndices(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

function getWindowedIndices(count, selectedIndex, maxSize) {
  if (!count) {
    return [];
  }

  if (count <= maxSize) {
    const all = [];
    for (let i = 0; i < count; i += 1) {
      all.push(i);
    }
    return all;
  }

  const half = Math.floor(maxSize / 2);
  let start = selectedIndex - half;
  if (start < 0) {
    start = 0;
  }
  if (start + maxSize > count) {
    start = count - maxSize;
  }

  const result = [];
  for (let i = start; i < start + maxSize; i += 1) {
    result.push(i);
  }

  return result;
}

function transitionConnection(nextState, detail) {
  const current = state.connection;
  const allowedNext = ALLOWED_CONNECTION_TRANSITIONS[current];

  if (current !== nextState && (!allowedNext || !allowedNext.has(nextState))) {
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
  const iconClass = STATUS_ICON_CLASSES[state.connection] || STATUS_ICON_CLASSES[CONNECTION_STATES.DISCONNECTED];
  const isActive = state.connection === CONNECTION_STATES.CONNECTED;
  const disableControls = !isActive;

  if (state.renderedConnectionIconClass !== iconClass) {
    ui.connectionIcon.className = 'icon ' + iconClass;
    state.renderedConnectionIconClass = iconClass;
  }

  if (state.renderedConnectionActive !== isActive) {
    ui.connectionIcon.classList.toggle('is-active', isActive);
    state.renderedConnectionActive = isActive;
  }

  if (state.renderedConnectionDetail !== state.connectionDetail) {
    ui.connectionText.textContent = state.connectionDetail;
    state.renderedConnectionDetail = state.connectionDetail;
    state.renderedStatusMessage = state.connectionDetail;
  }

  if (state.renderedControlsDisabled !== disableControls) {
    ui.btnPrev.disabled = disableControls;
    ui.btnPlayPause.disabled = disableControls;
    ui.btnNext.disabled = disableControls;
    state.renderedControlsDisabled = disableControls;
  }
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
    clearTimeout(state.healthcheckTimerId);
  }

  const run = async () => {
    await runHealthcheckOnce();
    state.healthcheckTimerId = window.setTimeout(run, 15000);
  };

  state.healthcheckTimerId = window.setTimeout(run, 15000);
}

async function runHealthcheckOnce() {
  if (state.healthcheckInFlight) {
    return;
  }

  state.healthcheckInFlight = true;
  try {
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
  } finally {
    state.healthcheckInFlight = false;
  }
}

async function loadFavorites() {
  const likedSongsMapper = (item) => {
    const image = normalizeTileImage(item.track.album.images);
    return ({
      type: 'song',
      id: item.track.id,
      image: image.url,
      imageWidth: image.width,
      imageHeight: image.height,
      track: normalizeTrack(item.track)
    });
  };
  const playlistsMapper = (item) => {
    const image = normalizeTileImage(item.images);
    return ({
      type: 'playlist',
      id: item.id,
      image: image.url,
      imageWidth: image.width,
      imageHeight: image.height
    });
  };
  const artistsMapper = (item) => {
    const image = normalizeTileImage(item.images);
    return ({
      type: 'artist',
      id: item.id,
      image: image.url,
      imageWidth: image.width,
      imageHeight: image.height
    });
  };
  const albumsMapper = (item) => {
    const image = normalizeTileImage(item.album.images);
    return ({
      type: 'album',
      id: item.album.id,
      image: image.url,
      imageWidth: image.width,
      imageHeight: image.height
    });
  };

  const [likedSongsPage, playlistsPage, artistsPage, albumsPage] = await Promise.all([
    fetchFirstPage('/me/tracks?limit=50', likedSongsMapper, false),
    fetchFirstPage('/me/playlists?limit=50', playlistsMapper, false),
    fetchFirstPage('/me/following?type=artist&limit=50', artistsMapper, true),
    fetchFirstPage('/me/albums?limit=50', albumsMapper, false)
  ]);

  state.favoritesTiles = likedSongsPage.items
    .concat(playlistsPage.items, artistsPage.items, albumsPage.items);

  scheduleImageWarmCache();

  window.setTimeout(() => {
    continueFavoritesPagination(likedSongsPage.next, likedSongsMapper, false);
    continueFavoritesPagination(playlistsPage.next, playlistsMapper, false);
    continueFavoritesPagination(artistsPage.next, artistsMapper, true);
    continueFavoritesPagination(albumsPage.next, albumsMapper, false);
  }, 0);
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
    ui.playPauseIcon.className = state.isPlaying ? 'icon icon-pause-circle' : 'icon icon-play-circle';
    ui.btnPlayPause.classList.toggle('is-active', state.isPlaying);
    updateTrackListFromPlayerState(sdkState);
  });

  await state.player.connect();
}

function waitForSpotifySdk() {
  return new Promise((resolve) => {
    if (window.Spotify) {
      resolve();
      return;
    }

    spotifySdkReadyResolve = resolve;
  });
}

async function playTrackAtIndex(index) {
  state.currentIndex = index;
  const track = state.currentList[index];
  if (!track || !state.deviceId) {
    return;
  }

  const body = JSON.stringify({
    uris: [track.uri],
    position_ms: 0
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(spotifyApiProxyUrl('/me/player/play?device_id=' + encodeURIComponent(state.deviceId)), {
      method: 'PUT',
      headers: spotifyHeaders(true),
      body
    });

    if (response.status === 401) {
      const tokenOk = await ensureValidToken(true);
      if (tokenOk) {
        continue;
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
    return;
  }
}

async function addTrackToQueue(track) {
  if (!track || !track.uri || !state.deviceId) {
    return;
  }

  const queuePath = '/me/player/queue?uri=' +
    encodeURIComponent(track.uri) +
    '&device_id=' +
    encodeURIComponent(state.deviceId);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(spotifyApiProxyUrl(queuePath), {
      method: 'POST',
      headers: spotifyHeaders(false)
    });

    if (response.status === 401) {
      const tokenOk = await ensureValidToken(true);
      if (tokenOk) {
        continue;
      }
      transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify authorization expired');
      return;
    }

    if (isNonFatalSpotifyStatus(response.status)) {
      setStatusMessage('Could not add this song to the queue');
      return;
    }

    if (!response.ok) {
      transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Spotify queue request failed');
      scheduleReconnect('Queue request failed');
      return;
    }

    setStatusMessage('Song added to queue');
    if (state.currentList.length) {
      syncQueueState(state.currentList[0]);
    }
    return;
  }
}

async function fetchContextTracks(type, id) {
  const cacheKey = type + ':' + id;
  if (state.contextTrackCache[cacheKey]) {
    return state.contextTrackCache[cacheKey];
  }

  const endpoint = type === 'playlist'
    ? '/playlists/' + id + '/tracks?limit=100'
    : '/albums/' + id + '/tracks?limit=50';

  const data = await spotifyGet(endpoint, { allowResourceErrors: true });
  if (!data) {
    return [];
  }
  const items = data.items || [];

  if (type === 'playlist') {
    const tracks = items
      .filter((entry) => entry.track && entry.track.uri)
      .map((entry) => normalizeTrack(entry.track));
    state.contextTrackCache[cacheKey] = tracks;
    return tracks;
  }

  const album = await spotifyGet('/albums/' + id, { allowResourceErrors: true });
  if (!album) {
    return [];
  }
  const image = normalizeAlbumArt(album.images);

  const tracks = items
    .filter((track) => track && track.uri)
    .map((track) => ({
      uri: track.uri,
      name: track.name,
      image: image.url,
      imageWidth: image.width,
      imageHeight: image.height
    }));
  state.contextTrackCache[cacheKey] = tracks;
  return tracks;
}

async function fetchArtistTracks(artistId) {
  if (state.artistTrackCache[artistId]) {
    return state.artistTrackCache[artistId];
  }

  const top = await spotifyGet('/artists/' + artistId + '/top-tracks?market=' + encodeURIComponent(state.market), {
    allowResourceErrors: true
  });
  if (!top) {
    return [];
  }
  const topTracks = (top.tracks || []).map(normalizeTrack);
  if (topTracks.length) {
    state.artistTrackCache[artistId] = topTracks;
    return topTracks;
  }

  const albumsData = await spotifyGet('/artists/' + artistId + '/albums?include_groups=album,single&limit=50', {
    allowResourceErrors: true
  });
  if (!albumsData) {
    return [];
  }
  const albums = albumsData.items || [];
  const trackMap = {};
  const fetchTasks = albums.map(async (album) => {
    const tracksData = await spotifyGet('/albums/' + album.id + '/tracks?limit=50', { allowResourceErrors: true });
    if (!tracksData) {
      return { tracks: [], image: normalizeAlbumArt(album.images) };
    }
    const tracks = tracksData.items || [];
    const image = normalizeAlbumArt(album.images);
    return { tracks, image };
  });

  const albumTracks = await Promise.all(fetchTasks);
  albumTracks.forEach(({ tracks, image }) => {
    tracks.forEach((track) => {
      if (!trackMap[track.id]) {
        trackMap[track.id] = {
          uri: track.uri,
          name: track.name,
          image: image.url,
          imageWidth: image.width,
          imageHeight: image.height
        };
      }
    });
  });

  const tracks = Object.values(trackMap);
  state.artistTrackCache[artistId] = tracks;
  return tracks;
}

async function playContextUri(contextUri) {
  const body = JSON.stringify({
    context_uri: contextUri
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(spotifyApiProxyUrl('/me/player/play?device_id=' + encodeURIComponent(state.deviceId)), {
      method: 'PUT',
      headers: spotifyHeaders(true),
      body
    });

    if (response.status === 401) {
      const tokenOk = await ensureValidToken(true);
      if (tokenOk) {
        continue;
      }
      transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify authorization expired');
      return;
    }

    if (isNonFatalSpotifyStatus(response.status)) {
      clearTrackList();
      setAlbumArtImage(createFallbackImage(ALBUM_ART_IMAGE_SIZE));
      setStatusMessage('This item is unavailable for the current Spotify account');
      return;
    }

    if (!response.ok) {
      transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Spotify play request failed');
      scheduleReconnect('Play request failed');
      return;
    }

    return;
  }
}

function normalizeTrack(track) {
  const image = normalizeAlbumArt(track.album && track.album.images);
  return {
    uri: track.uri,
    name: track.name,
    image: image.url,
    imageWidth: image.width,
    imageHeight: image.height
  };
}

function normalizeTileImage(images) {
  return pickImageBySize(images, TILE_IMAGE_DOWNLOAD_SIZE);
}

function normalizeAlbumArt(images) {
  return pickImageBySize(images, ALBUM_ART_IMAGE_SIZE);
}

function pickImageBySize(images, preferredSize) {
  if (!images || !images.length) {
    return createFallbackImage(preferredSize);
  }

  let best = null;

  for (let i = 0; i < images.length; i += 1) {
    const image = images[i];
    const candidateSize = image.width || image.height || preferredSize;
    if (candidateSize >= preferredSize && (!best || candidateSize < (best.width || best.height || preferredSize))) {
      best = image;
    }
  }

  if (!best) {
    best = images[0];
    for (let i = 1; i < images.length; i += 1) {
      const image = images[i];
      const candidateSize = image.width || image.height || preferredSize;
      const bestSize = best.width || best.height || preferredSize;
      if (candidateSize > bestSize) {
        best = image;
      }
    }
  }

  return {
    url: best.url,
    width: best.width || preferredSize,
    height: best.height || preferredSize
  };
}

function createFallbackImage(size) {
  return {
    url: GENRES_PLACEHOLDER,
    width: size,
    height: size
  };
}

function tileToAlbumArtImage(tile) {
  return {
    url: tile.image || GENRES_PLACEHOLDER,
    width: tile.imageWidth || ALBUM_ART_IMAGE_SIZE,
    height: tile.imageHeight || ALBUM_ART_IMAGE_SIZE
  };
}

function trackToAlbumArtImage(track) {
  return {
    url: track.image || GENRES_PLACEHOLDER,
    width: track.imageWidth || ALBUM_ART_IMAGE_SIZE,
    height: track.imageHeight || ALBUM_ART_IMAGE_SIZE
  };
}

function isNonFatalSpotifyStatus(status) {
  return status === 400 || status === 403 || status === 404;
}

async function spotifyGet(path, options) {
  const allowResourceErrors = options && options.allowResourceErrors;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;

    try {
      response = await fetchWithErrorDetail(spotifyApiProxyUrl(path), {
        headers: spotifyHeaders(false)
      }, 'Spotify API request failed');
    } catch (error) {
      throw error;
    }

    if (response.status === 401) {
      const tokenOk = await ensureValidToken(true);
      if (tokenOk) {
        continue;
      }
      transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify authorization expired');
      return {};
    }

    if (allowResourceErrors && isNonFatalSpotifyStatus(response.status)) {
      return null;
    }

    if (!response.ok) {
      transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Spotify API unavailable');
      return {};
    }

    return response.json();
  }

  return {};
}

function spotifyHeaders(includeJsonContentType) {
  const headers = {
    Authorization: 'Bearer ' + state.accessToken
  };

  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

function tokenRequestHeaders() {
  return {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
}

function spotifyApiProxyUrl(path) {
  return SPOTIFY.apiProxyBase + '?path=' + encodeURIComponent(path);
}

async function fetchWithErrorDetail(url, options, label) {
  try {
    return await fetch(url, options);
  } catch (error) {
    failStartup((label || 'Request failed') + ': ' + url + ' (' + describeError(error) + ')', error);
    throw error;
  }
}

async function loadUserMarket() {
  const profile = await spotifyGet('/me', { allowResourceErrors: true });
  if (profile && profile.country) {
    state.market = profile.country;
  }
}

async function fetchFirstPage(path, mapper, followingArtists) {
  const data = await spotifyGet(path);
  return mapFavoritesPage(data, mapper, followingArtists);
}

function mapFavoritesPage(data, mapper, followingArtists) {
  if (followingArtists) {
    const artists = data.artists || {};
    const items = (artists.items || []).map(mapper);
    return {
      items,
      next: artists.next
    };
  }

  const items = (data.items || []).map(mapper);
  return {
    items,
    next: data.next
  };
}

async function continueFavoritesPagination(path, mapper, followingArtists) {
  let nextPath = path;
  while (nextPath) {
    const data = await spotifyGet(nextPath.replace('https://api.spotify.com/v1', ''));
    const mapped = mapFavoritesPage(data, mapper, followingArtists);
    if (mapped.items.length) {
      const previousVisibleIndices = getWindowedIndices(
        state.favoritesTiles.length,
        state.selectedTileIndex,
        MAX_RENDERED_TILES
      );
      state.favoritesTiles = state.favoritesTiles.concat(mapped.items);
      scheduleImageWarmCache(mapped.items);
      const nextVisibleIndices = getWindowedIndices(
        state.favoritesTiles.length,
        state.selectedTileIndex,
        MAX_RENDERED_TILES
      );
      if (!sameIndices(previousVisibleIndices, nextVisibleIndices)) {
        renderTiles();
      }
    }
    nextPath = mapped.next;
    await pauseForUi();
  }
}

async function pauseForUi() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function maybeCompleteAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) {
    return;
  }

  const verifier = getStorageItem('spotify_pkce_verifier');
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

  let tokenRes;
  try {
    tokenRes = await fetchWithErrorDetail(SPOTIFY.tokenProxyUrl, {
      method: 'POST',
      headers: tokenRequestHeaders(),
      body
    }, 'Spotify authorization request failed');
  } catch (error) {
    throw error;
  }

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

  setStorageItem('spotify_pkce_verifier', verifier);

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

  let tokenRes;
  try {
    tokenRes = await fetchWithErrorDetail(SPOTIFY.tokenProxyUrl, {
      method: 'POST',
      headers: tokenRequestHeaders(),
      body
    }, 'Spotify token refresh failed');
  } catch (error) {
    throw error;
  }

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

  setStorageItem('spotify_access_token', state.accessToken);
  setStorageItem('spotify_refresh_token', state.refreshToken || '');
  setStorageItem('spotify_expires_at', String(state.expiresAt));
}

function loadTokensFromStorage() {
  state.accessToken = getStorageItem('spotify_access_token');
  state.refreshToken = getStorageItem('spotify_refresh_token');
  state.expiresAt = Number(getStorageItem('spotify_expires_at') || 0);
}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = new Uint32Array(length);
  const value = new Array(length);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i += 1) {
    value[i] = chars[randomValues[i] % chars.length];
  }

  return value.join('');
}

async function sha256Base64Url(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  const chars = new Array(bytes.length);

  for (let i = 0; i < bytes.length; i += 1) {
    chars[i] = String.fromCharCode(bytes[i]);
  }

  return btoa(chars.join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

init();

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

const PLAYBACK_MODES = {
  LOCAL: 'local',
  REMOTE: 'remote'
};

const REMOTE_DEVICE_TYPES = {
  SPOTIFY_CONNECT: 'spotify_connect',
  GOOGLE_CAST: 'google_cast',
  AIRPLAY: 'airplay'
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
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 -960 960 960' fill='#e3e3e3'><rect width='960' height='960' fill='#1f1f1f'/><path d='M447-207q-47-47-47-113t47-113q47-47 113-47 23 0 42.5 5.5T640-458v-342h240v120H720v360q0 66-47 113t-113 47q-66 0-113-47ZM80-320q0-99 38-186.5T221-659q65-65 152.5-103T560-800v80q-82 0-155 31.5t-127.5 86q-54.5 54.5-86 127T160-320H80Zm160 0q0-66 25.5-124.5t69-102Q378-590 436-615t124-25v80q-100 0-170 70t-70 170h-80Z'/></svg>"
  );

const TILE_IMAGE_SIZE = 100;
const TILE_IMAGE_DOWNLOAD_SIZE = 100;
const ALBUM_ART_IMAGE_SIZE = 160;
const TRACK_THUMBNAIL_SIZE = 40;
const MAX_RENDERED_TRACKS = 40;
const PREVIOUS_TRACK_STORAGE_KEY = 'previous_track';

const state = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
  player: null,
  deviceId: null,
  playbackMode: PLAYBACK_MODES.LOCAL,
  activeRemoteDeviceId: '',
  activeRemoteDeviceName: '',
  availableDevices: [],
  externalDevices: [],
  devicePickerOpen: false,
  devicePickerRequestId: 0,
  playbackUnsupported: false,
  playerInitDiagnostic: '',
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
  renderedAlbumArtSrc: '',
  renderedStatusMessage: '',
  renderedTrackTitle: '',
  renderedTrackArtist: '',
  previousTrackName: '',
  previousTrackUri: '',
  previousTrackImage: '',
  previousTrackImageWidth: 0,
  previousTrackImageHeight: 0,
  lastKnownTrackUri: '',
  currentTrackForPrevious: null,
  progressDurationMs: 0,
  progressPositionMs: 0,
  progressLastUpdateMs: 0,
  progressTimerId: null,
  startupStep: 'boot'
};

const ui = {
  tileGrid: document.getElementById('tileGrid'),
  albumArt: document.getElementById('albumArt'),
  trackList: document.getElementById('trackList'),
  btnCast: document.getElementById('btnCast'),
  btnPrev: document.getElementById('btnPrev'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  btnNext: document.getElementById('btnNext'),
  playPauseIcon: document.getElementById('playPauseIcon'),
  trackTitle: document.getElementById('trackTitle'),
  trackArtist: document.getElementById('trackArtist'),
  progressBar: document.getElementById('progressBar'),
  progressFill: document.getElementById('progressFill'),
  btnRestart: document.getElementById('btnRestart')
};

let spotifySdkReadyResolve = null;
let spotifyPlayerReadyResolve = null;

function onSpotifyWebPlaybackSDKReady() {
  if (spotifySdkReadyResolve) {
    spotifySdkReadyResolve();
    spotifySdkReadyResolve = null;
  }
}

function resolveSpotifyPlayerReady(deviceId) {
  if (spotifyPlayerReadyResolve) {
    spotifyPlayerReadyResolve(deviceId);
    spotifyPlayerReadyResolve = null;
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

function isPlayerReadyTimeoutError(error) {
  return !!(error && error.message === 'Spotify player ready timeout');
}

function isRecoverablePlayerInitError(error) {
  return isPlayerReadyTimeoutError(error);
}

async function detectPlaybackCompatibilityIssue() {
  if (!window.isSecureContext) {
    return 'The page is not running in a secure context (HTTPS is required).';
  }

  if (typeof window.MediaSource === 'undefined') {
    return 'This browser does not expose MediaSource, which Spotify playback needs.';
  }

  if (
    !navigator.requestMediaKeySystemAccess ||
    typeof navigator.requestMediaKeySystemAccess !== 'function'
  ) {
    return 'This browser does not expose Encrypted Media Extensions (EME).';
  }

  try {
    const keySystemAccess = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
      initDataTypes: ['cenc'],
      audioCapabilities: [
        { contentType: 'audio/mp4; codecs="mp4a.40.2"' }
      ],
      videoCapabilities: [
        { contentType: 'video/mp4; codecs="avc1.42E01E"' }
      ]
    }]);

    if (!keySystemAccess) {
      return 'Widevine DRM support is unavailable.';
    }
  } catch (error) {
    return 'Widevine DRM is unavailable: ' + describeError(error);
  }

  return '';
}

async function buildPlaybackUnsupportedMessage(error) {
  const diagnostics = [];

  if (state.playerInitDiagnostic) {
    diagnostics.push(state.playerInitDiagnostic);
  }

  const compatibilityIssue = await detectPlaybackCompatibilityIssue();
  if (compatibilityIssue) {
    diagnostics.push(compatibilityIssue);
  }

  if (!diagnostics.length && isPlayerReadyTimeoutError(error)) {
    diagnostics.push('Spotify player did not become ready before the timeout.');
  }

  if (!diagnostics.length) {
    diagnostics.push('Spotify playback is not available in this browser.');
  }

  return diagnostics.join(' ');
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

function setStartupStep(step) {
  state.startupStep = step;
}

async function init() {
  installGlobalErrorHandlers();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  }

  bindUiEvents();
  loadPreviousTrackFromStorage();
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

    try {
      setStartupStep('loading favorites');
      await loadFavorites();
      renderTiles();
      updateTrackList();
    } catch (error) {
      failStartup('Could not load favorites', error);
      return;
    }

    transitionConnection(CONNECTION_STATES.CONNECTING, 'Connecting to Spotify...');
    setStartupStep('connecting Spotify player');
    startHealthchecks();
    await refreshAvailableDevices();

    try {
      await initSpotifyPlayer();
    } catch (error) {
      if (!isRecoverablePlayerInitError(error)) {
        throw error;
      }

      state.playbackUnsupported = true;
      clearReconnectTimer();
      state.playerInitDiagnostic = await buildPlaybackUnsupportedMessage(error);
      setStatusMessage(state.playerInitDiagnostic);
      transitionConnection(
        CONNECTION_STATES.DISCONNECTED,
        'Local Spotify playback unavailable'
      );
    }

    autoSelectPlaybackOutput();
  } catch (error) {
    failStartup('Startup failed during ' + state.startupStep + ': ' + describeError(error), error);
  }
}

function bindUiEvents() {
  ui.tileGrid.addEventListener('click', onTileGridClick);

  ui.btnPlayPause.addEventListener('click', onTogglePlayPause);
  ui.btnPrev.addEventListener('click', () => onTrackStep(-1));
  ui.btnNext.addEventListener('click', () => onTrackStep(1));
  ui.btnRestart.addEventListener('click', onRestartTrack);
  ui.btnCast.addEventListener('click', onCastButtonClick);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('online', onBrowserOnline);
  window.addEventListener('offline', onBrowserOffline);
}

function shouldIgnoreGlobalKeydown(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
    return true;
  }

  const active = document.activeElement;
  if (!active) {
    return false;
  }

  if (active.isContentEditable) {
    return true;
  }

  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function getConnectionStatusLabel(stateName, detail) {
  if (detail && detail.toLowerCase().includes('local spotify playback unavailable')) {
    return 'Local off';
  }

  if (stateName === CONNECTION_STATES.CONNECTED) {
    return 'Connected';
  }
  if (stateName === CONNECTION_STATES.DISCONNECTED) {
    return 'Offline';
  }
  if (stateName === CONNECTION_STATES.TOKEN_EXPIRED) {
    return 'Sign in';
  }
  if (stateName === CONNECTION_STATES.ERROR) {
    return 'Error';
  }

  return 'Connecting';
}

function shortenLabel(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return value.slice(0, Math.max(1, maxLength - 1)) + '…';
}

async function onCastButtonClick() {
  if (state.devicePickerOpen) {
    closeDevicePicker();
    return;
  }

  state.devicePickerOpen = true;
  ui.btnCast.classList.add('is-active');
  state.devicePickerRequestId += 1;
  const requestId = state.devicePickerRequestId;
  await refreshAvailableDevices();
  if (state.devicePickerOpen && requestId === state.devicePickerRequestId) {
    renderDevicePickerInTrackList();
  }
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
  if (shouldIgnoreGlobalKeydown(event)) {
    return;
  }

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
  if (state.playbackMode === PLAYBACK_MODES.LOCAL) {
    return state.connection === CONNECTION_STATES.CONNECTED && state.player && state.deviceId;
  }

  return !!state.activeRemoteDeviceId;
}

function getOutputStateMessage() {
  const localAvailable = !state.playbackUnsupported && !!state.deviceId;

  if (state.playbackMode === PLAYBACK_MODES.LOCAL) {
    return localAvailable ? 'Local' : 'Local (Unavailable)';
  }

  if (!state.availableDevices.length) {
    return 'Remote (None found)';
  }
  if (!state.activeRemoteDeviceId) {
    return 'Remote (Not selected)';
  }
  return 'Remote (' + (state.activeRemoteDeviceName || 'Selected') + ')';
}

function getConnectionSummary() {
  const compactStatus = getConnectionStatusLabel(state.connection, state.connectionDetail);
  return compactStatus + ' • ' + getOutputStateMessage();
}

async function refreshAvailableDevices() {
  const data = await spotifyGet('/me/player/devices', { allowResourceErrors: true });
  const devices = data && data.devices ? data.devices : [];
  const spotifyDevices = devices.map((device) => ({
    id: device.id,
    name: device.name,
    type: REMOTE_DEVICE_TYPES.SPOTIFY_CONNECT
  }));
  const externalDevices = enumerateExternalRemoteDevices();
  state.externalDevices = externalDevices;
  state.availableDevices = spotifyDevices.concat(externalDevices);

  if (state.activeRemoteDeviceId) {
    const activeDevice = state.availableDevices.find(
      (device) =>
        device.id === state.activeRemoteDeviceId && device.type === REMOTE_DEVICE_TYPES.SPOTIFY_CONNECT
    );
    if (activeDevice) {
      state.activeRemoteDeviceName = activeDevice.name || 'Remote device';
    }
  }

  if (state.devicePickerOpen) {
    renderDevicePickerInTrackList();
  }
  updateConnectionUi();
}

function renderDevicePickerInTrackList() {
  ui.trackList.innerHTML = '';

  const statusNode = document.createElement('li');
  statusNode.className = 'devicePickerStatus';
  const statusIcon = document.createElement('span');
  statusIcon.className = 'icon devicePickerConnectionIcon ' + (STATUS_ICON_CLASSES[state.connection] || STATUS_ICON_CLASSES[CONNECTION_STATES.DISCONNECTED]);
  statusIcon.classList.toggle('is-active', state.connection === CONNECTION_STATES.CONNECTED);
  statusIcon.setAttribute('aria-hidden', 'true');
  const statusTextNode = document.createElement('span');
  statusTextNode.className = 'devicePickerStatusText';
  statusTextNode.textContent = getConnectionSummary();
  statusNode.appendChild(statusIcon);
  statusNode.appendChild(statusTextNode);
  ui.trackList.appendChild(statusNode);

  const localOption = document.createElement('li');
  const localButton = document.createElement('button');
  localButton.type = 'button';
  localButton.className = 'trackListButton' + (state.playbackMode === PLAYBACK_MODES.LOCAL ? ' is-selected' : '');
  localButton.textContent = 'Local playback' + (state.playbackUnsupported ? ' (Unavailable)' : '');
  localButton.addEventListener('click', () => {
    selectLocalPlaybackMode();
    closeDevicePicker();
  });
  localOption.appendChild(localButton);
  ui.trackList.appendChild(localOption);

  if (!state.availableDevices.length) {
    const emptyNode = document.createElement('li');
    emptyNode.className = 'trackListHint';
    emptyNode.textContent = 'No Spotify Connect devices found';
    ui.trackList.appendChild(emptyNode);
    return;
  }

  state.availableDevices.forEach((device) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'trackListButton' + (state.activeRemoteDeviceId === device.id ? ' is-selected' : '');
    button.textContent = device.name + (device.type === REMOTE_DEVICE_TYPES.SPOTIFY_CONNECT ? '' : ' (Detected)');
    const selectable = device.type === REMOTE_DEVICE_TYPES.SPOTIFY_CONNECT && !!device.id;
    button.disabled = !selectable;
    button.addEventListener('click', async () => {
      if (!selectable) {
        return;
      }
      await selectRemotePlaybackDevice(device, { transferNow: true });
      closeDevicePicker();
    });
    li.appendChild(button);
    ui.trackList.appendChild(li);
  });
}

function enumerateExternalRemoteDevices() {
  const devices = [];

  if (typeof window.chrome !== 'undefined' && window.chrome.cast && window.chrome.cast.isAvailable) {
    devices.push({
      id: '',
      name: 'Google Cast devices',
      type: REMOTE_DEVICE_TYPES.GOOGLE_CAST
    });
  }

  if (window.WebKitPlaybackTargetAvailabilityEvent) {
    devices.push({
      id: '',
      name: 'AirPlay devices',
      type: REMOTE_DEVICE_TYPES.AIRPLAY
    });
  }

  return devices;
}

function setPlayingState(isPlaying) {
  state.isPlaying = !!isPlaying;
  ui.playPauseIcon.className = state.isPlaying ? 'icon icon-pause-circle' : 'icon icon-play-circle';
  ui.btnPlayPause.classList.toggle('is-active', state.isPlaying);
}

async function refreshPlaybackState() {
  if (state.playbackMode === PLAYBACK_MODES.LOCAL) {
    return;
  }

  const playbackState = await spotifyGet('/me/player', { allowResourceErrors: true });
  if (!playbackState) {
    return;
  }

  setPlayingState(!!playbackState.is_playing);
  if (playbackState.item) {
    const artists = playbackState.item.artists ? playbackState.item.artists.map((artist) => artist.name).join(', ') : '';
    setTrackMeta(playbackState.item.name || '', artists);
    setPlaybackProgress(playbackState.progress_ms || 0, playbackState.item.duration_ms || 0, !!playbackState.is_playing);
  }
}

function selectLocalPlaybackMode() {
  state.playbackMode = PLAYBACK_MODES.LOCAL;
  updateConnectionUi();
}

async function selectRemotePlaybackDevice(device, options) {
  const transferNow = !!(options && options.transferNow);
  state.playbackMode = PLAYBACK_MODES.REMOTE;
  state.activeRemoteDeviceId = device.id;
  state.activeRemoteDeviceName = device.name || 'Remote device';

  if (transferNow) {
    await transferPlaybackToRemoteDevice(state.isPlaying);
    await refreshPlaybackState();
  }

  updateConnectionUi();
}

function closeDevicePicker() {
  state.devicePickerOpen = false;
  state.devicePickerRequestId += 1;
  ui.btnCast.classList.remove('is-active');
  state.trackNodes = [];
  state.trackNodeIndices = [];
  ui.trackList.innerHTML = '';
  updateTrackList();
}

function autoSelectPlaybackOutput() {
  if (!state.playbackUnsupported && state.deviceId) {
    selectLocalPlaybackMode();
    return;
  }

  if (state.availableDevices.length) {
    selectRemotePlaybackDevice(state.availableDevices[0]);
    return;
  }

  selectLocalPlaybackMode();
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
    const started = await playTrackUri(tile.track.uri);
    if (started) {
      state.currentList = [tile.track];
      state.currentIndex = 0;
      state.currentSourceType = tile.type;
      updateTrackList();
    }
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
      await playSavedPreviousTrack();
      return;
    }

    if (state.playbackMode === PLAYBACK_MODES.LOCAL) {
      await state.player.nextTrack();
      return;
    }

    await remoteStep(direction);
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
    if (state.playbackMode === PLAYBACK_MODES.LOCAL) {
      await state.player.togglePlay();
      return;
    }

    if (state.isPlaying) {
      await remotePause();
    } else {
      await remoteResume();
    }
    await refreshPlaybackState();
  } catch (error) {
    transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Playback device unavailable');
    scheduleReconnect('Playback toggle failed');
  }
}

async function onRestartTrack() {
  if (!canControlPlayback()) {
    return;
  }

  const wasPlaying = state.isPlaying;
  const deviceId = await getActivePlaybackDeviceId();
  if (!deviceId) {
    return;
  }

  const response = await spotifyWrite('/me/player/seek?position_ms=0&device_id=' + encodeURIComponent(deviceId), {
    method: 'PUT',
    suppressReconnect: true
  });

  if (!response.ok) {
    return;
  }

  setPlaybackProgress(0, state.progressDurationMs, wasPlaying);
  if (!wasPlaying) {
    await remotePause();
    setPlayingState(false);
  }
}

function renderTiles() {
  const visibleIndices = getWindowedIndices(state.favoritesTiles.length, state.selectedTileIndex, state.favoritesTiles.length);
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
  if (img.tabIndex !== (selected ? 0 : -1)) {
    img.tabIndex = selected ? 0 : -1;
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
    nextNode.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function updateTrackList() {
  if (state.devicePickerOpen) {
    renderDevicePickerInTrackList();
    return;
  }

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
      const thumb = document.createElement('img');
      const label = document.createElement('span');
      li.className = 'trackListItem';
      thumb.className = 'trackListThumb';
      thumb.alt = '';
      thumb.decoding = 'async';
      thumb.loading = 'lazy';
      label.className = 'trackListLabel';
      li.appendChild(thumb);
      li.appendChild(label);
      li.trackThumbNode = thumb;
      li.trackLabelNode = label;
      updateTrackListItem(li, track, trackIndex === state.currentIndex);
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
  if (state.devicePickerOpen) {
    return;
  }

  state.trackNodes = [];
  state.trackNodeIndices = [];
  ui.trackList.innerHTML = '';
}

function getTrackListThumbnail(track) {
  if (!track || !track.image) {
    return createFallbackImage(TRACK_THUMBNAIL_SIZE);
  }

  return {
    url: track.image,
    width: track.imageWidth || TRACK_THUMBNAIL_SIZE,
    height: track.imageHeight || TRACK_THUMBNAIL_SIZE
  };
}

function updateTrackListItem(node, track, isNowPlaying) {
  if (!node) {
    return;
  }

  const nextTrack = track || {};
  const nextImage = getTrackListThumbnail(nextTrack);
  const nextText = nextTrack.name || '';

  node.classList.toggle('nowPlaying', !!isNowPlaying);
  if (node.trackThumbNode && node.trackThumbNode.src !== nextImage.url) {
    node.trackThumbNode.src = nextImage.url;
    node.trackThumbNode.width = nextImage.width;
    node.trackThumbNode.height = nextImage.height;
  }
  if (node.trackLabelNode && node.trackLabelNode.textContent !== nextText) {
    node.trackLabelNode.textContent = nextText;
  }
}

function parsePreviousTrackRecord(value) {
  if (!value) {
    return { uri: '', name: '', image: '', imageWidth: 0, imageHeight: 0 };
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    return { uri: '', name: '', image: '', imageWidth: 0, imageHeight: 0 };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { uri: '', name: '', image: '', imageWidth: 0, imageHeight: 0 };
  }

  return {
    uri: typeof parsed.uri === 'string' ? parsed.uri : '',
    name: typeof parsed.name === 'string' ? parsed.name : '',
    image: typeof parsed.image === 'string' ? parsed.image : '',
    imageWidth: Number.isFinite(parsed.imageWidth) ? parsed.imageWidth : 0,
    imageHeight: Number.isFinite(parsed.imageHeight) ? parsed.imageHeight : 0
  };
}

function loadPreviousTrackFromStorage() {
  const savedPreviousTrack = parsePreviousTrackRecord(getStorageItem(PREVIOUS_TRACK_STORAGE_KEY));
  state.previousTrackName = savedPreviousTrack.name;
  state.previousTrackUri = savedPreviousTrack.uri;
  state.previousTrackImage = savedPreviousTrack.image;
  state.previousTrackImageWidth = savedPreviousTrack.imageWidth;
  state.previousTrackImageHeight = savedPreviousTrack.imageHeight;
}

function savePreviousTrack(track) {
  const previousTrack = {
    uri: track && track.uri ? track.uri : '',
    name: track && track.name ? track.name : '',
    image: track && track.image ? track.image : '',
    imageWidth: track && Number.isFinite(track.imageWidth) ? track.imageWidth : 0,
    imageHeight: track && Number.isFinite(track.imageHeight) ? track.imageHeight : 0
  };

  state.previousTrackName = previousTrack.name;
  state.previousTrackUri = previousTrack.uri;
  state.previousTrackImage = previousTrack.image;
  state.previousTrackImageWidth = previousTrack.imageWidth;
  state.previousTrackImageHeight = previousTrack.imageHeight;

  try {
    setStorageItem(PREVIOUS_TRACK_STORAGE_KEY, JSON.stringify(previousTrack));
  } catch (error) {
    console.warn(error);
  }
}

async function playSavedPreviousTrack() {
  if (!state.previousTrackUri) {
    return false;
  }

  return playTrackUri(state.previousTrackUri);
}

function updateTrackListFromPlayerState(sdkState) {
  const currentTrack = sdkState.track_window && sdkState.track_window.current_track;

  if (!currentTrack) {
    clearTrackList();
    setAlbumArtImage(createFallbackImage(ALBUM_ART_IMAGE_SIZE));
    setTrackMeta('', '');
    setPlaybackProgress(0, 0, false);
    return;
  }

  setStatusMessage(state.connectionDetail);
  const currentUri = currentTrack.uri || '';
  if (state.lastKnownTrackUri && currentUri && state.lastKnownTrackUri !== currentUri) {
    const previousTrack = state.currentTrackForPrevious || null;
    if (previousTrack.uri || previousTrack.name) {
      savePreviousTrack(previousTrack);
    }
  }
  state.lastKnownTrackUri = currentUri;
  state.currentTrackForPrevious = normalizePlayerTrack(currentTrack);
  const artistName = currentTrack.artists && currentTrack.artists.length ? currentTrack.artists.map((artist) => artist.name).join(', ') : '';
  setTrackMeta(currentTrack.name || '', artistName);
  setPlaybackProgress(sdkState.position || 0, currentTrack.duration_ms || 0, !sdkState.paused);
  syncQueueState(state.currentTrackForPrevious);
}

function setTrackMeta(title, artist) {
  const nextTitle = title || 'Nothing playing';
  const nextArtist = artist || '—';
  if (state.renderedTrackTitle !== nextTitle) {
    ui.trackTitle.textContent = nextTitle;
    state.renderedTrackTitle = nextTitle;
  }
  if (state.renderedTrackArtist !== nextArtist) {
    ui.trackArtist.textContent = nextArtist;
    state.renderedTrackArtist = nextArtist;
  }
}

function setPlaybackProgress(positionMs, durationMs, isPlaying) {
  state.progressPositionMs = Math.max(0, positionMs || 0);
  state.progressDurationMs = Math.max(0, durationMs || 0);
  state.progressLastUpdateMs = Date.now();
  renderPlaybackProgress();
  scheduleProgressTick(!!isPlaying && state.progressDurationMs > 0);
}

function scheduleProgressTick(shouldRun) {
  if (state.progressTimerId) {
    clearInterval(state.progressTimerId);
    state.progressTimerId = null;
  }
  if (!shouldRun) {
    return;
  }
  state.progressTimerId = window.setInterval(() => {
    const elapsed = Date.now() - state.progressLastUpdateMs;
    const nextPosition = Math.min(state.progressDurationMs, state.progressPositionMs + elapsed);
    renderPlaybackProgress(nextPosition);
  }, 250);
}

function renderPlaybackProgress(positionOverrideMs) {
  const duration = state.progressDurationMs;
  const position = typeof positionOverrideMs === 'number' ? positionOverrideMs : state.progressPositionMs;
  const ratio = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
  ui.progressFill.style.inlineSize = String(ratio * 100) + '%';
  ui.progressBar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
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
    updateTrackListItem(state.trackNodes[i], state.currentList[trackIndex], trackIndex === state.currentIndex);
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
  const compact = getConnectionStatusLabel(state.connection, message);
  const fullStatus = compact + ' • ' + getOutputStateMessage();
  if (state.renderedStatusMessage === fullStatus) {
    return;
  }

  state.renderedStatusMessage = fullStatus;
  if (state.devicePickerOpen) {
    renderDevicePickerInTrackList();
  }
}

function scheduleImageWarmCache(tiles) {
  const tileSource = tiles || state.favoritesTiles;
  if (!tileSource.length) {
    return;
  }

  const allImages = tileSource
    .map((tile) => tile.image)
    .filter((url) => !!url);

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
  const disableControls = !canControlPlayback();
  const fullStatus = getConnectionSummary();
  state.renderedStatusMessage = fullStatus;
  if (state.devicePickerOpen) {
    renderDevicePickerInTrackList();
  }
  ui.btnPrev.disabled = disableControls;
  ui.btnPlayPause.disabled = disableControls;
  ui.btnNext.disabled = disableControls;
}

function scheduleReconnect(reason) {
  if (state.playbackUnsupported || state.reconnectTimerId || state.connection === CONNECTION_STATES.CONNECTED) {
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
  if (state.playbackUnsupported) {
    return;
  }

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
      await waitForSpotifyPlayerReady();
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

    await refreshAvailableDevices();

    if (state.playbackUnsupported || !state.player) {
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

  state.playerInitDiagnostic = '';

  state.player = new Spotify.Player({
    name: 'Kids Player',
    getOAuthToken: (cb) => cb(state.accessToken),
    volume: 0.9
  });

  state.player.addListener('ready', ({ device_id: deviceId }) => {
    state.playbackUnsupported = false;
    state.deviceId = deviceId;
    resolveSpotifyPlayerReady(deviceId);
    transitionConnection(CONNECTION_STATES.CONNECTED, 'Spotify connected');
  });

  state.player.addListener('not_ready', () => {
    state.deviceId = null;
    transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Spotify disconnected');
    scheduleReconnect('Device became unavailable');
  });

  state.player.addListener('initialization_error', ({ message }) => {
    state.playerInitDiagnostic = 'Spotify initialization error: ' + (message || 'unknown error') + '.';
    state.playbackUnsupported = true;
    clearReconnectTimer();
    console.error(state.playerInitDiagnostic);
    setStatusMessage(state.playerInitDiagnostic);
    transitionConnection(CONNECTION_STATES.ERROR, state.playerInitDiagnostic);
  });

  state.player.addListener('authentication_error', ({ message }) => {
    const detail = 'Spotify authentication error' + (message ? ': ' + message : '');
    console.error(detail);
    setStatusMessage(detail);
    transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, detail);
  });

  state.player.addListener('account_error', ({ message }) => {
    const detail = message || 'Spotify Premium account required';
    console.error(detail);
    setStatusMessage(detail);
    transitionConnection(CONNECTION_STATES.ERROR, detail);
  });

  state.player.addListener('autoplay_failed', () => {
    const detail = 'Browser blocked autoplay. Tap play to start Spotify playback.';
    console.warn(detail);
    setStatusMessage(detail);
  });

  state.player.addListener('player_state_changed', (sdkState) => {
    if (!sdkState) {
      return;
    }

    setPlayingState(!sdkState.paused);
    updateTrackListFromPlayerState(sdkState);
  });

  await state.player.connect();
  await waitForSpotifyPlayerReady();
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

function waitForSpotifyPlayerReady() {
  if (state.deviceId) {
    return Promise.resolve(state.deviceId);
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (spotifyPlayerReadyResolve === handleReady) {
        spotifyPlayerReadyResolve = null;
      }
      reject(new Error('Spotify player ready timeout'));
    }, 10000);

    const handleReady = (deviceId) => {
      clearTimeout(timeoutId);
      resolve(deviceId);
    };

    spotifyPlayerReadyResolve = handleReady;
  });
}

async function playTrackAtIndex(index) {
  state.currentIndex = index;
  const track = state.currentList[index];
  if (!track) {
    return;
  }

  await playTrackUri(track.uri);
  updateTrackList();
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
  const deviceId = await getActivePlaybackDeviceId();
  if (!deviceId) {
    return;
  }

  if (state.playbackMode === PLAYBACK_MODES.REMOTE) {
    await transferPlaybackToRemoteDevice();
  }

  const body = JSON.stringify({
    context_uri: contextUri
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(spotifyApiProxyUrl('/me/player/play?device_id=' + encodeURIComponent(deviceId)), {
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

    await refreshPlaybackState();
    if (state.playbackMode === PLAYBACK_MODES.LOCAL) {
      setPlayingState(true);
    }
    return;
  }
}

async function playTrackUri(trackUri) {
  const deviceId = await getActivePlaybackDeviceId();
  if (!deviceId || !trackUri) {
    return false;
  }

  if (state.playbackMode === PLAYBACK_MODES.REMOTE) {
    await transferPlaybackToRemoteDevice();
  }

  const body = JSON.stringify({
    uris: [trackUri],
    position_ms: 0
  });

  const response = await spotifyWrite('/me/player/play?device_id=' + encodeURIComponent(deviceId), {
    method: 'PUT',
    body,
    includeJsonContentType: true
  });

  if (response.ok) {
    await refreshPlaybackState();
    if (state.playbackMode === PLAYBACK_MODES.LOCAL) {
      setPlayingState(true);
    }
    return true;
  }

  return false;
}

async function transferPlaybackToRemoteDevice(shouldPlay) {
  if (!state.activeRemoteDeviceId) {
    return;
  }

  await spotifyWrite('/me/player', {
    method: 'PUT',
    body: JSON.stringify({
      device_ids: [state.activeRemoteDeviceId],
      play: !!shouldPlay
    }),
    includeJsonContentType: true,
    suppressReconnect: true
  });
}

async function getActivePlaybackDeviceId() {
  if (state.playbackMode === PLAYBACK_MODES.LOCAL) {
    return state.deviceId;
  }

  return state.activeRemoteDeviceId;
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

async function remoteStep(direction) {
  const path = direction < 0 ? '/me/player/previous' : '/me/player/next';
  await spotifyWrite(path, {
    method: 'POST',
    suppressReconnect: true
  });
}

async function remotePause() {
  await spotifyWrite('/me/player/pause', {
    method: 'PUT',
    suppressReconnect: true
  });
}

async function remoteResume() {
  const deviceId = await getActivePlaybackDeviceId();
  if (!deviceId) {
    return;
  }

  await transferPlaybackToRemoteDevice();
  await spotifyWrite('/me/player/play?device_id=' + encodeURIComponent(deviceId), {
    method: 'PUT',
    suppressReconnect: true
  });
}

async function spotifyWrite(path, options) {
  const method = options && options.method ? options.method : 'PUT';
  const body = options && options.body ? options.body : null;
  const includeJsonContentType = !!(options && options.includeJsonContentType);
  const suppressReconnect = !!(options && options.suppressReconnect);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(spotifyApiProxyUrl(path), {
      method,
      headers: spotifyHeaders(includeJsonContentType),
      body
    });

    if (response.status === 401) {
      const tokenOk = await ensureValidToken(true);
      if (tokenOk) {
        continue;
      }
      transitionConnection(CONNECTION_STATES.TOKEN_EXPIRED, 'Spotify authorization expired');
      return { ok: false };
    }

    if (isNonFatalSpotifyStatus(response.status)) {
      setStatusMessage('This item is unavailable for the current Spotify account');
      return { ok: false };
    }

    if (!response.ok) {
      if (!suppressReconnect) {
        transitionConnection(CONNECTION_STATES.DISCONNECTED, 'Spotify playback request failed');
        scheduleReconnect('Playback request failed');
      }
      return { ok: false };
    }

    return { ok: true };
  }

  return { ok: false };
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
      state.favoritesTiles = state.favoritesTiles.concat(mapped.items);
      scheduleImageWarmCache(mapped.items);
      renderTiles();
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

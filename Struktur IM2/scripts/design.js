'use strict';

// Reset dropdowns on every page load
document.getElementById('year-select').value       = '';
document.getElementById('race-select').value       = '';
document.getElementById('session-select').innerHTML = '<option value="">Session wählen</option>';
document.getElementById('session-select').disabled  = true;

// ── API ─────
const API_BASE = 'https://api.openf1.org/v1';
const apiCache = new Map();

async function apiFetch(endpoint, params = {}) {
  const cacheKey = endpoint + JSON.stringify(params);
  if (apiCache.has(cacheKey)) return apiCache.get(cacheKey);

  const url = new URL(API_BASE + endpoint);
  Object.entries(params).forEach(([k, v]) => {
    if (v == null) return;
    if (Array.isArray(v)) v.forEach(i => url.searchParams.append(k, i));
    else url.searchParams.append(k, v);
  });

  const res = await fetch(url);
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 600));
    return apiFetch(endpoint, params);
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${endpoint}`);
  const data = await res.json();
  apiCache.set(cacheKey, data);
  return data;
}

// ── State ───
let state = {
  year: null,
  meetings: [],
  sessions: [],
  currentSession: null,
  currentMeeting: null,
};

// ── Helpers ───
function formatLapTime(s) {
  if (!s || s <= 0) return '–';
  const m   = Math.floor(s / 60);
  const sec = (s % 60).toFixed(3);
  return `${m}:${sec.padStart(6, '0')}`;
}

function silhouetteSVG(cls = '') {
  return `<svg viewBox="0 0 40 44" class="${cls}" fill="currentColor" aria-hidden="true">
    <circle cx="20" cy="11" r="9"/>
    <path d="M3 42C3 29 10 22 20 22C30 22 37 29 37 42Z"/>
  </svg>`;
}

function tireColor(compound) {
  const c = (compound || '').toUpperCase();
  if (c === 'SOFT')         return '#E8002D';
  if (c === 'MEDIUM')       return '#FFC906';
  if (c === 'HARD')         return '#AAAAAA';
  if (c === 'INTERMEDIATE') return '#43B02A';
  if (c === 'WET')          return '#0067FF';
  return '#888';
}

function tireClass(compound) {
  const c = (compound || '').toLowerCase();
  return `tire-${c}`;
}

// ── Year / Race / Session selects ───
document.getElementById('year-select').addEventListener('change', async function () {
  const year = this.value;
  if (!year) return;
  state.year = year;

  const raceSelect = document.getElementById('race-select');
  raceSelect.disabled = true;
  raceSelect.innerHTML = '<option value="">Wird geladen…</option>';

  setMainLoading(true);
  hideAll();

  const sessionSel = document.getElementById('session-select');
  sessionSel.innerHTML = '<option value="">Session wählen</option>';
  sessionSel.disabled  = true;

  try {
    [state.meetings, state.sessions] = await Promise.all([
      apiFetch('/meetings', { year }),
      apiFetch('/sessions', { year })
    ]);
    populateRaceSelect();
    raceSelect.disabled = false;
  } catch (e) {
    showEmptyHint('Fehler beim Laden: ' + e.message);
  } finally {
    setMainLoading(false);
  }
});

document.getElementById('race-select').addEventListener('change', function () {
  const meetingKey = this.value;
  const sessionSel = document.getElementById('session-select');

  if (!meetingKey) {
    sessionSel.innerHTML = '<option value="">Session wählen</option>';
    sessionSel.disabled  = true;
    state.currentMeeting = null;
    state.currentSession = null;
    hideAll();
    document.getElementById('empty-hint').classList.remove('hidden');
    return;
  }

  state.currentMeeting = meetingKey;

  const meetingSessions = state.sessions
    .filter(s => s.meeting_key == meetingKey)
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

  sessionSel.innerHTML = '<option value="">Session wählen</option>';
  meetingSessions.forEach(s => {
    const opt = document.createElement('option');
    opt.value   = s.session_key;
    opt.textContent = s.session_name;
    sessionSel.appendChild(opt);
  });
  sessionSel.disabled = false;
});

document.getElementById('session-select').addEventListener('change', async function () {
  if (!this.value) return;
  state.currentSession = this.value;
  await loadRaceData();
});

function populateRaceSelect() {
  const sel = document.getElementById('race-select');
  sel.innerHTML = '<option value="">Rennen wählen</option>';

  const usedKeys = new Set(state.sessions.map(s => s.meeting_key));

  state.meetings
    .filter(m => usedKeys.has(m.meeting_key))
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start))
    .forEach(m => {
      const opt       = document.createElement('option');
      opt.value       = m.meeting_key;
      opt.textContent = m.meeting_name;
      sel.appendChild(opt);
    });
}

// ── Load Race Overview ─────
async function loadRaceData() {
  trackNormalized = [];
  trackDrivers    = [];
  trackLaps       = [];
  trackLapTimes   = [];
  trackTimeMin    = 0;
  trackTimeMax    = 0;
  trackLoadedFor  = null;
  trackPct        = 0;
  _lastLapEl      = null;
  document.getElementById('circuit-mini-placeholder')?.classList.remove('hidden');
  document.getElementById('circuit-mini-svg')?.classList.add('hidden');

  setMainLoading(true);
  hideAll();

  try {
    const meeting = state.meetings.find(m => m.meeting_key == state.currentMeeting);
    document.getElementById('race-name').textContent =
      (meeting?.meeting_official_name || '').toUpperCase();

    await Promise.all([
      loadPodium(state.currentSession),
      loadWeather(state.currentSession),
      loadDriverGrid(state.currentSession),
    ]);

    document.getElementById('content-row').classList.remove('hidden');
    document.getElementById('summary-section').classList.remove('hidden');
    document.getElementById('driver-grid-section').classList.remove('hidden');
    fetchWikiSummary();
  } catch (e) {
    showEmptyHint('Fehler: ' + e.message);
    console.error(e);
  } finally {
    setMainLoading(false);
  }
}

// ── Podium ────
async function loadPodium(sessionKey) {
  const [results, drivers] = await Promise.all([
    apiFetch('/session_result', { session_key: sessionKey }),
    apiFetch('/drivers',        { session_key: sessionKey }),
  ]);

  const dmap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));
  const top3 = results
    .filter(r => r.position >= 1 && r.position <= 3)
    .sort((a, b) => a.position - b.position);

  const order = [
    top3.find(r => r.position === 3),
    top3.find(r => r.position === 1),
    top3.find(r => r.position === 2),
  ].filter(Boolean);

  const stage = document.getElementById('podium-stage');
  stage.innerHTML = '';

  order.forEach(result => {
    const d = dmap[result.driver_number];
    if (!d) return;

    const el       = document.createElement('div');
    el.className   = `podium-driver podium-p${result.position}`;
    el.title       = `${d.full_name} — Position ${result.position}`;
    el.innerHTML   = `
      <div class="podium-info">
        ${d.headshot_url
          ? `<img class="podium-headshot" src="${d.headshot_url}" alt="${d.full_name}" loading="lazy"/>`
          : `<div class="podium-silhouette">${silhouetteSVG()}</div>`
        }
        <span class="podium-code">${d.name_acronym}</span>
      </div>
      <div class="podium-block">
        <span class="podium-pos">${result.position}.</span>
      </div>
    `;
    el.addEventListener('click', () => openDriverPopup(result.driver_number, d));
    stage.appendChild(el);
  });
}

// ── Weather ────
async function loadWeather(sessionKey) {
  const data = await apiFetch('/weather', { session_key: sessionKey });
  if (!data.length) return;
  const w       = data[data.length - 1];
  const hadRain = data.some(d => d.rainfall > 0);
  document.getElementById('w-air').textContent   = w.air_temperature   + '°C';
  document.getElementById('w-track').textContent = w.track_temperature + '°C';
  document.getElementById('w-humid').textContent = w.humidity          + ' %';
  document.getElementById('w-rain').textContent  = hadRain ? 'Ja' : 'Nein';
  const sunEl = document.getElementById('weather-icon');
  if (sunEl) sunEl.textContent = hadRain ? '🌧' : '☀';
}

// ── Driver Grid ──
async function loadDriverGrid(sessionKey) {
  const [results, drivers] = await Promise.all([
    apiFetch('/session_result', { session_key: sessionKey }),
    apiFetch('/drivers',        { session_key: sessionKey }),
  ]);

  const dmap       = Object.fromEntries(drivers.map(d => [d.driver_number, d]));
  const classified = results
    .filter(r => r.position > 3)
    .sort((a, b) => a.position - b.position);
  const dnfs       = results
    .filter(r => !r.position || r.position <= 0)
    .sort((a, b) => a.driver_number - b.driver_number);

  const grid = document.getElementById('driver-grid');
  grid.innerHTML = '';

  [...classified, ...dnfs].forEach(result => {
    const d = dmap[result.driver_number];
    if (!d) return;

    const isDNF     = !result.position || result.position <= 0;
    const card      = document.createElement('div');
    card.className  = 'driver-card';
    card.title      = d.full_name;
    card.innerHTML  = `
      <span class="dc-pos${isDNF ? ' dc-pos-dnf' : ''}">${isDNF ? 'DNF' : result.position + '.'}</span>
      <div class="dc-avatar">
        ${d.headshot_url
          ? `<img src="${d.headshot_url}" alt="${d.full_name}" loading="lazy"/>`
          : silhouetteSVG('dc-silhouette')}
      </div>
      <span class="dc-name">${d.name_acronym}</span>
    `;
    card.addEventListener('click', () => openDriverPopup(result.driver_number, d));
    grid.appendChild(card);
  });
}

// ── Driver Popup ─────────
async function openDriverPopup(driverNumber, driverHint) {
  const popup = document.getElementById('driver-popup');
  const body  = document.getElementById('driver-popup-body');
  popup.classList.remove('hidden');
  body.innerHTML = '<div class="popup-loading"><div class="spinner dark"></div></div>';

  try {
    const [drivers, laps, stints, radioResult, allResults] = await Promise.all([
      apiFetch('/drivers',        { session_key: state.currentSession, driver_number: driverNumber }),
      apiFetch('/laps',           { session_key: state.currentSession, driver_number: driverNumber }),
      apiFetch('/stints',         { session_key: state.currentSession, driver_number: driverNumber }),
      apiFetch('/team_radio',     { session_key: state.currentSession, driver_number: driverNumber }).catch(() => null),
      apiFetch('/session_result', { session_key: state.currentSession }),
    ]);
    const radios = radioResult ?? [];

    const driver = drivers[0] || driverHint || {};
    const result = allResults.find(r => String(r.driver_number) === String(driverNumber));

    // Fastest valid lap
    const validLaps = laps.filter(l => l.lap_duration > 0);
    const fastest   = validLaps.length
      ? validLaps.reduce((b, l) => l.lap_duration < b.lap_duration ? l : b)
      : null;

    // Team accent color
    const accent = driver.team_colour ? '#' + driver.team_colour : '#E10600';
    document.getElementById('popup-dots').innerHTML = `
      <span class="ptdot" style="background:${accent}"></span>
      <span class="ptdot" style="background:${accent};opacity:.5"></span>
      <span class="ptdot" style="background:${accent};opacity:.2"></span>
    `;

    const numStr = String(driver.driver_number || driverNumber).padStart(2, '0');

    const stintHTML = stints.length
      ? stints.map((s, i) => `
          <div class="dpu-tire-item">
            <div class="dpu-tire-circle" style="border-color:${tireColor(s.compound)};color:${tireColor(s.compound)}">
              <span class="dpu-tire-inner"></span>
            </div>
            <div class="dpu-tire-meta">
              <span class="dpu-tire-range">${s.lap_start}–${s.lap_end}</span>
              <span class="dpu-tire-laps">${(s.lap_end - s.lap_start)} Runden</span>
            </div>
          </div>
          ${i < stints.length - 1 ? '<div class="dpu-tire-connector"></div>' : ''}
        `).join('')
      : '<span class="dpu-empty">–</span>';

    const radioFailed = radioResult === null;
    const validRadios = radios.filter(r => r.recording_url);
    const radioHTML = radioFailed
      ? '<span class="dpu-empty dpu-radio-error">Team Radio nicht verfügbar</span>'
      : validRadios.map((r, i) => {
      const radioTime = new Date(r.date).getTime();
      const lap = laps.find(l => {
        const start = new Date(l.date_start).getTime();
        const end   = start + (l.lap_duration || 0) * 1000;
        return radioTime >= start && radioTime <= end;
      });
      const lapLabel = lap ? `Lap ${lap.lap_number}` : '–';
      return `
        <div class="dpu-radio-item">
          <button class="dpu-radio-btn" data-url="${r.recording_url}" data-idx="${i}" onclick="playRadio(this)">&#9654;</button>
          <div class="dpu-radio-track"><div class="dpu-radio-fill" id="rfill-${i}"></div></div>
          <span class="dpu-radio-time">${lapLabel}</span>
        </div>
      `;
    }).join('') || '<span class="dpu-empty">Keine Team Radios verfügbar</span>';

    body.innerHTML = `
      <!-- Driver Row -->
      <div class="dpu-driver">
        <span class="dpu-num">${numStr}</span>
        <span class="dpu-name">${driver.full_name || '–'}</span>
        <div class="dpu-avatar">
          ${driver.headshot_url
            ? `<img src="${driver.headshot_url}" alt="${driver.full_name}" loading="lazy"/>`
            : silhouetteSVG()}
        </div>
      </div>

      <div class="dpu-divider"></div>

      <!-- Fastest Lap -->
      <div class="dpu-lap-row">
        <div class="dpu-lap-left">
          <p class="dpu-lap-sub">Schnellste Runde${fastest ? ': Lap ' + fastest.lap_number : ''}</p>
          <p class="dpu-lap-time">${fastest ? formatLapTime(fastest.lap_duration) : '–'}</p>
        </div>
        <div class="dpu-sectors">
          <div class="dpu-sec">
            <span class="dpu-sec-lbl">S1</span>
            <span class="dpu-sec-val">${fastest?.duration_sector_1?.toFixed(3) || '–'}</span>
          </div>
          <div class="dpu-sec dpu-sec-personal">
            <span class="dpu-sec-lbl">S2</span>
            <span class="dpu-sec-val">${fastest?.duration_sector_2?.toFixed(3) || '–'}</span>
          </div>
          <div class="dpu-sec dpu-sec-best">
            <span class="dpu-sec-lbl">S3</span>
            <span class="dpu-sec-val">${fastest?.duration_sector_3?.toFixed(3) || '–'}</span>
          </div>
        </div>
      </div>

      <div class="dpu-divider"></div>

      <!-- Two-column: Tires + Radios -->
      <div class="dpu-two-col">
        <div class="dpu-col">
          <p class="dpu-col-heading">Reifenstrategie</p>
          <div class="dpu-tire-items">${stintHTML}</div>
        </div>
        <div class="dpu-col">
          <p class="dpu-col-heading">Team Radios</p>
          <div class="dpu-radio-list">${radioHTML}</div>
          ${state.year === '2026' && !validRadios.length ? '<p class="dpu-radio-notice">Team radio is not released by F1 for every session. Coverage has decreased significantly starting in 2026, with most events providing no radio data at all. This is a limitation on F1\'s side and outside our control.</p>' : ''}
        </div>
      </div>

      <div class="dpu-divider"></div>

      <!-- Result -->
      <div class="dpu-result">
        <p class="dpu-col-heading">Position in der World Championship</p>
        <div class="dpu-result-rows">
          <div class="dpu-result-row">
            <span>Finish-Position:</span>
            <span class="dpu-result-val">Platz ${result?.position || '–'}</span>
          </div>
          <div class="dpu-result-row">
            <span>Team:</span>
            <span class="dpu-result-val">${driver.team_name || '–'}</span>
          </div>
        </div>
      </div>
    `;

  } catch (e) {
    body.innerHTML = `<p class="dpu-error">Fehler: ${e.message}</p>`;
    console.error(e);
  }
}

function closeDriverPopup() {
  document.getElementById('driver-popup').classList.add('hidden');
  stopAllAudio();
}

// ── Audio ──────────
let currentAudio = null;
let currentAudioBtn = null;
let audioSimInterval = null;

function playRadio(btn) {
  const url  = btn.dataset.url;
  const idx  = btn.dataset.idx;
  const fill = document.getElementById('rfill-' + idx);
  const isActive = btn.classList.contains('dpu-radio-playing');

  stopAllAudio();
  if (isActive) return;

  if (!url) return;

  btn.classList.add('dpu-radio-playing');
  btn.innerHTML = '&#9646;&#9646;';
  currentAudioBtn = btn;

  currentAudio = new Audio(url);

  currentAudio.addEventListener('timeupdate', () => {
    const pct = (currentAudio.currentTime / (currentAudio.duration || 1)) * 100;
    if (fill) fill.style.width = pct + '%';
  });
  currentAudio.addEventListener('ended', () => {
    if (fill) fill.style.width = '0%';
    btn.innerHTML = '&#9654;';
    btn.classList.remove('dpu-radio-playing');
    currentAudio = null;
    currentAudioBtn = null;
  });
  currentAudio.addEventListener('error', () => {
    btn.innerHTML = '&#9654;';
    btn.classList.remove('dpu-radio-playing');
    currentAudio = null;
    currentAudioBtn = null;
  });

  currentAudio.play().catch(() => {
    btn.innerHTML = '&#9654;';
    btn.classList.remove('dpu-radio-playing');
    currentAudio = null;
    currentAudioBtn = null;
  });
}

function stopAllAudio() {
  if (currentAudio) { try { currentAudio.pause(); } catch(_){} currentAudio = null; }
  clearInterval(audioSimInterval);
  document.querySelectorAll('.dpu-radio-btn').forEach(b => {
    b.innerHTML = '&#9654;';
    b.classList.remove('dpu-radio-playing');
  });
  document.querySelectorAll('.dpu-radio-fill').forEach(f => f.style.width = '0%');
  currentAudioBtn = null;
}

// ── Track Popup ─────────
let trackNormalized = [];
let trackDrivers    = [];
let trackLaps       = [];   // P1's laps for the lap counter
let trackTimeMin    = 0;
let trackTimeMax    = 0;
let trackLoadedFor  = null;
let trackPct = 0, trackPlaying = false, trackAnimId = null;
let trackCanvas     = null;
let trackCtx        = null;
let carImgs         = {};
let trackPathPoints = [];

function teamIcon(teamName) {
  const n = (teamName || '').toLowerCase();
  if (n.includes('red bull'))                                    return 'assets/icons/f1carredbull.png';
  if (n.includes('ferrari'))                                     return 'assets/icons/f1carferrari.png';
  if (n.includes('mercedes'))                                    return 'assets/icons/f1carmercedes.png';
  if (n.includes('mclaren'))                                     return 'assets/icons/f1carmclaren.png';
  if (n.includes('aston martin'))                                return 'assets/icons/f1carastonmartin.png';
  if (n.includes('alpine'))                                      return 'assets/icons/f1caralpine.png';
  if (n.includes('williams'))                                    return 'assets/icons/f1carwilliams.png';
  if (n.includes('haas'))                                        return 'assets/icons/f1carhaas.png';
  if (n.includes('sauber') || n.includes('alfa'))               return 'assets/icons/f1carsauber.png';
  if (n.includes('alphatauri') || n.includes('rb') || n.includes('racing bulls') || n.includes('visa')) return 'assets/icons/f1caralphatauri.png';
  return 'assets/icons/f1carredbull.png';
}

document.getElementById('circuit-expand').addEventListener('click', async () => {
  document.getElementById('track-popup').classList.remove('hidden');
  await ensureTrackData();
});

function closeTrackPopup() {
  document.getElementById('track-popup').classList.add('hidden');
  stopTrack();
}

async function ensureTrackData() {
  if (!state.currentSession) return;
  if (trackLoadedFor === state.currentSession && trackDrivers.length) {
    initCanvas();
    positionAllDrivers(trackPct);
    return;
  }

  trackNormalized = [];
  trackDrivers    = [];
  trackLaps       = [];
  trackTimeMin    = 0;
  trackTimeMax    = 0;

  const overlay = document.getElementById('track-loading-overlay');
  if (overlay) overlay.classList.remove('hidden');

  try {
    const [results, drivers] = await Promise.all([
      apiFetch('/session_result', { session_key: state.currentSession }),
      apiFetch('/drivers',        { session_key: state.currentSession }),
    ]);
    const driverMap = Object.fromEntries(drivers.map(d => [String(d.driver_number), d]));

    const p1 = results.find(r => r.position === 1);
    if (!p1) return;

  
    trackLaps = (await apiFetch('/laps', {
      session_key:   state.currentSession,
      driver_number: p1.driver_number,
    })).filter(l => l.lap_number > 0 && l.date_start)
       .sort((a, b) => a.lap_number - b.lap_number);

    const fetchAllLoc = async (driverNum) => {
      const url = `${API_BASE}/location?session_key=${state.currentSession}&driver_number=${driverNum}`;
      try {
        let res = await fetch(url);
        if (res.status === 429) { await new Promise(r => setTimeout(r, 1000)); res = await fetch(url); }
        if (!res.ok) return [];
        const data = await res.json();
        const N = Math.max(1, Math.floor(data.length / 600));
        return data.filter((_, i) => i % N === 0);
      } catch { return []; }
    };

    const allDriverData = [];
    for (let i = 0; i < results.length; i += 4) {
      const batch = results.slice(i, i + 4);
      const rows  = await Promise.all(
        batch.map(r => fetchAllLoc(r.driver_number).then(locs => ({
          result: r, driver: driverMap[String(r.driver_number)], locs,
        })))
      );
      allDriverData.push(...rows);
      if (i + 4 < results.length) await new Promise(r => setTimeout(r, 300));
    }

    const allX = allDriverData.flatMap(d => d.locs.map(l => l.x)).filter(v => v != null);
    const allY = allDriverData.flatMap(d => d.locs.map(l => l.y)).filter(v => v != null);
    const allT = allDriverData.flatMap(d => d.locs.map(l => new Date(l.date).getTime())).filter(Boolean);
    if (!allX.length) return;

    const bounds = {
      minX: Math.min(...allX), maxX: Math.max(...allX),
      minY: Math.min(...allY), maxY: Math.max(...allY),
    };

    const lap1 = trackLaps.find(l => l.lap_number === 1);
    trackTimeMin = lap1
      ? new Date(lap1.date_start).getTime()
      : Math.min(...allT);
    trackTimeMax = Math.max(...allT);

    const norm = (locs, w, h, pad) => normalizeLocations(locs, w, h, pad, bounds);

    const validLaps = trackLaps.filter(l => l.lap_duration > 0 && l.lap_number > 1);
    const refLap = validLaps.length
      ? validLaps.reduce((b, l) => l.lap_duration < b.lap_duration ? l : b)
      : null;

    let pathLocs = [];
    if (refLap) {
      const lapEnd = new Date(new Date(refLap.date_start).getTime() + refLap.lap_duration * 1000).toISOString();
      const pathUrl = `${API_BASE}/location?session_key=${state.currentSession}&driver_number=${p1.driver_number}&date>${refLap.date_start}&date<${lapEnd}`;
      try {
        const pathRes = await fetch(pathUrl);
        if (pathRes.ok) pathLocs = await pathRes.json();
      } catch {  }
    }

    // Fallback: use P1's sampled race data if single-lap fetch failed
    if (!pathLocs.length) {
      pathLocs = allDriverData.find(d => d.result.position === 1)?.locs || [];
    }

    trackNormalized = norm(pathLocs, 400, 300, 24);
    trackPathPoints = trackNormalized;
    drawTrackPath(document.querySelector('.cmini-path'), norm(pathLocs, 280, 200, 16));
    document.querySelector('.cmini-sf')?.setAttribute('display', 'none');
    document.querySelector('.cmini-dot')?.setAttribute('display', 'none');
    document.getElementById('circuit-mini-placeholder')?.classList.add('hidden');
    document.getElementById('circuit-mini-svg')?.classList.remove('hidden');

    // Per-driver time-stamped points
    trackDrivers = allDriverData
      .filter(d => d.locs.length > 2 && d.driver)
      .map(d => ({
        position:     d.result.position,
        driverNumber: d.result.driver_number,
        acronym:      d.driver.name_acronym,
        teamName:     d.driver.team_name,
        iconPath:     teamIcon(d.driver.team_name),
        points:       norm(d.locs, 400, 300, 24).map((p, i) => ({
          ...p,
          t: new Date(d.locs[i].date).getTime(),
        })),
        currentPt: null, currentAngle: 90,
      }))
      .sort((a, b) => a.position - b.position);

    trackLoadedFor = state.currentSession;
    buildLapTimes();
    initCanvas();
    await preloadCarImages();
    updateTrackUI();
    positionAllDrivers(0);

  } catch (e) {
    console.error('Track data load failed:', e);
  } finally {
    if (overlay) overlay.classList.add('hidden');
  }
}

function normalizeLocations(locations, svgW, svgH, pad = 20, bounds = null) {
  const xs   = locations.map(l => l.x);
  const ys   = locations.map(l => l.y);
  const minX = bounds?.minX ?? Math.min(...xs);
  const maxX = bounds?.maxX ?? Math.max(...xs);
  const minY = bounds?.minY ?? Math.min(...ys);
  const maxY = bounds?.maxY ?? Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale  = Math.min((svgW - 2 * pad) / rangeX, (svgH - 2 * pad) / rangeY);
  const offX   = pad + ((svgW - 2 * pad) - rangeX * scale) / 2;
  const offY   = pad + ((svgH - 2 * pad) - rangeY * scale) / 2;
  return locations.map(l => ({
    x: offX + (l.x - minX) * scale,
    y: svgH - (offY + (l.y - minY) * scale),
  }));
}


function positionAllDrivers(pct) {
  const currentTime = trackTimeMin > 0
    ? trackTimeMin + (pct / 100) * (trackTimeMax - trackTimeMin)
    : -1;

  trackDrivers.forEach(d => {
    if (!d.points.length) return;

    let idx = 0;
    if (currentTime > 0) {
      let lo = 0, hi = d.points.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (d.points[mid].t < currentTime) lo = mid + 1;
        else hi = mid;
      }
      idx = Math.min(lo, d.points.length - 1);
    } else {
      idx = Math.min(Math.floor((pct / 100) * d.points.length), d.points.length - 1);
    }

    const pt = d.points[idx];
    d.currentPt = pt;

    let angle = 90;
    if (idx < d.points.length - 1) {
      const next = d.points[idx + 1];
      angle += Math.atan2(next.y - pt.y, next.x - pt.x) * (180 / Math.PI);
    } else if (idx > 0) {
      const prev = d.points[idx - 1];
      angle += Math.atan2(pt.y - prev.y, pt.x - prev.x) * (180 / Math.PI);
    }
    d.currentAngle = angle;
  });

  renderTrackFrame();
}

function updateTrackUI() {
  const lapEl = document.getElementById('track-lap-display');
  if (lapEl) lapEl.textContent = trackLaps.length ? `LAP – / ${trackLaps.length}` : '–';

  const panel = document.getElementById('track-standings-panel');
  if (!panel) return;
  panel.innerHTML = trackDrivers.map(d => `
    <div class="ts-row">
      <span class="ts-pos">${d.position}</span>
      <img class="ts-icon" src="${d.iconPath}" alt="${d.acronym}"/>
      <span class="ts-name">${d.acronym}</span>
    </div>
  `).join('');
}

function drawTrackPath(pathEl, points) {
  if (!pathEl || !points.length) return;
  const d = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
  ).join(' ') + ' Z';
  pathEl.setAttribute('d', d);
}

function initCanvas() {
  trackCanvas = document.getElementById('track-canvas');
  if (!trackCanvas) return;
  const dpr  = window.devicePixelRatio || 1;
  const rect = trackCanvas.getBoundingClientRect();
  trackCanvas.width  = Math.round(rect.width  * dpr);
  trackCanvas.height = Math.round(rect.height * dpr);
  trackCtx = trackCanvas.getContext('2d');
  trackCtx.scale(dpr, dpr);
}

async function preloadCarImages() {
  const paths = [...new Set(trackDrivers.map(d => d.iconPath))];
  await Promise.all(paths.map(path => new Promise(resolve => {
    if (carImgs[path]) { resolve(); return; }
    const img = new Image();
    img.onload  = () => { carImgs[path] = img; resolve(); };
    img.onerror = resolve;
    img.src     = path;
  })));
}

function renderTrackFrame() {
  if (!trackCtx || !trackCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W   = trackCanvas.width  / dpr;
  const H   = trackCanvas.height / dpr;

  trackCtx.clearRect(0, 0, W, H);
  trackCtx.fillStyle = '#2a2a2a';
  trackCtx.fillRect(0, 0, W, H);

  if (!trackPathPoints.length) return;

  const NW = 400, NH = 300;
  const scale = Math.min(W / NW, H / NH);
  const ox    = (W - NW * scale) / 2;
  const oy    = (H - NH * scale) / 2;
  const cx    = p => ox + p.x * scale;
  const cy    = p => oy + p.y * scale;

  // Track outline
  trackCtx.beginPath();
  trackPathPoints.forEach((p, i) => {
    if (i === 0) trackCtx.moveTo(cx(p), cy(p));
    else         trackCtx.lineTo(cx(p), cy(p));
  });
  trackCtx.closePath();
  trackCtx.strokeStyle = '#555';
  trackCtx.lineWidth   = 8;
  trackCtx.lineCap     = 'round';
  trackCtx.lineJoin    = 'round';
  trackCtx.stroke();

  // Car icons — draw back-to-front so leader is on top
  const IW = 30, IH = 15;
  [...trackDrivers].reverse().forEach(d => {
    if (!d.currentPt) return;
    const img = carImgs[d.iconPath];
    if (!img) return;
    const x     = cx(d.currentPt);
    const y     = cy(d.currentPt);
    const angle = (d.currentAngle || 0) * Math.PI / 180;
    trackCtx.save();
    trackCtx.translate(x, y);
    trackCtx.rotate(angle);
    trackCtx.drawImage(img, -IW / 2, -IH / 2, IW, IH);
    trackCtx.restore();
  });
}

// 10 minutes for full race playback
const TRACK_DURATION_MS = 600_000;
let trackRafId   = null;
let trackLastTs  = null;
// Pre-computed lap timestamps for fast lookup
let trackLapTimes = [];

function trackCtrl(action) {
  const btn = document.getElementById('tc-play');
  if (action === 'play') {
    trackPlaying = !trackPlaying;
    btn.innerHTML = trackPlaying ? '&#9646;&#9646;' : '&#9654;';
    if (trackPlaying) {
      trackLastTs = null;
      trackRafId  = requestAnimationFrame(trackAnimFrame);
    } else {
      stopTrack(false);
    }
  } else if (action === 'start') { trackPct = 0;                          setTrackProgress(0); }
  else if  (action === 'back')   { trackPct = Math.max(0,   trackPct - 3); setTrackProgress(trackPct); }
  else if  (action === 'fwd')    { trackPct = Math.min(100, trackPct + 3); setTrackProgress(trackPct); }
}

function trackAnimFrame(ts) {
  if (!trackPlaying) return;
  if (trackLastTs !== null) {
    trackPct += ((ts - trackLastTs) / TRACK_DURATION_MS) * 100;
    if (trackPct >= 100) {
      trackPct = 100;
      setTrackProgress(trackPct);
      trackPlaying = false;
      document.getElementById('tc-play').innerHTML = '&#9654;';
      return;
    }
    setTrackProgress(trackPct);
  }
  trackLastTs = ts;
  trackRafId  = requestAnimationFrame(trackAnimFrame);
}

function setTrackProgress(pct) {
  const fill  = document.getElementById('tc-fill');
  const thumb = document.getElementById('tc-thumb');
  if (fill)  fill.style.width = pct + '%';
  if (thumb) thumb.style.left = pct + '%';
  positionAllDrivers(pct);
  updateTrackLap(pct);
}

// Pre-compute lap start times once after loading
function buildLapTimes() {
  trackLapTimes = trackLaps.map(l => ({
    n: l.lap_number,
    t: new Date(l.date_start).getTime(),
  }));
}

let _lastLapEl = null;
function updateTrackLap(pct) {
  if (!_lastLapEl) _lastLapEl = document.getElementById('track-lap-display');
  if (!_lastLapEl || !trackLapTimes.length || !trackTimeMin) return;
  const cur = trackTimeMin + (pct / 100) * (trackTimeMax - trackTimeMin);
  // Walk backward through pre-computed list (usually at end = current lap)
  for (let i = trackLapTimes.length - 1; i >= 0; i--) {
    if (trackLapTimes[i].t <= cur) {
      _lastLapEl.textContent = `LAP ${trackLapTimes[i].n} / ${trackLapTimes.length}`;
      return;
    }
  }
}

function stopTrack(resetBtn = true) {
  if (trackRafId) { cancelAnimationFrame(trackRafId); trackRafId = null; }
  trackPlaying = false;
  trackLastTs  = null;
  if (resetBtn) {
    const btn = document.getElementById('tc-play');
    if (btn) btn.innerHTML = '&#9654;';
  }
}

function scrubberClick(e) {
  const rect = document.getElementById('tc-scrubber').querySelector('.tc-track').getBoundingClientRect();
  trackPct   = ((e.clientX - rect.left) / rect.width) * 100;
  setTrackProgress(trackPct);
}

// ── Wikipedia Race Summary ───────────────────────────────
async function fetchWikiSummary() {
  const textEl = document.getElementById('summary-text');
  const linkEl = document.getElementById('summary-wiki-link');

  textEl.textContent = 'Summary wird geladen…';
  textEl.className   = 'summary-text loading';
  linkEl.classList.add('hidden');

  try {
    const meeting = state.meetings.find(m => m.meeting_key == state.currentMeeting);
    if (!meeting) return;

    // Search Wikipedia for the race article
    const query     = `${state.year} ${meeting.meeting_name} Formula One`;
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=1`
    );
    const searchData  = await searchRes.json();
    const firstResult = searchData.query?.search?.[0];

    if (!firstResult) {
      textEl.textContent = 'Kein Wikipedia-Artikel für dieses Rennen gefunden.';
      textEl.className   = 'summary-text';
      return;
    }

    // Fetch the full intro section as plain text (skips boilerplate first paragraph)
    const wikiRes  = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(firstResult.title)}&prop=extracts&exintro=true&explaintext=true&format=json&origin=*`
    );
    const wikiData = await wikiRes.json();
    const page     = Object.values(wikiData.query?.pages || {})[0];
    const extract  = page?.extract;

    if (!extract) {
      textEl.textContent = 'Kein Inhalt verfügbar.';
      textEl.className   = 'summary-text';
      return;
    }

    // Skip the boilerplate first paragraph ("The 20XX X Grand Prix was held on…")
    const paragraphs = extract.split('\n').filter(p => p.trim().length > 50);
    const body       = paragraphs.slice(1, 4).join('\n\n').trim();
    const display    = body || paragraphs[0] || extract;

    textEl.textContent = display.length > 900 ? display.slice(0, 900) + '…' : display;
    textEl.className   = 'summary-text';

    linkEl.href = `https://en.wikipedia.org/wiki/${encodeURIComponent(firstResult.title)}`;
    linkEl.classList.remove('hidden');

  } catch (_) {
    textEl.textContent = 'Wikipedia-Zusammenfassung nicht verfügbar.';
    textEl.className   = 'summary-text';
  }
}

// ── UI Helpers ───────────────────────────────────────────
function setMainLoading(on) {
  document.getElementById('main-loading').classList.toggle('hidden', !on);
  if (on) document.getElementById('empty-hint').classList.add('hidden');
}

function hideAll() {
  document.getElementById('content-row').classList.add('hidden');
  document.getElementById('summary-section').classList.add('hidden');
  document.getElementById('driver-grid-section').classList.add('hidden');
  document.getElementById('empty-hint').classList.add('hidden');
}

function showEmptyHint(msg) {
  const el = document.getElementById('empty-hint');
  el.querySelector('p').textContent = msg;
  el.classList.remove('hidden');
}

// Keyboard escape
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeDriverPopup();
  closeTrackPopup();
});

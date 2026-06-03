// ── Main JavaScript for F1 Telemetry Explorer ─────────────────────────────────

// API Base URL
const API_BASE = 'https://api.openf1.org/v1';

// Global state
let currentSeason = null;
let currentSession = null;
let currentDriver = null;
let currentMeetingKey = null;
let currentSessionType = 'Race';
let seasonSessions = [];
let seasonMeetings = [];
const apiCache = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Utility Functions ──────────────────────────────────────────────────────

/**
 * Fetch data from OpenF1 API
 */
async function fetchAPI(endpoint, params = {}) {
  const cacheKey = `${endpoint}:${JSON.stringify(Object.fromEntries(Object.entries(params).sort()))}`;
  if (apiCache.has(cacheKey)) {
    return apiCache.get(cacheKey);
  }

  const url = new URL(`${API_BASE}${endpoint}`);
  Object.keys(params).forEach(key => {
    const value = params[key];
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach(item => url.searchParams.append(key, item));
    } else {
      url.searchParams.append(key, value);
    }
  });

  async function fetchWithRetry(attempt = 1) {
    const response = await fetch(url);
    if (response.status === 429) {
      if (attempt >= 3) {
        throw new Error('API Error: 429 - Zu viele Anfragen. Bitte später erneut versuchen.');
      }
      await sleep(500 * attempt);
      return fetchWithRetry(attempt + 1);
    }
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    return response.json();
  }

  try {
    const data = await fetchWithRetry();
    apiCache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.error('API fetch error:', error);
    throw error;
  }
}

/**
 * Format time in seconds to MM:SS.mmm
 */
function formatTime(seconds) {
  if (!seconds || seconds === 'N/A') return 'N/A';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
}

/**
 * Format date to readable string
 */
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Show/hide loading state
 */
function setLoading(element, loading) {
  const wrap = element.querySelector('.loading-wrap');
  const targets = element.querySelectorAll('.load-target');

  if (loading) {
    wrap?.classList.remove('hidden');
    targets.forEach(target => target.classList.add('hidden'));
  } else {
    wrap?.classList.add('hidden');
    targets.forEach(target => target.classList.remove('hidden'));
  }
}

/**
 * Show error message
 */
function showError(element, message) {
  const errorEl = element.querySelector('.error-banner');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}

/**
 * Hide error message
 */
function hideError(element) {
  const errorEl = element.querySelector('.error-banner');
  if (errorEl) {
    errorEl.classList.add('hidden');
  }
}

// ── Traffic Lights Animation ──────────────────────────────────────────────

function initTrafficLights() {
  const lights = ['tl-1', 'tl-2', 'tl-3', 'tl-4', 'tl-5'];
  let currentLight = 0;

  function animateLights() {
    // Reset all lights
    lights.forEach(id => {
      document.getElementById(id).className = 'tl-light out';
    });

    if (currentLight < 4) {
      // Red lights
      for (let i = 0; i <= currentLight; i++) {
        document.getElementById(lights[i]).classList.add('red');
      }
      currentLight++;
      setTimeout(animateLights, 500);
    } else {
      // Green light
      document.getElementById(lights[4]).classList.add('green');
    }
  }

  // Start animation after page load
  setTimeout(animateLights, 1000);
}

// ── Season Picker ────────────────────────────────────────────────────────

function initSeasonPicker() {
  const buttons = document.querySelectorAll('.btn-season');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSeason = btn.dataset.year;
      currentSessionType = 'Race';
      currentSession = null;
      currentMeetingKey = null;
      document.getElementById('picker-stage-session')?.classList.add('hidden');
      document.getElementById('picker-stage-race')?.classList.add('hidden');
      document.getElementById('race-overview')?.classList.add('hidden');
      document.getElementById('driver-detail')?.classList.add('hidden');
      loadRaces(currentSeason);
    });
  });
}
function initSessionSwitcher() {
  const buttons = document.querySelectorAll('.session-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => setActiveSessionType(btn.dataset.session));
  });
  setActiveSessionType(currentSessionType);
}

function setActiveSessionType(sessionType) {
  currentSessionType = sessionType;
  document.querySelectorAll('.session-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.session === sessionType);
  });
  const summaryTypeEl = document.getElementById('summary-session-type');
  if (summaryTypeEl) summaryTypeEl.textContent = sessionType;

  document.getElementById('race-overview')?.classList.add('hidden');
  document.getElementById('driver-detail')?.classList.add('hidden');
  currentSession = null;
  currentMeetingKey = null;

  if (seasonSessions.length > 0) {
    const hasOptions = populateRaceSelect();
    if (hasOptions) {
      document.getElementById('picker-stage-race')?.classList.remove('hidden');
    }
  }
}

function initRaceSelect() {
  const raceSelect = document.getElementById('race-select');
  if (!raceSelect) return;
  raceSelect.addEventListener('change', () => {
    const selectedOption = raceSelect.selectedOptions[0];
    if (!selectedOption) return;
    const sessionKey = selectedOption.value;
    const meetingKey = selectedOption.dataset.meetingKey;
    if (sessionKey && meetingKey) {
      selectRace(meetingKey, sessionKey);
    }
  });
}

function populateRaceSelect() {
  const raceSelect = document.getElementById('race-select');
  const empty = document.getElementById('picker-empty');
  if (!raceSelect) return null;

  const options = seasonSessions
    .filter(session => session.session_type?.toLowerCase() === currentSessionType.toLowerCase())
    .map(session => {
      const meeting = seasonMeetings.find(m => m.meeting_key === session.meeting_key);
      return meeting ? { session, meeting } : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.session.date_start) - new Date(b.session.date_start));

  if (options.length === 0) {
    raceSelect.innerHTML = '<option value="" disabled selected>Keine Sessions verfügbar</option>';
    raceSelect.disabled = true;
    empty.classList.remove('hidden');
    return false;
  }

  raceSelect.disabled = false;
  empty.classList.add('hidden');

  raceSelect.innerHTML = '<option value="" disabled selected>Wähle ein Rennen</option>' + options.map(({ meeting, session }) => {
    const label = `${meeting.meeting_official_name} — ${formatDate(session.date_start)}`;
    return ` <option value="${session.session_key}" data-meeting-key="${meeting.meeting_key}">${label}</option>`;
  }).join('');

  currentMeetingKey = null;
  currentSession = null;
  return true;
}

function renderSessionSummary(session, meeting) {
  const summary = document.getElementById('session-summary');
  if (!summary) return;
  summary.classList.remove('hidden');
  document.getElementById('summary-session-type').textContent = session.session_type || currentSessionType;
  document.getElementById('summary-date').textContent = formatDate(session.date_start);
  document.getElementById('summary-location').textContent = meeting.location;
}
/**
 * Load races for selected season
 */
async function loadRaces(year) {
  const picker = document.getElementById('race-picker');
  const loading = document.getElementById('picker-loading');
  const empty = document.getElementById('picker-empty');
  const error = document.getElementById('picker-error');

  try {
    setLoading(picker, true);
    hideError(picker);

    seasonSessions = await fetchAPI('/sessions', { year });
    seasonMeetings = await fetchAPI('/meetings', { year });

    document.getElementById('picker-stage-session')?.classList.remove('hidden');
    document.getElementById('picker-stage-race')?.classList.add('hidden');
    currentSession = null;
    currentMeetingKey = null;
  } catch (err) {
    showError(picker, 'Fehler beim Laden der Rennen: ' + err.message);
  } finally {
    setLoading(picker, false);
  }
}


/**
 * Create race card element
 */
function createRaceCard(meeting, session) {
  const card = document.createElement('div');
  card.className = 'race-card';
  card.innerHTML = `
    <div class="race-round">R${meeting.meeting_name.match(/(\d+)/)?.[1] || ''}</div>
    <div class="race-flag">🏁</div>
    <div class="race-name">${meeting.meeting_name.replace('Grand Prix', 'GP')}</div>
    <div class="race-meta">
      <span>${meeting.location}</span>
      <span class="mono">${formatDate(session.date_start)}</span>
    </div>
  `;

  card.addEventListener('click', () => selectRace(meeting.meeting_key, session.session_key));
  return card;
}

// ── Race Selection ───────────────────────────────────────────────────────

/**
 * Select a race and show overview
 */
async function selectRace(meetingKey, sessionKey) {
  currentMeetingKey = meetingKey;
  currentSession = sessionKey;

  document.querySelectorAll('.session-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.session === currentSessionType);
  });
  const summaryTypeEl = document.getElementById('summary-session-type');
  if (summaryTypeEl) summaryTypeEl.textContent = currentSessionType;

  document.getElementById('race-picker')?.classList.add('hidden');
  document.getElementById('driver-detail')?.classList.add('hidden');
  document.getElementById('race-overview')?.classList.add('hidden');

  await loadRaceOverview(sessionKey);
  document.getElementById('race-overview')?.classList.remove('hidden');
  document.getElementById('race-overview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Back to race picker
 */
function initBackButtons() {
  document.getElementById('back-to-picker').addEventListener('click', () => {
    document.getElementById('race-overview').classList.add('hidden');
    document.getElementById('driver-detail').classList.add('hidden');
    document.getElementById('race-picker').classList.remove('hidden');
    currentSession = null;
    currentDriver = null;
  });

  document.getElementById('back-to-overview').addEventListener('click', () => {
    document.getElementById('driver-detail').classList.add('hidden');
    document.getElementById('race-overview').classList.remove('hidden');
    currentDriver = null;
  });
}

// ── Race Overview ───────────────────────────────────────────────────────

/**
 * Load race overview data
 */
async function loadRaceOverview(sessionKey) {
  const overview = document.getElementById('race-overview');
  const header = document.getElementById('overview-header');
  const body = document.getElementById('overview-body');

  try {
    setLoading(overview, true);
    hideError(overview);

    // Get session info from cache when possible
    let session = seasonSessions.find(s => String(s.session_key) === String(sessionKey));
    if (!session) {
      const sessions = await fetchAPI('/sessions', { session_key: sessionKey });
      session = sessions[0];
    }

    // Get meeting info from cache when possible
    let meeting = seasonMeetings.find(m => m.meeting_key === session.meeting_key);
    if (!meeting) {
      const meetings = await fetchAPI('/meetings', { meeting_key: session.meeting_key });
      meeting = meetings[0];
    }

    renderSessionSummary(session, meeting);

    // Render header
    header.innerHTML = `
      <div class="overview-header-inner" style="border-left-color: #${meeting.circuit_key ? 'E10600' : 'E10600'}">
        <span class="oh-tag">Rennen</span>
        <h2 class="oh-title">${meeting.meeting_official_name}</h2>
        <p class="oh-meta">${meeting.location} • ${formatDate(session.date_start)}</p>
      </div>
    `;

    // Load podium, weather, drivers
    await Promise.all([
      loadPodium(sessionKey),
      loadWeather(sessionKey),
      loadDrivers(sessionKey)
    ]);

  } catch (err) {
    showError(overview, 'Fehler beim Laden der Übersicht: ' + err.message);
  } finally {
    setLoading(overview, false);
  }
}

/**
 * Load podium data
 */
async function loadPodium(sessionKey) {
  const podiumEl = document.getElementById('podium');

  try {
    const [results, drivers] = await Promise.all([
      fetchAPI('/session_result', { session_key: sessionKey, position: [1, 2, 3] }),
      fetchAPI('/drivers', { session_key: sessionKey })
    ]);

    // Create driver map
    const driverMap = {};
    drivers.forEach(driver => {
      driverMap[driver.driver_number] = driver;
    });

    podiumEl.innerHTML = '';

    results.forEach((result, index) => {
      const driver = driverMap[result.driver_number];
      if (driver) {
        const step = document.createElement('div');
        step.className = `podium-step p${index + 1}`;
        step.innerHTML = `
          <div class="podium-info">
            <div class="podium-pos">${result.position}</div>
            <div class="podium-name">${driver.name_acronym}</div>
            <div class="podium-acronym">${driver.name_acronym}</div>
          </div>
          <div class="podium-block"></div>
          <div class="podium-team">${driver.team_name}</div>
        `;

        // Add animation delay
        setTimeout(() => step.classList.add('visible'), index * 200);

        podiumEl.appendChild(step);
      }
    });

  } catch (err) {
    podiumEl.innerHTML = '<p>Fehler beim Laden des Podiums</p>';
  }
}

/**
 * Load weather data
 */
async function loadWeather(sessionKey) {
  const wrap = document.getElementById('weather-wrap');

  try {
    const weather = await fetchAPI('/weather', { session_key: sessionKey });

    if (weather.length === 0) {
      wrap.innerHTML = '<p>Keine Wetterdaten verfügbar</p>';
      return;
    }

    // Get latest weather
    const latest = weather[weather.length - 1];

    wrap.innerHTML = `
      <div class="weather-card">
        <h4 class="weather-title">Wetterbedingungen</h4>
        <div class="weather-row">
          <span class="wkey">Lufttemperatur</span>
          <span class="wval">${latest.air_temperature}°C</span>
        </div>
        <div class="weather-row">
          <span class="wkey">Streckentemperatur</span>
          <span class="wval">${latest.track_temperature}°C</span>
        </div>
        <div class="weather-row">
          <span class="wkey">Luftfeuchtigkeit</span>
          <span class="wval">${latest.humidity}%</span>
        </div>
        <div class="weather-row">
          <span class="wkey">Regen</span>
          <span class="wval">${latest.rainfall ? 'Ja' : 'Nein'}</span>
        </div>
      </div>
    `;

  } catch (err) {
    wrap.innerHTML = '<p>Fehler beim Laden der Wetterdaten</p>';
  }
}

/**
 * Load drivers list
 */
async function loadDrivers(sessionKey) {
  const grid = document.getElementById('driver-grid');

  try {
    const [results, drivers] = await Promise.all([
      fetchAPI('/session_result', { session_key: sessionKey }),
      fetchAPI('/drivers', { session_key: sessionKey })
    ]);

    // Create driver map
    const driverMap = {};
    drivers.forEach(driver => {
      driverMap[driver.driver_number] = driver;
    });

    grid.innerHTML = '';

    results.forEach(result => {
      const driver = driverMap[result.driver_number];
      if (driver) {
        const card = createDriverCard(result, driver);
        grid.appendChild(card);
      }
    });

  } catch (err) {
    grid.innerHTML = '<p>Fehler beim Laden der Fahrer</p>';
  }
}

/**
 * Create driver card
 */
function createDriverCard(result, driver) {
  const card = document.createElement('div');
  card.className = 'driver-card';
  card.innerHTML = `
    <div class="driver-num">${result.position}</div>
    <div class="driver-info">
      <div class="driver-acronym">${driver.name_acronym}</div>
      <div class="driver-fullname">${driver.full_name}</div>
    </div>
    <div class="driver-team">${driver.team_name}</div>
    <img class="driver-headshot" src="${driver.headshot_url}" alt="${driver.full_name}" />
  `;

  card.addEventListener('click', () => selectDriver(result.driver_number));
  return card;
}

// ── Driver Detail ────────────────────────────────────────────────────────

/**
 * Select driver and show details
 */
async function selectDriver(driverNumber) {
  currentDriver = driverNumber;
  document.getElementById('driver-detail').classList.remove('hidden');
  await loadDriverDetail(driverNumber);
  document.getElementById('driver-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Load driver detail data
 */
async function loadDriverDetail(driverNumber) {
  const detail = document.getElementById('driver-detail');
  const header = document.getElementById('driver-header');
  const body = document.getElementById('driver-body');

  try {
    setLoading(detail, true);
    hideError(detail);

    // Get driver info
    const drivers = await fetchAPI('/drivers', {
      session_key: currentSession,
      driver_number: driverNumber
    });
    const driver = drivers[0];

    // Render header
    header.innerHTML = `
      <div class="driver-detail-header">
        <div class="ddh-num">${driver.driver_number}</div>
        <div class="ddh-info">
          <div class="ddh-acronym">${driver.name_acronym}</div>
          <div class="ddh-name">${driver.full_name}</div>
          <div class="ddh-team">${driver.team_name}</div>
        </div>
        <img class="ddh-headshot" src="${driver.headshot_url}" alt="${driver.full_name}" />
      </div>
    `;

    // Load lap data and telemetry
    await Promise.all([
      loadLapData(driverNumber),
      loadTelemetry(driverNumber)
    ]);

  } catch (err) {
    showError(detail, 'Fehler beim Laden der Fahrer-Details: ' + err.message);
  } finally {
    setLoading(detail, false);
  }
}

/**
 * Load lap data for best lap
 */
async function loadLapData(driverNumber) {
  const lapInfo = document.getElementById('lap-info');

  try {
    const laps = await fetchAPI('/laps', {
      session_key: currentSession,
      driver_number: driverNumber
    });

    if (laps.length === 0) {
      lapInfo.innerHTML = '<p>Keine Rundendaten verfügbar</p>';
      return;
    }

    // Find fastest lap
    const fastestLap = laps.reduce((fastest, lap) =>
      lap.lap_duration < fastest.lap_duration ? lap : fastest
    );

    lapInfo.innerHTML = `
      <div class="bestlap-block">
        <div class="bestlap-label">Schnellste Runde</div>
        <div class="bestlap-time">${formatTime(fastestLap.lap_duration)}</div>
        <div class="bestlap-meta">Runde ${fastestLap.lap_number}</div>
      </div>
      <div class="sectors-block">
        <h4>Sektorzeiten</h4>
        <div class="sectors-row">
          <span>Sektor 1</span>
          <span class="mono">${formatTime(fastestLap.duration_sector_1)}</span>
        </div>
        <div class="sectors-row">
          <span>Sektor 2</span>
          <span class="mono">${formatTime(fastestLap.duration_sector_2)}</span>
        </div>
        <div class="sectors-row">
          <span>Sektor 3</span>
          <span class="mono">${formatTime(fastestLap.duration_sector_3)}</span>
        </div>
      </div>
    `;

  } catch (err) {
    lapInfo.innerHTML = '<p>Fehler beim Laden der Rundendaten</p>';
  }
}

/**
 * Load telemetry data for fastest lap
 */
async function loadTelemetry(driverNumber) {
  const chartWrap = document.getElementById('telemetry-chart').parentElement;
  const loading = document.getElementById('telemetry-loading');
  const error = document.getElementById('telemetry-error');

  try {
    loading.classList.remove('hidden');
    hideError(chartWrap);

    // Get fastest lap
    const laps = await fetchAPI('/laps', {
      session_key: currentSession,
      driver_number: driverNumber
    });

    if (laps.length === 0) {
      throw new Error('Keine Rundendaten verfügbar');
    }

    const fastestLap = laps.reduce((fastest, lap) =>
      lap.lap_duration < fastest.lap_duration ? lap : fastest
    );

    // Get telemetry for that lap
    const telemetry = await fetchAPI('/car_data', {
      session_key: currentSession,
      driver_number: driverNumber,
      date_start: fastestLap.date_start
    });

    if (telemetry.length === 0) {
      throw new Error('Keine Telemetrie-Daten verfügbar');
    }

    // Create chart
    const ctx = document.getElementById('telemetry-chart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: telemetry.map(d => new Date(d.date).toLocaleTimeString()),
        datasets: [{
          label: 'Geschwindigkeit (km/h)',
          data: telemetry.map(d => d.speed),
          borderColor: '#E10600',
          backgroundColor: 'rgba(225, 6, 0, 0.1)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text: 'Zeit'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Geschwindigkeit (km/h)'
            }
          }
        }
      }
    });

  } catch (err) {
    showError(chartWrap, 'Fehler beim Laden der Telemetrie: ' + err.message);
  } finally {
    loading.classList.add('hidden');
  }
}

// ── Tab Switching ────────────────────────────────────────────────────────

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;

      // Update tab buttons
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show corresponding pane
      const panes = document.querySelectorAll('.tab-pane');
      panes.forEach(pane => {
        pane.classList.remove('active');
        pane.classList.add('hidden');
      });

      const activePane = document.getElementById(`tab-${tabName}`);
      activePane.classList.add('active');
      activePane.classList.remove('hidden');

      // Load tab content if needed
      if (tabName === 'story') {
        loadRaceStory();
      }
    });
  });
}

// ── Race Story (Race Control) ────────────────────────────────────────────

/**
 * Load race control messages
 */
async function loadRaceStory() {
  const timeline = document.getElementById('race-timeline');
  const loading = document.getElementById('story-loading');
  const error = document.getElementById('story-error');

  try {
    loading.classList.remove('hidden');
    hideError(timeline.parentElement);

    const messages = await fetchAPI('/race_control', {
      session_key: currentSession
    });

    timeline.innerHTML = '';

    messages.forEach(msg => {
      const item = document.createElement('div');
      item.className = 'timeline-item';

      let flagClass = 'clear';
      if (msg.flag === 'YELLOW') flagClass = 'yellow';
      else if (msg.flag === 'RED') flagClass = 'red';
      else if (msg.flag === 'GREEN') flagClass = 'green';
      else if (msg.flag === 'BLUE') flagClass = 'blue';
      else if (msg.flag === 'CHEQUERED') flagClass = 'green';

      item.innerHTML = `
        <div class="timeline-dot ${flagClass}"></div>
        <div class="timeline-time">${new Date(msg.date).toLocaleTimeString('de-DE')}</div>
        <div class="timeline-msg">${msg.message}</div>
        <div class="timeline-flag ${flagClass}">${msg.flag || 'INFO'}</div>
      `;

      timeline.appendChild(item);
    });

    if (messages.length === 0) {
      timeline.innerHTML = '<p>Keine Race-Control-Meldungen verfügbar</p>';
    }

  } catch (err) {
    showError(timeline.parentElement, 'Fehler beim Laden der Race-Story: ' + err.message);
  } finally {
    loading.classList.add('hidden');
  }
}

// ── Initialization ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initSeasonPicker();
  initSessionSwitcher();
  initRaceSelect();
  initBackButtons();

  // Add reveal animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
      }
    });
  });

  document.querySelectorAll('.reveal-section').forEach(section => {
    observer.observe(section);
  });
});
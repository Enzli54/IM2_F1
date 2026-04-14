const OPENF1_BASE = "https://api.openf1.org/v1";
const CURRENTS_API_KEY = "5fWRxNGk4yWg8GpYU4DdFnpeWBwWfsERnlirizN_4PVeFn4W";

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = byId(id);
  if (el) {
    el.textContent = value;
  } else {
    console.warn(`Element mit ID "${id}" nicht gefunden`);
  }
}

function setHtml(id, value) {
  const el = byId(id);
  if (el) {
    el.innerHTML = value;
  } else {
    console.warn(`Element mit ID "${id}" nicht gefunden`);
  }
}

function setStatus(id, text, ok = false) {
  const el = byId(id);
  if (!el) return;

  el.textContent = text;
  el.style.color = ok ? "#ffffff" : "#aeb7c5";
  el.style.borderColor = ok
    ? "rgba(255, 45, 45, 0.3)"
    : "rgba(255, 255, 255, 0.09)";
  el.style.background = ok
    ? "rgba(255, 45, 45, 0.10)"
    : "rgba(255, 255, 255, 0.05)";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatTime(value) {
  if (!value) return "--:--";
  const date = new Date(value);
  return new Intl.DateTimeFormat("de-CH", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function fetchJson(url, options = {}) {
  console.log("Fetch:", url);
  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} bei ${url} ${text}`);
  }

  return response.json();
}

async function fetchOpenF1(endpoint) {
  return fetchJson(`${OPENF1_BASE}/${endpoint}`);
}

function sortByDateDesc(items, key) {
  return [...items].sort((a, b) => {
    return new Date(b?.[key] || 0) - new Date(a?.[key] || 0);
  });
}

function getLatestMeeting(meetings) {
  return sortByDateDesc(meetings, "date_start")[0] || null;
}

function getLatestCompletedRaceSession(sessions) {
  const now = Date.now();

  const raceSessions = sessions.filter((session) => {
    const name = String(session.session_name || "").toLowerCase();
    const type = String(session.session_type || "").toLowerCase();
    return name.includes("race") || type === "race";
  });

  const completedRaceSessions = raceSessions.filter((session) => {
    const endTime = new Date(session.date_end || session.date_start || 0).getTime();
    return endTime <= now;
  });

  if (completedRaceSessions.length > 0) {
    return sortByDateDesc(completedRaceSessions, "date_end")[0] || null;
  }

  if (raceSessions.length > 0) {
    return sortByDateDesc(raceSessions, "date_start")[0] || null;
  }

  return null;
}

function renderDrivers(drivers) {
  if (!Array.isArray(drivers) || drivers.length === 0) {
    setHtml("driversGrid", `<div class="placeholder-card">Keine Fahrerdaten gefunden</div>`);
    return;
  }

  const html = drivers.slice(0, 12).map((driver) => `
    <article class="driver-card">
      <div class="driver-top">
        <div class="driver-number">${escapeHtml(driver.driver_number ?? "--")}</div>
        <div>${escapeHtml(driver.name_acronym ?? "")}</div>
      </div>
      <h4>${escapeHtml(driver.full_name ?? "Unbekannter Fahrer")}</h4>
      <p class="driver-team">${escapeHtml(driver.team_name ?? "Unbekanntes Team")}</p>
      <p class="driver-extra">${escapeHtml(driver.country_code ?? "")}</p>
    </article>
  `).join("");

  setHtml("driversGrid", html);
}

function renderWeather(weatherRows) {
  const weather = Array.isArray(weatherRows) && weatherRows.length > 0
    ? weatherRows[weatherRows.length - 1]
    : null;

  setText("airTemp", weather?.air_temperature != null ? `${weather.air_temperature} °C` : "-- °C");
  setText("trackTemp", weather?.track_temperature != null ? `${weather.track_temperature} °C` : "-- °C");
  setText("windSpeed", weather?.wind_speed != null ? `${weather.wind_speed} km/h` : "-- km/h");
  setText("rainfall", weather?.rainfall != null ? `${weather.rainfall}` : "--");
  setText("humidity", weather?.humidity != null ? `${weather.humidity} %` : "-- %");
  setText("pressure", weather?.pressure != null ? `${weather.pressure} hPa` : "-- hPa");
}

function renderRaceControl(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    setHtml("raceControlFeed", `
      <div class="feed-item">
        <span class="feed-time">--:--</span>
        <div>
          <strong>Keine Meldungen</strong>
          <p>Für diese Session wurden keine Race-Control-Daten gefunden.</p>
        </div>
      </div>
    `);
    return;
  }

  const html = messages.slice(0, 10).map((item) => `
    <div class="feed-item">
      <span class="feed-time">${escapeHtml(formatTime(item.date))}</span>
      <div>
        <strong>${escapeHtml(item.category || item.flag || "Race Control")}</strong>
        <p>${escapeHtml(item.message || "Keine Nachricht verfügbar.")}</p>
      </div>
    </div>
  `).join("");

  setHtml("raceControlFeed", html);
}

function renderDriverStandings(rows, drivers) {
  if (!Array.isArray(rows) || rows.length === 0) {
    setHtml("driverStandings", `
      <div class="table-row">
        <span>--</span>
        <strong>Keine Daten</strong>
        <span>--</span>
      </div>
    `);
    return;
  }

  const driverMap = new Map();
  (drivers || []).forEach((driver) => {
    driverMap.set(driver.driver_number, driver);
  });

  const sortedRows = [...rows].sort((a, b) => {
    return (a.position_current ?? 999) - (b.position_current ?? 999);
  });

  const html = sortedRows.slice(0, 10).map((row) => {
    const driver = driverMap.get(row.driver_number);
    const position = String(row.position_current ?? "--").padStart(2, "0");
    const name = driver?.full_name || `#${row.driver_number}`;
    const points = row.points_current ?? "--";

    return `
      <div class="table-row">
        <span>${escapeHtml(position)}</span>
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(points)}</span>
      </div>
    `;
  }).join("");

  setHtml("driverStandings", html);
}

function renderTeamStandings(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    setHtml("teamStandings", `
      <div class="table-row">
        <span>--</span>
        <strong>Keine Daten</strong>
        <span>--</span>
      </div>
    `);
    return;
  }

  const sortedRows = [...rows].sort((a, b) => {
    return (a.position_current ?? 999) - (b.position_current ?? 999);
  });

  const html = sortedRows.slice(0, 10).map((row) => {
    const position = String(row.position_current ?? "--").padStart(2, "0");
    const name = row.team_name || row.name || "Unbekanntes Team";
    const points = row.points_current ?? "--";

    return `
      <div class="table-row">
        <span>${escapeHtml(position)}</span>
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(points)}</span>
      </div>
    `;
  }).join("");

  setHtml("teamStandings", html);
}

async function loadOpenF1() {
  setStatus("apiStatus", "Lade OpenF1 ...");

  const meetings = await fetchOpenF1("meetings");
  if (!Array.isArray(meetings) || meetings.length === 0) {
    throw new Error("Keine Meetings gefunden");
  }

  const meeting = getLatestMeeting(meetings);
  if (!meeting?.meeting_key) {
    throw new Error("Kein Meeting gefunden");
  }

  const sessions = await fetchOpenF1(`sessions?meeting_key=${meeting.meeting_key}`);
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error("Keine Sessions gefunden");
  }

  const raceSession = getLatestCompletedRaceSession(sessions);
  if (!raceSession?.session_key) {
    throw new Error("Keine beendete Race-Session gefunden");
  }

  const meetingKey = meeting.meeting_key;
  const sessionKey = raceSession.session_key;

  setText("meetingName", meeting.meeting_name || meeting.meeting_official_name || "Meeting");
  setText("sessionName", raceSession.session_name || "Race");
  setText("sessionStatus", "Race session geladen");

  setText("headlineRace", meeting.meeting_name || meeting.meeting_official_name || "Event");
  setText("headlineCircuit", `${meeting.location || "--"}, ${meeting.country_name || "--"}`);
  setText("countryName", meeting.country_name || "--");
  setText("locationName", meeting.location || "--");
  setText("sessionStart", formatDate(raceSession.date_start));
  setText("sessionEnd", formatDate(raceSession.date_end));

  setText("infoMeeting", meeting.meeting_name || meeting.meeting_official_name || "--");
  setText("infoSessionName", raceSession.session_name || "--");
  setText("infoSessionType", raceSession.session_type || "--");
  setText("infoSessionStart", formatDate(raceSession.date_start));
  setText("infoSessionEnd", formatDate(raceSession.date_end));

  const [
    driversResult,
    weatherResult,
    raceControlResult,
    driverStandingsResult,
    teamStandingsResult
  ] = await Promise.allSettled([
    fetchOpenF1(`drivers?session_key=${sessionKey}`),
    fetchOpenF1(`weather?meeting_key=${meetingKey}`),
    fetchOpenF1(`race_control?session_key=${sessionKey}`),
    fetchOpenF1(`championship_drivers?session_key=${sessionKey}`),
    fetchOpenF1(`championship_teams?session_key=${sessionKey}`)
  ]);

  const drivers = driversResult.status === "fulfilled" ? driversResult.value : [];

  renderDrivers(drivers);

  if (weatherResult.status === "fulfilled") {
    renderWeather(weatherResult.value);
  } else {
    renderWeather([]);
  }

  if (raceControlResult.status === "fulfilled") {
    renderRaceControl(raceControlResult.value);
  } else {
    renderRaceControl([]);
  }

  if (driverStandingsResult.status === "fulfilled") {
    renderDriverStandings(driverStandingsResult.value, drivers);
  } else {
    console.error("Driver standings Fehler:", driverStandingsResult.reason);
    renderDriverStandings([], drivers);
  }

  if (teamStandingsResult.status === "fulfilled") {
    renderTeamStandings(teamStandingsResult.value);
  } else {
    console.error("Team standings Fehler:", teamStandingsResult.reason);
    renderTeamStandings([]);
  }

  setStatus("apiStatus", "OpenF1 geladen", true);
}

document.addEventListener("DOMContentLoaded", () => {
  loadOpenF1().catch((error) => {
    console.error(error);
    setStatus("apiStatus", "OpenF1 Fehler");
  });
});
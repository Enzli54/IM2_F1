const OPENF1_BASE = "https://api.openf1.org/v1";

const state = {
  meetings: [],
  currentMeetingIndex: -1
};

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

function isPastDate(value) {
  if (!value) return false;
  return new Date(value).getTime() <= Date.now();
}

function sortByDateAsc(items, key) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a?.[key] || 0).getTime();
    const bTime = new Date(b?.[key] || 0).getTime();
    return aTime - bTime;
  });
}

function sortByDateDesc(items, key) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a?.[key] || 0).getTime();
    const bTime = new Date(b?.[key] || 0).getTime();
    return bTime - aTime;
  });
}

async function fetchJson(url) {
  console.log("Fetch:", url);

  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} bei ${url}${text ? ` | ${text}` : ""}`);
  }

  return response.json();
}

async function fetchOpenF1(endpoint) {
  return fetchJson(`${OPENF1_BASE}/${endpoint}`);
}

function getLatestPastMeetingIndex(meetings) {
  let latestPastIndex = 0;

  meetings.forEach((meeting, index) => {
    if (isPastDate(meeting.date_start)) {
      latestPastIndex = index;
    }
  });

  return latestPastIndex;
}

function isRaceSession(session) {
  const name = String(session?.session_name || "").toLowerCase();
  const type = String(session?.session_type || "").toLowerCase();

  return (
    type === "race" ||
    name === "race" ||
    name.includes("grand prix") ||
    (name.includes("race") && !name.includes("sprint"))
  );
}

function getPreferredSession(sessions, isFutureMeeting) {
  const raceSessions = sessions.filter(isRaceSession);

  if (raceSessions.length === 0) {
    return sortByDateAsc(sessions, "date_start")[0] || null;
  }

  if (isFutureMeeting) {
    return sortByDateAsc(raceSessions, "date_start")[0] || null;
  }

  const completedRaceSessions = raceSessions.filter((session) =>
    isPastDate(session.date_end || session.date_start)
  );

  if (completedRaceSessions.length > 0) {
    return sortByDateDesc(completedRaceSessions, "date_end")[0] || null;
  }

  return sortByDateAsc(raceSessions, "date_start")[0] || null;
}

function updateRaceNav() {
  const meeting = state.meetings[state.currentMeetingIndex];
  const name =
    meeting?.meeting_name || meeting?.meeting_official_name || "Unbekanntes Rennen";

  setText("selectedRaceName", name);

  const prevBtn = byId("prevRaceBtn");
  const nextBtn = byId("nextRaceBtn");

  if (prevBtn) prevBtn.disabled = state.currentMeetingIndex <= 0;
  if (nextBtn) nextBtn.disabled = state.currentMeetingIndex >= state.meetings.length - 1;
}

function updateMeetingAndSession(meeting, session) {
  const meetingName =
    meeting?.meeting_name || meeting?.meeting_official_name || "Unbekanntes Meeting";
  const location = meeting?.location || "Unbekannter Ort";
  const country = meeting?.country_name || "Unbekanntes Land";
  const sessionName = session?.session_name || "Unbekannte Session";
  const sessionType = session?.session_type || "--";

  setText("meetingName", meetingName);
  setText("sessionName", sessionName);
  setText("sessionStatus", sessionType);

  setText("headlineRace", meetingName);
  setText("headlineCircuit", `${location}, ${country}`);
  setText("countryName", country);
  setText("locationName", location);
  setText("sessionStart", formatDate(session?.date_start));
  setText("sessionEnd", formatDate(session?.date_end));

  setText("infoMeeting", meetingName);
  setText("infoSessionName", sessionName);
  setText("infoSessionType", sessionType);
  setText("infoSessionStart", formatDate(session?.date_start));
  setText("infoSessionEnd", formatDate(session?.date_end));
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

function renderDriverStandings(rows, drivers, isFutureMeeting) {
  if (isFutureMeeting) {
    setHtml("driverStandings", `
      <div class="table-row">
        <span>--</span>
        <strong>Noch keine Wertung</strong>
        <span>zukünftig</span>
      </div>
    `);
    return;
  }

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
    driverMap.set(String(driver.driver_number), driver);
  });

  const sortedRows = [...rows].sort((a, b) => {
    return (a.position_current ?? 999) - (b.position_current ?? 999);
  });

  const html = sortedRows.slice(0, 10).map((row) => {
    const driver = driverMap.get(String(row.driver_number));
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

function renderTeamStandings(rows, isFutureMeeting) {
  if (isFutureMeeting) {
    setHtml("teamStandings", `
      <div class="table-row">
        <span>--</span>
        <strong>Noch keine Wertung</strong>
        <span>zukünftig</span>
      </div>
    `);
    return;
  }

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
    const name = row.team_name || "Unbekanntes Team";
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

function renderEmptyState() {
  renderDrivers([]);
  renderWeather([]);
  renderRaceControl([]);
  renderDriverStandings([], [], false);
  renderTeamStandings([], false);
}

async function loadMeetingByIndex(index) {
  if (index < 0 || index >= state.meetings.length) return;

  state.currentMeetingIndex = index;
  updateRaceNav();

  const meeting = state.meetings[index];
  const isFutureMeeting = !isPastDate(meeting?.date_start);

  setStatus("apiStatus", "Lade Rennen ...");
  renderEmptyState();

  const sessions = await fetchOpenF1(`sessions?meeting_key=${meeting.meeting_key}`);
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error("Keine Sessions für dieses Rennen gefunden");
  }

  const selectedSession = getPreferredSession(sessions, isFutureMeeting);
  if (!selectedSession?.session_key) {
    throw new Error("Keine passende Session gefunden");
  }

  updateMeetingAndSession(meeting, selectedSession);

  const [driversResult, weatherResult, raceControlResult] = await Promise.allSettled([
    fetchOpenF1(`drivers?session_key=${selectedSession.session_key}`),
    fetchOpenF1(`weather?meeting_key=${meeting.meeting_key}`),
    fetchOpenF1(`race_control?session_key=${selectedSession.session_key}`)
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

  if (!isFutureMeeting && isRaceSession(selectedSession)) {
    const [driverStandingsResult, teamStandingsResult] = await Promise.allSettled([
      fetchOpenF1(`championship_drivers?session_key=${selectedSession.session_key}`),
      fetchOpenF1(`championship_teams?session_key=${selectedSession.session_key}`)
    ]);

    if (driverStandingsResult.status === "fulfilled") {
      renderDriverStandings(driverStandingsResult.value, drivers, false);
    } else {
      renderDriverStandings([], drivers, false);
    }

    if (teamStandingsResult.status === "fulfilled") {
      renderTeamStandings(teamStandingsResult.value, false);
    } else {
      renderTeamStandings([], false);
    }
  } else {
    renderDriverStandings([], drivers, true);
    renderTeamStandings([], true);
  }

  setStatus("apiStatus", "Rennen geladen", true);
}

async function loadMeetings() {
  setStatus("apiStatus", "Lade Kalender ...");

  const currentYear = new Date().getFullYear();
  const meetings = await fetchOpenF1(`meetings?year=${currentYear}`);

  if (!Array.isArray(meetings) || meetings.length === 0) {
    throw new Error("Keine Meetings gefunden");
  }

  state.meetings = sortByDateAsc(meetings, "date_start");
  state.currentMeetingIndex = getLatestPastMeetingIndex(state.meetings);

  updateRaceNav();
  await loadMeetingByIndex(state.currentMeetingIndex);
}

function bindRaceNavigation() {
  const prevBtn = byId("prevRaceBtn");
  const nextBtn = byId("nextRaceBtn");

  if (prevBtn) {
    prevBtn.addEventListener("click", async () => {
      try {
        await loadMeetingByIndex(state.currentMeetingIndex - 1);
      } catch (error) {
        console.error(error);
        setStatus("apiStatus", "Fehler beim Laden");
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      try {
        await loadMeetingByIndex(state.currentMeetingIndex + 1);
      } catch (error) {
        console.error(error);
        setStatus("apiStatus", "Fehler beim Laden");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("script.js wurde geladen");

  bindRaceNavigation();

  try {
    await loadMeetings();
  } catch (error) {
    console.error(error);
    setStatus("apiStatus", "OpenF1 Fehler");
  }
});
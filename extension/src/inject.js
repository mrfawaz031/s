/*
 * inject.js — runs in the page's MAIN world at document_start (wer9store).
 *
 * Replaces the Geolocation API with values for a location the user picked.
 * Runs before any page script so early references still see the override.
 * Config arrives from content.js (isolated world) via window.postMessage,
 * because the MAIN world cannot read chrome.storage directly.
 *
 * Advanced behaviour:
 *   - realistic drift around the fixed point (never byte-identical reads)
 *   - optional motion simulation: the point advances along a heading at a
 *     chosen speed, reporting real heading/speed to route-tracking apps.
 */
(function () {
  "use strict";
  if (window.__wer9Installed) return;
  window.__wer9Installed = true;

  const geo = navigator.geolocation;
  const origGet = geo ? geo.getCurrentPosition.bind(geo) : null;
  const origWatch = geo ? geo.watchPosition.bind(geo) : null;
  const origClear = geo ? geo.clearWatch.bind(geo) : null;

  let config = {
    enabled: false,
    lat: 0,
    lng: 0,
    accuracy: 20,
    motion: { enabled: false, speed: 0, heading: 0 }, // speed in m/s, heading in deg
  };
  let motionStart = Date.now();

  const watchers = new Map();
  let watchSeq = 900000;

  const EARTH_M_PER_DEG = 111320;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function spoofingOn() {
    return config && config.enabled === true &&
      Number.isFinite(config.lat) && Number.isFinite(config.lng);
  }

  // Compute the (possibly moving) base point, then add small realistic drift.
  function makePosition() {
    const acc = Math.max(3, Number(config.accuracy) || 20);
    let baseLat = config.lat;
    let baseLng = config.lng;
    let heading = null;
    let speed = null;

    const m = config.motion || {};
    const latRad = (baseLat * Math.PI) / 180;
    let cosLat = Math.max(0.05, Math.cos(latRad));

    if (m.enabled && Number(m.speed) > 0) {
      const elapsed = (Date.now() - motionStart) / 1000; // seconds
      const dist = Number(m.speed) * elapsed; // metres travelled
      const hdg = ((Number(m.heading) || 0) % 360 + 360) % 360;
      const rad = (hdg * Math.PI) / 180;
      baseLat += (dist * Math.cos(rad)) / EARTH_M_PER_DEG;
      baseLng += (dist * Math.sin(rad)) / (EARTH_M_PER_DEG * cosLat);
      heading = hdg;
      speed = Number(m.speed);
      cosLat = Math.max(0.05, Math.cos((baseLat * Math.PI) / 180));
    }

    // Drift within ~30% of the accuracy radius.
    const driftM = rand(0, acc * 0.3);
    const bearing = rand(0, Math.PI * 2);
    const dNorth = (driftM * Math.cos(bearing)) / EARTH_M_PER_DEG;
    const dEast = (driftM * Math.sin(bearing)) / (EARTH_M_PER_DEG * cosLat);

    const coords = {
      latitude: baseLat + dNorth,
      longitude: baseLng + dEast,
      accuracy: Math.round((acc + rand(-acc * 0.15, acc * 0.15)) * 10) / 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: heading,
      speed: speed,
    };
    return { coords, timestamp: Date.now() };
  }

  function installOverride() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition = function (success, error, options) {
      if (!spoofingOn()) {
        if (origGet) return origGet(success, error, options);
        if (typeof error === "function") error({ code: 2, message: "Position unavailable" });
        return;
      }
      setTimeout(function () {
        try { if (typeof success === "function") success(makePosition()); } catch (e) {}
      }, rand(40, 180));
    };

    navigator.geolocation.watchPosition = function (success, error, options) {
      if (!spoofingOn()) {
        if (origWatch) return origWatch(success, error, options);
        return -1;
      }
      const id = ++watchSeq;
      const emit = function () {
        try { if (typeof success === "function") success(makePosition()); } catch (e) {}
      };
      setTimeout(emit, rand(60, 220));
      const timer = setInterval(emit, rand(900, 1600));
      watchers.set(id, timer);
      return id;
    };

    navigator.geolocation.clearWatch = function (id) {
      if (watchers.has(id)) {
        clearInterval(watchers.get(id));
        watchers.delete(id);
        return;
      }
      if (origClear) origClear(id);
    };
  }

  installOverride();

  // Report geolocation permission as granted while active, so apps that gate
  // on permission state proceed to actually call the API.
  if (navigator.permissions && navigator.permissions.query) {
    const origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function (desc) {
      if (spoofingOn() && desc && desc.name === "geolocation") {
        return Promise.resolve({
          state: "granted",
          status: "granted",
          onchange: null,
          addEventListener: function () {},
          removeEventListener: function () {},
          dispatchEvent: function () { return false; },
        });
      }
      return origQuery(desc);
    };
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__wer9 !== "config") return;
    const p = d.payload || {};
    config = {
      enabled: p.enabled === true,
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracy: Number(p.accuracy) || 20,
      motion: {
        enabled: !!(p.motion && p.motion.enabled),
        speed: Number(p.motion && p.motion.speed) || 0,
        heading: Number(p.motion && p.motion.heading) || 0,
      },
    };
    // Restart the motion clock whenever the base config changes.
    motionStart = Date.now();
  });

  window.postMessage({ __wer9: "request" }, "*");
})();

/*
 * inject.js — runs in the page's MAIN world at document_start.
 *
 * Replaces the Geolocation API methods with versions that return a location
 * chosen by the user. Runs before any page script, so pages that grab a
 * reference to getCurrentPosition early still see the override.
 *
 * The chosen coordinates arrive from content.js (the extension's isolated
 * world) via window.postMessage, because the MAIN world cannot read
 * chrome.storage directly.
 */
(function () {
  "use strict";
  if (window.__geoSetInstalled) return;
  window.__geoSetInstalled = true;

  const geo = navigator.geolocation;
  const origGet = geo ? geo.getCurrentPosition.bind(geo) : null;
  const origWatch = geo ? geo.watchPosition.bind(geo) : null;
  const origClear = geo ? geo.clearWatch.bind(geo) : null;

  // Default config; overwritten by messages from the isolated content script.
  let config = { enabled: false, lat: 0, lng: 0, accuracy: 20 };

  const watchers = new Map();
  let watchSeq = 900000;

  const EARTH_M_PER_DEG = 111320; // metres per degree of latitude (approx)

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  // Build a Position-like object with small, realistic drift so repeated
  // reads are not byte-identical (real GPS/Wi-Fi fixes always wander a little).
  function makePosition() {
    const acc = Math.max(3, Number(config.accuracy) || 20);
    const latRad = (config.lat * Math.PI) / 180;
    const cosLat = Math.max(0.05, Math.cos(latRad));
    // Drift within ~30% of the accuracy radius.
    const driftM = rand(0, acc * 0.3);
    const bearing = rand(0, Math.PI * 2);
    const dNorth = (driftM * Math.cos(bearing)) / EARTH_M_PER_DEG;
    const dEast = (driftM * Math.sin(bearing)) / (EARTH_M_PER_DEG * cosLat);

    const coords = {
      latitude: config.lat + dNorth,
      longitude: config.lng + dEast,
      accuracy: Math.round((acc + rand(-acc * 0.15, acc * 0.15)) * 10) / 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    };
    // Some readers use instanceof / getters; a plain object satisfies the
    // GeolocationPosition shape used by essentially all consumers.
    return { coords, timestamp: Date.now() };
  }

  function spoofingOn() {
    return config && config.enabled === true &&
      Number.isFinite(config.lat) && Number.isFinite(config.lng);
  }

  function installOverride() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition = function (success, error, options) {
      if (!spoofingOn()) {
        if (origGet) return origGet(success, error, options);
        if (typeof error === "function") error({ code: 2, message: "Position unavailable" });
        return;
      }
      // Mimic real async acquisition latency.
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

  // Some apps check permission state before calling the API and give up if it
  // reads "denied". When the override is on, report geolocation as granted so
  // those apps proceed to call getCurrentPosition (which we then answer).
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

  // Receive config updates from the isolated world.
  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__geoSet !== "config") return;
    const p = d.payload || {};
    config = {
      enabled: p.enabled === true,
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracy: Number(p.accuracy) || 20,
    };
  });

  // Ask the isolated world to send the current config.
  window.postMessage({ __geoSet: "request" }, "*");
})();

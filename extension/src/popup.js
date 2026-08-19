/* popup.js — the control panel: map picker, search, and settings persistence. */
(function () {
  "use strict";

  const KEY = "geoSetConfig";
  const VIEW = "geoSetView";
  const DEFAULT = { enabled: false, lat: 25.2048, lng: 55.2708, accuracy: 20 };

  const $ = (id) => document.getElementById(id);
  const els = {
    enabled: $("enabled"),
    q: $("q"),
    go: $("go"),
    results: $("results"),
    lat: $("lat"),
    lng: $("lng"),
    accuracy: $("accuracy"),
    accVal: $("accVal"),
    status: $("status"),
    reset: $("reset"),
    myLoc: $("myLoc"),
  };

  let cfg = Object.assign({}, DEFAULT);
  let map, marker;
  let saveTimer = null;

  // Explicit marker icon using the vendored images (avoids Leaflet's default
  // "missing marker" problem in bundled/extension contexts).
  const icon = L.icon({
    iconUrl: "../vendor/leaflet/images/marker-icon.png",
    iconRetinaUrl: "../vendor/leaflet/images/marker-icon-2x.png",
    shadowUrl: "../vendor/leaflet/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function persist() {
    const toStore = {
      enabled: !!cfg.enabled,
      lat: Number(cfg.lat),
      lng: Number(cfg.lng),
      accuracy: Number(cfg.accuracy),
    };
    chrome.storage.local.set({ [KEY]: toStore });
    if (map) chrome.storage.local.set({ [VIEW]: { lat: cfg.lat, lng: cfg.lng, zoom: map.getZoom() } });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 200);
  }

  function renderStatus() {
    if (cfg.enabled) {
      els.status.textContent = "Override is ON";
      els.status.className = "status on";
    } else {
      els.status.textContent = "Override is OFF";
      els.status.className = "status off";
    }
  }

  function syncInputs() {
    els.lat.value = Number(cfg.lat).toFixed(6);
    els.lng.value = Number(cfg.lng).toFixed(6);
    els.accuracy.value = cfg.accuracy;
    els.accVal.textContent = cfg.accuracy;
    els.enabled.checked = !!cfg.enabled;
    renderStatus();
  }

  function setPoint(lat, lng, opts) {
    cfg.lat = clamp(Number(lat), -90, 90);
    cfg.lng = clamp(Number(lng), -180, 180);
    if (marker) marker.setLatLng([cfg.lat, cfg.lng]);
    if (map && opts && opts.pan) map.panTo([cfg.lat, cfg.lng]);
    syncInputs();
    scheduleSave();
  }

  function initMap(view) {
    map = L.map("map", { zoomControl: true, attributionControl: false }).setView(
      [view.lat, view.lng],
      view.zoom || 12
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    marker = L.marker([cfg.lat, cfg.lng], { draggable: true, icon }).addTo(map);
    marker.on("dragend", function () {
      const p = marker.getLatLng();
      setPoint(p.lat, p.lng, { pan: false });
    });
    map.on("click", function (e) {
      setPoint(e.latlng.lat, e.latlng.lng, { pan: false });
    });
  }

  // ---- Geocoding search (OpenStreetMap Nominatim) ----
  function showResults(items) {
    els.results.innerHTML = "";
    if (!items.length) {
      els.results.hidden = true;
      return;
    }
    items.slice(0, 6).forEach(function (it) {
      const li = document.createElement("li");
      const name = it.display_name || "";
      const main = name.split(",")[0];
      li.innerHTML = "<span>" + main + "</span><small>" + name + "</small>";
      li.addEventListener("click", function () {
        els.results.hidden = true;
        els.q.value = main;
        setPoint(parseFloat(it.lat), parseFloat(it.lon), { pan: true });
        if (map) map.setView([cfg.lat, cfg.lng], 14);
      });
      els.results.appendChild(li);
    });
    els.results.hidden = false;
  }

  async function search() {
    const q = els.q.value.trim();
    if (!q) return;
    els.go.textContent = "…";
    try {
      const url =
        "https://nominatim.openstreetmap.org/search?format=json&limit=6&q=" +
        encodeURIComponent(q);
      const res = await fetch(url, { headers: { "Accept-Language": navigator.language || "en" } });
      const data = await res.json();
      showResults(Array.isArray(data) ? data : []);
    } catch (e) {
      showResults([]);
    } finally {
      els.go.textContent = "Search";
    }
  }

  // ---- Wire up events ----
  function bind() {
    els.enabled.addEventListener("change", function () {
      cfg.enabled = els.enabled.checked;
      renderStatus();
      persist();
    });

    els.go.addEventListener("click", search);
    els.q.addEventListener("keydown", function (e) {
      if (e.key === "Enter") search();
    });

    els.lat.addEventListener("change", function () {
      setPoint(els.lat.value, cfg.lng, { pan: true });
    });
    els.lng.addEventListener("change", function () {
      setPoint(cfg.lat, els.lng.value, { pan: true });
    });

    els.accuracy.addEventListener("input", function () {
      cfg.accuracy = Number(els.accuracy.value);
      els.accVal.textContent = cfg.accuracy;
      scheduleSave();
    });

    document.querySelectorAll(".presets button[data-lat]").forEach(function (b) {
      b.addEventListener("click", function () {
        setPoint(b.dataset.lat, b.dataset.lng, { pan: true });
        if (map) map.setView([cfg.lat, cfg.lng], 12);
      });
    });

    els.myLoc.addEventListener("click", function () {
      // Read the REAL location once (temporarily bypassing the override is not
      // possible here; this simply asks the browser and uses whatever it gives).
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          setPoint(pos.coords.latitude, pos.coords.longitude, { pan: true });
          if (map) map.setView([cfg.lat, cfg.lng], 14);
        },
        function () {
          els.myLoc.textContent = "Unavailable";
          setTimeout(function () { els.myLoc.textContent = "My location"; }, 1500);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    els.reset.addEventListener("click", function () {
      // Nudge the stored value so content scripts re-broadcast and drift resets.
      persist();
      els.reset.textContent = "Done";
      setTimeout(function () { els.reset.textContent = "Reset drift"; }, 1000);
    });

    // Hide results when clicking elsewhere.
    document.addEventListener("click", function (e) {
      if (!els.results.contains(e.target) && e.target !== els.q && e.target !== els.go) {
        els.results.hidden = true;
      }
    });
  }

  // ---- Boot ----
  chrome.storage.local.get([KEY, VIEW], function (res) {
    cfg = Object.assign({}, DEFAULT, res[KEY] || {});
    const view = res[VIEW] || { lat: cfg.lat, lng: cfg.lng, zoom: 12 };
    syncInputs();
    bind();
    initMap(view);
    // Ensure the map sizes correctly inside the popup.
    setTimeout(function () { if (map) map.invalidateSize(); }, 60);
  });
})();

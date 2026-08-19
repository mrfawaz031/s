/* popup.js — wer9store control panel. */
(function () {
  "use strict";

  const KEY = "wer9Config";
  const VIEW = "wer9View";
  const SAVED = "wer9Saved";
  const DEFAULT = {
    enabled: false,
    lat: 25.2048,
    lng: 55.2708,
    accuracy: 20,
    motion: { enabled: false, speed: 0, heading: 0 }, // speed in m/s
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    enabled: $("enabled"),
    lockBadge: $("lockBadge"), lockText: $("lockText"),
    q: $("q"), go: $("go"), results: $("results"),
    lat: $("lat"), lng: $("lng"), copy: $("copy"),
    accuracy: $("accuracy"), accVal: $("accVal"),
    motionOn: $("motionOn"), motionState: $("motionState"),
    speed: $("speed"), speedVal: $("speedVal"),
    heading: $("heading"), headVal: $("headVal"),
    saveName: $("saveName"), saveBtn: $("saveBtn"),
    savedList: $("savedList"), savedCount: $("savedCount"),
    myLoc: $("myLoc"),
    export: $("export"), import: $("import"), importFile: $("importFile"),
    reset: $("reset"),
  };

  let cfg = JSON.parse(JSON.stringify(DEFAULT));
  let saved = [];
  let map, marker;
  let saveTimer = null;

  const icon = L.icon({
    iconUrl: "../vendor/leaflet/images/marker-icon.png",
    iconRetinaUrl: "../vendor/leaflet/images/marker-icon-2x.png",
    shadowUrl: "../vendor/leaflet/images/marker-shadow.png",
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
  });

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const kmh = (ms) => Math.round(ms * 3.6);
  const ms = (kmh) => kmh / 3.6;

  function persistConfig() {
    chrome.storage.local.set({
      [KEY]: {
        enabled: !!cfg.enabled,
        lat: Number(cfg.lat), lng: Number(cfg.lng),
        accuracy: Number(cfg.accuracy),
        motion: {
          enabled: !!cfg.motion.enabled,
          speed: Number(cfg.motion.speed) || 0,
          heading: Number(cfg.motion.heading) || 0,
        },
      },
    });
    if (map) chrome.storage.local.set({ [VIEW]: { lat: cfg.lat, lng: cfg.lng, zoom: map.getZoom() } });
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(persistConfig, 200); }
  function persistSaved() { chrome.storage.local.set({ [SAVED]: saved }); }

  function renderLock() {
    if (cfg.enabled) {
      els.lockBadge.className = "lock on";
      els.lockText.textContent = "LOCKED — active until you turn it OFF";
    } else {
      els.lockBadge.className = "lock off";
      els.lockText.textContent = "Override OFF — real location in use";
    }
  }

  function renderMotionTag() {
    const on = cfg.motion.enabled && Number(cfg.motion.speed) > 0;
    els.motionState.textContent = on ? kmh(cfg.motion.speed) + " km/h" : "off";
    els.motionState.className = on ? "tag active" : "tag";
  }

  function syncInputs() {
    els.lat.value = Number(cfg.lat).toFixed(6);
    els.lng.value = Number(cfg.lng).toFixed(6);
    els.accuracy.value = cfg.accuracy; els.accVal.textContent = cfg.accuracy;
    els.enabled.checked = !!cfg.enabled;
    els.motionOn.checked = !!cfg.motion.enabled;
    els.speed.value = kmh(cfg.motion.speed); els.speedVal.textContent = kmh(cfg.motion.speed);
    els.heading.value = cfg.motion.heading; els.headVal.textContent = cfg.motion.heading;
    renderLock(); renderMotionTag();
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
    map = L.map("map", { zoomControl: true, attributionControl: false }).setView([view.lat, view.lng], view.zoom || 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    marker = L.marker([cfg.lat, cfg.lng], { draggable: true, icon }).addTo(map);
    marker.on("dragend", () => { const p = marker.getLatLng(); setPoint(p.lat, p.lng, { pan: false }); });
    map.on("click", (e) => setPoint(e.latlng.lat, e.latlng.lng, { pan: false }));
  }

  // ---- Search (Nominatim) ----
  function showResults(items) {
    els.results.innerHTML = "";
    if (!items.length) { els.results.hidden = true; return; }
    items.slice(0, 6).forEach((it) => {
      const li = document.createElement("li");
      const name = it.display_name || "";
      const main = name.split(",")[0];
      li.innerHTML = "<span>" + main + "</span><small>" + name + "</small>";
      li.addEventListener("click", () => {
        els.results.hidden = true; els.q.value = main;
        setPoint(parseFloat(it.lat), parseFloat(it.lon), { pan: true });
        if (map) map.setView([cfg.lat, cfg.lng], 14);
      });
      els.results.appendChild(li);
    });
    els.results.hidden = false;
  }
  async function search() {
    const q = els.q.value.trim(); if (!q) return;
    els.go.textContent = "…";
    try {
      const url = "https://nominatim.openstreetmap.org/search?format=json&limit=6&q=" + encodeURIComponent(q);
      const res = await fetch(url, { headers: { "Accept-Language": navigator.language || "en" } });
      showResults(await res.json());
    } catch (e) { showResults([]); }
    finally { els.go.textContent = "Search"; }
  }

  // ---- Saved places ----
  function renderSaved() {
    els.savedCount.textContent = saved.length;
    els.savedList.innerHTML = "";
    if (!saved.length) {
      const li = document.createElement("li");
      li.className = "empty"; li.textContent = "No saved places yet.";
      els.savedList.appendChild(li); return;
    }
    saved.forEach((s) => {
      const li = document.createElement("li");
      const nm = document.createElement("span");
      nm.className = "nm"; nm.textContent = s.name;
      nm.title = "Apply this place";
      nm.addEventListener("click", () => {
        setPoint(s.lat, s.lng, { pan: true });
        if (map) map.setView([s.lat, s.lng], 14);
      });
      const co = document.createElement("span");
      co.className = "co"; co.textContent = Number(s.lat).toFixed(3) + ", " + Number(s.lng).toFixed(3);
      const del = document.createElement("button");
      del.className = "del"; del.textContent = "✕"; del.title = "Delete";
      del.addEventListener("click", () => {
        saved = saved.filter((x) => x.id !== s.id); persistSaved(); renderSaved();
      });
      li.append(nm, co, del);
      els.savedList.appendChild(li);
    });
  }

  // ---- Import / Export ----
  function doExport() {
    const blob = new Blob([JSON.stringify({ config: cfg, saved }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "wer9store-settings.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  function doImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.config) cfg = Object.assign(JSON.parse(JSON.stringify(DEFAULT)), data.config,
          { motion: Object.assign({}, DEFAULT.motion, data.config.motion || {}) });
        if (Array.isArray(data.saved)) saved = data.saved;
        syncInputs(); renderSaved();
        if (map && marker) { marker.setLatLng([cfg.lat, cfg.lng]); map.setView([cfg.lat, cfg.lng], 13); }
        persistConfig(); persistSaved();
      } catch (e) { alert("Invalid settings file."); }
    };
    reader.readAsText(file);
  }

  // ---- Bind ----
  function bind() {
    els.enabled.addEventListener("change", () => { cfg.enabled = els.enabled.checked; renderLock(); persistConfig(); });

    els.go.addEventListener("click", search);
    els.q.addEventListener("keydown", (e) => { if (e.key === "Enter") search(); });

    els.lat.addEventListener("change", () => setPoint(els.lat.value, cfg.lng, { pan: true }));
    els.lng.addEventListener("change", () => setPoint(cfg.lat, els.lng.value, { pan: true }));
    els.copy.addEventListener("click", () => {
      navigator.clipboard.writeText(Number(cfg.lat).toFixed(6) + ", " + Number(cfg.lng).toFixed(6)).catch(() => {});
      els.copy.textContent = "✓"; setTimeout(() => (els.copy.textContent = "⧉"), 900);
    });

    els.accuracy.addEventListener("input", () => {
      cfg.accuracy = Number(els.accuracy.value); els.accVal.textContent = cfg.accuracy; scheduleSave();
    });

    els.motionOn.addEventListener("change", () => { cfg.motion.enabled = els.motionOn.checked; renderMotionTag(); persistConfig(); });
    els.speed.addEventListener("input", () => {
      cfg.motion.speed = ms(Number(els.speed.value)); els.speedVal.textContent = els.speed.value; renderMotionTag(); scheduleSave();
    });
    els.heading.addEventListener("input", () => {
      cfg.motion.heading = Number(els.heading.value); els.headVal.textContent = els.heading.value; scheduleSave();
    });

    els.saveBtn.addEventListener("click", () => {
      const name = (els.saveName.value.trim()) || ("Spot " + (saved.length + 1));
      saved.unshift({ id: Date.now().toString(36), name, lat: Number(cfg.lat), lng: Number(cfg.lng) });
      els.saveName.value = ""; persistSaved(); renderSaved();
    });
    els.saveName.addEventListener("keydown", (e) => { if (e.key === "Enter") els.saveBtn.click(); });

    document.querySelectorAll(".presets button[data-lat]").forEach((b) => {
      b.addEventListener("click", () => {
        setPoint(b.dataset.lat, b.dataset.lng, { pan: true });
        if (map) map.setView([cfg.lat, cfg.lng], 12);
      });
    });

    els.myLoc.addEventListener("click", () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => { setPoint(pos.coords.latitude, pos.coords.longitude, { pan: true }); if (map) map.setView([cfg.lat, cfg.lng], 14); },
        () => { els.myLoc.textContent = "Unavailable"; setTimeout(() => (els.myLoc.textContent = "My location"), 1500); },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    els.export.addEventListener("click", doExport);
    els.import.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", (e) => { if (e.target.files[0]) doImport(e.target.files[0]); e.target.value = ""; });

    els.reset.addEventListener("click", () => {
      persistConfig(); els.reset.textContent = "Done"; setTimeout(() => (els.reset.textContent = "Reset drift"), 1000);
    });

    document.addEventListener("click", (e) => {
      if (!els.results.contains(e.target) && e.target !== els.q && e.target !== els.go) els.results.hidden = true;
    });
  }

  // ---- Boot ----
  chrome.storage.local.get([KEY, VIEW, SAVED], (res) => {
    const stored = res[KEY] || {};
    cfg = Object.assign(JSON.parse(JSON.stringify(DEFAULT)), stored,
      { motion: Object.assign({}, DEFAULT.motion, stored.motion || {}) });
    saved = Array.isArray(res[SAVED]) ? res[SAVED] : [];
    const view = res[VIEW] || { lat: cfg.lat, lng: cfg.lng, zoom: 12 };
    syncInputs(); renderSaved(); bind(); initMap(view);
    setTimeout(() => { if (map) map.invalidateSize(); }, 60);
  });
})();

/*
 * content.js — runs in the extension's ISOLATED world at document_start.
 *
 * Bridges chrome.storage (only reachable here) to inject.js (which lives in
 * the page's MAIN world and does the actual Geolocation override). Talks to
 * inject.js over window.postMessage.
 */
(function () {
  "use strict";
  const KEY = "geoSetConfig";
  const DEFAULT = { enabled: false, lat: 0, lng: 0, accuracy: 20 };

  function send(cfg) {
    window.postMessage({ __geoSet: "config", payload: cfg || DEFAULT }, "*");
  }

  function load() {
    try {
      chrome.storage.local.get(KEY, function (res) {
        send((res && res[KEY]) || DEFAULT);
      });
    } catch (e) {
      send(DEFAULT);
    }
  }

  // MAIN world asks for config as soon as inject.js loads.
  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__geoSet !== "request") return;
    load();
  });

  // Push live updates when the popup changes settings.
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes[KEY]) {
        send(changes[KEY].newValue || DEFAULT);
      }
    });
  } catch (e) {}

  // Also send once proactively in case inject.js's request raced ahead.
  load();
})();

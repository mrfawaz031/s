/*
 * content.js — runs in the extension's ISOLATED world at document_start.
 * Bridges chrome.storage (only reachable here) to inject.js (MAIN world).
 */
(function () {
  "use strict";
  const KEY = "wer9Config";
  const DEFAULT = {
    enabled: false,
    lat: 0,
    lng: 0,
    accuracy: 20,
    motion: { enabled: false, speed: 0, heading: 0 },
  };

  function send(cfg) {
    window.postMessage({ __wer9: "config", payload: cfg || DEFAULT }, "*");
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

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__wer9 !== "request") return;
    load();
  });

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes[KEY]) {
        send(changes[KEY].newValue || DEFAULT);
      }
    });
  } catch (e) {}

  load();
})();

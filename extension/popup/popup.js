/* ── Popup Controller ── */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  /* ── Elements ── */
  const btnSelectArea = $("#btn-select-area");
  const btnScrapePage = $("#btn-scrape-page");
  const btnStartAuto = $("#btn-start-auto");
  const btnStop = $("#btn-stop");
  const btnExport = $("#btn-export");
  const btnUploadHF = $("#btn-upload-hf");
  const btnOptions = $("#btn-options");
  const linkOptions = $("#link-options");
  const statusBadge = $("#status-badge");

  const chkAutoStart = $("#chk-auto-start");
  const chkAutoScroll = $("#chk-auto-scroll");
  const chkAutoNext = $("#chk-auto-next");
  const selSaveMode = $("#sel-save-mode");
  const selFormat = $("#sel-format");

  /* ── Load saved config ── */
  browser.storage.local.get([
    "autoStart", "autoScroll", "autoNext", "saveMode", "dataFormat", "sessionStats", "scrapeActive"
  ]).then((cfg) => {
    chkAutoStart.checked = !!cfg.autoStart;
    chkAutoScroll.checked = cfg.autoScroll !== false;
    chkAutoNext.checked = cfg.autoNext !== false;
    selSaveMode.value = cfg.saveMode || "local";
    selFormat.value = cfg.dataFormat || "jsonl";
    updateStats(cfg.sessionStats || {});
    updateStatus(cfg.scrapeActive ? "active" : "idle");
    btnStop.classList.toggle("hidden", !cfg.scrapeActive);
  });

  /* ── Persist quick settings on change ── */
  function saveQuickSettings() {
    browser.storage.local.set({
      autoStart: chkAutoStart.checked,
      autoScroll: chkAutoScroll.checked,
      autoNext: chkAutoNext.checked,
      saveMode: selSaveMode.value,
      dataFormat: selFormat.value,
    });
  }
  [chkAutoStart, chkAutoScroll, chkAutoNext, selSaveMode, selFormat].forEach((el) =>
    el.addEventListener("change", saveQuickSettings)
  );

  /* ── Helpers ── */
  function updateStatus(state) {
    statusBadge.textContent = state.charAt(0).toUpperCase() + state.slice(1);
    statusBadge.className = "badge badge-" + state;
  }

  function updateStats(s) {
    $("#stat-pages").textContent = s.pages || 0;
    $("#stat-texts").textContent = s.texts || 0;
    $("#stat-images").textContent = s.images || 0;
    $("#stat-links").textContent = s.links || 0;
    $("#stat-audio").textContent = s.audio || 0;
  }

  function sendToTab(action, extra) {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, { action, ...extra });
      }
    });
  }

  function sendToBackground(action, extra) {
    browser.runtime.sendMessage({ action, ...extra });
  }

  /* ── Button handlers ── */
  btnSelectArea.addEventListener("click", () => {
    sendToTab("START_SELECTION");
    updateStatus("active");
    window.close();
  });

  btnScrapePage.addEventListener("click", () => {
    sendToTab("SCRAPE_FULL_PAGE");
    updateStatus("scraping");
    btnStop.classList.remove("hidden");
  });

  btnStartAuto.addEventListener("click", () => {
    sendToTab("START_AUTO_SCAN");
    updateStatus("scraping");
    btnStop.classList.remove("hidden");
    window.close();
  });

  btnStop.addEventListener("click", () => {
    sendToTab("STOP_SCRAPE");
    sendToBackground("STOP_ALL");
    updateStatus("idle");
    btnStop.classList.add("hidden");
  });

  btnExport.addEventListener("click", () => {
    sendToBackground("EXPORT_DATA", { format: selFormat.value });
  });

  btnUploadHF.addEventListener("click", () => {
    sendToBackground("UPLOAD_HF");
  });

  btnOptions.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });

  linkOptions.addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });

  /* ── Listen for stats updates from background ── */
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "STATS_UPDATE") {
      updateStats(msg.stats);
    }
    if (msg.action === "STATUS_CHANGE") {
      updateStatus(msg.status);
      btnStop.classList.toggle("hidden", msg.status === "idle");
    }
  });
})();

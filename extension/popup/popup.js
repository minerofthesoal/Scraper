/* ── Popup Controller v0.8 ── */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  /* ── Tab names in order (for swipe navigation) ── */
  const TAB_ORDER = ["scrape", "queue", "data", "extract", "graph", "export", "sessions"];

  function switchTab(tabName) {
    $$(".tab-btn").forEach(b => b.classList.remove("active"));
    $$(".tab-content").forEach(t => t.classList.remove("active"));
    const btn = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
    if (btn) btn.classList.add("active");
    const tab = $("#tab-" + tabName);
    if (tab) tab.classList.add("active");
    if (tabName === "data") loadDataPreview();
    if (tabName === "sessions") loadSessions();
    if (tabName === "queue") loadQueue();
    if (tabName === "graph") loadGraphPreview();
  }

  /* ── Tab Navigation (click) ── */
  for (const btn of $$(".tab-btn")) {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  }

  /* ── Swipe Navigation (Android / touch) ── */
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  const popupContainer = $(".popup-container");
  if (popupContainer) {
    popupContainer.addEventListener("touchstart", (e) => {
      if (e.target.closest("textarea, input, .queue-input, .data-preview, .ai-results, .session-list, .queue-list")) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    popupContainer.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      const dt = Date.now() - touchStartTime;
      if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) || dt > 500) return;

      const activeBtn = $(".tab-btn.active");
      if (!activeBtn) return;
      const currentIdx = TAB_ORDER.indexOf(activeBtn.dataset.tab);
      if (currentIdx === -1) return;

      if (dx < -50 && currentIdx < TAB_ORDER.length - 1) {
        switchTab(TAB_ORDER[currentIdx + 1]);
      } else if (dx > 50 && currentIdx > 0) {
        switchTab(TAB_ORDER[currentIdx - 1]);
      }
    }, { passive: true });
  }

  /* ── Theme Toggle ── */
  const btnTheme = $("#btn-theme");
  browser.storage.local.get(["theme"]).then(cfg => {
    if (cfg.theme === "light") {
      document.body.setAttribute("data-theme", "light");
      if (btnTheme) btnTheme.textContent = "\u2600";
    }
  });
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const isLight = document.body.getAttribute("data-theme") === "light";
      if (isLight) {
        document.body.removeAttribute("data-theme");
        btnTheme.textContent = "\u263E";
        browser.storage.local.set({ theme: "dark" });
      } else {
        document.body.setAttribute("data-theme", "light");
        btnTheme.textContent = "\u2600";
        browser.storage.local.set({ theme: "light" });
      }
    });
  }

  /* ── Spinner HTML (smooth animated SVG) ── */
  const SPINNER_SVG = '<span class="scrape-spinner"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle></svg></span>';
  const LOADING_HTML = '<div class="loading-spinner"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle></svg></div>';

  /* ── Elements ── */
  const statusBadge = $("#status-badge");
  const btnStop = $("#btn-stop");
  const chkAutoScroll = $("#chk-auto-scroll");
  const chkAutoNext = $("#chk-auto-next");
  const chkCookieDismiss = $("#chk-cookie-dismiss");
  const chkDeobfuscate = $("#chk-deobfuscate");
  const chkDownloadImages = $("#chk-download-images");
  const chkScrapeVideo = $("#chk-scrape-video");
  const chkAllowYoutube = $("#chk-allow-youtube");
  const chkScrapeJs = $("#chk-scrape-js");
  const selFormat = $("#sel-format");

  /* ── Session Timer ── */
  let sessionStartTime = null;
  let timerInterval = null;

  function startSessionTimer() {
    if (timerInterval) return;
    sessionStartTime = Date.now();
    browser.storage.local.set({ sessionStartTime });
    timerInterval = setInterval(updateTimerDisplay, 1000);
  }

  function updateTimerDisplay() {
    const el = $("#session-timer");
    if (!el || !sessionStartTime) return;
    const elapsed = Date.now() - sessionStartTime;
    const hrs = Math.floor(elapsed / 3600000);
    const mins = Math.floor((elapsed % 3600000) / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    el.textContent = hrs > 0
      ? `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
      : `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  browser.storage.local.get(["sessionStartTime"]).then(cfg => {
    if (cfg.sessionStartTime) {
      sessionStartTime = cfg.sessionStartTime;
      timerInterval = setInterval(updateTimerDisplay, 1000);
      updateTimerDisplay();
    }
  });

  /* ── Load saved config ── */
  browser.storage.local.get([
    "autoScroll", "autoNext", "dataFormat", "sessionStats", "scrapeActive",
    "cookieDismissEnabled", "deobfuscateEnabled", "downloadImages",
    "scrapeVideo", "allowYouTube", "scrapeJS"
  ]).then((cfg) => {
    if (chkAutoScroll) chkAutoScroll.checked = cfg.autoScroll !== false;
    if (chkAutoNext) chkAutoNext.checked = cfg.autoNext !== false;
    if (chkCookieDismiss) chkCookieDismiss.checked = !!cfg.cookieDismissEnabled;
    if (chkDeobfuscate) chkDeobfuscate.checked = !!cfg.deobfuscateEnabled;
    if (chkDownloadImages) chkDownloadImages.checked = !!cfg.downloadImages;
    if (chkScrapeVideo) chkScrapeVideo.checked = cfg.scrapeVideo !== false;
    if (chkAllowYoutube) chkAllowYoutube.checked = !!cfg.allowYouTube;
    if (chkScrapeJs) chkScrapeJs.checked = !!cfg.scrapeJS;
    if (selFormat) selFormat.value = cfg.dataFormat || "jsonl";
    updateStats(cfg.sessionStats || {});
    updateStatus(cfg.scrapeActive ? "scraping" : "idle");
    if (btnStop) btnStop.classList.toggle("hidden", !cfg.scrapeActive);
  });

  /* ── Persist quick settings ── */
  function saveQuickSettings() {
    browser.storage.local.set({
      autoScroll: chkAutoScroll ? chkAutoScroll.checked : true,
      autoNext: chkAutoNext ? chkAutoNext.checked : true,
      cookieDismissEnabled: chkCookieDismiss ? chkCookieDismiss.checked : false,
      deobfuscateEnabled: chkDeobfuscate ? chkDeobfuscate.checked : false,
      downloadImages: chkDownloadImages ? chkDownloadImages.checked : false,
      scrapeVideo: chkScrapeVideo ? chkScrapeVideo.checked : true,
      allowYouTube: chkAllowYoutube ? chkAllowYoutube.checked : false,
      scrapeJS: chkScrapeJs ? chkScrapeJs.checked : false,
      dataFormat: selFormat ? selFormat.value : "jsonl",
    });
  }
  [chkAutoScroll, chkAutoNext, chkCookieDismiss, chkDeobfuscate, chkDownloadImages, chkScrapeVideo, chkAllowYoutube, chkScrapeJs, selFormat].forEach(el => {
    if (el) el.addEventListener("change", saveQuickSettings);
  });

  /* ── Helpers ── */
  function updateStatus(state) {
    if (!statusBadge) return;
    if (state === "scraping") {
      statusBadge.innerHTML = SPINNER_SVG + "Scraping";
      startSessionTimer();
    } else {
      statusBadge.textContent = state.charAt(0).toUpperCase() + state.slice(1);
    }
    statusBadge.className = "badge badge-" + state;
  }

  function updateStats(s) {
    if (!s) return;
    const set = (id, val) => {
      const el = $(id);
      if (!el) return;
      const newVal = formatNum(val);
      if (el.textContent !== newVal) {
        el.textContent = newVal;
        /* Pop animation on value change */
        el.classList.remove("updated");
        void el.offsetWidth; /* force reflow to restart animation */
        el.classList.add("updated");
      }
    };
    set("#stat-words", s.words || 0);
    set("#stat-pages", s.pages || 0);
    set("#stat-images", s.images || 0);
    set("#stat-links", s.links || 0);
    set("#stat-audio", s.audio || 0);
    set("#stat-video", s.video || 0);
  }

  function updateRecordMeta(count, stats) {
    const el = $("#stat-records");
    if (el) el.textContent = formatNum(count) + " records";
    const sizeEl = $("#stat-size");
    if (sizeEl) sizeEl.textContent = "~" + formatBytes(count * 200);
  }

  function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  }

  function formatBytes(bytes) {
    if (bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function sendToTab(action, extra) {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, Object.assign({ action: action }, extra || {}))
          .catch(function (err) { console.warn("[WSP] sendToTab failed:", err.message); });
      }
    });
  }

  function sendToBackground(action, extra) {
    browser.runtime.sendMessage(Object.assign({ action: action }, extra || {}))
      .catch(function (err) { console.warn("[WSP] sendToBackground failed:", err.message); });
  }

  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function safeDomain(url) {
    if (!url) return "";
    try { return new URL(url).hostname; } catch (e) { return ""; }
  }

  /* ── Helpers: bindClick ── */
  const bindClick = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", fn); };

  /* ── Record Detail Modal ── */
  const modal = $("#record-modal");
  const modalBackdrop = modal ? modal.querySelector(".modal-backdrop") : null;
  let modalRecord = null; // currently displayed record

  function openModal(record) {
    if (!modal) return;
    modalRecord = record;
    const typeEl = $("#modal-type");
    const sourceEl = $("#modal-source");
    const bodyEl = $("#modal-body");
    if (typeEl) { typeEl.textContent = record.type || "unknown"; typeEl.className = "dr-type dr-type-" + (record.type || "text"); }
    if (sourceEl) sourceEl.textContent = safeDomain(record.source_url);

    if (bodyEl) {
      const clean = Object.assign({}, record);
      delete clean._fp;
      const entries = Object.entries(clean);
      bodyEl.innerHTML = entries.map(([k, v]) => {
        let val = v;
        if (typeof v === "object" && v !== null) val = JSON.stringify(v, null, 2);
        if (typeof val === "string" && val.length > 500) val = val.slice(0, 500) + "\u2026";
        return '<div class="modal-field"><strong>' + escapeHtml(k) + ':</strong> <span>' + escapeHtml(String(val)) + '</span></div>';
      }).join("");
    }
    modal.classList.remove("hidden");
  }

  function closeModal() {
    if (modal) modal.classList.add("hidden");
    modalRecord = null;
  }

  bindClick("#modal-close", closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal);

  bindClick("#modal-copy", () => {
    if (!modalRecord) return;
    const clean = Object.assign({}, modalRecord);
    delete clean._fp;
    navigator.clipboard.writeText(JSON.stringify(clean, null, 2)).then(() => {
      const btn = $("#modal-copy");
      if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy JSON"; }, 1200); }
    }).catch(() => {});
  });

  bindClick("#modal-copy-text", () => {
    if (!modalRecord) return;
    const text = modalRecord.text || modalRecord.src || modalRecord.href || modalRecord.content || "";
    navigator.clipboard.writeText(text).then(() => {
      const btn = $("#modal-copy-text");
      if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy Text"; }, 1200); }
    }).catch(() => {});
  });

  /* ── Domain Stats & Dedup Display ── */
  function renderDomainStats(domains) {
    const el = $("#domain-stats");
    if (!el || !domains || domains.length === 0) { if (el) el.innerHTML = ""; return; }
    el.innerHTML = domains.map(d =>
      '<span class="domain-pill">' + escapeHtml(d.domain) + ' <b>' + d.count + '</b></span>'
    ).join("");
  }

  function renderDedupStat(count) {
    const el = $("#stat-dedup");
    if (!el) return;
    el.textContent = count > 0 ? count + " dupes skipped" : "";
  }

  /* ── Get full stats ── */
  browser.runtime.sendMessage({ action: "GET_STATS" }).then(resp => {
    if (resp) {
      updateStats(resp.stats || {});
      updateRecordMeta(resp.recordCount || 0, resp.stats);
      renderDomainStats(resp.domains || []);
      renderDedupStat(resp.dedupSkipped || 0);
    }
  }).catch(() => {});

  /* ── Scrape Tab Buttons ── */
  bindClick("#btn-select-area", () => {
    sendToTab("START_SELECTION");
    updateStatus("active");
    browser.storage.local.set({ scrapeActive: true });
    window.close();
  });

  bindClick("#btn-scrape-page", () => {
    sendToTab("SCRAPE_FULL_PAGE");
    updateStatus("scraping");
    browser.storage.local.set({ scrapeActive: true });
    if (btnStop) btnStop.classList.remove("hidden");
  });

  bindClick("#btn-scroll-scrape", () => {
    sendToTab("SCRAPE_WITH_SCROLL");
    updateStatus("scraping");
    browser.storage.local.set({ scrapeActive: true });
    if (btnStop) btnStop.classList.remove("hidden");
    window.close();
  });

  bindClick("#btn-start-auto", () => {
    sendToTab("START_AUTO_SCAN");
    updateStatus("scraping");
    browser.storage.local.set({ scrapeActive: true });
    if (btnStop) btnStop.classList.remove("hidden");
    window.close();
  });

  bindClick("#btn-smart-extract", () => {
    sendToTab("SMART_EXTRACT_ARTICLE");
    updateStatus("scraping");
  });

  bindClick("#btn-scrape-tabs", () => {
    sendToBackground("SCRAPE_ALL_TABS");
    updateStatus("scraping");
    if (btnStop) btnStop.classList.remove("hidden");
  });

  bindClick("#btn-clipboard-scrape", () => {
    navigator.clipboard.readText().then(text => {
      if (text && text.trim().length > 0) {
        sendToBackground("CLIPBOARD_SCRAPE", { text: text.trim() });
        updateStatus("scraping");
      } else {
        const el = $("#export-status");
        if (el) { el.textContent = "Clipboard is empty"; setTimeout(() => { el.textContent = ""; }, 2000); }
      }
    }).catch(() => {
      const el = $("#export-status");
      if (el) { el.textContent = "Clipboard access denied"; setTimeout(() => { el.textContent = ""; }, 2000); }
    });
  });

  if (btnStop) {
    btnStop.addEventListener("click", () => {
      sendToTab("STOP_SCRAPE");
      sendToBackground("STOP_ALL");
      updateStatus("idle");
      btnStop.classList.add("hidden");
    });
  }

  bindClick("#btn-export", () => {
    const fmt = selFormat ? selFormat.value : "jsonl";
    const prettyPrint = !!($("#chk-pretty-print") && $("#chk-pretty-print").checked);
    sendToBackground("EXPORT_DATA", { format: fmt, options: { prettyPrint } });
    const statusEl = $("#export-status");
    if (statusEl) { statusEl.textContent = "Exporting..."; setTimeout(() => { statusEl.textContent = ""; }, 5000); }
  });

  bindClick("#btn-upload-hf", () => { sendToBackground("UPLOAD_HF"); });
  bindClick("#btn-upload-hf-2", () => { sendToBackground("UPLOAD_HF"); });

  bindClick("#btn-options", () => { browser.runtime.openOptionsPage(); });

  bindClick("#link-options", (e) => { e.preventDefault(); browser.runtime.openOptionsPage(); });

  const linkShortcuts = $("#link-shortcuts");
  if (linkShortcuts) {
    linkShortcuts.addEventListener("click", (e) => {
      e.preventDefault();
      sendToTab("SHOW_SHORTCUTS");
    });
  }

  /* ── Image Export ── */
  bindClick("#btn-export-images", () => {
    const format = ($("#sel-img-format") || {}).value || "png";
    const statusEl = $("#img-export-status");
    if (statusEl) statusEl.textContent = "Exporting images...";
    sendToBackground("EXPORT_IMAGES", { format });
    setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 8000);
  });

  /* ── Extract Tab ── */
  // Custom template toggle
  const selAiTemplate = $("#sel-ai-template");
  const customSection = $("#custom-template-section");
  if (selAiTemplate) {
    selAiTemplate.addEventListener("change", () => {
      if (customSection) {
        customSection.classList.toggle("hidden", selAiTemplate.value !== "custom");
      }
    });
  }

  bindClick("#btn-ai-extract", () => {
    const templateSel = ($("#sel-ai-template") || {}).value || "article";
    const statusEl = $("#ai-extract-status");
    if (statusEl) statusEl.textContent = "Running AI extraction...";

    if (templateSel === "custom") {
      const customInput = $("#ai-custom-template");
      const customText = customInput ? customInput.value.trim() : "";
      if (!customText) {
        if (statusEl) statusEl.textContent = "Please enter a custom JSON template";
        return;
      }
      try {
        JSON.parse(customText);
      } catch (e) {
        if (statusEl) statusEl.textContent = "Invalid JSON template: " + e.message;
        return;
      }
      sendToTab("AI_EXTRACT_PAGE", { template: "custom", customTemplate: customText });
    } else {
      sendToTab("AI_EXTRACT_PAGE", { template: templateSel });
    }
    setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 15000);
  });

  bindClick("#btn-ai-batch", () => {
    const templateSel = ($("#sel-ai-template") || {}).value || "article";
    const statusEl = $("#ai-extract-status");
    if (statusEl) statusEl.textContent = "Running batch extraction...";
    sendToBackground("AI_BATCH_EXTRACT", { template: templateSel });
    setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 30000);
  });

  // Listen for AI results
  function renderAIResults(results) {
    const container = $("#ai-results");
    const countEl = $("#ai-result-count");
    if (!container) return;

    if (!results || results.length === 0) {
      container.innerHTML = '<div class="data-empty">No results yet</div>';
      if (countEl) countEl.textContent = "";
      return;
    }

    if (countEl) countEl.textContent = results.length + " result" + (results.length > 1 ? "s" : "");

    container.innerHTML = results.map((result, idx) => {
      const data = result.data || result;
      const entries = Object.entries(data).filter(([k]) => !k.startsWith("_"));
      return '<div class="ai-result-item" data-idx="' + idx + '">'
        + entries.slice(0, 6).map(([k, v]) => {
          let val = v;
          if (Array.isArray(v)) val = v.join(", ");
          if (typeof v === "object" && v !== null && !Array.isArray(v)) val = JSON.stringify(v);
          if (typeof val === "string" && val.length > 120) val = val.slice(0, 120) + "\u2026";
          return '<div class="ai-result-field"><span class="ai-result-key">' + escapeHtml(k) + ':</span> <span class="ai-result-value">' + escapeHtml(String(val || "")) + '</span></div>';
        }).join("")
        + (entries.length > 6 ? '<div class="ai-result-field"><span class="ai-result-key">...</span> <span class="ai-result-value">' + (entries.length - 6) + ' more fields</span></div>' : '')
        + '</div>';
    }).join("");

    // Click to view full result
    for (const item of container.querySelectorAll(".ai-result-item")) {
      item.addEventListener("click", () => {
        const idx = parseInt(item.dataset.idx);
        if (results[idx]) openModal(Object.assign({ type: "ai_extract" }, results[idx].data || results[idx]));
      });
    }
  }

  /* ── Queue Tab ── */
  bindClick("#btn-queue-add", () => {
    const textarea = $("#queue-urls");
    if (!textarea) return;
    const urls = textarea.value.split("\n").map(u => u.trim()).filter(u => u && u.startsWith("http"));
    if (urls.length === 0) return;
    sendToBackground("QUEUE_ADD", { urls });
    textarea.value = "";
    setTimeout(loadQueue, 300);
  });

  bindClick("#btn-queue-start", () => {
    sendToBackground("QUEUE_START");
    const stopBtn = $("#btn-queue-stop");
    if (stopBtn) stopBtn.classList.remove("hidden");
    updateStatus("scraping");
    browser.storage.local.set({ scrapeActive: true });
  });

  bindClick("#btn-queue-stop", () => {
    sendToBackground("QUEUE_STOP");
    const stopBtn = $("#btn-queue-stop");
    if (stopBtn) stopBtn.classList.add("hidden");
  });

  bindClick("#btn-queue-clear", () => {
    if (confirm("Clear all queue items?")) {
      sendToBackground("QUEUE_CLEAR");
      setTimeout(loadQueue, 200);
    }
  });

  function loadQueue() {
    browser.runtime.sendMessage({ action: "QUEUE_GET" }).then(resp => {
      if (!resp) return;
      const queue = resp.queue || [];
      const stats = resp.stats || {};
      const list = $("#queue-list");
      if (!list) return;

      if (queue.length === 0) {
        list.innerHTML = '<div class="data-empty">No items in queue</div>';
        const statusText = $("#queue-status-text");
        if (statusText) statusText.textContent = "No items in queue";
        return;
      }

      list.innerHTML = queue.map((item) => {
        const domain = safeDomain(item.url);
        return '<div class="queue-item">'
          + '<span class="qi-status qi-' + item.status + '"></span>'
          + '<span class="qi-url" title="' + escapeHtml(item.url) + '">' + escapeHtml(domain || item.url) + '</span>'
          + '</div>';
      }).join("");

      const total = stats.total || 1;
      const done = stats.done || 0;
      const pct = Math.round((done / total) * 100);
      const fill = $(".progress-fill");
      if (fill) fill.style.width = pct + "%";
      const statusText = $("#queue-status-text");
      if (statusText) statusText.textContent = done + "/" + total + " done, " + (stats.failed || 0) + " failed, " + (stats.pending || 0) + " pending";

      const stopBtn = $("#btn-queue-stop");
      if (stats.processing) {
        if (stopBtn) stopBtn.classList.remove("hidden");
      } else {
        if (stopBtn) stopBtn.classList.add("hidden");
      }
    }).catch(err => console.warn("[WSP] loadQueue failed:", err));
  }

  /* ── Data Preview Tab ── */
  let dataPage = 0;
  const PAGE_SIZE = 20;

  function loadDataPreview() {
    browser.runtime.sendMessage({ action: "GET_ALL_DATA" }).then(resp => {
      if (!resp) return;
      const records = resp.records || [];
      const search = ($("#data-search") ? $("#data-search").value : "").toLowerCase();
      const filterEl = $("#data-filter");
      const filter = filterEl ? filterEl.value : "all";

      let filtered = records;
      if (filter !== "all") {
        filtered = filtered.filter(r => r.type === filter);
      }
      if (search) {
        filtered = filtered.filter(r => {
          var text = (r.text || r.src || r.href || "").toLowerCase();
          var source = (r.source_url || "").toLowerCase();
          var title = (r.source_title || "").toLowerCase();
          return text.includes(search) || source.includes(search) || title.includes(search);
        });
      }

      const total = filtered.length;
      const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
      if (dataPage >= totalPages) dataPage = totalPages - 1;
      if (dataPage < 0) dataPage = 0;

      const start = dataPage * PAGE_SIZE;
      const pageRecords = filtered.slice(start, start + PAGE_SIZE);

      const preview = $("#data-preview");
      if (!preview) return;

      if (pageRecords.length === 0) {
        preview.innerHTML = '<div class="data-empty">No matching records</div>';
      } else {
        preview.innerHTML = pageRecords.map((r, idx) => {
          const typeClass = "dr-type-" + (r.type || "text");
          const content = r.text || r.src || r.href || r.template || "";
          const source = safeDomain(r.source_url);
          return '<div class="data-record" data-idx="' + (start + idx) + '" title="Click to view details">'
            + '<span class="dr-type ' + typeClass + '">' + (r.type || "?") + '</span>'
            + '<span class="dr-source">' + escapeHtml(source) + '</span>'
            + '<div class="dr-content">' + escapeHtml(content.slice(0, 150)) + '</div>'
            + '</div>';
        }).join("");

        // Click to open record detail modal
        for (const rec of preview.querySelectorAll(".data-record")) {
          rec.addEventListener("click", () => {
            const idx = parseInt(rec.dataset.idx);
            if (records[idx]) openModal(records[idx]);
          });
        }
      }

      // Pagination
      const pagEl = $("#data-pagination");
      if (pagEl) {
        if (totalPages > 1) {
          let btns = "";
          const maxBtns = Math.min(totalPages, 7);
          let startPage = Math.max(0, Math.min(dataPage - 3, totalPages - maxBtns));
          for (let i = startPage; i < startPage + maxBtns && i < totalPages; i++) {
            btns += '<button data-page="' + i + '" class="' + (i === dataPage ? 'active' : '') + '">' + (i + 1) + '</button>';
          }
          pagEl.innerHTML = btns;
          for (const btn of pagEl.querySelectorAll("button")) {
            btn.addEventListener("click", () => {
              dataPage = parseInt(btn.dataset.page);
              loadDataPreview();
            });
          }
        } else {
          pagEl.innerHTML = "";
        }
      }

      // Type counts (always count from all records, not filtered)
      const typeCounts = $("#data-type-counts");
      if (typeCounts) {
        const types = { text: 0, image: 0, link: 0, audio: 0, video: 0, ai_extract: 0 };
        records.forEach(r => { if (types[r.type] !== undefined) types[r.type]++; });
        typeCounts.innerHTML = Object.entries(types)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => '<span class="dtc-pill dtc-' + k + '">' + k + ': ' + formatNum(v) + '</span>')
          .join("");
      }

      // Storage usage
      const storageEl = $("#data-storage-usage");
      if (storageEl) {
        var jsonSize = JSON.stringify(records).length;
        storageEl.textContent = "Storage: ~" + formatBytes(jsonSize);
      }

      updateRecordMeta(records.length, resp.stats);
    }).catch(err => console.warn("[WSP] loadDataPreview failed:", err));
  }

  // Clear data button
  bindClick("#btn-data-clear", () => {
    if (confirm("Clear all scraped data? This cannot be undone.")) {
      sendToBackground("CLEAR_DATA");
      sessionStartTime = null;
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      browser.storage.local.remove(["sessionStartTime"]);
      updateStats({});
      updateRecordMeta(0, {});
      setTimeout(loadDataPreview, 300);
    }
  });

  // Search/filter listeners
  let searchTimer;
  const dataSearch = $("#data-search");
  const dataFilter = $("#data-filter");
  if (dataSearch) {
    dataSearch.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { dataPage = 0; loadDataPreview(); }, 300);
    });
  }
  if (dataFilter) {
    dataFilter.addEventListener("change", () => { dataPage = 0; loadDataPreview(); });
  }

  /* ── Sessions Tab ── */
  bindClick("#btn-session-save", () => {
    const nameEl = $("#session-name");
    if (!nameEl) return;
    const name = nameEl.value.trim();
    if (!name) return;
    sendToBackground("SESSION_SAVE", { name });
    nameEl.value = "";
    setTimeout(loadSessions, 500);
  });

  function loadSessions() {
    browser.runtime.sendMessage({ action: "SESSION_LIST" }).then(resp => {
      if (!resp) return;
      const sessions = resp.sessions || [];
      const list = $("#session-list");
      if (!list) return;

      if (sessions.length === 0) {
        list.innerHTML = '<div class="data-empty">No saved sessions</div>';
        return;
      }

      list.innerHTML = sessions.map((s) => {
        const date = new Date(s.savedAt).toLocaleString();
        const count = (s.records || []).length;
        const safeName = escapeHtml(s.name);
        return '<div class="session-item">'
          + '<div class="si-info">'
          + '<div class="si-name">' + safeName + '</div>'
          + '<div class="si-meta">' + count + ' records - ' + date + '</div>'
          + '</div>'
          + '<div class="si-actions">'
          + '<button data-action="restore" data-name="' + safeName + '" title="Restore">Load</button>'
          + '<button data-action="merge" data-name="' + safeName + '" title="Merge into current">Merge</button>'
          + '<button class="si-delete" data-action="delete" data-name="' + safeName + '" title="Delete">Del</button>'
          + '</div>'
          + '</div>';
      }).join("");

      for (const btn of list.querySelectorAll("button")) {
        btn.addEventListener("click", () => {
          const action = btn.dataset.action;
          const name = btn.dataset.name;
          if (action === "restore") {
            if (confirm('Restore session "' + name + '"? Current data will be replaced.')) {
              sendToBackground("SESSION_RESTORE", { name });
              setTimeout(() => {
                browser.runtime.sendMessage({ action: "GET_STATS" }).then(resp => {
                  if (resp) { updateStats(resp.stats || {}); updateRecordMeta(resp.recordCount || 0); }
                }).catch(() => {});
              }, 500);
            }
          } else if (action === "merge") {
            sendToBackground("SESSION_MERGE", { name });
          } else if (action === "delete") {
            if (confirm('Delete session "' + name + '"?')) {
              sendToBackground("SESSION_DELETE", { name });
              setTimeout(loadSessions, 300);
            }
          }
        });
      }
    }).catch(err => console.warn("[WSP] loadSessions failed:", err));
  }

  /* ── Listen for stats updates from background ── */
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "STATS_UPDATE") {
      updateStats(msg.stats);
      if (msg.recordCount !== undefined) updateRecordMeta(msg.recordCount);
      if (msg.dedupSkipped !== undefined) renderDedupStat(msg.dedupSkipped);
      if (msg.domains) renderDomainStats(msg.domains);
    }
    if (msg.action === "STATUS_CHANGE") {
      updateStatus(msg.status);
      if (btnStop) btnStop.classList.toggle("hidden", msg.status === "idle");
    }
    if (msg.action === "QUEUE_UPDATE") {
      loadQueue();
    }
    if (msg.action === "AI_RESULTS") {
      renderAIResults(msg.results || []);
      const statusEl = $("#ai-extract-status");
      if (statusEl) statusEl.textContent = "Extraction complete!";
      setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 3000);
    }
  });

  /* ── Graph Tab (GwSS) ── */
  bindClick("#btn-open-gwss", () => {
    browser.tabs.create({ url: browser.runtime.getURL("gwss/gwss.html") });
  });

  function loadGraphPreview() {
    browser.runtime.sendMessage({ action: "GET_ALL_DATA" }).then(resp => {
      if (!resp) return;
      var records = resp.records || [];
      var domainMap = {};
      records.forEach(r => {
        var d = safeDomain(r.source_url || "");
        if (!d) return;
        if (!domainMap[d]) domainMap[d] = { count: 0, types: {}, size: 0 };
        domainMap[d].count++;
        var t = r.type || "text";
        domainMap[d].types[t] = (domainMap[d].types[t] || 0) + 1;
        domainMap[d].size += JSON.stringify(r).length;
      });

      var domains = Object.entries(domainMap).sort((a, b) => b[1].count - a[1].count);
      var list = $("#graph-domain-list");
      if (list) {
        if (domains.length === 0) {
          list.innerHTML = '<div class="data-empty">No scraped data yet</div>';
        } else {
          var typeColors = { text: "var(--accent)", image: "var(--orange)", link: "var(--green)", audio: "#8b5cf6", video: "#e11d48", ai_extract: "var(--pink)" };
          list.innerHTML = domains.slice(0, 20).map(([d, info]) => {
            var dots = Object.keys(info.types).map(t =>
              '<span class="gdi-type-dot" style="background:' + (typeColors[t] || "var(--accent)") + '" title="' + t + ': ' + info.types[t] + '"></span>'
            ).join("");
            return '<div class="graph-domain-item">'
              + '<span class="gdi-domain">' + escapeHtml(d) + '</span>'
              + '<span class="gdi-types">' + dots + '</span>'
              + '<span class="gdi-count">' + info.count + '</span></div>';
          }).join("");
        }
      }

      // Stats
      var gsDomains = $("#gs-domains");
      var gsRecords = $("#gs-records");
      var gsSize = $("#gs-size");
      if (gsDomains) gsDomains.textContent = domains.length;
      if (gsRecords) gsRecords.textContent = formatNum(records.length);
      var totalSize = domains.reduce((sum, d) => sum + d[1].size, 0);
      if (gsSize) gsSize.textContent = formatBytes(totalSize);
    }).catch(() => {});
  }

  /* ── Keyboard Navigation ── */
  document.addEventListener("keydown", (e) => {
    // Escape closes modal
    if (e.key === "Escape") {
      closeModal();
      return;
    }
    // Arrow keys for data pagination (only when Data tab is active and not in an input)
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    const dataTab = $("#tab-data");
    if (!dataTab || !dataTab.classList.contains("active")) return;
    const pagEl = $("#data-pagination");
    if (!pagEl || pagEl.children.length === 0) return;

    if (e.key === "ArrowLeft" && dataPage > 0) {
      dataPage--;
      loadDataPreview();
    } else if (e.key === "ArrowRight") {
      const totalBtns = pagEl.querySelectorAll("button").length;
      const lastBtn = pagEl.querySelector("button:last-child");
      const maxPage = lastBtn ? parseInt(lastBtn.dataset.page) : dataPage;
      if (dataPage < maxPage) {
        dataPage++;
        loadDataPreview();
      }
    }
  });
})();

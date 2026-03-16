/* ── Popup Controller v0.6.6 ── */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  /* ── Tab Navigation ── */
  for (const btn of $$(".tab-btn")) {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach(b => b.classList.remove("active"));
      $$(".tab-content").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      const tab = $("#tab-" + btn.dataset.tab);
      if (tab) tab.classList.add("active");
      if (btn.dataset.tab === "data") loadDataPreview();
      if (btn.dataset.tab === "sessions") loadSessions();
      if (btn.dataset.tab === "queue") loadQueue();
    });
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

  /* ── Elements ── */
  const statusBadge = $("#status-badge");
  const btnStop = $("#btn-stop");
  const chkAutoScroll = $("#chk-auto-scroll");
  const chkAutoNext = $("#chk-auto-next");
  const chkCookieDismiss = $("#chk-cookie-dismiss");
  const chkDeobfuscate = $("#chk-deobfuscate");
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
    "cookieDismissEnabled", "deobfuscateEnabled"
  ]).then((cfg) => {
    if (chkAutoScroll) chkAutoScroll.checked = cfg.autoScroll !== false;
    if (chkAutoNext) chkAutoNext.checked = cfg.autoNext !== false;
    if (chkCookieDismiss) chkCookieDismiss.checked = !!cfg.cookieDismissEnabled;
    if (chkDeobfuscate) chkDeobfuscate.checked = !!cfg.deobfuscateEnabled;
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
      dataFormat: selFormat ? selFormat.value : "jsonl",
    });
  }
  [chkAutoScroll, chkAutoNext, chkCookieDismiss, chkDeobfuscate, selFormat].forEach(el => {
    if (el) el.addEventListener("change", saveQuickSettings);
  });

  /* ── Helpers ── */
  function updateStatus(state) {
    if (!statusBadge) return;
    statusBadge.textContent = state.charAt(0).toUpperCase() + state.slice(1);
    statusBadge.className = "badge badge-" + state;
    if (state === "scraping") startSessionTimer();
  }

  function updateStats(s) {
    if (!s) return;
    const set = (id, val) => { const el = $(id); if (el) el.textContent = formatNum(val); };
    set("#stat-words", s.words || 0);
    set("#stat-pages", s.pages || 0);
    set("#stat-images", s.images || 0);
    set("#stat-links", s.links || 0);
    set("#stat-audio", s.audio || 0);
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
        if (typeof val === "string" && val.length > 500) val = val.slice(0, 500) + "…";
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

  /* ── AI Extract ── */
  const aiDot = $("#ai-status-dot");

  browser.runtime.sendMessage({ action: "AI_STATUS" }).then(resp => {
    if (resp && resp.status === "ready") {
      if (aiDot) { aiDot.className = "ai-dot ai-dot-on"; aiDot.title = "AI ready (" + (resp.device || "?") + ")"; }
    }
    const modeLabel = $("#ai-mode-label");
    if (modeLabel && resp) {
      if (resp.mode === "local") modeLabel.textContent = "Mode: Local (auto-downloaded)";
      else if (resp.status === "ready") modeLabel.textContent = "Mode: Server (" + (resp.device || "?") + ")";
      else modeLabel.textContent = "Mode: Not connected";
    }
  }).catch(() => {});

  bindClick("#btn-ai-extract", () => {
    const template = ($("#sel-ai-template") || {}).value || "article";
    const statusEl = $("#ai-extract-status");
    if (statusEl) statusEl.textContent = "Running AI extraction...";
    sendToTab("AI_EXTRACT_PAGE", { template });
    setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 15000);
  });

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

      if (stats.processing) {
        const stopBtn = $("#btn-queue-stop");
        if (stopBtn) stopBtn.classList.remove("hidden");
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
          return '<div class="data-record" data-idx="' + (start + idx) + '" title="Click to copy">'
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
        const types = { text: 0, image: 0, link: 0, audio: 0, ai_extract: 0 };
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
  });

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

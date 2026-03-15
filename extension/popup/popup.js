/* ── Popup Controller v0.6.2b ── */
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
      // Load data for the tab
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
      btnTheme.textContent = "\u2600"; // sun
    }
  });
  btnTheme.addEventListener("click", () => {
    const isLight = document.body.getAttribute("data-theme") === "light";
    if (isLight) {
      document.body.removeAttribute("data-theme");
      btnTheme.textContent = "\u263E"; // moon
      browser.storage.local.set({ theme: "dark" });
    } else {
      document.body.setAttribute("data-theme", "light");
      btnTheme.textContent = "\u2600"; // sun
      browser.storage.local.set({ theme: "light" });
    }
  });

  /* ── Elements ── */
  const statusBadge = $("#status-badge");
  const btnStop = $("#btn-stop");
  const chkAutoScroll = $("#chk-auto-scroll");
  const chkAutoNext = $("#chk-auto-next");
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
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    el.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // Resume timer from storage
  browser.storage.local.get(["sessionStartTime"]).then(cfg => {
    if (cfg.sessionStartTime) {
      sessionStartTime = cfg.sessionStartTime;
      timerInterval = setInterval(updateTimerDisplay, 1000);
      updateTimerDisplay();
    }
  });

  /* ── Load saved config ── */
  browser.storage.local.get([
    "autoScroll", "autoNext", "dataFormat", "sessionStats", "scrapeActive"
  ]).then((cfg) => {
    chkAutoScroll.checked = cfg.autoScroll !== false;
    chkAutoNext.checked = cfg.autoNext !== false;
    selFormat.value = cfg.dataFormat || "jsonl";
    updateStats(cfg.sessionStats || {});
    updateStatus(cfg.scrapeActive ? "scraping" : "idle");
    btnStop.classList.toggle("hidden", !cfg.scrapeActive);
  });

  /* ── Persist quick settings ── */
  function saveQuickSettings() {
    browser.storage.local.set({
      autoScroll: chkAutoScroll.checked,
      autoNext: chkAutoNext.checked,
      dataFormat: selFormat.value,
    });
  }
  [chkAutoScroll, chkAutoNext, selFormat].forEach(el => el.addEventListener("change", saveQuickSettings));

  /* ── Helpers ── */
  function updateStatus(state) {
    statusBadge.textContent = state.charAt(0).toUpperCase() + state.slice(1);
    statusBadge.className = "badge badge-" + state;
    if (state === "scraping") startSessionTimer();
  }

  function updateStats(s) {
    $("#stat-words").textContent = formatNum(s.words || 0);
    $("#stat-pages").textContent = formatNum(s.pages || 0);
    $("#stat-images").textContent = formatNum(s.images || 0);
    $("#stat-links").textContent = formatNum(s.links || 0);
    $("#stat-audio").textContent = formatNum(s.audio || 0);
  }

  function updateRecordMeta(count, stats) {
    const el = $("#stat-records");
    if (el) el.textContent = formatNum(count) + " records";
    const sizeEl = $("#stat-size");
    if (sizeEl) {
      // Rough estimate: ~200 bytes per record average
      const bytes = count * 200;
      sizeEl.textContent = "~" + formatBytes(bytes);
    }
  }

  function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function sendToTab(action, extra) {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]) browser.tabs.sendMessage(tabs[0].id, { action, ...extra });
    });
  }

  function sendToBackground(action, extra) {
    browser.runtime.sendMessage({ action, ...extra });
  }

  /* ── Get full stats ── */
  browser.runtime.sendMessage({ action: "GET_STATS" }).then(resp => {
    if (resp) {
      updateStats(resp.stats || {});
      updateRecordMeta(resp.recordCount || 0, resp.stats);
    }
  }).catch(() => {});

  /* ── Scrape Tab Buttons ── */
  $("#btn-select-area").addEventListener("click", () => {
    sendToTab("START_SELECTION");
    updateStatus("active");
    window.close();
  });

  $("#btn-scrape-page").addEventListener("click", () => {
    sendToTab("SCRAPE_FULL_PAGE");
    updateStatus("scraping");
    btnStop.classList.remove("hidden");
  });

  $("#btn-scroll-scrape").addEventListener("click", () => {
    sendToTab("SCRAPE_WITH_SCROLL");
    updateStatus("scraping");
    btnStop.classList.remove("hidden");
    window.close();
  });

  $("#btn-start-auto").addEventListener("click", () => {
    sendToTab("START_AUTO_SCAN");
    updateStatus("scraping");
    btnStop.classList.remove("hidden");
    window.close();
  });

  $("#btn-smart-extract").addEventListener("click", () => {
    sendToTab("SMART_EXTRACT_ARTICLE");
    updateStatus("scraping");
  });

  btnStop.addEventListener("click", () => {
    sendToTab("STOP_SCRAPE");
    sendToBackground("STOP_ALL");
    updateStatus("idle");
    btnStop.classList.add("hidden");
  });

  $("#btn-export").addEventListener("click", () => {
    sendToBackground("EXPORT_DATA", { format: selFormat.value });
  });

  $("#btn-upload-hf").addEventListener("click", () => {
    sendToBackground("UPLOAD_HF");
  });

  $("#btn-options").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });

  $("#link-options").addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });

  const linkShortcuts = $("#link-shortcuts");
  if (linkShortcuts) {
    linkShortcuts.addEventListener("click", (e) => {
      e.preventDefault();
      sendToTab("SHOW_SHORTCUTS");
    });
  }

  /* ── Image Export ── */
  const btnExportImages = $("#btn-export-images");
  if (btnExportImages) {
    btnExportImages.addEventListener("click", () => {
      const format = ($("#sel-img-format") || {}).value || "png";
      const statusEl = $("#img-export-status");
      if (statusEl) statusEl.textContent = "Exporting images...";
      sendToBackground("EXPORT_IMAGES", { format });
      setTimeout(() => {
        if (statusEl) statusEl.textContent = "";
      }, 5000);
    });
  }

  /* ── AI Extract ── */
  const aiDot = $("#ai-status-dot");
  const btnAIExtract = $("#btn-ai-extract");

  // Check AI server status on load
  browser.runtime.sendMessage({ action: "AI_STATUS" }).then(resp => {
    if (resp && resp.status === "ready") {
      if (aiDot) { aiDot.className = "ai-dot ai-dot-on"; aiDot.title = "AI server ready"; }
    }
  }).catch(() => {});

  if (btnAIExtract) {
    btnAIExtract.addEventListener("click", () => {
      const template = ($("#sel-ai-template") || {}).value || "article";
      const statusEl = $("#ai-extract-status");
      if (statusEl) statusEl.textContent = "Running AI extraction...";
      sendToTab("AI_EXTRACT_PAGE", { template });
      setTimeout(() => {
        if (statusEl) statusEl.textContent = "";
      }, 10000);
    });
  }

  /* ── Queue Tab ── */
  $("#btn-queue-add").addEventListener("click", () => {
    const textarea = $("#queue-urls");
    const urls = textarea.value.split("\n").map(u => u.trim()).filter(u => u);
    if (urls.length === 0) return;
    sendToBackground("QUEUE_ADD", { urls });
    textarea.value = "";
    setTimeout(loadQueue, 300);
  });

  $("#btn-queue-start").addEventListener("click", () => {
    sendToBackground("QUEUE_START");
    $("#btn-queue-stop").classList.remove("hidden");
    updateStatus("scraping");
  });

  $("#btn-queue-stop").addEventListener("click", () => {
    sendToBackground("QUEUE_STOP");
    $("#btn-queue-stop").classList.add("hidden");
  });

  $("#btn-queue-clear").addEventListener("click", () => {
    sendToBackground("QUEUE_CLEAR");
    setTimeout(loadQueue, 200);
  });

  function loadQueue() {
    browser.runtime.sendMessage({ action: "QUEUE_GET" }).then(resp => {
      if (!resp) return;
      const queue = resp.queue || [];
      const stats = resp.stats || {};
      const list = $("#queue-list");

      if (queue.length === 0) {
        list.innerHTML = '<div class="data-empty">No items in queue</div>';
        $("#queue-status-text").textContent = "No items in queue";
        return;
      }

      list.innerHTML = queue.map((item, i) => `
        <div class="queue-item">
          <span class="qi-status qi-${item.status}"></span>
          <span class="qi-url" title="${item.url}">${item.url}</span>
        </div>
      `).join("");

      // Update progress
      const total = stats.total || 1;
      const done = stats.done || 0;
      const pct = Math.round((done / total) * 100);
      $(".progress-fill").style.width = pct + "%";
      $("#queue-status-text").textContent = `${done}/${total} done, ${stats.failed || 0} failed, ${stats.pending || 0} pending`;

      if (stats.processing) {
        $("#btn-queue-stop").classList.remove("hidden");
      }
    }).catch(() => {});
  }

  /* ── Data Preview Tab ── */
  let dataPage = 0;
  const PAGE_SIZE = 20;

  function loadDataPreview() {
    browser.runtime.sendMessage({ action: "GET_ALL_DATA" }).then(resp => {
      if (!resp) return;
      const records = resp.records || [];
      const search = ($("#data-search").value || "").toLowerCase();
      const filter = $("#data-filter").value;

      let filtered = records;
      if (filter !== "all") {
        filtered = filtered.filter(r => r.type === filter);
      }
      if (search) {
        filtered = filtered.filter(r => {
          const text = (r.text || r.src || r.href || "").toLowerCase();
          const source = (r.source_url || "").toLowerCase();
          return text.includes(search) || source.includes(search);
        });
      }

      const total = filtered.length;
      const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
      if (dataPage >= totalPages) dataPage = totalPages - 1;
      if (dataPage < 0) dataPage = 0;

      const start = dataPage * PAGE_SIZE;
      const pageRecords = filtered.slice(start, start + PAGE_SIZE);

      const preview = $("#data-preview");
      if (pageRecords.length === 0) {
        preview.innerHTML = '<div class="data-empty">No matching records</div>';
      } else {
        preview.innerHTML = pageRecords.map(r => {
          const typeClass = "dr-type-" + r.type;
          const content = r.text || r.src || r.href || "";
          const source = r.source_url ? new URL(r.source_url).hostname : "";
          return `
            <div class="data-record">
              <span class="dr-type ${typeClass}">${r.type}</span>
              <span class="dr-source">${source}</span>
              <div class="dr-content">${escapeHtml(content.slice(0, 120))}</div>
            </div>`;
        }).join("");
      }

      // Pagination
      const pagEl = $("#data-pagination");
      if (totalPages > 1) {
        let btns = "";
        const maxBtns = Math.min(totalPages, 5);
        let startPage = Math.max(0, dataPage - 2);
        for (let i = startPage; i < startPage + maxBtns && i < totalPages; i++) {
          btns += `<button data-page="${i}" class="${i === dataPage ? 'active' : ''}">${i + 1}</button>`;
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

      // Type counts
      const typeCounts = $("#data-type-counts");
      if (typeCounts) {
        const types = { text: 0, image: 0, link: 0, audio: 0 };
        records.forEach(r => { if (types[r.type] !== undefined) types[r.type]++; });
        typeCounts.innerHTML = Object.entries(types)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `<span class="dtc-pill dtc-${k}">${k}: ${formatNum(v)}</span>`)
          .join("");
      }

      // Storage usage estimate
      const storageEl = $("#data-storage-usage");
      if (storageEl) {
        const jsonSize = JSON.stringify(records).length;
        storageEl.textContent = "Storage: ~" + formatBytes(jsonSize);
      }

      updateRecordMeta(records.length, resp.stats);
    }).catch(() => {});
  }

  // Clear data button
  const btnDataClear = $("#btn-data-clear");
  if (btnDataClear) {
    btnDataClear.addEventListener("click", () => {
      if (confirm("Clear all scraped data? This cannot be undone.")) {
        sendToBackground("CLEAR_DATA");
        setTimeout(loadDataPreview, 300);
      }
    });
  }

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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Sessions Tab ── */
  $("#btn-session-save").addEventListener("click", () => {
    const name = $("#session-name").value.trim();
    if (!name) return;
    sendToBackground("SESSION_SAVE", { name });
    $("#session-name").value = "";
    setTimeout(loadSessions, 300);
  });

  function loadSessions() {
    browser.runtime.sendMessage({ action: "SESSION_LIST" }).then(resp => {
      if (!resp) return;
      const sessions = resp.sessions || [];
      const list = $("#session-list");

      if (sessions.length === 0) {
        list.innerHTML = '<div class="data-empty">No saved sessions</div>';
        return;
      }

      list.innerHTML = sessions.map((s, i) => {
        const date = new Date(s.savedAt).toLocaleString();
        const count = (s.records || []).length;
        return `
          <div class="session-item">
            <div class="si-info">
              <div class="si-name">${escapeHtml(s.name)}</div>
              <div class="si-meta">${count} records - ${date}</div>
            </div>
            <div class="si-actions">
              <button data-action="restore" data-name="${escapeHtml(s.name)}" title="Restore this session">Load</button>
              <button data-action="merge" data-name="${escapeHtml(s.name)}" title="Merge into current">Merge</button>
              <button class="si-delete" data-action="delete" data-name="${escapeHtml(s.name)}" title="Delete">Del</button>
            </div>
          </div>`;
      }).join("");

      // Attach handlers
      for (const btn of list.querySelectorAll("button")) {
        btn.addEventListener("click", () => {
          const action = btn.dataset.action;
          const name = btn.dataset.name;
          if (action === "restore") {
            sendToBackground("SESSION_RESTORE", { name });
          } else if (action === "merge") {
            sendToBackground("SESSION_MERGE", { name });
          } else if (action === "delete") {
            sendToBackground("SESSION_DELETE", { name });
            setTimeout(loadSessions, 200);
          }
        });
      }
    }).catch(() => {});
  }

  /* ── Listen for stats updates from background ── */
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "STATS_UPDATE") {
      updateStats(msg.stats);
      if (msg.recordCount !== undefined) updateRecordMeta(msg.recordCount);
    }
    if (msg.action === "STATUS_CHANGE") {
      updateStatus(msg.status);
      btnStop.classList.toggle("hidden", msg.status === "idle");
    }
    if (msg.action === "QUEUE_UPDATE") {
      loadQueue();
    }
  });
})();

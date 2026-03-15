/* ── Options Page Controller v0.6.3b1 ── */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  /* ── Theme ── */
  const btnTheme = $("#btn-theme");
  browser.storage.local.get(["theme"]).then(cfg => {
    if (cfg.theme === "light") {
      document.body.setAttribute("data-theme", "light");
      btnTheme.textContent = "\u2600";
    }
  });
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

  /* ── Elements ── */
  const elements = {
    autoStart: $("#chk-auto-start"),
    autoScroll: $("#chk-auto-scroll"),
    autoNext: $("#chk-auto-next"),
    delay: $("#inp-delay"),
    maxPages: $("#inp-max-pages"),
    format: $("#sel-format"),
    savePath: $("#inp-save-path"),
    saveLocal: $("#chk-save-local"),
    downloadImages: $("#chk-download-images"),
    convertAudio: $("#chk-convert-audio"),
    hfToken: $("#inp-hf-token"),
    hfRepo: $("#inp-hf-repo"),
    hfCreate: $("#chk-hf-create"),
    hfPrivate: $("#chk-hf-private"),
    hfAutoUpload: $("#chk-hf-auto-upload"),
    hfOwnerRepo: $("#inp-hf-owner-repo"),
    autoCite: $("#chk-auto-cite"),
    citeReadme: $("#chk-cite-readme"),
    citeLinks: $("#chk-cite-links"),
    btnSave: $("#btn-save"),
    btnExport: $("#btn-export"),
    btnUploadHF: $("#btn-upload-hf"),
    btnClear: $("#btn-clear"),
    btnValidateToken: $("#btn-validate-token"),
    tokenStatus: $("#token-status"),
    saveStatus: $("#save-status"),
    dataStats: $("#data-stats"),
    // New v0.6.3b1
    rateMax: $("#inp-rate-max"),
    rateWindow: $("#inp-rate-window"),
    rateEnabled: $("#chk-rate-enabled"),
    allowlist: $("#txt-allowlist"),
    blocklist: $("#txt-blocklist"),
    regexRules: $("#txt-regex-rules"),
    // AI extraction
    aiEnabled: $("#chk-ai-enabled"),
    aiServer: $("#inp-ai-server"),
    btnAICheck: $("#btn-ai-check"),
    aiServerStatus: $("#ai-server-status"),
  };

  /* ── Load settings ── */
  browser.storage.local.get([
    "autoStart", "autoScroll", "autoNext", "scrapeDelay", "maxPages",
    "dataFormat", "savePath", "saveLocal", "downloadImages", "convertAudio",
    "hfToken", "hfRepoId", "hfCreateRepo", "hfPrivate", "hfAutoUpload", "hfOwnerRepo",
    "autoCite", "citeReadme", "citeLinks", "uploadToOwner",
    "scrapeJS", "citationFormat", "respectRobots", "minTextLength",
    "rateLimitConfig", "domainAllowlist", "domainBlocklist", "regexPatterns",
    "rateEnabled",
    "aiEnabled", "aiServerUrl",
  ]).then((cfg) => {
    elements.autoStart.checked = !!cfg.autoStart;
    elements.autoScroll.checked = cfg.autoScroll !== false;
    elements.autoNext.checked = cfg.autoNext !== false;
    elements.delay.value = cfg.scrapeDelay || 1500;
    elements.maxPages.value = cfg.maxPages || 200;
    elements.format.value = cfg.dataFormat || "jsonl";
    elements.savePath.value = cfg.savePath || "webscraper-pro/";
    elements.saveLocal.checked = cfg.saveLocal !== false;
    elements.downloadImages.checked = !!cfg.downloadImages;
    elements.convertAudio.checked = !!cfg.convertAudio;
    elements.hfToken.value = cfg.hfToken || "";
    elements.hfToken.dataset.hadToken = cfg.hfToken ? "true" : "false";
    elements.hfRepo.value = cfg.hfRepoId || "";
    elements.hfCreate.checked = cfg.hfCreateRepo !== false;
    elements.hfPrivate.checked = !!cfg.hfPrivate;
    elements.hfAutoUpload.checked = !!cfg.hfAutoUpload;
    elements.hfOwnerRepo.value = cfg.hfOwnerRepo || "";
    elements.autoCite.checked = cfg.autoCite !== false;
    elements.citeReadme.checked = cfg.citeReadme !== false;
    elements.citeLinks.checked = cfg.citeLinks !== false;

    const uploadOwnerEl = $("#chk-upload-owner");
    if (uploadOwnerEl) uploadOwnerEl.checked = !!cfg.uploadToOwner;
    const scrapeJSEl = $("#chk-scrape-js");
    if (scrapeJSEl) scrapeJSEl.checked = !!cfg.scrapeJS;
    const citeFmtEl = $("#sel-citation-format");
    if (citeFmtEl) citeFmtEl.value = cfg.citationFormat || "mla";
    const robotsEl = $("#chk-respect-robots");
    if (robotsEl) robotsEl.checked = cfg.respectRobots !== false;
    const minTextEl = $("#inp-min-text");
    if (minTextEl) minTextEl.value = cfg.minTextLength || 3;

    // Rate limiting
    const rateConfig = cfg.rateLimitConfig || {};
    const rateDefaults = rateConfig.defaults || {};
    if (elements.rateMax) elements.rateMax.value = rateDefaults.maxRequests || 5;
    if (elements.rateWindow) elements.rateWindow.value = (rateDefaults.windowMs || 10000) / 1000;
    if (elements.rateEnabled) elements.rateEnabled.checked = cfg.rateEnabled !== false;

    // Domain filtering
    if (elements.allowlist) elements.allowlist.value = (cfg.domainAllowlist || []).join("\n");
    if (elements.blocklist) elements.blocklist.value = (cfg.domainBlocklist || []).join("\n");

    // Regex rules
    if (elements.regexRules && cfg.regexPatterns) {
      elements.regexRules.value = JSON.stringify(cfg.regexPatterns, null, 2);
    }

    // AI extraction
    if (elements.aiEnabled) elements.aiEnabled.checked = !!cfg.aiEnabled;
    if (elements.aiServer) elements.aiServer.value = cfg.aiServerUrl || "http://127.0.0.1:8377";
  });

  /* ── Load stats ── */
  browser.runtime.sendMessage({ action: "GET_STATS" }).then((resp) => {
    if (resp && resp.stats) {
      const s = resp.stats;
      elements.dataStats.innerHTML = `
        <strong>Session Data:</strong> ${resp.recordCount} records |
        Words: ${s.words || 0} | Pages: ${s.pages} | Images: ${s.images} |
        Links: ${s.links} | Audio: ${s.audio}
      `;
    }
  }).catch(() => {
    elements.dataStats.textContent = "No active session data.";
  });

  /* ── Parse HF repo from URL or ID ── */
  function parseRepoId(input) {
    if (!input) return "";
    const urlMatch = input.match(/huggingface\.co\/datasets\/([^/]+\/[^/\s]+)/);
    if (urlMatch) return urlMatch[1];
    if (input.includes("/")) return input.trim();
    return input.trim();
  }

  /* ── Save ── */
  elements.btnSave.addEventListener("click", () => {
    const repoId = parseRepoId(elements.hfRepo.value);
    elements.hfRepo.value = repoId;

    const rawToken = elements.hfToken.value.trim();

    const settings = {
      autoStart: elements.autoStart.checked,
      autoScroll: elements.autoScroll.checked,
      autoNext: elements.autoNext.checked,
      scrapeDelay: parseInt(elements.delay.value, 10),
      maxPages: parseInt(elements.maxPages.value, 10),
      dataFormat: elements.format.value,
      savePath: elements.savePath.value,
      saveLocal: elements.saveLocal.checked,
      downloadImages: elements.downloadImages.checked,
      convertAudio: elements.convertAudio.checked,
      hfRepoId: repoId,
      hfCreateRepo: elements.hfCreate.checked,
      hfPrivate: elements.hfPrivate.checked,
      hfAutoUpload: elements.hfAutoUpload.checked,
      hfOwnerRepo: elements.hfOwnerRepo.value,
      uploadToOwner: $("#chk-upload-owner") ? $("#chk-upload-owner").checked : false,
      autoCite: elements.autoCite.checked,
      citeReadme: elements.citeReadme.checked,
      citeLinks: elements.citeLinks.checked,
      scrapeJS: $("#chk-scrape-js") ? $("#chk-scrape-js").checked : false,
      citationFormat: $("#sel-citation-format") ? $("#sel-citation-format").value : "mla",
      respectRobots: $("#chk-respect-robots") ? $("#chk-respect-robots").checked : true,
      minTextLength: parseInt(($("#inp-min-text") || {}).value || "3", 10),
      // Rate limiting
      rateEnabled: elements.rateEnabled ? elements.rateEnabled.checked : true,
      rateLimitConfig: {
        defaults: {
          maxRequests: parseInt((elements.rateMax || {}).value || "5", 10),
          windowMs: parseInt((elements.rateWindow || {}).value || "10", 10) * 1000,
        }
      },
      // Domain filtering
      domainAllowlist: (elements.allowlist ? elements.allowlist.value : "")
        .split("\n").map(d => d.trim()).filter(d => d),
      domainBlocklist: (elements.blocklist ? elements.blocklist.value : "")
        .split("\n").map(d => d.trim()).filter(d => d),
    };

    // AI extraction
    settings.aiEnabled = elements.aiEnabled ? elements.aiEnabled.checked : false;
    settings.aiServerUrl = elements.aiServer ? elements.aiServer.value.trim() : "http://127.0.0.1:8377";

    // Regex patterns
    if (elements.regexRules && elements.regexRules.value.trim()) {
      try {
        settings.regexPatterns = JSON.parse(elements.regexRules.value.trim());
      } catch {
        elements.saveStatus.textContent = "Invalid regex JSON - fix syntax and try again";
        elements.saveStatus.className = "status error";
        return;
      }
    } else {
      settings.regexPatterns = [];
    }

    // Token handling
    if (rawToken) {
      settings.hfToken = rawToken;
    }
    if (rawToken === "" && elements.hfToken.dataset.hadToken === "true") {
      settings.hfToken = "";
    }

    browser.storage.local.set(settings).then(() => {
      elements.saveStatus.textContent = "Settings saved!";
      elements.saveStatus.className = "status success";
      setTimeout(() => { elements.saveStatus.textContent = ""; }, 3000);
    });
  });

  /* ── Validate HF token ── */
  elements.btnValidateToken.addEventListener("click", async () => {
    const token = elements.hfToken.value.trim();
    if (!token) {
      elements.tokenStatus.textContent = "Enter a token first";
      elements.tokenStatus.className = "status error";
      return;
    }

    elements.tokenStatus.textContent = "Validating...";
    elements.tokenStatus.className = "status";

    try {
      const resp = await fetch("https://huggingface.co/api/whoami", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        elements.tokenStatus.textContent = `Valid! User: ${data.name}`;
        elements.tokenStatus.className = "status success";
      } else if (resp.status === 401) {
        elements.tokenStatus.textContent = "Invalid token - check your HF token";
        elements.tokenStatus.className = "status error";
      } else {
        elements.tokenStatus.textContent = `HF API error (${resp.status}) - token may still be valid`;
        elements.tokenStatus.className = "status error";
      }
    } catch (err) {
      elements.tokenStatus.textContent = "Network error - could not reach HuggingFace";
      elements.tokenStatus.className = "status error";
    }
  });

  /* ── AI Connection Check ── */
  if (elements.btnAICheck) {
    elements.btnAICheck.addEventListener("click", async () => {
      const serverUrl = (elements.aiServer ? elements.aiServer.value : "http://127.0.0.1:8377").trim();
      elements.aiServerStatus.textContent = "Checking...";
      elements.aiServerStatus.className = "status";

      try {
        const resp = await fetch(serverUrl + "/health", { method: "GET" });
        if (resp.ok) {
          const info = await resp.json();
          elements.aiServerStatus.textContent = `Connected! Model: ${info.model || "NuExtract"}, Device: ${info.device || "?"}, GPU: ${info.gpu || "N/A"}`;
          elements.aiServerStatus.className = "status success";
        } else {
          elements.aiServerStatus.textContent = `Server returned status ${resp.status}`;
          elements.aiServerStatus.className = "status error";
        }
      } catch (err) {
        elements.aiServerStatus.textContent = "Cannot connect. Start server with: scrape ai.serve";
        elements.aiServerStatus.className = "status error";
      }
    });
  }

  /* ── Export ── */
  elements.btnExport.addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "EXPORT_DATA", format: elements.format.value });
  });

  /* ── Upload to HF ── */
  elements.btnUploadHF.addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "UPLOAD_HF" });
  });

  /* ── Clear data ── */
  elements.btnClear.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear all scraped data? This cannot be undone.")) {
      browser.runtime.sendMessage({ action: "CLEAR_DATA" });
      elements.dataStats.textContent = "All data cleared.";
    }
  });
})();

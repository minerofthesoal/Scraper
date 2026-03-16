/* ── Options Page Controller v0.6.6 ── */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  /* ── Theme ── */
  const btnTheme = $("#btn-theme");
  if (btnTheme) {
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
  }

  /* ── Safe element helpers ── */
  function getChecked(el) { return el ? el.checked : false; }
  function getVal(el, fallback) { return el ? el.value : (fallback || ""); }
  function setChecked(el, val) { if (el) el.checked = !!val; }
  function setVal(el, val) { if (el) el.value = val; }

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
    rateMax: $("#inp-rate-max"),
    rateWindow: $("#inp-rate-window"),
    rateEnabled: $("#chk-rate-enabled"),
    allowlist: $("#txt-allowlist"),
    blocklist: $("#txt-blocklist"),
    regexRules: $("#txt-regex-rules"),
    aiEnabled: $("#chk-ai-enabled"),
    aiAutoDownload: $("#chk-ai-auto-download"),
    aiServer: $("#inp-ai-server"),
    btnAICheck: $("#btn-ai-check"),
    aiServerStatus: $("#ai-server-status"),
    prettyPrint: $("#chk-pretty-print"),
    sanitizeContent: $("#chk-sanitize-content"),
    validateUrls: $("#chk-validate-urls"),
    cookieDismiss: $("#chk-cookie-dismiss"),
    deobfuscate: $("#chk-deobfuscate"),
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
    "aiEnabled", "aiServerUrl", "aiAutoDownload", "prettyPrint",
    "sanitizeContent", "validateUrls", "cookieDismissEnabled", "deobfuscateEnabled",
  ]).then((cfg) => {
    setChecked(elements.autoStart, cfg.autoStart);
    setChecked(elements.autoScroll, cfg.autoScroll !== false);
    setChecked(elements.autoNext, cfg.autoNext !== false);
    setVal(elements.delay, cfg.scrapeDelay || 1500);
    setVal(elements.maxPages, cfg.maxPages || 200);
    setVal(elements.format, cfg.dataFormat || "jsonl");
    setVal(elements.savePath, cfg.savePath || "webscraper-pro/");
    setChecked(elements.saveLocal, cfg.saveLocal !== false);
    setChecked(elements.downloadImages, cfg.downloadImages);
    setChecked(elements.convertAudio, cfg.convertAudio);
    setVal(elements.hfToken, cfg.hfToken || "");
    if (elements.hfToken) elements.hfToken.dataset.hadToken = cfg.hfToken ? "true" : "false";
    setVal(elements.hfRepo, cfg.hfRepoId || "");
    setChecked(elements.hfCreate, cfg.hfCreateRepo !== false);
    setChecked(elements.hfPrivate, cfg.hfPrivate);
    setChecked(elements.hfAutoUpload, cfg.hfAutoUpload);
    setVal(elements.hfOwnerRepo, cfg.hfOwnerRepo || "");
    setChecked(elements.autoCite, cfg.autoCite !== false);
    setChecked(elements.citeReadme, cfg.citeReadme !== false);
    setChecked(elements.citeLinks, cfg.citeLinks !== false);

    setChecked($("#chk-upload-owner"), cfg.uploadToOwner);
    setChecked($("#chk-scrape-js"), cfg.scrapeJS);
    setVal($("#sel-citation-format"), cfg.citationFormat || "mla");
    setChecked($("#chk-respect-robots"), cfg.respectRobots !== false);
    setVal($("#inp-min-text"), cfg.minTextLength || 3);

    // Rate limiting
    const rateConfig = cfg.rateLimitConfig || {};
    const rateDefaults = rateConfig.defaults || {};
    setVal(elements.rateMax, rateDefaults.maxRequests || 5);
    setVal(elements.rateWindow, (rateDefaults.windowMs || 10000) / 1000);
    setChecked(elements.rateEnabled, cfg.rateEnabled !== false);

    // Domain filtering
    if (elements.allowlist) elements.allowlist.value = (cfg.domainAllowlist || []).join("\n");
    if (elements.blocklist) elements.blocklist.value = (cfg.domainBlocklist || []).join("\n");

    // Regex rules
    if (elements.regexRules && cfg.regexPatterns) {
      elements.regexRules.value = JSON.stringify(cfg.regexPatterns, null, 2);
    }

    // AI extraction
    setChecked(elements.aiEnabled, cfg.aiEnabled);
    setChecked(elements.aiAutoDownload, cfg.aiAutoDownload);
    setVal(elements.aiServer, cfg.aiServerUrl || "http://127.0.0.1:8377");

    // Pretty-print
    setChecked(elements.prettyPrint, cfg.prettyPrint);

    // Security & Privacy
    setChecked(elements.sanitizeContent, cfg.sanitizeContent !== false);
    setChecked(elements.validateUrls, cfg.validateUrls !== false);
    setChecked(elements.cookieDismiss, cfg.cookieDismissEnabled);
    setChecked(elements.deobfuscate, cfg.deobfuscateEnabled);
  }).catch((err) => {
    console.error("[WSP] Failed to load settings:", err);
  });

  /* ── Load stats ── */
  browser.runtime.sendMessage({ action: "GET_STATS" }).then((resp) => {
    if (resp && resp.stats && elements.dataStats) {
      const s = resp.stats;
      elements.dataStats.innerHTML = `
        <strong>Session Data:</strong> ${resp.recordCount} records |
        Words: ${s.words || 0} | Pages: ${s.pages} | Images: ${s.images} |
        Links: ${s.links} | Audio: ${s.audio}
      `;
    }
  }).catch(() => {
    if (elements.dataStats) elements.dataStats.textContent = "No active session data.";
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
  if (elements.btnSave) {
    elements.btnSave.addEventListener("click", () => {
      try {
        const repoId = parseRepoId(getVal(elements.hfRepo));
        setVal(elements.hfRepo, repoId);

        const rawToken = getVal(elements.hfToken).trim();

        const settings = {
          autoStart: getChecked(elements.autoStart),
          autoScroll: getChecked(elements.autoScroll),
          autoNext: getChecked(elements.autoNext),
          scrapeDelay: parseInt(getVal(elements.delay, "1500"), 10) || 1500,
          maxPages: parseInt(getVal(elements.maxPages, "200"), 10) || 200,
          dataFormat: getVal(elements.format, "jsonl"),
          savePath: getVal(elements.savePath, "webscraper-pro/"),
          saveLocal: getChecked(elements.saveLocal),
          downloadImages: getChecked(elements.downloadImages),
          convertAudio: getChecked(elements.convertAudio),
          hfRepoId: repoId,
          hfCreateRepo: getChecked(elements.hfCreate),
          hfPrivate: getChecked(elements.hfPrivate),
          hfAutoUpload: getChecked(elements.hfAutoUpload),
          hfOwnerRepo: getVal(elements.hfOwnerRepo),
          uploadToOwner: getChecked($("#chk-upload-owner")),
          autoCite: getChecked(elements.autoCite),
          citeReadme: getChecked(elements.citeReadme),
          citeLinks: getChecked(elements.citeLinks),
          scrapeJS: getChecked($("#chk-scrape-js")),
          citationFormat: getVal($("#sel-citation-format"), "mla"),
          respectRobots: getChecked($("#chk-respect-robots")),
          minTextLength: parseInt(getVal($("#inp-min-text"), "3"), 10) || 3,
          // Rate limiting
          rateEnabled: getChecked(elements.rateEnabled),
          rateLimitConfig: {
            defaults: {
              maxRequests: parseInt(getVal(elements.rateMax, "5"), 10) || 5,
              windowMs: (parseInt(getVal(elements.rateWindow, "10"), 10) || 10) * 1000,
            }
          },
          // Domain filtering
          domainAllowlist: getVal(elements.allowlist).split("\n").map(d => d.trim()).filter(d => d),
          domainBlocklist: getVal(elements.blocklist).split("\n").map(d => d.trim()).filter(d => d),
          // AI extraction
          aiEnabled: getChecked(elements.aiEnabled),
          aiAutoDownload: getChecked(elements.aiAutoDownload),
          aiServerUrl: getVal(elements.aiServer, "http://127.0.0.1:8377").trim(),
          // Pretty-print
          prettyPrint: getChecked(elements.prettyPrint),
          // Security & Privacy
          sanitizeContent: getChecked(elements.sanitizeContent),
          validateUrls: getChecked(elements.validateUrls),
          cookieDismissEnabled: getChecked(elements.cookieDismiss),
          deobfuscateEnabled: getChecked(elements.deobfuscate),
        };

        // Regex patterns
        const regexVal = getVal(elements.regexRules).trim();
        if (regexVal) {
          try {
            settings.regexPatterns = JSON.parse(regexVal);
          } catch {
            if (elements.saveStatus) {
              elements.saveStatus.textContent = "Invalid regex JSON - fix syntax and try again";
              elements.saveStatus.className = "status error";
            }
            return;
          }
        } else {
          settings.regexPatterns = [];
        }

        // Token handling
        if (rawToken) {
          settings.hfToken = rawToken;
        } else if (elements.hfToken && elements.hfToken.dataset.hadToken === "true") {
          settings.hfToken = "";
        }

        browser.storage.local.set(settings).then(() => {
          if (elements.saveStatus) {
            elements.saveStatus.textContent = "Settings saved!";
            elements.saveStatus.className = "status success";
            setTimeout(() => { elements.saveStatus.textContent = ""; }, 3000);
          }
        }).catch((err) => {
          console.error("[WSP] Save failed:", err);
          if (elements.saveStatus) {
            elements.saveStatus.textContent = "Save failed: " + err.message;
            elements.saveStatus.className = "status error";
          }
        });
      } catch (err) {
        console.error("[WSP] Save error:", err);
        if (elements.saveStatus) {
          elements.saveStatus.textContent = "Error: " + err.message;
          elements.saveStatus.className = "status error";
        }
      }
    });
  }

  /* ── Validate HF token ── */
  if (elements.btnValidateToken) {
    elements.btnValidateToken.addEventListener("click", async () => {
      const token = getVal(elements.hfToken).trim();
      if (!token) {
        if (elements.tokenStatus) {
          elements.tokenStatus.textContent = "Enter a token first";
          elements.tokenStatus.className = "status error";
        }
        return;
      }

      if (elements.tokenStatus) {
        elements.tokenStatus.textContent = "Validating...";
        elements.tokenStatus.className = "status";
      }

      try {
        /* Try whoami-v2 first, then whoami, then datasets listing.
         * IMPORTANT: credentials: "omit" prevents browser cookies from leaking
         * the logged-in HF session — we want to validate the TOKEN, not cookies. */
        let data = null;
        let validated = false;

        for (const endpoint of [
          "https://huggingface.co/api/whoami-v2",
          "https://huggingface.co/api/whoami"
        ]) {
          try {
            const resp = await fetch(endpoint, {
              headers: { Authorization: `Bearer ${token}` },
              credentials: "omit"
            });
            if (resp.ok) {
              data = await resp.json();
              validated = true;
              break;
            }
            if (resp.status === 401) {
              if (elements.tokenStatus) {
                elements.tokenStatus.textContent = "Invalid token - check your HF token at huggingface.co/settings/tokens";
                elements.tokenStatus.className = "status error";
              }
              return;
            }
          } catch { /* network error on this endpoint, try next */ }
        }

        if (!validated) {
          /* whoami endpoints returned 404/other - try datasets listing as final check */
          try {
            const resp = await fetch("https://huggingface.co/api/datasets?author=me&limit=1", {
              headers: { Authorization: `Bearer ${token}` },
              credentials: "omit"
            });
            if (resp.ok) {
              validated = true;
              data = { name: "verified-user" };
            } else if (resp.status === 401) {
              if (elements.tokenStatus) {
                elements.tokenStatus.textContent = "Invalid token - check your HF token at huggingface.co/settings/tokens";
                elements.tokenStatus.className = "status error";
              }
              return;
            }
          } catch { /* network error */ }
        }

        if (elements.tokenStatus) {
          if (validated && data) {
            const username = data.user || data.name || data.fullname || "unknown";
            elements.tokenStatus.textContent = `Valid! User: ${username}`;
            elements.tokenStatus.className = "status success";
          } else {
            elements.tokenStatus.textContent = "Could not verify token - it may still work for uploads";
            elements.tokenStatus.className = "status success";
          }
        }
      } catch (err) {
        if (elements.tokenStatus) {
          elements.tokenStatus.textContent = "Network error - could not reach HuggingFace";
          elements.tokenStatus.className = "status error";
        }
      }
    });
  }

  /* ── AI Connection Check ── */
  if (elements.btnAICheck) {
    elements.btnAICheck.addEventListener("click", async () => {
      const serverUrl = getVal(elements.aiServer, "http://127.0.0.1:8377").trim();
      if (elements.aiServerStatus) {
        elements.aiServerStatus.textContent = "Checking...";
        elements.aiServerStatus.className = "status";
      }

      try {
        const resp = await fetch(serverUrl + "/health", { method: "GET" });
        if (resp.ok) {
          const info = await resp.json();
          if (elements.aiServerStatus) {
            elements.aiServerStatus.textContent = `Connected! Model: ${info.model || "NuExtract"}, Device: ${info.device || "?"}, GPU: ${info.gpu || "N/A"}`;
            elements.aiServerStatus.className = "status success";
          }
        } else {
          if (elements.aiServerStatus) {
            elements.aiServerStatus.textContent = `Server returned status ${resp.status}`;
            elements.aiServerStatus.className = "status error";
          }
        }
      } catch (err) {
        if (elements.aiServerStatus) {
          elements.aiServerStatus.textContent = "Cannot connect. Start server with: scrape ai.serve";
          elements.aiServerStatus.className = "status error";
        }
      }
    });
  }

  /* ── Export ── */
  if (elements.btnExport) {
    elements.btnExport.addEventListener("click", () => {
      browser.runtime.sendMessage({ action: "EXPORT_DATA", format: getVal(elements.format, "jsonl") });
    });
  }

  /* ── Upload to HF ── */
  if (elements.btnUploadHF) {
    elements.btnUploadHF.addEventListener("click", () => {
      browser.runtime.sendMessage({ action: "UPLOAD_HF" });
    });
  }

  /* ── Clear data ── */
  if (elements.btnClear) {
    elements.btnClear.addEventListener("click", () => {
      if (confirm("Are you sure you want to clear all scraped data? This cannot be undone.")) {
        browser.runtime.sendMessage({ action: "CLEAR_DATA" });
        if (elements.dataStats) elements.dataStats.textContent = "All data cleared.";
      }
    });
  }
})();

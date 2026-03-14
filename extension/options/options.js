/* ── Options Page Controller ── */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

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
  };

  /* ── Load settings ── */
  browser.storage.local.get([
    "autoStart", "autoScroll", "autoNext", "scrapeDelay", "maxPages",
    "dataFormat", "savePath", "saveLocal", "downloadImages", "convertAudio",
    "hfToken", "hfRepoId", "hfCreateRepo", "hfPrivate", "hfAutoUpload", "hfOwnerRepo",
    "autoCite", "citeReadme", "citeLinks", "uploadToOwner",
    "scrapeJS", "citationFormat", "respectRobots", "minTextLength",
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
    const uploadOwnerEl = document.getElementById("chk-upload-owner");
    if (uploadOwnerEl) uploadOwnerEl.checked = !!cfg.uploadToOwner;
    const scrapeJSEl = document.getElementById("chk-scrape-js");
    if (scrapeJSEl) scrapeJSEl.checked = !!cfg.scrapeJS;
    const citeFmtEl = document.getElementById("sel-citation-format");
    if (citeFmtEl) citeFmtEl.value = cfg.citationFormat || "mla";
    const robotsEl = document.getElementById("chk-respect-robots");
    if (robotsEl) robotsEl.checked = cfg.respectRobots !== false;
    const minTextEl = document.getElementById("inp-min-text");
    if (minTextEl) minTextEl.value = cfg.minTextLength || 3;
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
    // Handle full URLs like https://huggingface.co/datasets/user/name
    const urlMatch = input.match(/huggingface\.co\/datasets\/([^/]+\/[^/\s]+)/);
    if (urlMatch) return urlMatch[1];
    // Handle user/name format
    if (input.includes("/")) return input.trim();
    return input.trim();
  }

  /* ── Save ── */
  elements.btnSave.addEventListener("click", () => {
    const repoId = parseRepoId(elements.hfRepo.value);
    elements.hfRepo.value = repoId; // normalize

    // Get the raw token value - preserve exactly as entered, only trim whitespace
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
      uploadToOwner: document.getElementById("chk-upload-owner") ? document.getElementById("chk-upload-owner").checked : false,
      autoCite: elements.autoCite.checked,
      citeReadme: elements.citeReadme.checked,
      citeLinks: elements.citeLinks.checked,
      scrapeJS: document.getElementById("chk-scrape-js") ? document.getElementById("chk-scrape-js").checked : false,
      citationFormat: document.getElementById("sel-citation-format") ? document.getElementById("sel-citation-format").value : "mla",
      respectRobots: document.getElementById("chk-respect-robots") ? document.getElementById("chk-respect-robots").checked : true,
      minTextLength: parseInt((document.getElementById("inp-min-text") || {}).value || "3", 10),
    };

    // Only update token if user actually typed something (not the masked *** from password field)
    // This prevents the save from overwriting a valid token with empty/masked value
    if (rawToken) {
      settings.hfToken = rawToken;
    }
    // If token field is empty, explicitly check: did user clear it on purpose?
    // We preserve existing token unless user deliberately empties the field
    if (rawToken === "" && elements.hfToken.dataset.hadToken === "true") {
      // User cleared the token field - respect that
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
        // Token is valid - make sure it stays saved as-is (don't trim/modify)
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

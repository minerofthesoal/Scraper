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
    "autoCite", "citeReadme", "citeLinks",
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
    elements.hfRepo.value = cfg.hfRepoId || "";
    elements.hfCreate.checked = cfg.hfCreateRepo !== false;
    elements.hfPrivate.checked = !!cfg.hfPrivate;
    elements.hfAutoUpload.checked = !!cfg.hfAutoUpload;
    elements.hfOwnerRepo.value = cfg.hfOwnerRepo || "";
    elements.autoCite.checked = cfg.autoCite !== false;
    elements.citeReadme.checked = cfg.citeReadme !== false;
    elements.citeLinks.checked = cfg.citeLinks !== false;
  });

  /* ── Load stats ── */
  browser.runtime.sendMessage({ action: "GET_STATS" }).then((resp) => {
    if (resp && resp.stats) {
      const s = resp.stats;
      elements.dataStats.innerHTML = `
        <strong>Session Data:</strong> ${resp.recordCount} records |
        Pages: ${s.pages} | Texts: ${s.texts} | Images: ${s.images} |
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

    browser.storage.local.set({
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
      hfToken: elements.hfToken.value,
      hfRepoId: repoId,
      hfCreateRepo: elements.hfCreate.checked,
      hfPrivate: elements.hfPrivate.checked,
      hfAutoUpload: elements.hfAutoUpload.checked,
      hfOwnerRepo: elements.hfOwnerRepo.value,
      autoCite: elements.autoCite.checked,
      citeReadme: elements.citeReadme.checked,
      citeLinks: elements.citeLinks.checked,
    }).then(() => {
      elements.saveStatus.textContent = "Settings saved!";
      elements.saveStatus.className = "status success";
      setTimeout(() => { elements.saveStatus.textContent = ""; }, 3000);
    });
  });

  /* ── Validate HF token ── */
  elements.btnValidateToken.addEventListener("click", async () => {
    const token = elements.hfToken.value;
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
      } else {
        elements.tokenStatus.textContent = "Invalid token";
        elements.tokenStatus.className = "status error";
      }
    } catch (err) {
      elements.tokenStatus.textContent = "Network error";
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

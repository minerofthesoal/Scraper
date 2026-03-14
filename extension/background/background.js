/* ── WebScraper Pro Background Script ── */
/* eslint-env browser, webextensions */
(function () {
  "use strict";

  /* ── State ── */
  let scrapedRecords = [];
  let citations = [];
  let sessionStats = { words: 0, pages: 0, images: 0, links: 0, audio: 0 };

  // Load persisted data on startup
  browser.storage.local.get(["scrapedRecords", "citations", "sessionStats"]).then((data) => {
    if (data.scrapedRecords) scrapedRecords = data.scrapedRecords;
    if (data.citations) citations = data.citations;
    if (data.sessionStats) sessionStats = data.sessionStats;
  });

  /* ── Save state ── */
  function persistState() {
    browser.storage.local.set({ scrapedRecords, citations, sessionStats });
  }

  /* ── Broadcast stats to popup ── */
  function broadcastStats() {
    browser.runtime.sendMessage({ action: "STATS_UPDATE", stats: sessionStats }).catch(() => {});
  }

  /* ── Message listener ── */
  browser.runtime.onMessage.addListener((msg, sender) => {
    switch (msg.action) {
      case "SCRAPED_DATA":
        handleScrapedData(msg.data);
        break;

      case "EXPORT_DATA":
        exportData(msg.format || "jsonl");
        break;

      case "UPLOAD_HF":
        uploadToHF();
        break;

      case "AUTO_NAVIGATE":
        handleAutoNavigate(msg.url, sender.tab);
        break;

      case "STOP_ALL":
        stopAll();
        break;

      case "CLEAR_DATA":
        clearData();
        break;

      case "GET_STATS":
        return Promise.resolve({ stats: sessionStats, recordCount: scrapedRecords.length });

      case "GET_ALL_DATA":
        return Promise.resolve({ records: scrapedRecords, citations, stats: sessionStats });

      case "STATUS_CHANGE":
        // Forward to popup
        browser.runtime.sendMessage(msg).catch(() => {});
        break;
    }
  });

  /* ── Handle scraped data ── */
  function handleScrapedData(data) {
    const meta = data.meta || {};

    // Generate citation (MLA + APA)
    const citation = WSP_Citation.generateDatasetCitation(meta);
    const existingIdx = citations.findIndex((c) => c.url === citation.url);
    if (existingIdx === -1) {
      citations.push(citation);
    } else {
      // Update existing citation if new one has more info
      const existing = citations[existingIdx];
      if (!existing.apa && citation.apa) existing.apa = citation.apa;
      if (!existing.license && citation.license) existing.license = citation.license;
      if (!existing.description && citation.description) existing.description = citation.description;
    }

    // Process text records
    if (data.texts) {
      for (const t of data.texts) {
        scrapedRecords.push({
          id: WSP_Utils.uid(),
          type: "text",
          text: t.text,
          tag: t.tag,
          source_url: meta.url,
          source_title: meta.title,
          author: meta.author || "Unknown",
          site_name: meta.siteName || WSP_Utils.extractDomain(meta.url),
          scraped_at: data.scrapedAt,
          citation_mla: citation.mla,
          citation_apa: citation.apa || "",
        });
      }
      sessionStats.words += data.totalWords || data.texts.reduce((sum, t) => sum + (t.text || "").split(/\s+/).length, 0);
    }

    // Process images
    if (data.images) {
      for (const img of data.images) {
        scrapedRecords.push({
          id: WSP_Utils.uid(),
          type: "image",
          src: img.src,
          alt: img.alt,
          width: img.width,
          height: img.height,
          source_url: meta.url,
          source_title: meta.title,
          author: meta.author || "Unknown",
          scraped_at: data.scrapedAt,
          citation_mla: citation.mla,
          citation_apa: citation.apa || "",
        });
      }
      sessionStats.images += data.images.length;
    }

    // Process links
    if (data.links) {
      for (const link of data.links) {
        scrapedRecords.push({
          id: WSP_Utils.uid(),
          type: "link",
          href: link.href,
          text: link.text,
          source_url: meta.url,
          source_title: meta.title,
          scraped_at: data.scrapedAt,
        });
      }
      sessionStats.links += data.links.length;
    }

    // Process audio
    if (data.audio) {
      for (const a of data.audio) {
        scrapedRecords.push({
          id: WSP_Utils.uid(),
          type: "audio",
          src: a.src,
          media_type: a.type,
          source_url: meta.url,
          source_title: meta.title,
          scraped_at: data.scrapedAt,
          citation_mla: citation.mla,
          citation_apa: citation.apa || "",
        });
      }
      sessionStats.audio += data.audio.length;
    }

    sessionStats.pages += 1;
    persistState();
    broadcastStats();
  }

  /* ── Export data ── */
  function exportData(format) {
    if (scrapedRecords.length === 0) {
      browser.notifications.create({
        type: "basic",
        title: "WebScraper Pro",
        message: "No data to export. Start scraping first!",
      });
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // Separate by type
    const texts = scrapedRecords.filter((r) => r.type === "text");
    const images = scrapedRecords.filter((r) => r.type === "image");
    const links = scrapedRecords.filter((r) => r.type === "link");
    const audioRecs = scrapedRecords.filter((r) => r.type === "audio");

    if (format === "jsonl") {
      if (texts.length > 0) {
        WSP_Utils.downloadText(WSP_Utils.toJSONL(texts), `webscraper-pro/data/text_data_${timestamp}.jsonl`);
      }
      if (images.length > 0) {
        WSP_Utils.downloadText(WSP_Utils.toJSONL(images), `webscraper-pro/data/images_${timestamp}.jsonl`);
      }
      if (links.length > 0) {
        WSP_Utils.downloadText(WSP_Utils.toJSONL(links), `webscraper-pro/data/links_${timestamp}.jsonl`);
      }
      if (audioRecs.length > 0) {
        WSP_Utils.downloadText(WSP_Utils.toJSONL(audioRecs), `webscraper-pro/data/audio_${timestamp}.jsonl`);
      }
      // Citations
      WSP_Utils.downloadText(WSP_Utils.toJSONL(citations), `webscraper-pro/data/citations_${timestamp}.jsonl`);
    } else if (format === "json") {
      WSP_Utils.downloadText(JSON.stringify({ texts, images, links, audio: audioRecs, citations }, null, 2),
        `webscraper-pro/data/full_export_${timestamp}.json`);
    } else if (format === "csv") {
      if (texts.length > 0) {
        WSP_Utils.downloadText(WSP_Utils.toCSV(texts), `webscraper-pro/data/text_data_${timestamp}.csv`, "text/csv");
      }
    }

    browser.notifications.create({
      type: "basic",
      title: "WebScraper Pro",
      message: `Exported ${scrapedRecords.length} records in ${format.toUpperCase()} format.`,
    });
  }

  const OWNER_HF_REPO = "ray0rf1re/Site.scraped";

  /* ── Upload to HuggingFace ── */
  async function uploadToHF() {
    const cfg = await browser.storage.local.get(["hfToken", "hfRepoId", "hfCreateRepo", "hfPrivate",
      "autoScroll", "autoNext", "dataFormat", "hfOwnerRepo", "uploadToOwner"]);

    if (!cfg.hfToken) {
      browser.notifications.create({
        type: "basic",
        title: "WebScraper Pro",
        message: "HuggingFace token not configured. Open settings to add it.",
      });
      return;
    }

    if (!cfg.hfRepoId) {
      browser.notifications.create({
        type: "basic",
        title: "WebScraper Pro",
        message: "HuggingFace repo ID not configured. Open settings to add it.",
      });
      return;
    }

    try {
      // Validate token
      await WSP_HFUpload.validateToken(cfg.hfToken);

      // Create repo if needed
      if (cfg.hfCreateRepo) {
        await WSP_HFUpload.createRepo(cfg.hfToken, cfg.hfRepoId, !!cfg.hfPrivate);
      }

      // Prepare files
      const texts = scrapedRecords.filter((r) => r.type === "text");
      const images = scrapedRecords.filter((r) => r.type === "image");
      const links = scrapedRecords.filter((r) => r.type === "link");
      const audioRecs = scrapedRecords.filter((r) => r.type === "audio");

      const files = [];

      // README
      const readme = WSP_HFUpload.generateReadme(cfg, citations, sessionStats);
      files.push({ path: "README.md", content: readme });

      // Data files
      if (texts.length > 0) {
        files.push({ path: "data/text_data.jsonl", content: WSP_Utils.toJSONL(texts) });
      }
      if (images.length > 0) {
        files.push({ path: "data/images.jsonl", content: WSP_Utils.toJSONL(images) });
      }
      if (links.length > 0) {
        files.push({ path: "data/links.jsonl", content: WSP_Utils.toJSONL(links) });
      }
      if (audioRecs.length > 0) {
        files.push({ path: "data/audio.jsonl", content: WSP_Utils.toJSONL(audioRecs) });
      }
      // Citations
      files.push({ path: "data/citations.jsonl", content: WSP_Utils.toJSONL(citations) });

      // Upload README first, then data
      await WSP_HFUpload.commitFiles(cfg.hfToken, cfg.hfRepoId, files,
        `Update dataset - ${sessionStats.pages} pages scraped`);

      browser.notifications.create({
        type: "basic",
        title: "WebScraper Pro",
        message: `Uploaded ${scrapedRecords.length} records to ${cfg.hfRepoId}!`,
      });

      // Also upload to owner repo if configured
      if (cfg.uploadToOwner) {
        try {
          await WSP_HFUpload.commitFiles(cfg.hfToken, OWNER_HF_REPO, files,
            `Community upload - ${sessionStats.pages} pages`);
          browser.notifications.create({
            type: "basic",
            title: "WebScraper Pro",
            message: `Also uploaded to shared repo: ${OWNER_HF_REPO}`,
          });
        } catch (ownerErr) {
          // Silently fail - user may not have write access
        }
      }
    } catch (err) {
      browser.notifications.create({
        type: "basic",
        title: "WebScraper Pro - Error",
        message: `Upload failed: ${err.message}`,
      });
    }
  }

  /* ── Auto-navigate for pagination ── */
  function handleAutoNavigate(url, tab) {
    if (!tab) return;
    browser.tabs.update(tab.id, { url }).then(() => {
      // Wait for page load then continue auto-scan
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === "complete") {
          browser.webNavigation.onCompleted.removeListener(listener);
          setTimeout(() => {
            browser.tabs.sendMessage(tab.id, { action: "CONTINUE_AUTO_SCAN" }).catch(() => {});
          }, 1500);
        }
      };
      browser.webNavigation.onCompleted.addListener(listener);
    });
  }

  /* ── Stop everything ── */
  function stopAll() {
    browser.storage.local.set({ scrapeActive: false });
    // Notify all tabs
    browser.tabs.query({}).then((tabs) => {
      for (const tab of tabs) {
        browser.tabs.sendMessage(tab.id, { action: "STOP_SCRAPE" }).catch(() => {});
      }
    });
  }

  /* ── Clear data ── */
  function clearData() {
    scrapedRecords = [];
    citations = [];
    sessionStats = { words: 0, pages: 0, images: 0, links: 0, audio: 0 };
    persistState();
    broadcastStats();
  }

  /* ── Context menu ── */
  browser.contextMenus.create({
    id: "wsp-scrape-selection",
    title: "Scrape Selected Area",
    contexts: ["page", "selection", "image", "link"],
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "wsp-scrape-selection") {
      browser.tabs.sendMessage(tab.id, { action: "START_SELECTION" });
    }
  });

})();

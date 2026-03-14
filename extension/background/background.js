/* ── WebScraper Pro Background Script v0.6b ── */
/* eslint-env browser, webextensions */
(function () {
  "use strict";

  /* ── State ── */
  let scrapedRecords = [];
  let citations = [];
  let sessionStats = { words: 0, pages: 0, images: 0, links: 0, audio: 0 };
  let lastUploadRecordCount = 0;

  // Load persisted data on startup
  browser.storage.local.get(["scrapedRecords", "citations", "sessionStats", "lastUploadRecordCount"]).then((data) => {
    if (data.scrapedRecords) scrapedRecords = data.scrapedRecords;
    if (data.citations) citations = data.citations;
    if (data.sessionStats) sessionStats = data.sessionStats;
    if (data.lastUploadRecordCount) lastUploadRecordCount = data.lastUploadRecordCount;
  });

  /* ── Save state ── */
  function persistState() {
    browser.storage.local.set({ scrapedRecords, citations, sessionStats, lastUploadRecordCount });
  }

  /* ── Broadcast stats to popup ── */
  function broadcastStats() {
    browser.runtime.sendMessage({
      action: "STATS_UPDATE",
      stats: sessionStats,
      recordCount: scrapedRecords.length,
    }).catch(() => {});
  }

  /* ── Notify helper ── */
  function notify(title, message) {
    browser.notifications.create({
      type: "basic",
      title: title || "WebScraper Pro",
      message: String(message),
    });
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
        browser.runtime.sendMessage(msg).catch(() => {});
        break;

      // ── Queue actions ──
      case "QUEUE_ADD":
        if (typeof WSP_Queue !== "undefined") WSP_Queue.add(msg.urls || []);
        break;

      case "QUEUE_START":
        if (typeof WSP_Queue !== "undefined") WSP_Queue.start();
        break;

      case "QUEUE_STOP":
        if (typeof WSP_Queue !== "undefined") WSP_Queue.stop();
        break;

      case "QUEUE_CLEAR":
        if (typeof WSP_Queue !== "undefined") WSP_Queue.clear();
        break;

      case "QUEUE_GET":
        if (typeof WSP_Queue !== "undefined") {
          return Promise.resolve({ queue: WSP_Queue.getAll(), stats: WSP_Queue.stats() });
        }
        return Promise.resolve({ queue: [], stats: {} });

      // ── Session actions ──
      case "SESSION_SAVE":
        if (typeof WSP_Session !== "undefined") {
          WSP_Session.save(msg.name).then(() => notify("WebScraper Pro", `Session "${msg.name}" saved`));
        }
        break;

      case "SESSION_LIST":
        if (typeof WSP_Session !== "undefined") {
          return WSP_Session.list().then(sessions => ({ sessions }));
        }
        return Promise.resolve({ sessions: [] });

      case "SESSION_RESTORE":
        if (typeof WSP_Session !== "undefined") {
          WSP_Session.restore(msg.name).then(session => {
            scrapedRecords = session.records;
            citations = session.citations;
            sessionStats = session.stats;
            lastUploadRecordCount = session.lastUploadRecordCount;
            broadcastStats();
            notify("WebScraper Pro", `Session "${msg.name}" restored (${session.records.length} records)`);
          });
        }
        break;

      case "SESSION_MERGE":
        if (typeof WSP_Session !== "undefined") {
          WSP_Session.merge(msg.name).then(result => {
            // Reload from storage after merge
            browser.storage.local.get(["scrapedRecords", "citations", "sessionStats"]).then(data => {
              scrapedRecords = data.scrapedRecords || [];
              citations = data.citations || [];
              sessionStats = data.sessionStats || sessionStats;
              broadcastStats();
              notify("WebScraper Pro", `Merged "${msg.name}": now ${result.recordCount} records`);
            });
          });
        }
        break;

      case "SESSION_DELETE":
        if (typeof WSP_Session !== "undefined") {
          WSP_Session.remove(msg.name).then(() => notify("WebScraper Pro", `Session "${msg.name}" deleted`));
        }
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
      const existing = citations[existingIdx];
      if (!existing.apa && citation.apa) existing.apa = citation.apa;
      if (!existing.license && citation.license) existing.license = citation.license;
      if (!existing.description && citation.description) existing.description = citation.description;
    }

    // Content fingerprinting for cross-session dedup
    const seenFingerprints = new Set(scrapedRecords.map(r => r._fp).filter(Boolean));

    // Process text records
    if (data.texts) {
      for (const t of data.texts) {
        const fp = _fingerprint(t.text);
        if (seenFingerprints.has(fp)) continue;
        seenFingerprints.add(fp);

        scrapedRecords.push({
          id: WSP_Utils.uid(),
          _fp: fp,
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
        const fp = _fingerprint(img.src);
        if (seenFingerprints.has(fp)) continue;
        seenFingerprints.add(fp);

        scrapedRecords.push({
          id: WSP_Utils.uid(),
          _fp: fp,
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
        const fp = _fingerprint(link.href);
        if (seenFingerprints.has(fp)) continue;
        seenFingerprints.add(fp);

        scrapedRecords.push({
          id: WSP_Utils.uid(),
          _fp: fp,
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
        const fp = _fingerprint(a.src);
        if (seenFingerprints.has(fp)) continue;
        seenFingerprints.add(fp);

        scrapedRecords.push({
          id: WSP_Utils.uid(),
          _fp: fp,
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

    // Process smart extract article data
    if (data.article) {
      const fp = _fingerprint(data.article.fullText);
      if (!seenFingerprints.has(fp)) {
        seenFingerprints.add(fp);
        scrapedRecords.push({
          id: WSP_Utils.uid(),
          _fp: fp,
          type: "text",
          text: data.article.fullText,
          tag: "article",
          source_url: meta.url,
          source_title: meta.title,
          author: meta.author || "Unknown",
          site_name: meta.siteName || WSP_Utils.extractDomain(meta.url),
          scraped_at: data.scrapedAt,
          citation_mla: citation.mla,
          citation_apa: citation.apa || "",
          headings: data.article.headings,
        });
        sessionStats.words += data.article.wordCount || 0;
      }
    }

    sessionStats.pages += 1;
    persistState();
    broadcastStats();
  }

  /* ── Simple content fingerprint for dedup ── */
  function _fingerprint(str) {
    if (!str) return null;
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
    }
    return hash.toString(36);
  }

  /* ── Export data ── */
  function exportData(format) {
    if (scrapedRecords.length === 0) {
      notify("WebScraper Pro", "No data to export. Start scraping first!");
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const clean = (r) => { const c = { ...r }; delete c._fp; return c; };
    const texts = scrapedRecords.filter((r) => r.type === "text").map(clean);
    const images = scrapedRecords.filter((r) => r.type === "image").map(clean);
    const links = scrapedRecords.filter((r) => r.type === "link").map(clean);
    const audioRecs = scrapedRecords.filter((r) => r.type === "audio").map(clean);

    if (format === "jsonl") {
      if (texts.length > 0) WSP_Utils.downloadText(WSP_Utils.toJSONL(texts), `webscraper-pro/data/text_data_${timestamp}.jsonl`);
      if (images.length > 0) WSP_Utils.downloadText(WSP_Utils.toJSONL(images), `webscraper-pro/data/images_${timestamp}.jsonl`);
      if (links.length > 0) WSP_Utils.downloadText(WSP_Utils.toJSONL(links), `webscraper-pro/data/links_${timestamp}.jsonl`);
      if (audioRecs.length > 0) WSP_Utils.downloadText(WSP_Utils.toJSONL(audioRecs), `webscraper-pro/data/audio_${timestamp}.jsonl`);
      WSP_Utils.downloadText(WSP_Utils.toJSONL(citations), `webscraper-pro/data/citations_${timestamp}.jsonl`);
    } else if (format === "json") {
      WSP_Utils.downloadText(JSON.stringify({ texts, images, links, audio: audioRecs, citations }, null, 2),
        `webscraper-pro/data/full_export_${timestamp}.json`);
    } else if (format === "csv") {
      if (texts.length > 0) WSP_Utils.downloadText(WSP_Utils.toCSV(texts), `webscraper-pro/data/text_data_${timestamp}.csv`, "text/csv");
      if (images.length > 0) WSP_Utils.downloadText(WSP_Utils.toCSV(images), `webscraper-pro/data/images_${timestamp}.csv`, "text/csv");
      if (links.length > 0) WSP_Utils.downloadText(WSP_Utils.toCSV(links), `webscraper-pro/data/links_${timestamp}.csv`, "text/csv");
    } else if (format === "xml") {
      const xml = toXML(texts, images, links, audioRecs, citations);
      WSP_Utils.downloadText(xml, `webscraper-pro/data/export_${timestamp}.xml`, "application/xml");
    }

    notify("WebScraper Pro", `Exported ${scrapedRecords.length} records in ${format.toUpperCase()} format.`);
  }

  /* ── XML export ── */
  function toXML(texts, images, links, audio, citations) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<dataset>\n  <metadata>\n';
    xml += `    <generator>WebScraper Pro v0.6b</generator>\n`;
    xml += `    <exported>${new Date().toISOString()}</exported>\n`;
    xml += `    <stats words="${sessionStats.words}" pages="${sessionStats.pages}" images="${sessionStats.images}" links="${sessionStats.links}" audio="${sessionStats.audio}"/>\n`;
    xml += '  </metadata>\n';

    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    if (texts.length > 0) {
      xml += '  <texts>\n';
      for (const t of texts) {
        xml += `    <text id="${esc(t.id)}" tag="${esc(t.tag)}" source="${esc(t.source_url)}" author="${esc(t.author)}" scraped="${esc(t.scraped_at)}">\n`;
        xml += `      <content>${esc(t.text)}</content>\n`;
        xml += `      <citation format="mla">${esc(t.citation_mla)}</citation>\n`;
        if (t.citation_apa) xml += `      <citation format="apa">${esc(t.citation_apa)}</citation>\n`;
        xml += '    </text>\n';
      }
      xml += '  </texts>\n';
    }

    if (images.length > 0) {
      xml += '  <images>\n';
      for (const img of images) {
        xml += `    <image id="${esc(img.id)}" src="${esc(img.src)}" alt="${esc(img.alt)}" width="${img.width || 0}" height="${img.height || 0}" source="${esc(img.source_url)}"/>\n`;
      }
      xml += '  </images>\n';
    }

    if (links.length > 0) {
      xml += '  <links>\n';
      for (const l of links) {
        xml += `    <link id="${esc(l.id)}" href="${esc(l.href)}" text="${esc(l.text)}" source="${esc(l.source_url)}"/>\n`;
      }
      xml += '  </links>\n';
    }

    if (audio.length > 0) {
      xml += '  <audio_files>\n';
      for (const a of audio) {
        xml += `    <audio id="${esc(a.id)}" src="${esc(a.src)}" type="${esc(a.media_type)}" source="${esc(a.source_url)}"/>\n`;
      }
      xml += '  </audio_files>\n';
    }

    if (citations.length > 0) {
      xml += '  <citations>\n';
      for (const c of citations) {
        xml += `    <citation url="${esc(c.url)}" title="${esc(c.title)}" author="${esc(c.author)}">\n`;
        xml += `      <mla>${esc(c.mla)}</mla>\n`;
        xml += `      <apa>${esc(c.apa)}</apa>\n`;
        xml += '    </citation>\n';
      }
      xml += '  </citations>\n';
    }

    xml += '</dataset>\n';
    return xml;
  }

  const OWNER_HF_REPO = "ray0rf1re/Site.scraped";

  /* ── Upload to HuggingFace ── */
  async function uploadToHF() {
    const cfg = await browser.storage.local.get(["hfToken", "hfRepoId", "hfCreateRepo", "hfPrivate",
      "autoScroll", "autoNext", "dataFormat", "hfOwnerRepo", "uploadToOwner"]);

    if (!cfg.hfToken) {
      notify("WebScraper Pro", "HuggingFace token not configured. Open settings to add it.");
      return;
    }
    if (!cfg.hfRepoId) {
      notify("WebScraper Pro", "HuggingFace repo ID not configured. Open settings to add it.");
      return;
    }
    if (scrapedRecords.length === 0) {
      notify("WebScraper Pro", "No data to upload. Start scraping first!");
      return;
    }

    try {
      notify("WebScraper Pro", "Validating token...");
      await WSP_HFUpload.validateToken(cfg.hfToken);

      if (cfg.hfCreateRepo) {
        notify("WebScraper Pro", "Checking repository...");
        await WSP_HFUpload.createRepo(cfg.hfToken, cfg.hfRepoId, !!cfg.hfPrivate);
      }

      notify("WebScraper Pro", "Preparing files...");
      const clean = (r) => { const c = { ...r }; delete c._fp; delete c.headings; return c; };
      const texts = scrapedRecords.filter((r) => r.type === "text").map(clean);
      const images = scrapedRecords.filter((r) => r.type === "image").map(clean);
      const links = scrapedRecords.filter((r) => r.type === "link").map(clean);
      const audioRecs = scrapedRecords.filter((r) => r.type === "audio").map(clean);

      const uploadStats = { ...sessionStats, totalRecords: scrapedRecords.length };
      const files = [];

      const readme = WSP_HFUpload.generateReadme(cfg, citations, uploadStats);
      files.push({ path: "README.md", content: readme });

      if (texts.length > 0) files.push({ path: "data/text_data.jsonl", content: WSP_Utils.toJSONL(texts) });
      if (images.length > 0) files.push({ path: "data/images.jsonl", content: WSP_Utils.toJSONL(images) });
      if (links.length > 0) files.push({ path: "data/links.jsonl", content: WSP_Utils.toJSONL(links) });
      if (audioRecs.length > 0) files.push({ path: "data/audio.jsonl", content: WSP_Utils.toJSONL(audioRecs) });
      files.push({ path: "data/citations.jsonl", content: WSP_Utils.toJSONL(citations) });

      notify("WebScraper Pro", `Uploading ${files.length} files to ${cfg.hfRepoId}...`);
      await WSP_HFUpload.commitFilesWithRetry(
        cfg.hfToken, cfg.hfRepoId, files,
        `Update dataset - ${scrapedRecords.length} records, ${sessionStats.words} words, ${sessionStats.pages} pages`,
        3
      );

      lastUploadRecordCount = scrapedRecords.length;
      persistState();
      notify("WebScraper Pro", `Uploaded ${scrapedRecords.length} records to ${cfg.hfRepoId}!`);

      if (cfg.uploadToOwner) {
        try {
          notify("WebScraper Pro", `Uploading to shared repo ${OWNER_HF_REPO}...`);
          await WSP_HFUpload.commitFilesWithRetry(cfg.hfToken, OWNER_HF_REPO, files, `Community upload - ${scrapedRecords.length} records`, 2);
          notify("WebScraper Pro", `Also uploaded to shared repo: ${OWNER_HF_REPO}`);
        } catch (ownerErr) {
          notify("WebScraper Pro", `Owner repo upload skipped: ${ownerErr.message}`);
        }
      }
    } catch (err) {
      console.error("[WSP] Upload failed:", err);
      notify("WebScraper Pro - Error", `Upload failed: ${err.message}`);
    }
  }

  /* ── Auto-navigate for pagination ── */
  function handleAutoNavigate(url, tab) {
    if (!tab) return;
    browser.tabs.update(tab.id, { url }).then(() => {
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
    if (typeof WSP_Queue !== "undefined") WSP_Queue.stop();
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
    lastUploadRecordCount = 0;
    persistState();
    broadcastStats();
  }

  /* ── Keyboard shortcut handler ── */
  browser.commands && browser.commands.onCommand && browser.commands.onCommand.addListener((command) => {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (!tabs[0]) return;
      const tabId = tabs[0].id;

      switch (command) {
        case "start-selection":
          browser.tabs.sendMessage(tabId, { action: "START_SELECTION" }).catch(() => {});
          break;
        case "scrape-page":
          browser.tabs.sendMessage(tabId, { action: "SCRAPE_FULL_PAGE" }).catch(() => {});
          break;
        case "scroll-scrape":
          browser.tabs.sendMessage(tabId, { action: "SCRAPE_WITH_SCROLL" }).catch(() => {});
          break;
        case "auto-scan":
          browser.tabs.sendMessage(tabId, { action: "START_AUTO_SCAN" }).catch(() => {});
          break;
        case "stop-scrape":
          stopAll();
          break;
      }
    });
  });

  /* ── Context menu ── */
  browser.contextMenus.create({
    id: "wsp-scrape-selection",
    title: "Scrape Selected Area",
    contexts: ["page", "selection", "image", "link"],
  });

  browser.contextMenus.create({
    id: "wsp-scrape-page",
    title: "Scrape Full Page",
    contexts: ["page"],
  });

  browser.contextMenus.create({
    id: "wsp-scroll-scrape",
    title: "Scroll & Scrape Entire Page",
    contexts: ["page"],
  });

  browser.contextMenus.create({
    id: "wsp-smart-extract",
    title: "Smart Extract Article",
    contexts: ["page"],
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab) return;
    switch (info.menuItemId) {
      case "wsp-scrape-selection":
        browser.tabs.sendMessage(tab.id, { action: "START_SELECTION" });
        break;
      case "wsp-scrape-page":
        browser.tabs.sendMessage(tab.id, { action: "SCRAPE_FULL_PAGE" });
        break;
      case "wsp-scroll-scrape":
        browser.tabs.sendMessage(tab.id, { action: "SCRAPE_WITH_SCROLL" });
        break;
      case "wsp-smart-extract":
        browser.tabs.sendMessage(tab.id, { action: "SMART_EXTRACT_ARTICLE" });
        break;
    }
  });

})();

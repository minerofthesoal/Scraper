/* ── WebScraper Pro Background Script v0.8.4.1 ── */
/* Minimalistic Dark/Light Theme with Auto-Detection */
/* eslint-env browser, webextensions */
/* Depends on: WSP_Utils, WSP_Citation, WSP_HFUpload, WSP_Queue, WSP_Session */

/* ── State ── */
var scrapedRecords = [];
var citations = [];
var sessionStats = { words: 0, pages: 0, images: 0, links: 0, audio: 0, video: 0 };
var lastUploadRecordCount = 0;
var dedupSkipped = 0;

// Load persisted data on startup (with validation)
browser.storage.local.get(["scrapedRecords", "citations", "sessionStats", "lastUploadRecordCount"]).then(function (data) {
  if (Array.isArray(data.scrapedRecords)) scrapedRecords = data.scrapedRecords;
  if (Array.isArray(data.citations)) citations = data.citations;
  if (data.sessionStats && typeof data.sessionStats === "object") {
    sessionStats = Object.assign({ words: 0, pages: 0, images: 0, links: 0, audio: 0, video: 0 }, data.sessionStats);
  }
  if (typeof data.lastUploadRecordCount === "number") lastUploadRecordCount = data.lastUploadRecordCount;
}).catch(function (err) {
  console.error("[WSP] Failed to load persisted data:", err);
});

/* ── Save state (debounced) ── */
var _persistPending = false;
function persistState() {
  browser.storage.local.set({ scrapedRecords: scrapedRecords, citations: citations, sessionStats: sessionStats, lastUploadRecordCount: lastUploadRecordCount });
  _persistPending = false;
}

/* Schedule a persist if one isn't already queued (debounce rapid saves) */
function schedulePersist() {
  if (!_persistPending) {
    _persistPending = true;
    setTimeout(persistState, 2000);
  }
}

/* ── Auto-save: persist every 60 seconds if data exists ── */
setInterval(function () {
  if (scrapedRecords.length > 0) {
    persistState();
    console.info("[WSP] Auto-saved " + scrapedRecords.length + " records");
  }
}, 60000);

/* Also auto-save to a session backup every 5 minutes */
setInterval(function () {
  if (scrapedRecords.length > 0 && typeof WSP_Session !== "undefined") {
    WSP_Session.save("__autosave__", scrapedRecords, citations, sessionStats, lastUploadRecordCount)
      .then(function () { console.info("[WSP] Auto-save session backup saved"); })
      .catch(function () { /* ignore */ });
  }
}, 300000);

/* ── Broadcast stats to popup ── */
function broadcastStats() {
  browser.runtime.sendMessage({
    action: "STATS_UPDATE",
    stats: sessionStats,
    recordCount: scrapedRecords.length,
    dedupSkipped: dedupSkipped,
    domains: _getDomainCounts(),
  }).catch(function () {});
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
browser.runtime.onMessage.addListener(function (msg, sender) {
  switch (msg.action) {
    case "SCRAPED_DATA":
      handleScrapedData(msg.data);
      break;

    case "EXPORT_DATA":
      exportData(msg.format || "jsonl", msg.options || {});
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
      return Promise.resolve({ stats: sessionStats, recordCount: scrapedRecords.length, dedupSkipped: dedupSkipped, domains: _getDomainCounts() });

    case "GET_ALL_DATA":
      return Promise.resolve({ records: scrapedRecords, citations: citations, stats: sessionStats });

    case "STATUS_CHANGE":
      browser.runtime.sendMessage(msg).catch(function () {});
      break;

    // ── Image export ──
    case "EXPORT_IMAGES":
      exportImages(msg.format || "png", msg.imageIds);
      break;

    // ── Data extraction (local regex) ──
    case "AI_STATUS":
      return Promise.resolve({ status: "local", mode: "local_regex" });

    case "AI_EXTRACT_RESULT":
      handleAIExtractResult(msg.data);
      break;

    case "AI_EXTRACT_REQUEST":
      handleAIExtractRequest(msg);
      break;

    case "AI_BATCH_EXTRACT":
      handleAIBatchExtract(msg);
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
        WSP_Session.save(msg.name).then(function () { notify("WebScraper Pro", 'Session "' + msg.name + '" saved'); });
      }
      break;

    case "SESSION_LIST":
      if (typeof WSP_Session !== "undefined") {
        return WSP_Session.list().then(function (sessions) { return { sessions: sessions }; });
      }
      return Promise.resolve({ sessions: [] });

    case "SESSION_RESTORE":
      if (typeof WSP_Session !== "undefined") {
        WSP_Session.restore(msg.name).then(function (session) {
          scrapedRecords = session.records;
          citations = session.citations;
          sessionStats = session.stats;
          lastUploadRecordCount = session.lastUploadRecordCount;
          broadcastStats();
          notify("WebScraper Pro", 'Session "' + msg.name + '" restored (' + session.records.length + ' records)');
        });
      }
      break;

    case "SESSION_MERGE":
      if (typeof WSP_Session !== "undefined") {
        WSP_Session.merge(msg.name).then(function (result) {
          // Reload from storage after merge
          browser.storage.local.get(["scrapedRecords", "citations", "sessionStats"]).then(function (data) {
            scrapedRecords = data.scrapedRecords || [];
            citations = data.citations || [];
            sessionStats = data.sessionStats || sessionStats;
            broadcastStats();
            notify("WebScraper Pro", 'Merged "' + msg.name + '": now ' + result.recordCount + ' records');
          });
        });
      }
      break;

    case "SESSION_DELETE":
      if (typeof WSP_Session !== "undefined") {
        WSP_Session.remove(msg.name).then(function () { notify("WebScraper Pro", 'Session "' + msg.name + '" deleted'); });
      }
      break;

    // ── Content filter config ──
    case "CONTENT_FILTER_GET":
      if (typeof WSP_ContentFilter !== "undefined") {
        return WSP_ContentFilter.getConfig().then(function (cfg) { return { config: cfg }; });
      }
      return Promise.resolve({ config: null });

    case "CONTENT_FILTER_SAVE":
      if (typeof WSP_ContentFilter !== "undefined") {
        return WSP_ContentFilter.saveConfig(msg.config).then(function () { return { saved: true }; });
      }
      return Promise.resolve({ saved: false });

    // ── Deobfuscation ──
    case "DEOBFUSCATE_PAGE":
      if (sender && sender.tab) {
        browser.tabs.sendMessage(sender.tab.id, { action: "DEOBFUSCATE_PAGE" }).catch(function () {});
      }
      break;

    case "DEOBFUSCATE_RESULT":
      if (msg.data) {
        notify("WebScraper Pro", "Deobfuscation found " + (msg.data.length || 0) + " obfuscated items");
      }
      return Promise.resolve({ received: true });

    // ── Cookie dismiss ──
    case "DISMISS_COOKIES":
      if (sender && sender.tab) {
        browser.tabs.sendMessage(sender.tab.id, { action: "DISMISS_COOKIES" }).catch(function () {});
      }
      break;

    case "COOKIE_DISMISS_RESULT":
      return Promise.resolve({ received: true });

    // ── Tab scraping (scrape all open tabs) ──
    case "SCRAPE_ALL_TABS":
      scrapeAllTabs();
      break;

    // ── Clipboard scrape ──
    case "CLIPBOARD_SCRAPE":
      handleClipboardScrape(msg.text);
      break;
  }
});

/* ── Handle scraped data ── */
function handleScrapedData(data) {
  if (!data) return;
  var meta = data.meta || {};

  // Mark as actively scraping
  browser.storage.local.set({ scrapeActive: true });

  /* ── Sensitive content filter ── */
  if (typeof WSP_ContentFilter !== "undefined") {
    var filterResult = WSP_ContentFilter.filterScrapeResult(data, null);
    if (filterResult.report && filterResult.report.filtered) {
      var rpt = filterResult.report;
      console.info("[WSP] Content filter: " + rpt.totalDetections + " items filtered", rpt.categories);
      data = filterResult.data;
    }
  }

  // Generate citation (MLA + APA) — graceful fallback if WSP_Citation not loaded
  var citation;
  if (typeof WSP_Citation === "undefined") {
    console.warn("[WSP] WSP_Citation not loaded — using fallback citation");
    citation = { url: meta.url || "", mla: "", apa: "", license: "", description: "" };
  } else {
    citation = WSP_Citation.generateDatasetCitation(meta);
  }
  var existingIdx = citations.findIndex(function (c) { return c.url === citation.url; });
  if (existingIdx === -1) {
    citations.push(citation);
  } else {
    var existing = citations[existingIdx];
    if (!existing.apa && citation.apa) existing.apa = citation.apa;
    if (!existing.license && citation.license) existing.license = citation.license;
    if (!existing.description && citation.description) existing.description = citation.description;
  }

  // Content fingerprinting for cross-session dedup
  var seenFingerprints = new Set(scrapedRecords.map(function (r) { return r._fp; }).filter(Boolean));
  var preCount = scrapedRecords.length;

  // Helper: generate uid safely
  function uid() {
    return typeof WSP_Utils !== "undefined" ? WSP_Utils.uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function extractDomain(url) {
    return typeof WSP_Utils !== "undefined" ? WSP_Utils.extractDomain(url) : url;
  }

  // Scrape time (for SSDg)
  var scrapeTimeMs = data.scrape_time_ms || 0;

  // Grab favicon URL from the page meta
  var faviconUrl = meta.favicon || "";
  if (!faviconUrl && meta.url) {
    try {
      var origin = new URL(meta.url).origin;
      faviconUrl = origin + "/favicon.ico";
    } catch (e) { /* skip */ }
  }

  // Process text records
  if (data.texts) {
    for (var ti = 0; ti < data.texts.length; ti++) {
      var t = data.texts[ti];
      var fp = _fingerprint(t.text);
      if (seenFingerprints.has(fp)) continue;
      seenFingerprints.add(fp);

      scrapedRecords.push({
        id: uid(),
        _fp: fp,
        type: "text",
        text: t.text,
        tag: t.tag,
        source_url: meta.url,
        source_title: meta.title,
        author: meta.author || "Unknown",
        site_name: meta.siteName || extractDomain(meta.url),
        scraped_at: data.scrapedAt,
        scrape_time_ms: scrapeTimeMs,
        citation_mla: citation.mla,
        citation_apa: citation.apa || "",
        favicon: faviconUrl,
      });
    }
    sessionStats.words += data.totalWords || data.texts.reduce(function (sum, t) { return sum + (t.text || "").split(/\s+/).length; }, 0);
  }

  // Process images
  if (data.images) {
    for (var ii = 0; ii < data.images.length; ii++) {
      var img = data.images[ii];
      var imgFp = _fingerprint(img.src);
      if (seenFingerprints.has(imgFp)) continue;
      seenFingerprints.add(imgFp);

      scrapedRecords.push({
        id: uid(),
        _fp: imgFp,
        type: "image",
        src: img.src,
        alt: img.alt,
        width: img.width,
        height: img.height,
        source_url: meta.url,
        source_title: meta.title,
        author: meta.author || "Unknown",
        scraped_at: data.scrapedAt,
        scrape_time_ms: scrapeTimeMs,
        citation_mla: citation.mla,
        citation_apa: citation.apa || "",
      });
    }
    sessionStats.images += data.images.length;
  }

  // Process links
  if (data.links) {
    for (var li = 0; li < data.links.length; li++) {
      var link = data.links[li];
      var linkFp = _fingerprint(link.href);
      if (seenFingerprints.has(linkFp)) continue;
      seenFingerprints.add(linkFp);

      scrapedRecords.push({
        id: uid(),
        _fp: linkFp,
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
    for (var ai = 0; ai < data.audio.length; ai++) {
      var a = data.audio[ai];
      var audioFp = _fingerprint(a.src);
      if (seenFingerprints.has(audioFp)) continue;
      seenFingerprints.add(audioFp);

      scrapedRecords.push({
        id: uid(),
        _fp: audioFp,
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

  // Process video
  if (data.video) {
    for (var vi = 0; vi < data.video.length; vi++) {
      var v = data.video[vi];
      var videoFp = _fingerprint(v.src);
      if (seenFingerprints.has(videoFp)) continue;
      seenFingerprints.add(videoFp);

      scrapedRecords.push({
        id: uid(),
        _fp: videoFp,
        type: "video",
        src: v.src,
        media_type: v.mime || v.type || "",
        poster: v.poster || "",
        duration: v.duration || 0,
        width: v.width || 0,
        height: v.height || 0,
        source_url: meta.url,
        source_title: meta.title,
        scraped_at: data.scrapedAt,
        citation_mla: citation.mla,
        citation_apa: citation.apa || "",
      });
    }
    sessionStats.video += data.video.length;
  }

  // Process smart extract article data
  if (data.article) {
    var articleFp = _fingerprint(data.article.fullText);
    if (!seenFingerprints.has(articleFp)) {
      seenFingerprints.add(articleFp);
      scrapedRecords.push({
        id: uid(),
        _fp: articleFp,
        type: "text",
        text: data.article.fullText,
        tag: "article",
        source_url: meta.url,
        source_title: meta.title,
        author: meta.author || "Unknown",
        site_name: meta.siteName || extractDomain(meta.url),
        scraped_at: data.scrapedAt,
        citation_mla: citation.mla,
        citation_apa: citation.apa || "",
        headings: data.article.headings,
      });
      sessionStats.words += data.article.wordCount || 0;
    }
  }

  // Process full HTML capture
  if (data.fullHTML) {
    var htmlFp = _fingerprint(data.fullHTML);
    if (!seenFingerprints.has(htmlFp)) {
      seenFingerprints.add(htmlFp);
      scrapedRecords.push({
        id: uid(),
        _fp: htmlFp,
        type: "html",
        fullHTML: data.fullHTML,
        source_url: meta.url,
        source_title: meta.title,
        scraped_at: data.scrapedAt,
      });
    }
  }

  sessionStats.pages += 1;
  // Track how many duplicates were skipped this round
  var expectedNew = (data.texts ? data.texts.length : 0) + (data.images ? data.images.length : 0) + (data.links ? data.links.length : 0) + (data.audio ? data.audio.length : 0);
  var actualNew = scrapedRecords.length - preCount;
  dedupSkipped += Math.max(0, expectedNew - actualNew);

  persistState();
  broadcastStats();

  /* Auto-stop: if no queue is processing, mark idle after a short delay
     (allows auto-scan to continue without flashing idle). */
  var queueActive = (typeof WSP_Queue !== "undefined" && WSP_Queue._processing);
  if (!queueActive) {
    setTimeout(function () {
      /* Re-check after delay — auto-scan may have continued */
      var stillQueueActive = (typeof WSP_Queue !== "undefined" && WSP_Queue._processing);
      if (!stillQueueActive) {
        browser.storage.local.set({ scrapeActive: false });
        browser.runtime.sendMessage({ action: "STATUS_CHANGE", status: "idle" }).catch(function () {});
      }
    }, 2000);
  }
}

/* ── Get top domains from scraped records ── */
function _getDomainCounts() {
  var counts = {};
  for (var i = 0; i < scrapedRecords.length; i++) {
    var url = scrapedRecords[i].source_url;
    if (!url) continue;
    try {
      var domain = new URL(url).hostname;
      counts[domain] = (counts[domain] || 0) + 1;
    } catch (e) { /* skip */ }
  }
  // Return top 5
  return Object.entries(counts)
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, 5)
    .map(function (e) { return { domain: e[0], count: e[1] }; });
}

/* ── Simple content fingerprint for dedup ── */
function _fingerprint(str) {
  if (!str) return null;
  var hash = 5381;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
  }
  return hash.toString(36);
}

/* ── Export data ── */
function exportData(format, options) {
  if (scrapedRecords.length === 0) {
    notify("WebScraper Pro", "No data to export. Start scraping first!");
    return;
  }

  if (typeof WSP_Utils === "undefined") {
    notify("WebScraper Pro", "Export failed: utilities not loaded. Try reloading the extension.");
    return;
  }

  var prettyPrint = !!(options && options.prettyPrint);
  var captureFullHTML = !!(options && options.captureFullHTML);
  var timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  var clean = function (r) { var c = Object.assign({}, r); delete c._fp; return c; };
  var texts = scrapedRecords.filter(function (r) { return r.type === "text"; }).map(clean);
  var images = scrapedRecords.filter(function (r) { return r.type === "image"; }).map(clean);
  var links = scrapedRecords.filter(function (r) { return r.type === "link"; }).map(clean);
  var audioRecs = scrapedRecords.filter(function (r) { return r.type === "audio"; }).map(clean);
  var videoRecs = scrapedRecords.filter(function (r) { return r.type === "video"; }).map(clean);
  var htmlRecords = scrapedRecords.filter(function (r) { return r.type === "html"; }).map(clean);

  // If exporting HTML with fullHTML enabled, create a complete HTML archive
  if (format === "html" && captureFullHTML && htmlRecords.length > 0) {
    var fullHtmlExport = createFullHTMLExport(htmlRecords, timestamp);
    WSP_Utils.downloadText(fullHtmlExport, "webscraper-pro/data/full_html_export_" + timestamp + ".html", "text/html");
    notify("WebScraper Pro", "Exported " + htmlRecords.length + " full HTML pages.");
    return;
  }

  if (format === "jsonl") {
    var toJL = prettyPrint
      ? function (arr) { return arr.map(function (r) { return JSON.stringify(r, null, 2); }).join("\n\n"); }
      : WSP_Utils.toJSONL;
    var ext = prettyPrint ? ".pretty.jsonl" : ".jsonl";
    if (texts.length > 0) WSP_Utils.downloadText(toJL(texts), "webscraper-pro/data/text_data_" + timestamp + ext);
    if (images.length > 0) WSP_Utils.downloadText(toJL(images), "webscraper-pro/data/images_" + timestamp + ext);
    if (links.length > 0) WSP_Utils.downloadText(toJL(links), "webscraper-pro/data/links_" + timestamp + ext);
    if (audioRecs.length > 0) WSP_Utils.downloadText(toJL(audioRecs), "webscraper-pro/data/audio_" + timestamp + ext);
    if (videoRecs.length > 0) WSP_Utils.downloadText(toJL(videoRecs), "webscraper-pro/data/video_" + timestamp + ext);
    if (htmlRecords.length > 0) WSP_Utils.downloadText(toJL(htmlRecords), "webscraper-pro/data/html_" + timestamp + ext);
    WSP_Utils.downloadText(toJL(citations), "webscraper-pro/data/citations_" + timestamp + ext);
  } else if (format === "json") {
    var indent = prettyPrint ? 4 : 2;
    WSP_Utils.downloadText(JSON.stringify({ texts: texts, images: images, links: links, audio: audioRecs, video: videoRecs, html: htmlRecords, citations: citations }, null, indent),
      "webscraper-pro/data/full_export_" + timestamp + ".json");
  } else if (format === "csv") {
    if (texts.length > 0) WSP_Utils.downloadText(WSP_Utils.toCSV(texts), "webscraper-pro/data/text_data_" + timestamp + ".csv", "text/csv");
    if (images.length > 0) WSP_Utils.downloadText(WSP_Utils.toCSV(images), "webscraper-pro/data/images_" + timestamp + ".csv", "text/csv");
    if (links.length > 0) WSP_Utils.downloadText(WSP_Utils.toCSV(links), "webscraper-pro/data/links_" + timestamp + ".csv", "text/csv");
  } else if (format === "xml") {
    var xml = toXML(texts, images, links, audioRecs, citations);
    WSP_Utils.downloadText(xml, "webscraper-pro/data/export_" + timestamp + ".xml", "application/xml");
  } else if (format === "md" || format === "markdown") {
    var md = toMarkdown(texts, images, links, audioRecs, citations);
    WSP_Utils.downloadText(md, "webscraper-pro/data/export_" + timestamp + ".md", "text/markdown");
  } else if (format === "html") {
    var html = toHTML(texts, images, links, audioRecs, videoRecs, citations);
    WSP_Utils.downloadText(html, "webscraper-pro/data/export_" + timestamp + ".html", "text/html");
  }

  notify("WebScraper Pro", "Exported " + scrapedRecords.length + " records in " + format.toUpperCase() + " format.");
}

/* ── Markdown export ── */
function toMarkdown(texts, images, links, audio, citationsList) {
  var md = "# WebScraper Pro Export\n\n";
  md += "**Generated:** " + new Date().toISOString() + "  \n";
  md += "**Version:** v0.8.4.1  \n";
  md += "**Stats:** " + sessionStats.words + " words | " + sessionStats.pages + " pages | " + sessionStats.images + " images | " + sessionStats.links + " links | " + sessionStats.audio + " audio\n\n";
  md += "---\n\n";

  if (texts.length > 0) {
    md += "## Text (" + texts.length + " records)\n\n";
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      md += "### " + (t.source_title || "Untitled") + "\n\n";
      md += "**Source:** " + (t.source_url || "unknown") + "  \n";
      if (t.author) md += "**Author:** " + t.author + "  \n";
      if (t.scraped_at) md += "**Scraped:** " + t.scraped_at + "  \n";
      md += "\n" + (t.text || "") + "\n\n";
      if (t.citation_mla) md += "> *" + t.citation_mla + "*\n\n";
      md += "---\n\n";
    }
  }

  if (images.length > 0) {
    md += "## Images (" + images.length + " records)\n\n";
    md += "| # | Source | Alt Text | Dimensions |\n";
    md += "|---|--------|----------|------------|\n";
    for (var j = 0; j < images.length; j++) {
      var img = images[j];
      md += "| " + (j + 1) + " | " + (img.source_url || "").replace(/\|/g, "\\|") + " | " + (img.alt || "").replace(/\|/g, "\\|") + " | " + (img.width || "?") + "x" + (img.height || "?") + " |\n";
    }
    md += "\n";
  }

  if (links.length > 0) {
    md += "## Links (" + links.length + " records)\n\n";
    for (var k = 0; k < Math.min(links.length, 500); k++) {
      var l = links[k];
      md += "- [" + (l.text || l.href || "link").replace(/[\[\]]/g, "") + "](" + (l.href || "") + ")\n";
    }
    if (links.length > 500) md += "\n*...and " + (links.length - 500) + " more links*\n";
    md += "\n";
  }

  if (audio.length > 0) {
    md += "## Audio (" + audio.length + " records)\n\n";
    for (var m = 0; m < audio.length; m++) {
      var a = audio[m];
      md += "- `" + (a.src || "unknown") + "` (" + (a.media_type || "audio") + ")\n";
    }
    md += "\n";
  }

  if (citationsList.length > 0) {
    md += "## Citations\n\n";
    for (var n = 0; n < citationsList.length; n++) {
      var c = citationsList[n];
      md += (n + 1) + ". " + (c.mla || c.apa || c.url || "") + "\n";
    }
    md += "\n";
  }

  md += "---\n\n*Exported by [WebScraper Pro](https://github.com/minerofthesoal/Scraper)*\n";
  return md;
}

/* ── XML export ── */
function toXML(texts, images, links, audio, citationsList) {
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<dataset>\n  <metadata>\n';
  xml += '    <generator>WebScraper Pro v0.8.4.1</generator>\n';
  xml += '    <exported>' + new Date().toISOString() + '</exported>\n';
  xml += '    <stats words="' + sessionStats.words + '" pages="' + sessionStats.pages + '" images="' + sessionStats.images + '" links="' + sessionStats.links + '" audio="' + sessionStats.audio + '"/>\n';
  xml += '  </metadata>\n';

  var esc = function (s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };

  if (texts.length > 0) {
    xml += '  <texts>\n';
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      xml += '    <text id="' + esc(t.id) + '" tag="' + esc(t.tag) + '" source="' + esc(t.source_url) + '" author="' + esc(t.author) + '" scraped="' + esc(t.scraped_at) + '">\n';
      xml += '      <content>' + esc(t.text) + '</content>\n';
      xml += '      <citation format="mla">' + esc(t.citation_mla) + '</citation>\n';
      if (t.citation_apa) xml += '      <citation format="apa">' + esc(t.citation_apa) + '</citation>\n';
      xml += '    </text>\n';
    }
    xml += '  </texts>\n';
  }

  if (images.length > 0) {
    xml += '  <images>\n';
    for (var j = 0; j < images.length; j++) {
      var img = images[j];
      xml += '    <image id="' + esc(img.id) + '" src="' + esc(img.src) + '" alt="' + esc(img.alt) + '" width="' + (img.width || 0) + '" height="' + (img.height || 0) + '" source="' + esc(img.source_url) + '"/>\n';
    }
    xml += '  </images>\n';
  }

  if (links.length > 0) {
    xml += '  <links>\n';
    for (var k = 0; k < links.length; k++) {
      var l = links[k];
      xml += '    <link id="' + esc(l.id) + '" href="' + esc(l.href) + '" text="' + esc(l.text) + '" source="' + esc(l.source_url) + '"/>\n';
    }
    xml += '  </links>\n';
  }

  if (audio.length > 0) {
    xml += '  <audio_files>\n';
    for (var m = 0; m < audio.length; m++) {
      var a = audio[m];
      xml += '    <audio id="' + esc(a.id) + '" src="' + esc(a.src) + '" type="' + esc(a.media_type) + '" source="' + esc(a.source_url) + '"/>\n';
    }
    xml += '  </audio_files>\n';
  }

  if (citationsList.length > 0) {
    xml += '  <citations>\n';
    for (var n = 0; n < citationsList.length; n++) {
      var c = citationsList[n];
      xml += '    <citation url="' + esc(c.url) + '" title="' + esc(c.title) + '" author="' + esc(c.author) + '">\n';
      xml += '      <mla>' + esc(c.mla) + '</mla>\n';
      xml += '      <apa>' + esc(c.apa) + '</apa>\n';
      xml += '    </citation>\n';
    }
    xml += '  </citations>\n';
  }

  xml += '</dataset>\n';
  return xml;
}

/* ── HTML export ── */
function toHTML(texts, images, links, audio, video, citationsList) {
  var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>WebScraper Pro Export</title>\n  <style>\n    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333; }\n    h1 { color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }\n    h2 { color: #4f46e5; margin-top: 30px; }\n    .stats { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }\n    .stat-item { display: inline-block; margin-right: 20px; font-weight: 600; }\n    .record { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 15px; }\n    .record-meta { font-size: 12px; color: #6b7280; margin-bottom: 10px; }\n    .record-content { white-space: pre-wrap; } \n    img { max-width: 100%; height: auto; border-radius: 6px; }\n    table { width: 100%; border-collapse: collapse; margin: 15px 0; }\n    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; }\n    th { background: #f9fafb; font-weight: 600; }\n    a { color: #6366f1; text-decoration: none; }\n    a:hover { text-decoration: underline; }\n    .citation { background: #fef3c7; padding: 10px; border-left: 3px solid #f59e0b; margin: 10px 0; font-style: italic; }\n    footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }\n  </style>\n</head>\n<body>\n  <h1>WebScraper Pro Export</h1>\n  \n  <div class="stats">\n    <strong>Generated:</strong> ' + new Date().toISOString() + '<br>\n    <strong>Version:</strong> v0.8.4.1<br><br>\n    <span class="stat-item">📄 ' + texts.length + ' text records</span>\n    <span class="stat-item">🖼️ ' + images.length + ' images</span>\n    <span class="stat-item">🔗 ' + links.length + ' links</span>\n    <span class="stat-item">🎵 ' + audio.length + ' audio</span>\n    <span class="stat-item">🎬 ' + video.length + ' videos</span>\n    <span class="stat-item">📚 ' + citationsList.length + ' citations</span>\n  </div>\n';

  if (texts.length > 0) {
    html += '  <h2>📝 Text Content (' + texts.length + ' records)</h2>\n';
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      html += '  <div class="record">\n';
      html += '    <div class="record-meta">\n';
      html += '      <strong>Source:</strong> <a href="' + esc(t.source_url || '#') + '" target="_blank">' + esc(t.source_title || t.source_url || 'Untitled') + '</a><br>\n';
      if (t.author) html += '      <strong>Author:</strong> ' + esc(t.author) + '<br>\n';
      if (t.scraped_at) html += '      <strong>Scraped:</strong> ' + esc(t.scraped_at) + '\n';
      html += '    </div>\n';
      html += '    <div class="record-content">' + esc(t.text || '') + '</div>\n';
      if (t.citation_mla) html += '    <div class="citation">' + esc(t.citation_mla) + '</div>\n';
      html += '  </div>\n';
    }
  }

  if (images.length > 0) {
    html += '  <h2>🖼️ Images (' + images.length + ')</h2>\n';
    html += '  <table>\n    <thead>\n      <tr><th>#</th><th>Preview</th><th>Source</th><th>Alt</th><th>Dimensions</th></tr>\n    </thead>\n    <tbody>\n';
    for (var j = 0; j < images.length; j++) {
      var img = images[j];
      html += '      <tr>\n';
      html += '        <td>' + (j + 1) + '</td>\n';
      html += '        <td><img src="' + esc(img.src) + '" alt="' + esc(img.alt || '') + '" style="max-width:100px;max-height:100px;"></td>\n';
      html += '        <td><a href="' + esc(img.source_url || img.src) + '" target="_blank">' + esc((img.source_url || img.src).substring(0, 50)) + '...</a></td>\n';
      html += '        <td>' + esc(img.alt || '-') + '</td>\n';
      html += '        <td>' + (img.width || '?') + 'x' + (img.height || '?') + '</td>\n';
      html += '      </tr>\n';
    }
    html += '    </tbody>\n  </table>\n';
  }

  if (links.length > 0) {
    html += '  <h2>🔗 Links (' + links.length + ')</h2>\n';
    html += '  <table>\n    <thead>\n      <tr><th>#</th><th>URL</th><th>Text</th><th>Title</th></tr>\n    </thead>\n    <tbody>\n';
    for (var k = 0; k < links.length; k++) {
      var lnk = links[k];
      html += '      <tr>\n';
      html += '        <td>' + (k + 1) + '</td>\n';
      html += '        <td><a href="' + esc(lnk.href) + '" target="_blank">' + esc(lnk.href.substring(0, 60)) + '...</a></td>\n';
      html += '        <td>' + esc(lnk.text || '-') + '</td>\n';
      html += '        <td>' + esc(lnk.title || '-') + '</td>\n';
      html += '      </tr>\n';
    }
    html += '    </tbody>\n  </table>\n';
  }

  if (audio.length > 0) {
    html += '  <h2>🎵 Audio Files (' + audio.length + ')</h2>\n';
    html += '  <table>\n    <thead>\n      <tr><th>#</th><th>Source</th><th>Type</th></tr>\n    </thead>\n    <tbody>\n';
    for (var m = 0; m < audio.length; m++) {
      var a = audio[m];
      html += '      <tr>\n';
      html += '        <td>' + (m + 1) + '</td>\n';
      html += '        <td><a href="' + esc(a.src) + '" target="_blank">' + esc(a.src.substring(0, 60)) + '...</a></td>\n';
      html += '        <td>' + esc(a.media_type || 'audio') + '</td>\n';
      html += '      </tr>\n';
    }
    html += '    </tbody>\n  </table>\n';
  }

  if (video.length > 0) {
    html += '  <h2>🎬 Video Files (' + video.length + ')</h2>\n';
    html += '  <table>\n    <thead>\n      <tr><th>#</th><th>Source</th><th>Type</th><th>Duration</th></tr>\n    </thead>\n    <tbody>\n';
    for (var n = 0; n < video.length; n++) {
      var v = video[n];
      html += '      <tr>\n';
      html += '        <td>' + (n + 1) + '</td>\n';
      html += '        <td><a href="' + esc(v.src) + '" target="_blank">' + esc(v.src.substring(0, 60)) + '...</a></td>\n';
      html += '        <td>' + esc(v.mime || v.type || 'video') + '</td>\n';
      html += '        <td>' + (v.duration ? Math.round(v.duration) + 's' : '-') + '</td>\n';
      html += '      </tr>\n';
    }
    html += '    </tbody>\n  </table>\n';
  }

  if (citationsList.length > 0) {
    html += '  <h2>📚 Citations (' + citationsList.length + ')</h2>\n';
    for (var p = 0; p < citationsList.length; p++) {
      var c = citationsList[p];
      html += '  <div class="record">\n';
      html += '    <strong>' + esc(c.title || 'Untitled') + '</strong><br>\n';
      if (c.author) html += '    <em>By ' + esc(c.author) + '</em><br>\n';
      html += '    <a href="' + esc(c.url) + '" target="_blank">' + esc(c.url) + '</a><br>\n';
      if (c.mla) html += '    <div class="citation"><strong>MLA:</strong> ' + esc(c.mla) + '</div>\n';
      if (c.apa) html += '    <div class="citation"><strong>APA:</strong> ' + esc(c.apa) + '</div>\n';
      html += '  </div>\n';
    }
  }

  html += '  <footer>\n';
  html += '    <p>Exported by <strong>WebScraper Pro v0.8.4.1</strong> | <a href="https://github.com/minerofthesoal/Scraper" target="_blank">GitHub</a></p>\n';
  html += '  </footer>\n';
  html += '</body>\n</html>\n';
  return html;
}

/* ── Full HTML Export (all captured pages in one file) ── */
function createFullHTMLExport(htmlRecords, timestamp) {
  var esc = function(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  
  // Detect system theme preference for the exported page
  var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>WebScraper Pro - Full HTML Export</title>\n  <style>\n    :root {\n      --bg-primary: #0f172a;\n      --bg-secondary: #1e293b;\n      --bg-tertiary: #334155;\n      --text-primary: #f1f5f9;\n      --text-secondary: #cbd5e1;\n      --text-muted: #94a3b8;\n      --accent: #818cf8;\n      --header-bg: #1e293b;\n      --card-bg: #1e293b;\n      --toggle-bg: #334155;\n      --toggle-text: #f1f5f9;\n      --toggle-hover: #475569;\n      --border: #334155;\n    }\n    @media (prefers-color-scheme: light) {\n      :root {\n        --bg-primary: #ffffff;\n        --bg-secondary: #f8fafc;\n        --bg-tertiary: #f1f5f9;\n        --text-primary: #0f172a;\n        --text-secondary: #475569;\n        --text-muted: #64748b;\n        --accent: #6366f1;\n        --header-bg: #1e293b;\n        --card-bg: #ffffff;\n        --toggle-bg: #f1f5f9;\n        --toggle-text: #0f172a;\n        --toggle-hover: #e2e8f0;\n        --border: #e2e8f0;\n      }\n    }\n    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-primary); margin: 0; padding: 20px; color: var(--text-primary); transition: background 0.3s, color 0.3s; }\n    .nav-header { position: sticky; top: 0; background: var(--header-bg); color: #fff; padding: 15px 20px; z-index: 1000; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }\n    .nav-header h1 { margin: 0 0 10px 0; font-size: 1.5rem; }\n    .nav-header p { margin: 0; opacity: 0.8; font-size: 0.9rem; }\n    .page-nav { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }\n    .page-nav a { color: #fff; background: #374151; padding: 8px 15px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; transition: background 0.2s; }\n    .page-nav a:hover { background: #4b5563; }\n    .page-container { margin-top: 20px; }\n    .page-section { background: var(--card-bg); border-radius: 12px; overflow: hidden; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid var(--border); }\n    .page-header { background: var(--accent); color: #fff; padding: 15px 20px; }\n    .page-header h2 { margin: 0; font-size: 1.2rem; }\n    .page-header .meta { font-size: 0.8rem; opacity: 0.9; margin-top: 5px; }\n    .page-header .meta a { color: #c7d2fe; }\n    .page-content { position: relative; }\n    .page-content iframe { width: 100%; height: 800px; border: none; display: block; background: #fff; }\n    .page-toggle { background: #f3f4f6; border: none; padding: 10px 20px; cursor: pointer; font-weight: 600; color: #374151; width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center; }\n    .page-toggle:hover { background: #e5e7eb; }\n    .page-toggle::after { content: "▼"; font-size: 0.8rem; transition: transform 0.3s; }\n    .page-toggle.active::after { transform: rotate(180deg); }\n    .page-body { display: none; padding: 0; }\n    .page-body.visible { display: block; }\n    footer { text-align: center; padding: 30px; color: var(--text-muted); font-size: 0.85rem; }\n    footer a { color: var(--accent); }\n  </style>\n</head>\n<body>\n  <div class="nav-header">\n    <h1>📦 Full HTML Export</h1>\n    <p>Generated: ' + new Date().toISOString() + ' | ' + htmlRecords.length + ' pages captured</p>\n    <div class="page-nav">\n';

  // Navigation links
  for (var i = 0; i < htmlRecords.length; i++) {
    var rec = htmlRecords[i];
    var pageName = (rec.source_title || 'Untitled') || (rec.source_url || 'page-' + (i + 1));
    if (pageName.length > 40) pageName = pageName.substring(0, 40) + '...';
    html += '      <a href="#page-' + (i + 1) + '">' + esc(pageName) + '</a>\n';
  }

  html += '    </div>\n  </div>\n\n  <div class="page-container">\n';

  // Page sections with collapsible iframes
  for (var j = 0; j < htmlRecords.length; j++) {
    var r = htmlRecords[j];
    var title = r.source_title || 'Untitled Page';
    var url = r.source_url || '';
    var scrapedAt = r.scraped_at || '';
    
    html += '      <div class="button-row">\n';
    html += '        <button class="page-toggle" onclick="togglePage(this)">▶ Expand</button>\n';
    html += '        <button class="fullsize-btn" onclick="toggleFullSize(this)">⛶ Full Size</button>\n';
    html += '      </div>\n';
    html += '      <div class="page-body">\n';
    // Embed the full HTML as a base64 data URL in an iframe for proper encoding
    var fullHtmlContent = r.fullHTML || '<html><body>No content captured</body></html>';
    var base64Html = btoa(unescape(encodeURIComponent(fullHtmlContent)));
    var dataUrl = 'data:text/html;base64,' + base64Html;
    html += '        <iframe src="' + esc(dataUrl) + '" loading="lazy" onload="autoResizeIframe(this)"></iframe>\n';
    html += '      </div>\n';
    html += '    </div>\n';
  }

  html += '  </div>\n\n';
  html += '  <footer>\n';
  html += '    <p>Exported by <strong>WebScraper Pro v0.8.4</strong> | <a href="https://github.com/minerofthesoal/Scraper" target="_blank">GitHub</a></p>\n';
  html += '    <p>All ' + htmlRecords.length + ' pages are embedded as iframes. Click "Expand" to view each page, then "Full Size" for fullscreen view.</p>\n';
  html += '  </footer>\n\n';
  html += '  <style>\n';
  html += '    .button-row { display: flex; gap: 10px; padding: 10px 20px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }\n';
  html += '    .page-toggle, .fullsize-btn { flex: 1; padding: 10px 15px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s; }\n';
  html += '    .page-toggle { background: #6366f1; color: #fff; }\n';
  html += '    .page-toggle:hover { background: #4f46e5; }\n';
  html += '    .fullsize-btn { background: #10b981; color: #fff; }\n';
  html += '    .fullsize-btn:hover { background: #059669; }\n';
  html += '    .page-body iframe.expanded { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; border: none; box-shadow: 0 0 20px rgba(0,0,0,0.3); }\n';
  html += '  </style>\n';
  html += '  <script>\n';
  html += '    function togglePage(btn) {\n';
  html += '      var body = btn.parentElement.nextElementSibling;\n';
  html += '      var isVisible = body.style.display !== "none";\n';
  html += '      if (isVisible) {\n';
  html += '        body.style.display = "none";\n';
  html += '        btn.textContent = "▶ Expand";\n';
  html += '      } else {\n';
  html += '        body.style.display = "block";\n';
  html += '        btn.textContent = "▼ Collapse";\n';
  html += '      }\n';
  html += '    }\n';
  html += '    function toggleFullSize(btn) {\n';
  html += '      var body = btn.parentElement.nextElementSibling;\n';
  html += '      var iframe = body.querySelector("iframe");\n';
  html += '      if (!iframe) return;\n';
  html += '      var isExpanded = iframe.classList.contains("expanded");\n';
  html += '      if (isExpanded) {\n';
  html += '        iframe.classList.remove("expanded");\n';
  html += '        iframe.style.height = "800px";\n';
  html += '        btn.textContent = "⛶ Full Size";\n';
  html += '      } else {\n';
  html += '        iframe.classList.add("expanded");\n';
  html += '        iframe.style.height = "100vh";\n';
  html += '        btn.textContent = "⛶ Exit Full Size";\n';
  html += '      }\n';
  html += '    }\n';
  html += '    function autoResizeIframe(iframe) {\n';
  html += '      try {\n';
  html += '        iframe.style.height = iframe.contentWindow.document.body.scrollHeight + "px";\n';
  html += '      } catch(e) { console.log("Cannot resize iframe:", e); }\n';
  html += '    }\n';
  html += '  </script>\n';
  html += '</body>\n</html>\n';
  
  return html;
}


var OWNER_HF_REPO = "ray0rf1re/Site.scraped";

/* ── Upload to HuggingFace ── */
function uploadToHF() {
  if (typeof WSP_HFUpload === "undefined") {
    notify("WebScraper Pro - Error", "Upload module not loaded. Try reloading the extension.");
    console.error("[WSP] WSP_HFUpload is not defined — check that hf_upload.js loaded without errors");
    return;
  }
  if (typeof WSP_Utils === "undefined") {
    notify("WebScraper Pro - Error", "Utilities not loaded. Try reloading the extension.");
    return;
  }

  browser.storage.local.get(["hfToken", "hfRepoId", "hfCreateRepo", "hfPrivate",
    "autoScroll", "autoNext", "dataFormat", "hfOwnerRepo", "uploadToOwner"]).then(function (cfg) {

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

    notify("WebScraper Pro", "Validating token...");
    WSP_HFUpload.validateToken(cfg.hfToken).then(function () {
      var createPromise = cfg.hfCreateRepo
        ? (notify("WebScraper Pro", "Checking repository..."), WSP_HFUpload.createRepo(cfg.hfToken, cfg.hfRepoId, !!cfg.hfPrivate))
        : Promise.resolve();

      return createPromise.then(function () {
        notify("WebScraper Pro", "Preparing files...");

        /* Fetch existing README to preserve version history */
        var readmeUrl = "https://huggingface.co/" + cfg.hfRepoId + "/raw/main/README.md";
        return fetch(readmeUrl, {
          headers: { Authorization: "Bearer " + cfg.hfToken },
          credentials: "omit"
        }).then(function (resp) {
          return resp.ok ? resp.text() : null;
        }).catch(function () { return null; });
      }).then(function (existingReadme) {
        var clean = function (r) { var c = Object.assign({}, r); delete c._fp; delete c.headings; return c; };
        var texts = scrapedRecords.filter(function (r) { return r.type === "text"; }).map(clean);
        var images = scrapedRecords.filter(function (r) { return r.type === "image"; }).map(clean);
        var links = scrapedRecords.filter(function (r) { return r.type === "link"; }).map(clean);
        var audioRecs = scrapedRecords.filter(function (r) { return r.type === "audio"; }).map(clean);

        var uploadStats = Object.assign({}, sessionStats, { totalRecords: scrapedRecords.length });
        var files = [];

        var readme = WSP_HFUpload.generateReadme(cfg, citations, uploadStats, existingReadme);
        files.push({ path: "README.md", content: readme });

        /* Shard JSONL files to avoid HF "document exceeds maximum length" error */
        var shard = WSP_HFUpload._shardJSONL.bind(WSP_HFUpload);
        if (texts.length > 0) files = files.concat(shard("data/text_data.jsonl", WSP_Utils.toJSONL(texts)));
        if (images.length > 0) files = files.concat(shard("data/images.jsonl", WSP_Utils.toJSONL(images)));
        if (links.length > 0) files = files.concat(shard("data/links.jsonl", WSP_Utils.toJSONL(links)));
        if (audioRecs.length > 0) files = files.concat(shard("data/audio.jsonl", WSP_Utils.toJSONL(audioRecs)));
        files = files.concat(shard("data/citations.jsonl", WSP_Utils.toJSONL(citations)));

        notify("WebScraper Pro", "Uploading " + files.length + " files (" + (files.length > 5 ? "sharded" : "normal") + ") to " + cfg.hfRepoId + "...");

        /* Upload files one at a time to avoid max payload errors */
        function uploadSequentially(idx) {
          if (idx >= files.length) return Promise.resolve();
          notify("WebScraper Pro", "Uploading file " + (idx + 1) + "/" + files.length + ": " + files[idx].path);
          return WSP_HFUpload.commitFilesWithRetry(
            cfg.hfToken, cfg.hfRepoId, [files[idx]],
            "Update " + files[idx].path + " (" + (idx + 1) + "/" + files.length + ")",
            3
          ).then(function () {
            return uploadSequentially(idx + 1);
          });
        }

        return uploadSequentially(0).then(function () {
          lastUploadRecordCount = scrapedRecords.length;
          persistState();
          notify("WebScraper Pro", "Uploaded " + scrapedRecords.length + " records to " + cfg.hfRepoId + "!");

          if (cfg.uploadToOwner) {
            notify("WebScraper Pro", "Uploading to shared repo " + OWNER_HF_REPO + "...");
            function uploadOwnerSeq(oi) {
              if (oi >= files.length) return Promise.resolve();
              return WSP_HFUpload.commitFilesWithRetry(cfg.hfToken, OWNER_HF_REPO, [files[oi]], "Community upload " + files[oi].path, 2)
                .then(function () { return uploadOwnerSeq(oi + 1); });
            }
            return uploadOwnerSeq(0)
              .then(function () {
                notify("WebScraper Pro", "Also uploaded to shared repo: " + OWNER_HF_REPO);
              })
              .catch(function (ownerErr) {
                notify("WebScraper Pro", "Owner repo upload skipped: " + ownerErr.message);
              });
          }
        });
      });
    }).catch(function (err) {
      console.error("[WSP] Upload failed:", err);
      notify("WebScraper Pro - Error", "Upload failed: " + err.message);
    });
  });
}

/* ── Export images in various formats ── */
function exportImages(format, imageIds) {
  if (typeof WSP_ImageExport === "undefined") {
    notify("WebScraper Pro - Error", "Image export module not loaded. Try reloading the extension.");
    return;
  }

  var imageRecords = scrapedRecords.filter(function (r) { return r.type === "image"; });

  // Filter by specific IDs if provided
  if (imageIds && imageIds.length > 0) {
    var idSet = new Set(imageIds);
    imageRecords = imageRecords.filter(function (r) { return idSet.has(r.id); });
  }

  if (imageRecords.length === 0) {
    notify("WebScraper Pro", "No images to export. Scrape some pages first!");
    return;
  }

  notify("WebScraper Pro", "Exporting " + imageRecords.length + " images as " + format.toUpperCase() + "...");

  WSP_ImageExport.exportBatch(imageRecords, format, 0.92, function (done, total) {
    if (done === total) {
      notify("WebScraper Pro", "Exported " + done + " images as " + format.toUpperCase());
    }
  }).catch(function (err) {
    notify("WebScraper Pro - Error", "Image export failed: " + err.message);
  });
}

/* ── Handle AI extraction results ── */
function handleAIExtractResult(data) {
  if (!data) return;

  function uid() {
    return typeof WSP_Utils !== "undefined" ? WSP_Utils.uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  scrapedRecords.push({
    id: uid(),
    type: "ai_extract",
    template: data.template || "unknown",
    extracted: data.result || {},
    source_url: data.source_url || "",
    source_title: data.source_title || "",
    scraped_at: new Date().toISOString(),
  });

  persistState();
  broadcastStats();

  /* Send AI_RESULTS back to popup so it can display the extraction */
  try {
    browser.runtime.sendMessage({
      action: "AI_RESULTS",
      results: [{ template: data.template, result: data.result, source_url: data.source_url }]
    }).catch(function () { /* popup may be closed */ });
  } catch (e) { /* ignore */ }

  notify("WebScraper Pro", "AI extraction complete for " + (data.source_url || "page"));
}

/* ── Handle extraction request from content script ── */
function handleAIExtractRequest(msg) {
  if (typeof WSP_AI === "undefined") {
    notify("WebScraper Pro", "Extract module not loaded. Reload the extension.");
    return;
  }

  var template;
  if (msg.template === "custom" && msg.customTemplate) {
    try {
      template = typeof msg.customTemplate === "string" ? JSON.parse(msg.customTemplate) : msg.customTemplate;
    } catch (e) {
      notify("WebScraper Pro - Error", "Invalid custom template: " + e.message);
      return;
    }
  } else {
    template = WSP_AI.getTemplate(msg.template || "article");
  }

  WSP_AI.extract(msg.text, template).then(function (result) {
    handleAIExtractResult({
      template: msg.template,
      result: result,
      source_url: msg.source_url,
      source_title: msg.source_title,
    });
  }).catch(function (err) {
    notify("WebScraper Pro - Error", "Extraction failed: " + err.message);
  });
}

/* ── Handle AI batch extraction (from popup) ── */
function handleAIBatchExtract(msg) {
  if (typeof WSP_AI === "undefined") {
    notify("WebScraper Pro", "AI module not loaded. Reload the extension.");
    return;
  }

  var textRecords = scrapedRecords.filter(function (r) { return r.type === "text" && r.text && r.text.length > 20; });
  if (textRecords.length === 0) {
    notify("WebScraper Pro", "No text records to extract from. Scrape some pages first!");
    return;
  }

  var template = WSP_AI.getTemplate(msg.template || "article");
  notify("WebScraper Pro", "Starting batch extraction on " + textRecords.length + " records...");

  WSP_AI.batchExtract(textRecords, template, function (done, total) {
    if (done % 5 === 0 || done === total) {
      notify("WebScraper Pro", "AI batch: " + done + "/" + total + " done");
    }
  }).then(function (batch) {
    var validResults = batch.results.filter(function (r) { return r.data && !r.skipped; });
    if (validResults.length > 0) {
      for (var i = 0; i < validResults.length; i++) {
        handleAIExtractResult({
          template: msg.template,
          result: validResults[i].data,
          source_url: validResults[i].source_url || "",
        });
      }
    }
    /* Send all results to popup */
    try {
      browser.runtime.sendMessage({
        action: "AI_RESULTS",
        results: validResults
      }).catch(function () {});
    } catch (e) { /* ignore */ }
    notify("WebScraper Pro", "Batch extraction complete: " + validResults.length + " results, " + batch.errors.length + " errors");
  }).catch(function (err) {
    notify("WebScraper Pro - Error", "Batch extraction failed: " + err.message);
  });
}

/* ── Auto-navigate for pagination ── */
function handleAutoNavigate(url, tab) {
  if (!tab) return;
  browser.tabs.update(tab.id, { url: url }).then(function () {
    var listener = function (tabId, changeInfo) {
      if (tabId === tab.id && changeInfo.status === "complete") {
        browser.webNavigation.onCompleted.removeListener(listener);
        setTimeout(function () {
          browser.tabs.sendMessage(tab.id, { action: "CONTINUE_AUTO_SCAN" }).catch(function () {});
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
  browser.tabs.query({}).then(function (tabs) {
    for (var i = 0; i < tabs.length; i++) {
      browser.tabs.sendMessage(tabs[i].id, { action: "STOP_SCRAPE" }).catch(function () {});
    }
  });
}

/* ── Clear data ── */
function clearData() {
  scrapedRecords = [];
  citations = [];
  sessionStats = { words: 0, pages: 0, images: 0, links: 0, audio: 0, video: 0 };
  lastUploadRecordCount = 0;
  persistState();
  broadcastStats();
}

/* ── Scrape all open tabs (simultaneous multi-page scraping) ── */
function scrapeAllTabs() {
  browser.tabs.query({}).then(function (tabs) {
    var validTabs = tabs.filter(function (t) {
      return t.url && (t.url.startsWith("http://") || t.url.startsWith("https://"));
    });
    if (validTabs.length === 0) {
      notify("WebScraper Pro", "No valid tabs to scrape.");
      return;
    }
    notify("WebScraper Pro", "Simultaneously scraping " + validTabs.length + " tabs...");
    
    // Get current config for fullHTML capture and other options
    browser.storage.local.get(["captureFullHTML", "scrapeJS", "scrapeVideo", "allowYouTube"]).then(function(cfg) {
      var completed = 0;
      var errors = 0;
      
      for (var i = 0; i < validTabs.length; i++) {
        (function(tab, index) {
          browser.tabs.sendMessage(tab.id, { 
            action: "SCRAPE_DOCUMENT",
            captureFullHTML: cfg.captureFullHTML,
            scrapeJS: cfg.scrapeJS,
            scrapeVideo: cfg.scrapeVideo !== false,
            allowYouTube: cfg.allowYouTube
          })
            .then(function () {
              completed++;
              console.log("[WSP] Tab " + (index + 1) + "/" + validTabs.length + " scraped: " + tab.url);
              if (completed + errors === validTabs.length) {
                var msg = "Finished scraping " + completed + "/" + validTabs.length + " tabs";
                if (errors > 0) msg += " (" + errors + " failed)";
                notify("WebScraper Pro", msg + ".");
                browser.storage.local.set({ scrapeActive: false });
                browser.runtime.sendMessage({ action: "STATUS_CHANGE", status: "idle" }).catch(function () {});
              }
            })
            .catch(function (err) {
              errors++;
              console.warn("[WSP] Failed to scrape tab " + (index + 1) + ": " + tab.url, err);
              if (completed + errors === validTabs.length) {
                var msg = "Finished scraping " + completed + "/" + validTabs.length + " tabs";
                if (errors > 0) msg += " (" + errors + " failed)";
                notify("WebScraper Pro", msg + ".");
                browser.storage.local.set({ scrapeActive: false });
                browser.runtime.sendMessage({ action: "STATUS_CHANGE", status: "idle" }).catch(function () {});
              }
            });
        })(validTabs[i], i);
      }
    });
  });
}

/* ── Handle clipboard scrape ── */
function handleClipboardScrape(text) {
  if (!text || text.length < 5) {
    notify("WebScraper Pro", "Clipboard is empty or too short to scrape.");
    return;
  }

  function uid() {
    return typeof WSP_Utils !== "undefined" ? WSP_Utils.uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Sanitize if available
  if (typeof WSP_Sanitizer !== "undefined") {
    var xssCheck = WSP_Sanitizer.detectXSS(text);
    if (!xssCheck.safe) {
      text = WSP_Sanitizer.sanitizeHTML(text);
    }
  }

  var fp = _fingerprint(text);
  var existing = scrapedRecords.some(function (r) { return r._fp === fp; });
  if (existing) {
    notify("WebScraper Pro", "Clipboard content already exists in records (duplicate).");
    return;
  }

  scrapedRecords.push({
    id: uid(),
    _fp: fp,
    type: "text",
    text: text,
    tag: "clipboard",
    source_url: "clipboard://paste",
    source_title: "Clipboard Paste",
    author: "Unknown",
    scraped_at: new Date().toISOString(),
  });

  sessionStats.words += text.split(/\s+/).length;
  sessionStats.pages += 1;
  persistState();
  broadcastStats();
  notify("WebScraper Pro", "Scraped " + text.split(/\s+/).length + " words from clipboard.");
}

/* ── Keyboard shortcut handler ── */
if (browser.commands && browser.commands.onCommand) {
  browser.commands.onCommand.addListener(function (command) {
    browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      if (!tabs[0]) return;
      var tabId = tabs[0].id;

      switch (command) {
        case "start-selection":
          browser.tabs.sendMessage(tabId, { action: "START_SELECTION" }).catch(function () {});
          break;
        case "scrape-page":
          browser.tabs.sendMessage(tabId, { action: "SCRAPE_FULL_PAGE" }).catch(function () {});
          break;
        case "scroll-scrape":
          browser.tabs.sendMessage(tabId, { action: "SCRAPE_WITH_SCROLL" }).catch(function () {});
          break;
        case "auto-scan":
          browser.tabs.sendMessage(tabId, { action: "START_AUTO_SCAN" }).catch(function () {});
          break;
        case "stop-scrape":
          stopAll();
          break;
      }
    });
  });
}

/* ── Context menu ── */
/* Use browser.menus (Firefox) with browser.contextMenus fallback (Chrome compat) */
var _menus = browser.menus || browser.contextMenus;
if (_menus) {
  try {
    _menus.create({
      id: "wsp-scrape-selection",
      title: "Scrape Selected Area",
      contexts: ["page", "selection", "image", "link"],
    });

    _menus.create({
      id: "wsp-scrape-page",
      title: "Scrape Full Page",
      contexts: ["page"],
    });

    _menus.create({
      id: "wsp-scroll-scrape",
      title: "Scroll & Scrape Entire Page",
      contexts: ["page"],
    });

    _menus.create({
      id: "wsp-smart-extract",
      title: "Smart Extract Article",
      contexts: ["page"],
    });
  } catch (e) {
    console.warn("[WSP] Failed to create context menus:", e);
  }

  _menus.onClicked.addListener(function (info, tab) {
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
} else {
  console.warn("[WSP] Context menus API not available — check that 'menus' permission is declared");
}

/* ── WebScraper Pro Background Script v0.6.6.1 ── */
/* eslint-env browser, webextensions */
/* Depends on: WSP_Utils, WSP_Citation, WSP_HFUpload, WSP_Queue, WSP_Session */

/* ── State ── */
var scrapedRecords = [];
var citations = [];
var sessionStats = { words: 0, pages: 0, images: 0, links: 0, audio: 0 };
var lastUploadRecordCount = 0;
var dedupSkipped = 0;

// Load persisted data on startup (with validation)
browser.storage.local.get(["scrapedRecords", "citations", "sessionStats", "lastUploadRecordCount"]).then(function (data) {
  if (Array.isArray(data.scrapedRecords)) scrapedRecords = data.scrapedRecords;
  if (Array.isArray(data.citations)) citations = data.citations;
  if (data.sessionStats && typeof data.sessionStats === "object") {
    sessionStats = Object.assign({ words: 0, pages: 0, images: 0, links: 0, audio: 0 }, data.sessionStats);
  }
  if (typeof data.lastUploadRecordCount === "number") lastUploadRecordCount = data.lastUploadRecordCount;
}).catch(function (err) {
  console.error("[WSP] Failed to load persisted data:", err);
});

/* ── Save state ── */
function persistState() {
  browser.storage.local.set({ scrapedRecords: scrapedRecords, citations: citations, sessionStats: sessionStats, lastUploadRecordCount: lastUploadRecordCount });
}

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

    // ── AI extraction ──
    case "AI_STATUS":
      if (typeof WSP_AI !== "undefined") {
        return WSP_AI.checkServer();
      }
      return Promise.resolve({ status: "disabled", message: "AI module not loaded" });

    case "AI_EXTRACT_RESULT":
      handleAIExtractResult(msg.data);
      break;

    case "AI_EXTRACT_REQUEST":
      handleAIExtractRequest(msg);
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

  // Generate citation (MLA + APA) — guard against WSP_Citation not loaded
  if (typeof WSP_Citation === "undefined") {
    console.error("[WSP] WSP_Citation not loaded — cannot generate citations");
    return;
  }

  var citation = WSP_Citation.generateDatasetCitation(meta);
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
        citation_mla: citation.mla,
        citation_apa: citation.apa || "",
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

  sessionStats.pages += 1;
  // Track how many duplicates were skipped this round
  var expectedNew = (data.texts ? data.texts.length : 0) + (data.images ? data.images.length : 0) + (data.links ? data.links.length : 0) + (data.audio ? data.audio.length : 0);
  var actualNew = scrapedRecords.length - preCount;
  dedupSkipped += Math.max(0, expectedNew - actualNew);

  persistState();
  broadcastStats();
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
  var timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  var clean = function (r) { var c = Object.assign({}, r); delete c._fp; return c; };
  var texts = scrapedRecords.filter(function (r) { return r.type === "text"; }).map(clean);
  var images = scrapedRecords.filter(function (r) { return r.type === "image"; }).map(clean);
  var links = scrapedRecords.filter(function (r) { return r.type === "link"; }).map(clean);
  var audioRecs = scrapedRecords.filter(function (r) { return r.type === "audio"; }).map(clean);

  if (format === "jsonl") {
    var toJL = prettyPrint
      ? function (arr) { return arr.map(function (r) { return JSON.stringify(r, null, 2); }).join("\n\n"); }
      : WSP_Utils.toJSONL;
    var ext = prettyPrint ? ".pretty.jsonl" : ".jsonl";
    if (texts.length > 0) WSP_Utils.downloadText(toJL(texts), "webscraper-pro/data/text_data_" + timestamp + ext);
    if (images.length > 0) WSP_Utils.downloadText(toJL(images), "webscraper-pro/data/images_" + timestamp + ext);
    if (links.length > 0) WSP_Utils.downloadText(toJL(links), "webscraper-pro/data/links_" + timestamp + ext);
    if (audioRecs.length > 0) WSP_Utils.downloadText(toJL(audioRecs), "webscraper-pro/data/audio_" + timestamp + ext);
    WSP_Utils.downloadText(toJL(citations), "webscraper-pro/data/citations_" + timestamp + ext);
  } else if (format === "json") {
    var indent = prettyPrint ? 4 : 2;
    WSP_Utils.downloadText(JSON.stringify({ texts: texts, images: images, links: links, audio: audioRecs, citations: citations }, null, indent),
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
  }

  notify("WebScraper Pro", "Exported " + scrapedRecords.length + " records in " + format.toUpperCase() + " format.");
}

/* ── Markdown export ── */
function toMarkdown(texts, images, links, audio, citationsList) {
  var md = "# WebScraper Pro Export\n\n";
  md += "**Generated:** " + new Date().toISOString() + "  \n";
  md += "**Version:** v0.6.6.1  \n";
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
  xml += '    <generator>WebScraper Pro v0.6.6.1</generator>\n';
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
        var clean = function (r) { var c = Object.assign({}, r); delete c._fp; delete c.headings; return c; };
        var texts = scrapedRecords.filter(function (r) { return r.type === "text"; }).map(clean);
        var images = scrapedRecords.filter(function (r) { return r.type === "image"; }).map(clean);
        var links = scrapedRecords.filter(function (r) { return r.type === "link"; }).map(clean);
        var audioRecs = scrapedRecords.filter(function (r) { return r.type === "audio"; }).map(clean);

        var uploadStats = Object.assign({}, sessionStats, { totalRecords: scrapedRecords.length });
        var files = [];

        var readme = WSP_HFUpload.generateReadme(cfg, citations, uploadStats);
        files.push({ path: "README.md", content: readme });

        if (texts.length > 0) files.push({ path: "data/text_data.jsonl", content: WSP_Utils.toJSONL(texts) });
        if (images.length > 0) files.push({ path: "data/images.jsonl", content: WSP_Utils.toJSONL(images) });
        if (links.length > 0) files.push({ path: "data/links.jsonl", content: WSP_Utils.toJSONL(links) });
        if (audioRecs.length > 0) files.push({ path: "data/audio.jsonl", content: WSP_Utils.toJSONL(audioRecs) });
        files.push({ path: "data/citations.jsonl", content: WSP_Utils.toJSONL(citations) });

        notify("WebScraper Pro", "Uploading " + files.length + " files to " + cfg.hfRepoId + "...");
        return WSP_HFUpload.commitFilesWithRetry(
          cfg.hfToken, cfg.hfRepoId, files,
          "Update dataset - " + scrapedRecords.length + " records, " + sessionStats.words + " words, " + sessionStats.pages + " pages",
          3
        ).then(function () {
          lastUploadRecordCount = scrapedRecords.length;
          persistState();
          notify("WebScraper Pro", "Uploaded " + scrapedRecords.length + " records to " + cfg.hfRepoId + "!");

          if (cfg.uploadToOwner) {
            notify("WebScraper Pro", "Uploading to shared repo " + OWNER_HF_REPO + "...");
            return WSP_HFUpload.commitFilesWithRetry(cfg.hfToken, OWNER_HF_REPO, files, "Community upload - " + scrapedRecords.length + " records", 2)
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
  notify("WebScraper Pro", "AI extraction complete for " + (data.source_url || "page"));
}

/* ── Handle AI extraction request from content script ── */
function handleAIExtractRequest(msg) {
  if (typeof WSP_AI === "undefined") {
    notify("WebScraper Pro", "AI module not loaded. Reload the extension.");
    return;
  }
  if (!WSP_AI._enabled) {
    notify("WebScraper Pro", "AI extraction is disabled. Enable it in Settings.");
    return;
  }

  var template = WSP_AI.getTemplate(msg.template || "article");

  WSP_AI.extract(msg.text, template).then(function (result) {
    handleAIExtractResult({
      template: msg.template,
      result: result,
      source_url: msg.source_url,
      source_title: msg.source_title,
    });
  }).catch(function (err) {
    notify("WebScraper Pro - Error", "AI extraction failed: " + err.message);
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
  sessionStats = { words: 0, pages: 0, images: 0, links: 0, audio: 0 };
  lastUploadRecordCount = 0;
  persistState();
  broadcastStats();
}

/* ── Scrape all open tabs ── */
function scrapeAllTabs() {
  browser.tabs.query({}).then(function (tabs) {
    var validTabs = tabs.filter(function (t) {
      return t.url && (t.url.startsWith("http://") || t.url.startsWith("https://"));
    });
    if (validTabs.length === 0) {
      notify("WebScraper Pro", "No valid tabs to scrape.");
      return;
    }
    notify("WebScraper Pro", "Scraping " + validTabs.length + " tabs...");
    var completed = 0;
    for (var i = 0; i < validTabs.length; i++) {
      browser.tabs.sendMessage(validTabs[i].id, { action: "SCRAPE_FULL_PAGE" })
        .then(function () {
          completed++;
          if (completed === validTabs.length) {
            notify("WebScraper Pro", "Finished scraping " + validTabs.length + " tabs.");
          }
        })
        .catch(function () {
          completed++;
        });
    }
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

browser.contextMenus.onClicked.addListener(function (info, tab) {
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

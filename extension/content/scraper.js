/* ── Scraper Module ── */
(function () {
  "use strict";

  /**
   * Collect all elements whose bounding rect intersects with the given selection rect.
   */
  function getElementsInRect(selRect) {
    const all = document.querySelectorAll("body *");
    const hits = [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (
        r.width > 0 && r.height > 0 &&
        r.left < selRect.right && r.right > selRect.left &&
        r.top < selRect.bottom && r.bottom > selRect.top
      ) {
        hits.push(el);
      }
    }
    return hits;
  }

  /**
   * Scrape data from a list of DOM elements.
   */
  function extractData(elements) {
    const texts = [];
    const images = [];
    const links = [];
    const audio = [];
    const seenText = new Set();
    const seenSrc = new Set();

    for (const el of elements) {
      // Text
      if (el.matches("p, h1, h2, h3, h4, h5, h6, li, td, th, span, blockquote, pre, code, figcaption, dt, dd, label, summary")) {
        const txt = el.innerText.trim();
        if (txt && !seenText.has(txt)) {
          seenText.add(txt);
          texts.push({
            tag: el.tagName.toLowerCase(),
            text: txt,
          });
        }
      }

      // Images
      if (el.tagName === "IMG" && el.src && !seenSrc.has(el.src)) {
        seenSrc.add(el.src);
        images.push({
          src: el.src,
          alt: el.alt || "",
          width: el.naturalWidth || el.width,
          height: el.naturalHeight || el.height,
        });
      }

      // Picture > source
      if (el.tagName === "SOURCE" && el.parentElement && el.parentElement.tagName === "PICTURE") {
        const srcset = el.srcset;
        if (srcset && !seenSrc.has(srcset)) {
          seenSrc.add(srcset);
          images.push({ src: srcset.split(",")[0].trim().split(" ")[0], alt: "", width: 0, height: 0 });
        }
      }

      // Background images
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none") {
        const match = bg.match(/url\(["']?(.*?)["']?\)/);
        if (match && match[1] && !seenSrc.has(match[1])) {
          seenSrc.add(match[1]);
          images.push({ src: match[1], alt: "background-image", width: 0, height: 0 });
        }
      }

      // Links
      if (el.tagName === "A" && el.href) {
        const href = el.href;
        if (!seenSrc.has(href)) {
          seenSrc.add(href);
          links.push({
            href,
            text: el.innerText.trim() || el.title || "",
          });
        }
      }

      // Audio / Video
      if (el.tagName === "AUDIO" || el.tagName === "VIDEO") {
        const src = el.src || (el.querySelector("source") && el.querySelector("source").src);
        if (src && !seenSrc.has(src)) {
          seenSrc.add(src);
          audio.push({ src, type: el.tagName.toLowerCase() });
        }
      }
    }

    return { texts, images, links, audio };
  }

  /**
   * Build page metadata.
   */
  function pageMeta() {
    const meta = {};
    meta.url = window.location.href;
    meta.title = document.title;
    meta.timestamp = new Date().toISOString();

    // Author detection
    const authorMeta = document.querySelector('meta[name="author"]');
    if (authorMeta) meta.author = authorMeta.content;

    const ldJson = document.querySelector('script[type="application/ld+json"]');
    if (ldJson) {
      try {
        const ld = JSON.parse(ldJson.textContent);
        if (ld.author) meta.author = typeof ld.author === "string" ? ld.author : ld.author.name || "";
        if (ld.publisher) meta.publisher = typeof ld.publisher === "string" ? ld.publisher : ld.publisher.name || "";
        if (ld.datePublished) meta.datePublished = ld.datePublished;
      } catch (_) { /* ignore */ }
    }

    const ogSiteName = document.querySelector('meta[property="og:site_name"]');
    if (ogSiteName) meta.siteName = ogSiteName.content;

    const pubDate = document.querySelector('meta[name="date"], meta[property="article:published_time"], time[datetime]');
    if (pubDate) meta.datePublished = meta.datePublished || pubDate.content || pubDate.getAttribute("datetime");

    return meta;
  }

  /**
   * Scrape a selected rectangle area.
   */
  function scrapeRect(selRect) {
    const elements = getElementsInRect(selRect);
    const data = extractData(elements);
    const meta = pageMeta();
    const result = { meta, ...data, scrapedAt: new Date().toISOString() };

    // Highlight scraped elements
    elements.forEach((el) => el.classList.add("wsp-scraped-highlight"));
    setTimeout(() => elements.forEach((el) => el.classList.remove("wsp-scraped-highlight")), 2000);

    // Send to background
    browser.runtime.sendMessage({ action: "SCRAPED_DATA", data: result });
    if (typeof WSP_Toast !== "undefined") WSP_Toast.show(`Scraped: ${data.texts.length} texts, ${data.images.length} images, ${data.links.length} links`);
    return result;
  }

  /**
   * Scrape the entire visible page.
   */
  function scrapeFullPage() {
    const selRect = {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
    return scrapeRect(selRect);
  }

  /**
   * Scrape the entire document (scrolled content too).
   */
  function scrapeEntireDocument() {
    const selRect = {
      left: 0,
      top: 0,
      right: document.documentElement.scrollWidth,
      bottom: document.documentElement.scrollHeight,
    };
    // Need to get elements based on their page position, not viewport
    const all = document.querySelectorAll("body *");
    const elements = [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      const absTop = r.top + window.scrollY;
      const absLeft = r.left + window.scrollX;
      if (r.width > 0 && r.height > 0) {
        elements.push(el);
      }
    }
    const data = extractData(elements);
    const meta = pageMeta();
    const result = { meta, ...data, scrapedAt: new Date().toISOString() };
    browser.runtime.sendMessage({ action: "SCRAPED_DATA", data: result });
    if (typeof WSP_Toast !== "undefined") WSP_Toast.show(`Full scrape: ${data.texts.length} texts, ${data.images.length} images`);
    return result;
  }

  /* ── Message listener ── */
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "SCRAPE_FULL_PAGE") {
      scrapeFullPage();
    }
    if (msg.action === "SCRAPE_DOCUMENT") {
      scrapeEntireDocument();
    }
  });

  window.WSP_Scraper = { scrapeRect, scrapeFullPage, scrapeEntireDocument };
})();

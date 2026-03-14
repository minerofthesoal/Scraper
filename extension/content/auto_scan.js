/* ── Auto-Scan Module v0.5b ── */
/* Scroll-first approach: checks page length, scrapes viewport by viewport, then chases pages. */
(function () {
  "use strict";

  let active = false;
  let scrollTimer = null;
  let pageCount = 0;
  const MAX_PAGES = 200;

  /* ── Next-page button detection ── */
  const NEXT_PATTERNS = [
    // English
    /\bnext\b/i, /\bnext\s*page\b/i, /\bforward\b/i, /\bolder\b/i,
    /\bmore\b/i, /\bload\s*more\b/i, /\bshow\s*more\b/i, /\bcontinue\b/i,
    // Symbols
    /^[>›»→]+$/, /^→$/, /^\s*>\s*$/,
    // Pagination
    /^\d+$/ // we handle numeric pagination separately
  ];

  const NEXT_ARIA = ["next", "Next", "Next Page", "forward", "load more"];

  function findNextButton() {
    // 1. Check rel="next" links
    const relNext = document.querySelector('a[rel="next"], link[rel="next"]');
    if (relNext && relNext.href) return relNext;

    // 2. Check aria-label
    for (const label of NEXT_ARIA) {
      const el = document.querySelector(`[aria-label="${label}"], [aria-label="${label.toLowerCase()}"]`);
      if (el) return el;
    }

    // 3. Check button/link text content
    const candidates = document.querySelectorAll('a, button, [role="button"], [class*="next"], [class*="pag"]');
    for (const el of candidates) {
      const text = (el.textContent || "").trim();
      if (text.length > 50) continue;

      for (const pattern of NEXT_PATTERNS) {
        if (pattern.test(text)) {
          if (/^\d+$/.test(text)) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return el;
        }
      }
    }

    // 4. Look for pagination with ">" or "»" character
    const pagers = document.querySelectorAll('.pagination a, .pager a, nav a, [class*="page"] a');
    for (const el of pagers) {
      const t = (el.textContent || "").trim();
      if (/^[>›»→]$/.test(t) || t.toLowerCase() === "next") {
        return el;
      }
    }

    return null;
  }

  /* ── Infinite scroll detection ── */
  function isNearBottom() {
    const scrollPos = window.scrollY + window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;
    return (docHeight - scrollPos) < 300;
  }

  function scrollDown() {
    window.scrollBy({ top: window.innerHeight * 0.8, behavior: "smooth" });
  }

  /* ── Progress bar ── */
  function showProgress(pct) {
    let bar = document.getElementById("wsp-progress-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "wsp-progress-bar";
      document.body.appendChild(bar);
    }
    bar.style.width = pct + "%";
  }

  function removeProgress() {
    const bar = document.getElementById("wsp-progress-bar");
    if (bar) bar.remove();
  }

  /* ── Main auto-scan loop (scroll-first approach) ── */
  async function autoScanStep() {
    if (!active) return;

    pageCount++;
    if (pageCount > MAX_PAGES) {
      stop();
      if (typeof WSP_Toast !== "undefined") WSP_Toast.show("Auto-scan: reached max page limit (" + MAX_PAGES + ")");
      return;
    }

    showProgress(Math.min((pageCount / MAX_PAGES) * 100, 100));

    // SCROLL-FIRST: Before chasing pages, scroll down to check if page is longer
    // and scrape viewport by viewport
    if (typeof WSP_Scraper !== "undefined" && WSP_Scraper.scrapeWithScroll) {
      if (typeof WSP_Toast !== "undefined") WSP_Toast.show("Scrolling to check page length...");
      await WSP_Scraper.scrapeWithScroll();
    } else if (typeof WSP_Scraper !== "undefined") {
      // Fallback to legacy full page scrape
      WSP_Scraper.scrapeFullPage();
    }

    // Wait for content to be processed
    await sleep(1500);

    if (!active) return;

    // Check for config
    const cfg = await browser.storage.local.get(["autoScroll", "autoNext"]);
    const doScroll = cfg.autoScroll !== false;
    const doNext = cfg.autoNext !== false;

    // NOW chase pages (after scrolling the current page)

    // Strategy 1: Find and click a "next" button
    if (doNext) {
      const nextBtn = findNextButton();
      if (nextBtn) {
        if (typeof WSP_Toast !== "undefined") WSP_Toast.show("Auto-scan: clicking next page...");

        // Reset scroll position for the new page
        if (typeof WSP_Scraper !== "undefined" && WSP_Scraper.resetScrollPosition) {
          WSP_Scraper.resetScrollPosition();
        }

        if (nextBtn.tagName === "A" && nextBtn.href) {
          browser.runtime.sendMessage({
            action: "AUTO_NAVIGATE",
            url: nextBtn.href
          });
          return; // Background script will handle continuing auto-scan on new page
        } else {
          nextBtn.click();
          await sleep(2000);
          if (active) autoScanStep();
          return;
        }
      }
    }

    // Strategy 2: Check for dynamically loaded content by scrolling more
    if (doScroll) {
      const prevHeight = document.documentElement.scrollHeight;
      scrollDown();
      await sleep(2000);

      if (!active) return;

      const newHeight = document.documentElement.scrollHeight;
      if (newHeight > prevHeight) {
        if (typeof WSP_Toast !== "undefined") WSP_Toast.show("Auto-scan: new content detected, continuing...");
        autoScanStep();
        return;
      }

      if (!isNearBottom()) {
        autoScanStep();
        return;
      }
    }

    // Nothing more to do
    stop();
    if (typeof WSP_Toast !== "undefined") WSP_Toast.show("Auto-scan: complete - no more pages found");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* ── Public API ── */
  function start() {
    if (active) return;
    active = true;
    pageCount = 0;

    // Reset scroll tracking for fresh session
    if (typeof WSP_Scraper !== "undefined" && WSP_Scraper.resetScrollPosition) {
      WSP_Scraper.resetScrollPosition();
    }

    browser.runtime.sendMessage({ action: "STATUS_CHANGE", status: "scraping" });
    browser.storage.local.set({ scrapeActive: true });
    if (typeof WSP_Toast !== "undefined") WSP_Toast.show("Auto-scan started (scroll-first mode)");
    autoScanStep();
  }

  function stop() {
    active = false;
    removeProgress();
    browser.runtime.sendMessage({ action: "STATUS_CHANGE", status: "idle" });
    browser.storage.local.set({ scrapeActive: false });
    clearTimeout(scrollTimer);
  }

  /* ── Message listener ── */
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "START_AUTO_SCAN") start();
    if (msg.action === "STOP_SCRAPE") stop();
    if (msg.action === "CONTINUE_AUTO_SCAN") {
      active = true;
      autoScanStep();
    }
  });

  // Auto-start on new page if configured
  browser.storage.local.get(["autoStart", "scrapeActive"]).then((cfg) => {
    if (cfg.autoStart && cfg.scrapeActive) {
      setTimeout(() => start(), 1500);
    }
  });

  window.WSP_AutoScan = { start, stop, findNextButton };
})();

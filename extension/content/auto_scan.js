/* ── Auto-Scan Module v0.6b ── */
/* Scroll-first approach: fully scrapes current page, THEN finds next page. */
(function () {
  "use strict";

  let active = false;
  let scrollTimer = null;
  let pageCount = 0;
  let MAX_PAGES = 200;
  let lastScrapedUrl = ""; // Track URL to detect actual page changes

  /* ── Next-page button detection ── */
  const NEXT_PATTERNS = [
    // English
    /\bnext\b/i, /\bnext\s*page\b/i, /\bforward\b/i, /\bolder\b/i,
    /\bmore\b/i, /\bload\s*more\b/i, /\bshow\s*more\b/i, /\bcontinue\b/i,
    // Symbols
    /^[>›»→]+$/, /^→$/, /^\s*>\s*$/,
    // Pagination
    /^\d+$/ // handled separately
  ];

  const NEXT_ARIA = ["next", "Next", "Next Page", "forward", "load more"];

  function findNextButton() {
    // 1. Check rel="next" links (most reliable)
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
          if (/^\d+$/.test(text)) continue; // Skip standalone numbers
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return el;
        }
      }
    }

    // 4. Pagination with ">" or "»"
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

  /* ── Wait for DOM to stabilize after navigation/click ── */
  async function waitForPageStable(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 5000);
    let prevHeight = document.documentElement.scrollHeight;
    let prevContent = document.body ? document.body.innerText.length : 0;
    let stableCount = 0;

    while (Date.now() < deadline) {
      await sleep(500);
      const newHeight = document.documentElement.scrollHeight;
      const newContent = document.body ? document.body.innerText.length : 0;

      if (newHeight === prevHeight && Math.abs(newContent - prevContent) < 50) {
        stableCount++;
        if (stableCount >= 3) return; // Stable for 1.5 seconds
      } else {
        stableCount = 0;
      }
      prevHeight = newHeight;
      prevContent = newContent;
    }
  }

  /* ── Main auto-scan loop ── */
  async function autoScanStep() {
    if (!active) return;

    pageCount++;
    if (pageCount > MAX_PAGES) {
      stop();
      if (typeof WSP_Toast !== "undefined") WSP_Toast.show("Auto-scan: reached max page limit (" + MAX_PAGES + ")");
      return;
    }

    showProgress(Math.min((pageCount / MAX_PAGES) * 100, 100));

    // Load config
    const cfg = await browser.storage.local.get(["autoScroll", "autoNext", "maxPages", "scrapeDelay"]);
    if (cfg.maxPages) MAX_PAGES = cfg.maxPages;
    const doScroll = cfg.autoScroll !== false;
    const doNext = cfg.autoNext !== false;
    const scrapeDelay = cfg.scrapeDelay || 1500;

    // ══════════════════════════════════════════════════════════════
    // STEP 1: FULLY SCRAPE THE CURRENT PAGE FIRST
    // ══════════════════════════════════════════════════════════════

    lastScrapedUrl = window.location.href;

    if (typeof WSP_Scraper !== "undefined" && WSP_Scraper.scrapeWithScroll) {
      if (typeof WSP_Toast !== "undefined") WSP_Toast.show(`Page ${pageCount}: scrolling & scraping...`);
      await WSP_Scraper.scrapeWithScroll();
    } else if (typeof WSP_Scraper !== "undefined") {
      WSP_Scraper.scrapeFullPage();
    }

    // Wait for background to process the scraped data
    await sleep(scrapeDelay);
    if (!active) return;

    // ══════════════════════════════════════════════════════════════
    // STEP 2: CHECK FOR INFINITE SCROLL (new content loading)
    // ══════════════════════════════════════════════════════════════

    if (doScroll) {
      let infiniteScrollRounds = 0;
      const maxInfiniteRounds = 10; // prevent infinite loops

      while (infiniteScrollRounds < maxInfiniteRounds && active) {
        const prevHeight = document.documentElement.scrollHeight;
        scrollDown();
        await sleep(2000);
        if (!active) return;

        const newHeight = document.documentElement.scrollHeight;
        if (newHeight <= prevHeight) break; // No new content loaded

        infiniteScrollRounds++;
        if (typeof WSP_Toast !== "undefined") {
          WSP_Toast.show(`Page ${pageCount}: new content loaded (scroll ${infiniteScrollRounds}), scraping...`);
        }

        // Scrape the newly loaded content
        if (typeof WSP_Scraper !== "undefined" && WSP_Scraper.scrapeWithScroll) {
          await WSP_Scraper.scrapeWithScroll();
        }
        await sleep(scrapeDelay);
      }
    }

    if (!active) return;

    // ══════════════════════════════════════════════════════════════
    // STEP 3: ONLY NOW LOOK FOR NEXT PAGE
    // (page is fully scraped at this point)
    // ══════════════════════════════════════════════════════════════

    if (doNext) {
      const nextBtn = findNextButton();
      if (nextBtn) {
        if (typeof WSP_Toast !== "undefined") WSP_Toast.show(`Page ${pageCount} done. Navigating to next page...`);

        // Reset scroll position for the new page
        if (typeof WSP_Scraper !== "undefined" && WSP_Scraper.resetScrollPosition) {
          WSP_Scraper.resetScrollPosition();
        }

        if (nextBtn.tagName === "A" && nextBtn.href) {
          // Navigation via link — background script handles page load
          browser.runtime.sendMessage({
            action: "AUTO_NAVIGATE",
            url: nextBtn.href
          });
          return; // CONTINUE_AUTO_SCAN will be sent after page loads
        } else {
          // Button click (SPA navigation / AJAX load)
          nextBtn.click();

          // Wait for the page to actually change/stabilize
          await waitForPageStable(8000);
          await sleep(1000); // Extra buffer

          if (!active) return;

          // Verify something actually changed
          const newUrl = window.location.href;
          const heightChanged = document.documentElement.scrollHeight !== 0;
          if (newUrl !== lastScrapedUrl || heightChanged) {
            autoScanStep(); // Continue with next page
          } else {
            // Button click didn't change anything meaningful
            if (typeof WSP_Toast !== "undefined") {
              WSP_Toast.show("Auto-scan: next button didn't load new content, stopping.");
            }
            stop();
          }
          return;
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 4: NO NEXT BUTTON FOUND — TRY SCROLLING FOR MORE
    // ══════════════════════════════════════════════════════════════

    if (doScroll && !isNearBottom()) {
      scrollDown();
      await sleep(2000);
      if (active) autoScanStep();
      return;
    }

    // Nothing more to do
    stop();
    if (typeof WSP_Toast !== "undefined") WSP_Toast.show(`Auto-scan complete: ${pageCount} pages scraped`);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* ── Public API ── */
  function start() {
    if (active) return;
    active = true;
    pageCount = 0;
    lastScrapedUrl = "";

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

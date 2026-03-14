/* ── Area Selection Module v0.5.5b ── */
/* global WSP_Scraper */
(function () {
  "use strict";

  let overlay = null;
  let rect = null;
  let counter = null;
  let startX = 0, startY = 0;
  let isDrawing = false;
  let previewTimer = null;

  function createOverlay() {
    removeOverlay();
    overlay = document.createElement("div");
    overlay.id = "wsp-selection-overlay";
    document.body.appendChild(overlay);

    rect = document.createElement("div");
    rect.id = "wsp-selection-rect";
    document.body.appendChild(rect);

    counter = document.createElement("div");
    counter.id = "wsp-selection-counter";
    counter.style.display = "none";
    document.body.appendChild(counter);

    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);
    overlay.addEventListener("contextmenu", (e) => { e.preventDefault(); cancel(); });
    document.addEventListener("keydown", onKeyDown);
  }

  function removeOverlay() {
    if (overlay) { overlay.remove(); overlay = null; }
    if (rect) { rect.remove(); rect = null; }
    if (counter) { counter.remove(); counter = null; }
    clearTimeout(previewTimer);
    document.removeEventListener("keydown", onKeyDown);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") cancel();
  }

  function cancel() {
    removeOverlay();
    removeToolbar();
  }

  function onMouseDown(e) {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    rect.style.left = startX + "px";
    rect.style.top = startY + "px";
    rect.style.width = "0";
    rect.style.height = "0";
    rect.style.display = "block";
    if (counter) counter.style.display = "none";
  }

  function onMouseMove(e) {
    if (!isDrawing) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    rect.style.left = x + "px";
    rect.style.top = y + "px";
    rect.style.width = w + "px";
    rect.style.height = h + "px";

    // Live preview: count elements in selection (debounced)
    clearTimeout(previewTimer);
    if (w > 30 && h > 30) {
      previewTimer = setTimeout(() => {
        updateLiveCounter({
          left: x, top: y,
          right: x + w, bottom: y + h,
        }, e.clientX, e.clientY);
      }, 100);
    }
  }

  function updateLiveCounter(selRect, mouseX, mouseY) {
    if (!counter) return;

    const all = document.querySelectorAll("body *");
    let wordCount = 0;
    let imgCount = 0;
    let linkCount = 0;
    const seenText = new Set();

    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.left >= selRect.right || r.right <= selRect.left ||
          r.top >= selRect.bottom || r.bottom <= selRect.top) continue;

      if (el.tagName === "IMG") imgCount++;
      if (el.tagName === "A" && el.href) linkCount++;

      const text = (el.innerText || "").trim();
      if (text && text.length > 2 && !seenText.has(text)) {
        seenText.add(text);
        wordCount += text.split(/\s+/).filter(w => w.length > 0).length;
      }
    }

    counter.innerHTML = `<span class="count-words">${wordCount}</span> words · <span class="count-imgs">${imgCount}</span> imgs · <span class="count-links">${linkCount}</span> links`;
    counter.style.left = (mouseX + 15) + "px";
    counter.style.top = (mouseY - 25) + "px";
    counter.style.display = "block";

    // Keep in viewport
    requestAnimationFrame(() => {
      if (!counter) return;
      const cr = counter.getBoundingClientRect();
      if (cr.right > window.innerWidth) counter.style.left = (mouseX - cr.width - 10) + "px";
      if (cr.top < 0) counter.style.top = (mouseY + 15) + "px";
    });
  }

  function onMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    clearTimeout(previewTimer);
    if (counter) counter.style.display = "none";

    const selRect = {
      left: Math.min(startX, e.clientX),
      top: Math.min(startY, e.clientY),
      right: Math.max(startX, e.clientX),
      bottom: Math.max(startY, e.clientY),
    };

    // Minimum size
    if (selRect.right - selRect.left < 20 || selRect.bottom - selRect.top < 20) {
      cancel();
      return;
    }

    removeOverlay();
    showToolbar(selRect);
  }

  /* ── Floating toolbar ── */
  function showToolbar(selRect) {
    removeToolbar();
    const bar = document.createElement("div");
    bar.id = "wsp-toolbar";

    const btnScrape = document.createElement("button");
    btnScrape.textContent = "Scrape Area";
    btnScrape.addEventListener("click", () => {
      removeToolbar();
      if (typeof WSP_Scraper !== "undefined") {
        WSP_Scraper.scrapeRect(selRect);
      }
    });

    const btnScrapeAndNext = document.createElement("button");
    btnScrapeAndNext.textContent = "Scrape + Auto-Next";
    btnScrapeAndNext.addEventListener("click", () => {
      removeToolbar();
      if (typeof WSP_Scraper !== "undefined") {
        WSP_Scraper.scrapeRect(selRect);
      }
      if (typeof WSP_AutoScan !== "undefined") {
        WSP_AutoScan.start();
      }
    });

    const btnScrollScrape = document.createElement("button");
    btnScrollScrape.textContent = "Scroll & Scrape";
    btnScrollScrape.addEventListener("click", () => {
      removeToolbar();
      if (typeof WSP_Scraper !== "undefined") {
        WSP_Scraper.scrapeWithScroll();
      }
    });

    const btnCancel = document.createElement("button");
    btnCancel.className = "wsp-btn-danger";
    btnCancel.textContent = "Cancel";
    btnCancel.addEventListener("click", removeToolbar);

    bar.appendChild(btnScrape);
    bar.appendChild(btnScrapeAndNext);
    bar.appendChild(btnScrollScrape);
    bar.appendChild(btnCancel);

    // Position toolbar below the selection
    bar.style.left = selRect.left + "px";
    bar.style.top = (selRect.bottom + 8) + "px";
    document.body.appendChild(bar);

    // Ensure it stays within viewport
    requestAnimationFrame(() => {
      const r = bar.getBoundingClientRect();
      if (r.right > window.innerWidth) bar.style.left = (window.innerWidth - r.width - 10) + "px";
      if (r.bottom > window.innerHeight) bar.style.top = (selRect.top - r.height - 8) + "px";
    });
  }

  function removeToolbar() {
    const existing = document.getElementById("wsp-toolbar");
    if (existing) existing.remove();
  }

  /* ── Toast ── */
  window.WSP_Toast = {
    show(msg, duration = 3000) {
      let toast = document.getElementById("wsp-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "wsp-toast";
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.classList.add("visible");
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => toast.classList.remove("visible"), duration);
    }
  };

  /* ── Message listener ── */
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "START_SELECTION") {
      createOverlay();
    }
  });

  window.WSP_Selector = { start: createOverlay, cancel };
})();

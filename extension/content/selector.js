/* ── Area Selection Module ── */
/* global WSP_Scraper */
(function () {
  "use strict";

  let overlay = null;
  let rect = null;
  let startX = 0, startY = 0;
  let isDrawing = false;

  function createOverlay() {
    removeOverlay();
    overlay = document.createElement("div");
    overlay.id = "wsp-selection-overlay";
    document.body.appendChild(overlay);

    rect = document.createElement("div");
    rect.id = "wsp-selection-rect";
    document.body.appendChild(rect);

    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);
    overlay.addEventListener("contextmenu", (e) => { e.preventDefault(); cancel(); });
    document.addEventListener("keydown", onKeyDown);
  }

  function removeOverlay() {
    if (overlay) { overlay.remove(); overlay = null; }
    if (rect) { rect.remove(); rect = null; }
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
  }

  function onMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;

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

    const btnCancel = document.createElement("button");
    btnCancel.className = "wsp-btn-danger";
    btnCancel.textContent = "Cancel";
    btnCancel.addEventListener("click", removeToolbar);

    bar.appendChild(btnScrape);
    bar.appendChild(btnScrapeAndNext);
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

/* ── Scraper Module v0.7.2 ── */
/* Universal text/image/link/audio/video extraction that works on ANY site */
(function () {
  "use strict";

  /* ── Track last scrape viewport position ── */
  let lastScrapeBottomY = 0;

  /**
   * Collect all elements whose bounding rect intersects with the given selection rect.
   * selRect coordinates are relative to the viewport by default.
   * If useDocumentCoords is true, selRect is in document (absolute) coordinates.
   */
  function getElementsInRect(selRect, useDocumentCoords) {
    const all = document.querySelectorAll("body *");
    const hits = [];
    const scrollX = useDocumentCoords ? window.scrollX : 0;
    const scrollY = useDocumentCoords ? window.scrollY : 0;

    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;

      // Convert viewport-relative bounding rect to document coords if needed
      const elLeft = r.left + scrollX;
      const elRight = r.right + scrollX;
      const elTop = r.top + scrollY;
      const elBottom = r.bottom + scrollY;

      if (
        elLeft < selRect.right && elRight > selRect.left &&
        elTop < selRect.bottom && elBottom > selRect.top
      ) {
        hits.push(el);
      }
    }
    return hits;
  }

  /**
   * Universal text extraction - works on sites like Shelf.it, SPAs, shadow DOM, etc.
   * Falls back through multiple strategies to find ALL text content.
   */
  function extractTextUniversal(elements) {
    const texts = [];
    const seenText = new Set();
    let totalWords = 0;

    // Strategy 1: Standard semantic elements
    const semanticTags = "p, h1, h2, h3, h4, h5, h6, li, td, th, span, blockquote, pre, code, figcaption, dt, dd, label, summary, article, section, caption, address, cite, em, strong, b, i, mark, small, sub, sup, details, time";

    for (const el of elements) {
      if (el.matches(semanticTags)) {
        const txt = getDeepText(el);
        if (txt && txt.length > 2 && !seenText.has(txt)) {
          seenText.add(txt);
          totalWords += countWords(txt);
          texts.push({ tag: el.tagName.toLowerCase(), text: txt });
        }
      }
    }

    // Strategy 2: Divs and custom elements that are leaf text nodes
    // (catches Shelf.it, React/Vue rendered text, web components)
    for (const el of elements) {
      if (texts.length > 0 && el.matches(semanticTags)) continue; // Already got it

      const txt = getDirectText(el);
      if (txt && txt.length > 2 && !seenText.has(txt)) {
        // Make sure this element primarily contains text (not a layout container)
        const childElements = el.children.length;
        const textRatio = txt.length / (el.innerHTML || "x").length;

        if (childElements <= 3 || textRatio > 0.3) {
          seenText.add(txt);
          totalWords += countWords(txt);
          texts.push({ tag: el.tagName.toLowerCase(), text: txt });
        }
      }
    }

    // Strategy 3: TreeWalker for text nodes not inside any captured element
    // This catches text in unusual DOM structures
    if (texts.length === 0) {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const txt = node.textContent.trim();
            if (!txt || txt.length < 3) return NodeFilter.FILTER_REJECT;
            // Skip script/style
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName;
            if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
            // Check if visible
            const style = getComputedStyle(parent);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      let node;
      while ((node = walker.nextNode())) {
        const txt = node.textContent.trim();
        if (txt.length > 2 && !seenText.has(txt)) {
          seenText.add(txt);
          totalWords += countWords(txt);
          texts.push({ tag: node.parentElement.tagName.toLowerCase(), text: txt });
        }
      }
    }

    // Strategy 4: Shadow DOM traversal
    for (const el of elements) {
      if (el.shadowRoot) {
        const shadowTexts = extractFromShadow(el.shadowRoot, seenText);
        for (const st of shadowTexts) {
          totalWords += countWords(st.text);
          texts.push(st);
        }
      }
    }

    return { texts, totalWords };
  }

  /**
   * Extract text from shadow DOM
   */
  function extractFromShadow(shadowRoot, seenText) {
    const texts = [];
    const els = shadowRoot.querySelectorAll("*");
    for (const el of els) {
      const txt = getDeepText(el);
      if (txt && txt.length > 2 && !seenText.has(txt)) {
        seenText.add(txt);
        texts.push({ tag: el.tagName.toLowerCase(), text: txt });
      }
      if (el.shadowRoot) {
        texts.push(...extractFromShadow(el.shadowRoot, seenText));
      }
    }
    return texts;
  }

  /**
   * Get deep text content, handling innerText properly.
   */
  function getDeepText(el) {
    // innerText respects CSS visibility and layout, textContent doesn't
    // Use innerText when available as it gives rendered text
    try {
      const txt = (el.innerText || el.textContent || "").trim();
      // Clean up excessive whitespace
      return txt.replace(/\s+/g, " ");
    } catch {
      return "";
    }
  }

  /**
   * Get only the direct text of an element (not children).
   */
  function getDirectText(el) {
    let text = "";
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent;
      }
    }
    return text.trim().replace(/\s+/g, " ");
  }

  /**
   * Count words in text.
   */
  function countWords(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  /**
   * Universal image extraction - finds images everywhere.
   */
  function extractImagesUniversal(elements) {
    const images = [];
    const seenSrc = new Set();

    for (const el of elements) {
      // Standard <img>
      if (el.tagName === "IMG") {
        const src = el.currentSrc || el.src;
        if (src && !seenSrc.has(src) && !src.startsWith("data:image/svg")) {
          seenSrc.add(src);
          images.push({
            src,
            alt: el.alt || el.title || "",
            width: el.naturalWidth || el.width || 0,
            height: el.naturalHeight || el.height || 0,
          });
        }
      }

      // <picture> > <source>
      if (el.tagName === "SOURCE" && el.parentElement && el.parentElement.tagName === "PICTURE") {
        const srcset = el.srcset;
        if (srcset) {
          // Parse srcset - get highest resolution
          const candidates = srcset.split(",").map(s => s.trim().split(" ")[0]);
          for (const src of candidates) {
            if (src && !seenSrc.has(src)) {
              seenSrc.add(src);
              images.push({ src, alt: "", width: 0, height: 0 });
            }
          }
        }
      }

      // <svg> elements (capture as data URL if small enough)
      if (el.tagName === "svg" || el.tagName === "SVG") {
        try {
          const svgStr = new XMLSerializer().serializeToString(el);
          if (svgStr.length < 50000) { // Only small SVGs
            const src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgStr)));
            if (!seenSrc.has(src)) {
              seenSrc.add(src);
              images.push({ src, alt: "svg", width: el.clientWidth || 0, height: el.clientHeight || 0 });
            }
          }
        } catch { /* skip */ }
      }

      // Background images (CSS)
      try {
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== "none") {
          const matches = bg.matchAll(/url\(["']?(.*?)["']?\)/g);
          for (const match of matches) {
            const src = match[1];
            if (src && !seenSrc.has(src) && !src.startsWith("data:image/svg")) {
              seenSrc.add(src);
              images.push({ src, alt: "background-image", width: 0, height: 0 });
            }
          }
        }
      } catch { /* skip */ }

      // data-src, data-lazy-src, data-original (lazy loading)
      for (const attr of ["data-src", "data-lazy-src", "data-original", "data-bg", "data-image"]) {
        const src = el.getAttribute(attr);
        if (src && src.startsWith("http") && !seenSrc.has(src)) {
          seenSrc.add(src);
          images.push({ src, alt: el.alt || el.title || "lazy-loaded", width: 0, height: 0 });
        }
      }

      // <video> poster
      if (el.tagName === "VIDEO" && el.poster) {
        const src = el.poster;
        if (!seenSrc.has(src)) {
          seenSrc.add(src);
          images.push({ src, alt: "video-poster", width: el.videoWidth || 0, height: el.videoHeight || 0 });
        }
      }

      // <canvas> (grab as image if it has content)
      if (el.tagName === "CANVAS" && el.width > 10 && el.height > 10) {
        try {
          const src = el.toDataURL("image/png");
          if (src && !seenSrc.has(src)) {
            seenSrc.add(src);
            images.push({ src, alt: "canvas", width: el.width, height: el.height });
          }
        } catch { /* CORS blocked */ }
      }
    }

    return images;
  }

  /**
   * Universal link extraction.
   */
  function extractLinksUniversal(elements) {
    const links = [];
    const seenHref = new Set();

    for (const el of elements) {
      // Standard <a>
      if (el.tagName === "A" && el.href) {
        const href = el.href;
        if (!seenHref.has(href) && href.startsWith("http")) {
          seenHref.add(href);
          links.push({
            href,
            text: getDeepText(el) || el.title || "",
            rel: el.rel || "",
          });
        }
      }

      // Elements with onclick navigation
      if (el.getAttribute("onclick")) {
        const onclick = el.getAttribute("onclick");
        const urlMatch = onclick.match(/(?:location\.href|window\.open)\s*[=(]\s*['"]([^'"]+)['"]/);
        if (urlMatch && urlMatch[1] && !seenHref.has(urlMatch[1])) {
          seenHref.add(urlMatch[1]);
          links.push({ href: urlMatch[1], text: getDeepText(el), rel: "onclick" });
        }
      }

      // data-href, data-url attributes
      for (const attr of ["data-href", "data-url", "data-link"]) {
        const href = el.getAttribute(attr);
        if (href && href.startsWith("http") && !seenHref.has(href)) {
          seenHref.add(href);
          links.push({ href, text: getDeepText(el), rel: "data-attr" });
        }
      }

      // [role="link"] elements
      if (el.getAttribute("role") === "link") {
        const href = el.getAttribute("href") || el.getAttribute("data-href");
        if (href && !seenHref.has(href)) {
          seenHref.add(href);
          links.push({ href, text: getDeepText(el), rel: "role-link" });
        }
      }
    }

    return links;
  }

  /**
   * Universal audio extraction.
   */
  function extractAudioUniversal(elements) {
    const audio = [];
    const seenSrc = new Set();

    for (const el of elements) {
      if (el.tagName === "AUDIO") {
        let src = el.currentSrc || el.src;
        if (!src) {
          const source = el.querySelector("source");
          if (source) src = source.src;
        }
        if (src && !seenSrc.has(src)) {
          seenSrc.add(src);
          audio.push({ src, type: "audio", mime: el.type || "" });
        }
        for (const source of el.querySelectorAll("source")) {
          if (source.src && !seenSrc.has(source.src)) {
            seenSrc.add(source.src);
            audio.push({ src: source.src, type: "audio", mime: source.type || "" });
          }
        }
      }

      // <embed> and <object> audio
      if (el.tagName === "EMBED" || el.tagName === "OBJECT") {
        const src = el.src || el.data;
        const type = el.type || "";
        if (src && type.includes("audio") && !seenSrc.has(src)) {
          seenSrc.add(src);
          audio.push({ src, type: "audio", mime: type });
        }
      }
    }

    return audio;
  }

  /**
   * Check if a URL is a YouTube URL.
   */
  function isYouTubeUrl(url) {
    if (!url) return false;
    return /(?:youtube\.com|youtu\.be|youtube-nocookie\.com|ytimg\.com)/i.test(url);
  }

  /**
   * Universal video extraction.
   * Extracts <video> sources, <embed>/<object> video, and embedded iframes.
   * Filters YouTube unless allowYouTube is true.
   */
  function extractVideoUniversal(elements, allowYouTube) {
    const videos = [];
    const seenSrc = new Set();

    function addVideo(src, info) {
      if (!src || seenSrc.has(src)) return;
      if (!allowYouTube && isYouTubeUrl(src)) return;
      seenSrc.add(src);
      videos.push(Object.assign({ src }, info));
    }

    for (const el of elements) {
      // <video> elements
      if (el.tagName === "VIDEO") {
        const src = el.currentSrc || el.src;
        const info = {
          type: "video",
          mime: el.type || "",
          poster: el.poster || "",
          duration: el.duration && isFinite(el.duration) ? el.duration : 0,
          width: el.videoWidth || el.width || 0,
          height: el.videoHeight || el.height || 0,
        };
        if (src) addVideo(src, info);

        // All <source> children
        for (const source of el.querySelectorAll("source")) {
          if (source.src) {
            addVideo(source.src, {
              type: "video",
              mime: source.type || "",
              poster: el.poster || "",
              duration: info.duration,
              width: info.width,
              height: info.height,
            });
          }
        }

        // <track> subtitles/captions
        for (const track of el.querySelectorAll("track")) {
          if (track.src) {
            addVideo(track.src, {
              type: "video-track",
              kind: track.kind || "subtitles",
              label: track.label || "",
              srclang: track.srclang || "",
            });
          }
        }
      }

      // <embed> and <object> video
      if (el.tagName === "EMBED" || el.tagName === "OBJECT") {
        const src = el.src || el.data;
        const type = el.type || "";
        if (src && type.includes("video")) {
          addVideo(src, { type: "video", mime: type });
        }
      }

      // <iframe> video embeds (Vimeo, Dailymotion, etc.)
      if (el.tagName === "IFRAME" && el.src) {
        const iframeSrc = el.src;
        // Detect known video embed patterns
        const videoEmbedPattern = /(?:player\.vimeo\.com|dailymotion\.com\/embed|streamable\.com|wistia\.com|bitchute\.com|rumble\.com|odysee\.com|peertube)/i;
        const youtubeEmbedPattern = /(?:youtube\.com\/embed|youtube-nocookie\.com\/embed|youtu\.be)/i;

        if (videoEmbedPattern.test(iframeSrc)) {
          addVideo(iframeSrc, { type: "video-embed", embed: true });
        } else if (youtubeEmbedPattern.test(iframeSrc)) {
          addVideo(iframeSrc, { type: "video-embed", embed: true, platform: "youtube" });
        }
      }

      // data-video-src and similar attributes
      for (const attr of ["data-video-src", "data-video-url", "data-video", "data-src"]) {
        const src = el.getAttribute(attr);
        if (src && /\.(mp4|webm|ogg|m3u8|mpd|mov|avi|mkv)/i.test(src)) {
          addVideo(src, { type: "video", mime: "" });
        }
      }
    }

    return videos;
  }

  /**
   * Extract JavaScript-rendered content (toggled by user, off by default).
   * Enhanced: shadow DOM, web components, template elements, meta state, global JS data.
   */
  async function extractJSContent(elements) {
    const jsData = [];
    const seenContent = new Set();

    function addUnique(item) {
      const key = JSON.stringify(item).slice(0, 200);
      if (seenContent.has(key)) return;
      seenContent.add(key);
      jsData.push(item);
    }

    for (const el of elements) {
      // Script tags with structured data
      if (el.tagName === "SCRIPT") {
        const type = el.type || "";
        if (type === "application/ld+json" || type === "application/json") {
          try {
            const data = JSON.parse(el.textContent);
            addUnique({ type: "structured-data", format: type, data });
          } catch { /* skip */ }
        }
        // Inline scripts with __NEXT_DATA__, __NUXT__, window.__data patterns
        if (!type || type === "text/javascript") {
          const text = el.textContent || "";
          const statePatterns = [
            { re: /window\.__NEXT_DATA__\s*=\s*({[\s\S]*?})\s*;?\s*(?:<\/script>|$)/, name: "next-data" },
            { re: /window\.__NUXT__\s*=\s*({[\s\S]*?})\s*;?\s*(?:<\/script>|$)/, name: "nuxt-data" },
            { re: /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*(?:<\/script>|$)/, name: "initial-state" },
            { re: /window\.__APP_DATA__\s*=\s*({[\s\S]*?})\s*;?\s*(?:<\/script>|$)/, name: "app-data" },
          ];
          for (const pat of statePatterns) {
            const m = text.match(pat.re);
            if (m) {
              try {
                const data = JSON.parse(m[1]);
                addUnique({ type: "js-state", name: pat.name, data });
              } catch { /* partial JSON, skip */ }
            }
          }
        }
      }

      // Iframes (same-origin only)
      if (el.tagName === "IFRAME") {
        try {
          const iframeDoc = el.contentDocument || el.contentWindow.document;
          if (iframeDoc) {
            const iframeText = iframeDoc.body ? iframeDoc.body.innerText : "";
            if (iframeText && iframeText.length > 10) {
              addUnique({ type: "iframe-text", text: iframeText.trim(), src: el.src });
            }
          }
        } catch { /* cross-origin blocked */ }
      }

      // <template> elements with content
      if (el.tagName === "TEMPLATE" && el.content) {
        const tplText = el.content.textContent.trim();
        if (tplText.length > 10) {
          addUnique({ type: "template", text: tplText.slice(0, 5000) });
        }
      }

      // Shadow DOM traversal
      if (el.shadowRoot) {
        const shadowEls = el.shadowRoot.querySelectorAll("*");
        for (const sel of shadowEls) {
          const txt = (sel.innerText || sel.textContent || "").trim();
          if (txt.length > 20 && sel.children.length <= 3) {
            addUnique({ type: "shadow-dom", tag: sel.tagName.toLowerCase(), text: txt.slice(0, 2000) });
          }
        }
      }

      // Web components (custom elements with hyphenated names)
      if (el.tagName.includes("-")) {
        const txt = (el.innerText || el.textContent || "").trim();
        if (txt.length > 20) {
          addUnique({ type: "web-component", tag: el.tagName.toLowerCase(), text: txt.slice(0, 2000) });
        }
      }

      // Data attributes that might contain content
      if (el.dataset) {
        for (const [key, value] of Object.entries(el.dataset)) {
          if (value && value.length > 20 && value.length < 10000) {
            try {
              const parsed = JSON.parse(value);
              if (typeof parsed === "object") {
                addUnique({ type: "data-attr", key, data: parsed });
              }
            } catch {
              if (/^[a-zA-Z]/.test(value) && value.split(" ").length > 3) {
                addUnique({ type: "data-text", key, text: value });
              }
            }
          }
        }
      }

      // [slot] elements (web component slots)
      if (el.getAttribute("slot")) {
        const txt = (el.innerText || el.textContent || "").trim();
        if (txt.length > 10) {
          addUnique({ type: "slot", name: el.getAttribute("slot"), text: txt.slice(0, 2000) });
        }
      }
    }

    // Global: microdata (itemscope/itemprop)
    try {
      const microItems = document.querySelectorAll("[itemscope]");
      for (const item of microItems) {
        const itemType = item.getAttribute("itemtype") || "";
        const props = {};
        for (const prop of item.querySelectorAll("[itemprop]")) {
          const name = prop.getAttribute("itemprop");
          props[name] = prop.content || prop.getAttribute("content") || prop.innerText || prop.src || "";
        }
        if (Object.keys(props).length > 0) {
          addUnique({ type: "microdata", itemType, properties: props });
        }
      }
    } catch { /* skip */ }

    return jsData;
  }

  /**
   * Build page metadata (enhanced).
   */
  function pageMeta() {
    const meta = {};
    meta.url = window.location.href;
    meta.title = document.title;
    meta.timestamp = new Date().toISOString();

    // Author detection (multiple strategies)
    const authorMeta = document.querySelector('meta[name="author"]');
    if (authorMeta) meta.author = authorMeta.content;

    // JSON-LD
    const ldJsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldJsonScripts) {
      try {
        const ld = JSON.parse(script.textContent);
        const ldItems = Array.isArray(ld) ? ld : [ld];
        for (const item of ldItems) {
          if (item.author && !meta.author) {
            meta.author = typeof item.author === "string" ? item.author :
                          Array.isArray(item.author) ? item.author.map(a => a.name || a).join(", ") :
                          item.author.name || "";
          }
          if (item.publisher && !meta.publisher) {
            meta.publisher = typeof item.publisher === "string" ? item.publisher : item.publisher.name || "";
          }
          if (item.datePublished) meta.datePublished = item.datePublished;
          if (item.dateModified) meta.dateModified = item.dateModified;
          if (item.description) meta.description = item.description;
          if (item.license) meta.license = item.license;
          if (item["@type"]) meta.contentType = item["@type"];
          if (item.isbn) meta.isbn = item.isbn;
        }
      } catch { /* ignore */ }
    }

    // Open Graph
    const ogSiteName = document.querySelector('meta[property="og:site_name"]');
    if (ogSiteName) meta.siteName = ogSiteName.content;

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && !meta.description) meta.description = ogDesc.content;

    const ogType = document.querySelector('meta[property="og:type"]');
    if (ogType) meta.ogType = ogType.content;

    // Publish date
    const pubDate = document.querySelector('meta[name="date"], meta[property="article:published_time"], time[datetime]');
    if (pubDate) meta.datePublished = meta.datePublished || pubDate.content || pubDate.getAttribute("datetime");

    // Copyright / license
    const copyright = document.querySelector('meta[name="copyright"], meta[name="rights"]');
    if (copyright) meta.copyright = copyright.content;

    // Description
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta && !meta.description) meta.description = descMeta.content;

    // Language
    meta.lang = document.documentElement.lang || "en";

    // Favicon detection (multiple strategies)
    const iconLink = document.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
    if (iconLink && iconLink.href) {
      meta.favicon = iconLink.href;
    } else {
      try { meta.favicon = new URL("/favicon.ico", window.location.origin).href; } catch (e) { /* skip */ }
    }

    return meta;
  }

  /**
   * Main extraction pipeline.
   */
  async function extractData(elements) {
    const cfg = await browser.storage.local.get(["scrapeJS", "minTextLength", "scrapeVideo", "allowYouTube"]);
    const minLen = cfg.minTextLength || 3;

    // Universal text extraction
    const { texts: rawTexts, totalWords } = extractTextUniversal(elements);
    const texts = rawTexts.filter(t => t.text.length >= minLen);

    // Universal image extraction
    const images = extractImagesUniversal(elements);

    // Universal link extraction
    const links = extractLinksUniversal(elements);

    // Universal audio extraction
    const audio = extractAudioUniversal(elements);

    // Video extraction (enabled by default, YouTube filtered unless allowed)
    let video = [];
    if (cfg.scrapeVideo !== false) {
      video = extractVideoUniversal(elements, !!cfg.allowYouTube);
    }

    // Optional JS content extraction
    let jsContent = [];
    if (cfg.scrapeJS) {
      jsContent = await extractJSContent(elements);
    }

    return { texts, images, links, audio, video, jsContent, totalWords };
  }

  /**
   * Scrape a selected rectangle area.
   */
  async function scrapeRect(selRect) {
    const elements = getElementsInRect(selRect);
    const data = await extractData(elements);
    const meta = pageMeta();
    const result = { meta, ...data, scrapedAt: new Date().toISOString() };

    // Highlight scraped elements
    elements.forEach((el) => el.classList.add("wsp-scraped-highlight"));
    setTimeout(() => elements.forEach((el) => el.classList.remove("wsp-scraped-highlight")), 2000);

    // Send to background
    browser.runtime.sendMessage({ action: "SCRAPED_DATA", data: result });
    if (typeof WSP_Toast !== "undefined") {
      WSP_Toast.show(`Scraped: ${data.totalWords} words, ${data.images.length} imgs, ${data.links.length} links, ${data.video.length} videos`);
    }
    return result;
  }

  /**
   * Scrape the entire page (full document, not just visible viewport).
   */
  async function scrapeFullPage() {
    const docWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0,
      window.innerWidth
    );
    const docHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0,
      window.innerHeight
    );

    // Use document coordinates so we capture everything below the fold
    const selRect = {
      left: 0,
      top: 0,
      right: docWidth,
      bottom: docHeight,
    };

    const elements = getElementsInRect(selRect, true);
    const data = await extractData(elements);
    const meta = pageMeta();
    const result = { meta, ...data, scrapedAt: new Date().toISOString() };

    // Highlight scraped elements briefly
    elements.forEach((el) => el.classList.add("wsp-scraped-highlight"));
    setTimeout(() => elements.forEach((el) => el.classList.remove("wsp-scraped-highlight")), 2000);

    browser.runtime.sendMessage({ action: "SCRAPED_DATA", data: result });
    if (typeof WSP_Toast !== "undefined") {
      WSP_Toast.show(`Scraped full page: ${data.totalWords} words, ${data.images.length} imgs, ${data.links.length} links, ${data.video.length} videos`);
    }
    return result;
  }

  /**
   * Scroll-first full document scraping.
   * 1. First scrolls down to determine full page length
   * 2. Then scrolls back to where last scrape ended
   * 3. Scrapes viewport by viewport, scrolling down
   * 4. Tracks position so next call continues where it left off
   */
  async function scrapeWithScroll() {
    // Step 1: Scroll to bottom to trigger lazy loading and measure full height
    const originalScroll = window.scrollY;
    const viewportHeight = window.innerHeight;

    if (typeof WSP_Toast !== "undefined") {
      WSP_Toast.show("Checking page length...");
    }

    // Quick scroll to bottom to trigger lazy-load content
    let prevHeight = document.documentElement.scrollHeight;
    let scrollAttempts = 0;
    const maxScrollAttempts = 20;

    while (scrollAttempts < maxScrollAttempts) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(500);
      const newHeight = document.documentElement.scrollHeight;
      if (newHeight === prevHeight) break;
      prevHeight = newHeight;
      scrollAttempts++;
    }

    const totalHeight = document.documentElement.scrollHeight;

    // Step 2: Go back to where we last scraped (or top)
    const startY = lastScrapeBottomY || 0;
    window.scrollTo(0, startY);
    await sleep(300);

    if (typeof WSP_Toast !== "undefined") {
      WSP_Toast.show(`Page is ${Math.round(totalHeight / viewportHeight)} viewports tall. Scraping...`);
    }

    // Step 3: Scrape viewport by viewport using document coordinates
    let currentY = startY;
    let allResults = { texts: [], images: [], links: [], audio: [], video: [], jsContent: [], totalWords: 0 };
    const seenText = new Set();
    const seenSrc = new Set();
    let viewportCount = 0;

    while (currentY < totalHeight) {
      window.scrollTo(0, currentY);
      await sleep(400); // Wait for rendering

      // Use document (absolute) coordinates for the viewport slice
      const selRect = {
        left: 0,
        top: currentY,
        right: window.innerWidth,
        bottom: currentY + viewportHeight,
      };

      const elements = getElementsInRect(selRect, true);
      const data = await extractData(elements);

      // Deduplicate across viewports
      for (const t of data.texts) {
        if (!seenText.has(t.text)) {
          seenText.add(t.text);
          allResults.texts.push(t);
          allResults.totalWords += countWords(t.text);
        }
      }
      for (const img of data.images) {
        if (!seenSrc.has(img.src)) {
          seenSrc.add(img.src);
          allResults.images.push(img);
        }
      }
      for (const link of data.links) {
        if (!seenSrc.has(link.href)) {
          seenSrc.add(link.href);
          allResults.links.push(link);
        }
      }
      for (const a of data.audio) {
        if (!seenSrc.has(a.src)) {
          seenSrc.add(a.src);
          allResults.audio.push(a);
        }
      }
      for (const v of data.video || []) {
        if (!seenSrc.has(v.src)) {
          seenSrc.add(v.src);
          allResults.video.push(v);
        }
      }
      if (data.jsContent) {
        allResults.jsContent.push(...data.jsContent);
      }

      currentY += viewportHeight * 0.85; // Overlap slightly to not miss content
      viewportCount++;

      // Highlight progress
      elements.forEach((el) => el.classList.add("wsp-scraped-highlight"));
      setTimeout(() => elements.forEach((el) => el.classList.remove("wsp-scraped-highlight")), 1500);
    }

    // Step 4: Track position for next call
    lastScrapeBottomY = totalHeight;

    // Scroll back to original position
    window.scrollTo(0, originalScroll);

    // Send combined results
    const meta = pageMeta();
    const result = { meta, ...allResults, scrapedAt: new Date().toISOString() };
    browser.runtime.sendMessage({ action: "SCRAPED_DATA", data: result });

    if (typeof WSP_Toast !== "undefined") {
      WSP_Toast.show(`Scroll-scraped ${viewportCount} viewports: ${allResults.totalWords} words, ${allResults.images.length} imgs, ${allResults.links.length} links, ${allResults.video.length} videos`);
    }

    return result;
  }

  /**
   * Scrape the entire document (all visible elements regardless of scroll position).
   */
  async function scrapeEntireDocument() {
    const docHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    const docWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const selRect = { left: 0, top: 0, right: docWidth, bottom: docHeight };
    const elements = getElementsInRect(selRect, true);
    const data = await extractData(elements);
    const meta = pageMeta();
    const result = { meta, ...data, scrapedAt: new Date().toISOString() };
    browser.runtime.sendMessage({ action: "SCRAPED_DATA", data: result });
    if (typeof WSP_Toast !== "undefined") {
      WSP_Toast.show(`Full scrape: ${data.totalWords} words, ${data.images.length} imgs, ${data.video.length} videos`);
    }
    return result;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Reset the scroll tracking (for new sessions).
   */
  function resetScrollPosition() {
    lastScrapeBottomY = 0;
  }

  /* ── Message listener ── */
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "SCRAPE_FULL_PAGE") {
      scrapeFullPage();
    }
    if (msg.action === "SCRAPE_DOCUMENT") {
      scrapeEntireDocument();
    }
    if (msg.action === "SCRAPE_WITH_SCROLL") {
      scrapeWithScroll();
    }
    if (msg.action === "RESET_SCROLL") {
      resetScrollPosition();
    }
  });

  window.WSP_Scraper = { scrapeRect, scrapeFullPage, scrapeEntireDocument, scrapeWithScroll, resetScrollPosition };
})();

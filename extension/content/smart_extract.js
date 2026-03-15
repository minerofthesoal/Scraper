/* ── Smart Content Extractor v0.6.3b1 ── */
/* Article body detection, readability scoring, regex extraction rules */
(function () {
  "use strict";

  const WSP_SmartExtract = {

    /**
     * Extract the main article/content body from a page.
     * Uses a readability-inspired scoring algorithm.
     */
    extractArticle() {
      const candidates = document.querySelectorAll("article, [role='main'], main, .post-content, .entry-content, .article-body, .story-body, #content, #main-content, .content");

      // If there's a semantic <article> or <main>, use it
      for (const el of candidates) {
        const text = (el.innerText || "").trim();
        if (text.length > 200) {
          return this._buildArticle(el);
        }
      }

      // Readability scoring: find the div with the highest text density
      const allDivs = document.querySelectorAll("div, section");
      let bestScore = 0;
      let bestEl = null;

      for (const el of allDivs) {
        const score = this._scoreElement(el);
        if (score > bestScore) {
          bestScore = score;
          bestEl = el;
        }
      }

      if (bestEl && bestScore > 50) {
        return this._buildArticle(bestEl);
      }

      return null;
    },

    /**
     * Score an element based on how likely it is to be the main content.
     */
    _scoreElement(el) {
      let score = 0;
      const text = (el.innerText || "").trim();
      const html = el.innerHTML || "";

      // Text length is a strong signal
      const wordCount = text.split(/\s+/).length;
      score += Math.min(wordCount / 5, 100);

      // Paragraph density
      const pTags = el.querySelectorAll("p");
      score += pTags.length * 3;

      // Penalize navs, sidebars, footers
      const tag = el.tagName.toLowerCase();
      const cls = (el.className || "").toLowerCase();
      const id = (el.id || "").toLowerCase();

      if (/nav|sidebar|footer|header|menu|widget|ad|comment|share|social|related/.test(cls + " " + id)) {
        score -= 100;
      }

      // Penalize short content
      if (wordCount < 50) score -= 30;

      // Bonus for content-like classes
      if (/article|content|post|entry|story|text|body|main/.test(cls + " " + id)) {
        score += 30;
      }

      // Text-to-html ratio
      const ratio = text.length / (html.length || 1);
      if (ratio > 0.25) score += 20;

      // Penalize elements with too many links relative to text
      const links = el.querySelectorAll("a");
      const linkTextLen = Array.from(links).reduce((sum, a) => sum + (a.textContent || "").length, 0);
      if (text.length > 0 && linkTextLen / text.length > 0.5) score -= 40;

      return score;
    },

    /**
     * Build structured article data from an element.
     */
    _buildArticle(el) {
      const paragraphs = [];
      const headings = [];

      // Extract headings
      for (const h of el.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
        const text = (h.innerText || "").trim();
        if (text) {
          headings.push({ level: parseInt(h.tagName[1]), text });
        }
      }

      // Extract paragraphs
      for (const p of el.querySelectorAll("p")) {
        const text = (p.innerText || "").trim();
        if (text && text.length > 10) {
          paragraphs.push(text);
        }
      }

      // If no <p> tags, get all text blocks
      if (paragraphs.length === 0) {
        const walker = document.createTreeWalker(
          el, NodeFilter.SHOW_TEXT,
          { acceptNode(node) {
            const t = node.textContent.trim();
            if (t.length < 20) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }}
        );
        let node;
        while ((node = walker.nextNode())) {
          paragraphs.push(node.textContent.trim());
        }
      }

      const fullText = paragraphs.join("\n\n");
      const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;

      return {
        headings,
        paragraphs,
        fullText,
        wordCount,
        element: el.tagName.toLowerCase() + (el.className ? "." + el.className.split(" ")[0] : ""),
      };
    },

    /**
     * Extract content matching custom regex patterns.
     * Patterns are user-defined extraction rules.
     */
    extractByRegex(patterns) {
      const results = [];
      const bodyText = document.body.innerText || "";
      const bodyHTML = document.body.innerHTML || "";

      for (const rule of patterns) {
        try {
          const flags = rule.flags || "gi";
          const regex = new RegExp(rule.pattern, flags);
          const target = rule.matchHTML ? bodyHTML : bodyText;
          let match;

          while ((match = regex.exec(target)) !== null) {
            results.push({
              rule: rule.name || rule.pattern,
              match: match[0],
              groups: match.slice(1),
              index: match.index,
            });

            // Prevent infinite loops on zero-length matches
            if (match[0].length === 0) break;
          }
        } catch (err) {
          results.push({
            rule: rule.name || rule.pattern,
            error: err.message,
          });
        }
      }

      return results;
    },

    /**
     * Extract structured data from common page patterns.
     */
    extractStructuredData() {
      const data = {
        jsonLd: [],
        microdata: [],
        openGraph: {},
        twitterCards: {},
        tables: [],
      };

      // JSON-LD
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          data.jsonLd.push(JSON.parse(script.textContent));
        } catch { /* skip */ }
      }

      // Open Graph
      for (const meta of document.querySelectorAll('meta[property^="og:"]')) {
        const key = meta.getAttribute("property").replace("og:", "");
        data.openGraph[key] = meta.content;
      }

      // Twitter Cards
      for (const meta of document.querySelectorAll('meta[name^="twitter:"]')) {
        const key = meta.getAttribute("name").replace("twitter:", "");
        data.twitterCards[key] = meta.content;
      }

      // Tables (structured tabular data)
      for (const table of document.querySelectorAll("table")) {
        const rows = [];
        const headers = [];

        for (const th of table.querySelectorAll("thead th, tr:first-child th")) {
          headers.push((th.innerText || "").trim());
        }

        for (const tr of table.querySelectorAll("tbody tr, tr")) {
          const cells = [];
          for (const td of tr.querySelectorAll("td")) {
            cells.push((td.innerText || "").trim());
          }
          if (cells.length > 0) rows.push(cells);
        }

        if (rows.length > 0) {
          data.tables.push({ headers, rows });
        }
      }

      return data;
    },

    /**
     * Extract all email addresses from the page.
     */
    extractEmails() {
      const text = document.body.innerText || "";
      const html = document.body.innerHTML || "";
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = new Set();

      for (const match of text.matchAll(emailRegex)) {
        emails.add(match[0].toLowerCase());
      }

      // Also check mailto: links
      for (const a of document.querySelectorAll('a[href^="mailto:"]')) {
        const email = a.href.replace("mailto:", "").split("?")[0];
        if (email) emails.add(email.toLowerCase());
      }

      return Array.from(emails);
    },

    /**
     * Extract all phone numbers from the page.
     */
    extractPhoneNumbers() {
      const text = document.body.innerText || "";
      const phoneRegex = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
      const phones = new Set();

      for (const match of text.matchAll(phoneRegex)) {
        phones.add(match[0].trim());
      }

      // Also check tel: links
      for (const a of document.querySelectorAll('a[href^="tel:"]')) {
        const phone = a.href.replace("tel:", "");
        if (phone) phones.add(phone);
      }

      return Array.from(phones);
    },
  };

  /* ── Message listener ── */
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "SMART_EXTRACT_ARTICLE") {
      const article = WSP_SmartExtract.extractArticle();
      if (article) {
        // Build a meta object like the regular scraper
        const meta = {
          url: window.location.href,
          title: document.title,
          timestamp: new Date().toISOString(),
        };
        const authorMeta = document.querySelector('meta[name="author"]');
        if (authorMeta) meta.author = authorMeta.content;
        const ogSite = document.querySelector('meta[property="og:site_name"]');
        if (ogSite) meta.siteName = ogSite.content;

        // Send article to background as scraped data
        browser.runtime.sendMessage({
          action: "SCRAPED_DATA",
          data: {
            meta,
            texts: article.paragraphs.map(p => ({ tag: "p", text: p })),
            images: [],
            links: [],
            audio: [],
            article,
            totalWords: article.wordCount,
            scrapedAt: new Date().toISOString(),
          }
        });

        if (typeof WSP_Toast !== "undefined") {
          WSP_Toast.show(`Smart Extract: ${article.wordCount} words, ${article.headings.length} headings`);
        }
      } else {
        if (typeof WSP_Toast !== "undefined") {
          WSP_Toast.show("Smart Extract: no article body found on this page");
        }
      }
      return Promise.resolve({ article });
    }
    if (msg.action === "EXTRACT_REGEX") {
      const results = WSP_SmartExtract.extractByRegex(msg.patterns || []);
      return Promise.resolve({ results });
    }
    if (msg.action === "EXTRACT_STRUCTURED") {
      const data = WSP_SmartExtract.extractStructuredData();
      return Promise.resolve({ data });
    }
    if (msg.action === "SHOW_SHORTCUTS") {
      showShortcutHint();
    }
    if (msg.action === "AI_EXTRACT_PAGE") {
      // Extract the main article text and send it to the AI server via background
      const article = WSP_SmartExtract.extractArticle();
      const text = article ? article.fullText : (document.body.innerText || "").slice(0, 4000);
      const template = msg.template || "article";

      // Send to background to forward to AI server
      browser.runtime.sendMessage({
        action: "AI_EXTRACT_REQUEST",
        text: text.slice(0, 4000),
        template: template,
        source_url: window.location.href,
        source_title: document.title,
      });
      return Promise.resolve({ sent: true });
    }
  });

  function showShortcutHint() {
    let hint = document.getElementById("wsp-shortcut-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "wsp-shortcut-hint";
      hint.innerHTML = `
        <strong>WebScraper Pro Shortcuts</strong><br>
        <kbd>Alt+S</kbd> Select Area<br>
        <kbd>Alt+P</kbd> Full Page<br>
        <kbd>Alt+Shift+S</kbd> Scroll &amp; Scrape<br>
        <kbd>Alt+A</kbd> Auto-Scan<br>
        <kbd>Alt+X</kbd> Stop
      `;
      document.body.appendChild(hint);
    }
    hint.classList.add("visible");
    clearTimeout(hint._timer);
    hint._timer = setTimeout(() => hint.classList.remove("visible"), 5000);
  }

  window.WSP_SmartExtract = WSP_SmartExtract;
})();

/* ── MLA Citation Generator ── */
(function () {
  "use strict";

  const WSP_Citation = {

    /**
     * Generate an MLA 9th edition citation from page metadata.
     *
     * Format:
     *   Author Last, First. "Page Title." Site Name, Publisher, Day Month Year,
     *       URL. Accessed Day Month Year.
     */
    generateMLA(meta) {
      const parts = [];

      // Author
      if (meta.author) {
        const author = this.formatAuthor(meta.author);
        parts.push(author);
      }

      // Title
      const title = meta.title || "Untitled Page";
      parts.push(`"${title}."`);

      // Site name / container
      if (meta.siteName) {
        parts.push(`*${meta.siteName}*,`);
      } else {
        const domain = this._extractDomain(meta.url);
        parts.push(`*${domain}*,`);
      }

      // Publisher (if different from site name)
      if (meta.publisher && meta.publisher !== meta.siteName) {
        parts.push(meta.publisher + ",");
      }

      // Publication date
      if (meta.datePublished) {
        const pubDate = this._parseDate(meta.datePublished);
        if (pubDate) {
          parts.push(this._formatMLADate(pubDate) + ",");
        }
      }

      // URL
      parts.push(meta.url + ".");

      // Accessed date
      parts.push("Accessed " + this._formatMLADate(new Date()) + ".");

      return parts.join(" ");
    },

    /**
     * Generate a citation entry for a dataset README.
     */
    generateDatasetCitation(meta) {
      return {
        mla: this.generateMLA(meta),
        url: meta.url,
        title: meta.title || "Untitled",
        author: meta.author || "Unknown",
        accessDate: new Date().toISOString(),
        siteName: meta.siteName || this._extractDomain(meta.url),
        publishDate: meta.datePublished || null,
      };
    },

    /**
     * Format author name for MLA (Last, First).
     */
    formatAuthor(name) {
      if (!name) return "";
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0] + ".";
      const last = parts.pop();
      return last + ", " + parts.join(" ") + ".";
    },

    /**
     * Generate full citation block for HF README.
     */
    generateReadmeCitations(citations) {
      let md = "## Sources & Citations (MLA 9th Edition)\n\n";
      md += "| # | Source | Author | MLA Citation |\n";
      md += "|---|--------|--------|--------------|\n";

      citations.forEach((c, i) => {
        const safeTitle = (c.title || "Untitled").replace(/\|/g, "\\|");
        const safeAuthor = (c.author || "Unknown").replace(/\|/g, "\\|");
        const safeMLA = (c.mla || "").replace(/\|/g, "\\|");
        md += `| ${i + 1} | [${safeTitle}](${c.url}) | ${safeAuthor} | ${safeMLA} |\n`;
      });

      md += "\n### Full Citations\n\n";
      citations.forEach((c, i) => {
        md += `${i + 1}. ${c.mla}\n\n`;
      });

      return md;
    },

    /* ── Private helpers ── */
    _extractDomain(url) {
      try { return new URL(url).hostname; } catch { return url; }
    },

    _parseDate(str) {
      if (!str) return null;
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    },

    _formatMLADate(date) {
      const months = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June",
        "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
      return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }
  };

  if (typeof window !== "undefined") window.WSP_Citation = WSP_Citation;
  if (typeof globalThis !== "undefined") globalThis.WSP_Citation = WSP_Citation;
})();

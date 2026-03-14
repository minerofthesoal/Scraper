/* ── Citation Generator (MLA 9th + APA 7th) ── */
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
        const author = this.formatAuthorMLA(meta.author);
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
     * Generate an APA 7th edition citation from page metadata.
     *
     * Format:
     *   Author, A. B. (Year, Month Day). Title of page. Site Name. URL
     */
    generateAPA(meta) {
      const parts = [];

      // Author
      if (meta.author) {
        const author = this.formatAuthorAPA(meta.author);
        parts.push(author);
      } else {
        // No author - use site name or skip
        if (meta.siteName) {
          parts.push(meta.siteName + ".");
        }
      }

      // Date
      if (meta.datePublished) {
        const pubDate = this._parseDate(meta.datePublished);
        if (pubDate) {
          parts.push(`(${this._formatAPADate(pubDate)}).`);
        } else {
          parts.push("(n.d.).");
        }
      } else {
        parts.push("(n.d.).");
      }

      // Title (italicized for web pages)
      const title = meta.title || "Untitled page";
      parts.push(`*${title}*.`);

      // Site name (only if different from author)
      if (meta.siteName && meta.siteName !== meta.author) {
        parts.push(meta.siteName + ".");
      }

      // URL
      parts.push(meta.url);

      return parts.join(" ");
    },

    /**
     * Generate a citation entry for a dataset README.
     * Supports both MLA and APA.
     */
    generateDatasetCitation(meta) {
      return {
        mla: this.generateMLA(meta),
        apa: this.generateAPA(meta),
        url: meta.url,
        title: meta.title || "Untitled",
        author: meta.author || "Unknown",
        accessDate: new Date().toISOString(),
        siteName: meta.siteName || this._extractDomain(meta.url),
        publishDate: meta.datePublished || null,
        license: meta.license || meta.copyright || null,
        description: meta.description || null,
        contentType: meta.contentType || null,
        isbn: meta.isbn || null,
      };
    },

    /**
     * Format author name for MLA (Last, First).
     */
    formatAuthorMLA(name) {
      if (!name) return "";
      // Handle multiple authors separated by comma or "and"
      const authors = name.split(/,\s*(?:and\s*)?|\s+and\s+/i).filter(a => a.trim());
      if (authors.length === 0) return "";

      const formatted = authors.map((a, i) => {
        const parts = a.trim().split(/\s+/);
        if (parts.length === 1) return parts[0] + ".";
        const last = parts.pop();
        if (i === 0) {
          return last + ", " + parts.join(" ") + ".";
        }
        // Subsequent authors: First Last
        return parts.join(" ") + " " + last;
      });

      if (formatted.length === 1) return formatted[0];
      if (formatted.length === 2) return formatted.join(" and ");
      return formatted.slice(0, -1).join(", ") + ", and " + formatted[formatted.length - 1];
    },

    /**
     * Format author name for APA (Last, F. M.).
     */
    formatAuthorAPA(name) {
      if (!name) return "";
      const authors = name.split(/,\s*(?:and\s*)?|\s+and\s+/i).filter(a => a.trim());
      if (authors.length === 0) return "";

      const formatted = authors.map((a) => {
        const parts = a.trim().split(/\s+/);
        if (parts.length === 1) return parts[0] + ".";
        const last = parts.pop();
        const initials = parts.map(p => p[0].toUpperCase() + ".").join(" ");
        return last + ", " + initials;
      });

      if (formatted.length === 1) return formatted[0];
      if (formatted.length === 2) return formatted.join(", & ");
      if (formatted.length <= 20) {
        return formatted.slice(0, -1).join(", ") + ", & " + formatted[formatted.length - 1];
      }
      return formatted.slice(0, 19).join(", ") + ", ... " + formatted[formatted.length - 1];
    },

    /**
     * Generate full citation block for HF README.
     * Includes both MLA and APA, plus licenses.
     */
    generateReadmeCitations(citations) {
      let md = "## Sources & Citations\n\n";

      // Summary table
      md += "### Source Summary\n\n";
      md += "| # | Source | Author | License | Content Type |\n";
      md += "|---|--------|--------|---------|-------------|\n";

      citations.forEach((c, i) => {
        const safeTitle = (c.title || "Untitled").replace(/\|/g, "\\|");
        const safeAuthor = (c.author || "Unknown").replace(/\|/g, "\\|");
        const license = (c.license || "See source").replace(/\|/g, "\\|");
        const ctype = (c.contentType || "Web page").replace(/\|/g, "\\|");
        md += `| ${i + 1} | [${safeTitle}](${c.url}) | ${safeAuthor} | ${license} | ${ctype} |\n`;
      });

      // MLA citations
      md += "\n### MLA 9th Edition Citations\n\n";
      citations.forEach((c, i) => {
        md += `${i + 1}. ${c.mla}\n\n`;
      });

      // APA citations
      md += "### APA 7th Edition Citations\n\n";
      citations.forEach((c, i) => {
        md += `${i + 1}. ${c.apa || "N/A"}\n\n`;
      });

      // License summary
      const licenses = new Set(citations.filter(c => c.license).map(c => c.license));
      if (licenses.size > 0) {
        md += "### Source Licenses\n\n";
        for (const lic of licenses) {
          const sources = citations.filter(c => c.license === lic);
          md += `- **${lic}**: ${sources.length} source(s)\n`;
        }
        md += "\n";
      }

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
    },

    _formatAPADate(date) {
      const months = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      return `${date.getFullYear()}, ${months[date.getMonth()]} ${date.getDate()}`;
    }
  };

  if (typeof window !== "undefined") window.WSP_Citation = WSP_Citation;
  if (typeof globalThis !== "undefined") globalThis.WSP_Citation = WSP_Citation;
})();

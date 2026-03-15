/* ── Citation Generator (MLA 9th + APA 7th) v0.6.1b ── */
/* eslint-env browser, webextensions */
/* Exported as: window.WSP_Citation */
var WSP_Citation = {

  /**
   * Generate an MLA 9th edition citation from page metadata.
   *
   * Format:
   *   Author Last, First. "Page Title." Site Name, Publisher, Day Month Year,
   *       URL. Accessed Day Month Year.
   */
  generateMLA(meta) {
    var parts = [];

    // Author
    if (meta.author) {
      var author = this.formatAuthorMLA(meta.author);
      parts.push(author);
    }

    // Title
    var title = meta.title || "Untitled Page";
    parts.push('"' + title + '."');

    // Site name / container
    if (meta.siteName) {
      parts.push("*" + meta.siteName + "*,");
    } else {
      var domain = this._extractDomain(meta.url);
      parts.push("*" + domain + "*,");
    }

    // Publisher (if different from site name)
    if (meta.publisher && meta.publisher !== meta.siteName) {
      parts.push(meta.publisher + ",");
    }

    // Publication date
    if (meta.datePublished) {
      var pubDate = this._parseDate(meta.datePublished);
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
    var parts = [];

    // Author
    if (meta.author) {
      var author = this.formatAuthorAPA(meta.author);
      parts.push(author);
    } else {
      // No author - use site name or skip
      if (meta.siteName) {
        parts.push(meta.siteName + ".");
      }
    }

    // Date
    if (meta.datePublished) {
      var pubDate = this._parseDate(meta.datePublished);
      if (pubDate) {
        parts.push("(" + this._formatAPADate(pubDate) + ").");
      } else {
        parts.push("(n.d.).");
      }
    } else {
      parts.push("(n.d.).");
    }

    // Title (italicized for web pages)
    var title = meta.title || "Untitled page";
    parts.push("*" + title + "*.");

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
    var authors = name.split(/,\s*(?:and\s*)?|\s+and\s+/i).filter(function (a) { return a.trim(); });
    if (authors.length === 0) return "";

    var formatted = authors.map(function (a, i) {
      var parts = a.trim().split(/\s+/);
      if (parts.length === 1) return parts[0] + ".";
      var last = parts.pop();
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
    var authors = name.split(/,\s*(?:and\s*)?|\s+and\s+/i).filter(function (a) { return a.trim(); });
    if (authors.length === 0) return "";

    var formatted = authors.map(function (a) {
      var parts = a.trim().split(/\s+/);
      if (parts.length === 1) return parts[0] + ".";
      var last = parts.pop();
      var initials = parts.map(function (p) { return p[0].toUpperCase() + "."; }).join(" ");
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
    var md = "## Sources & Citations\n\n";

    // Summary table
    md += "### Source Summary\n\n";
    md += "| # | Source | Author | License | Content Type |\n";
    md += "|---|--------|--------|---------|-------------|\n";

    citations.forEach(function (c, i) {
      var safeTitle = (c.title || "Untitled").replace(/\|/g, "\\|");
      var safeAuthor = (c.author || "Unknown").replace(/\|/g, "\\|");
      var license = (c.license || "See source").replace(/\|/g, "\\|");
      var ctype = (c.contentType || "Web page").replace(/\|/g, "\\|");
      md += "| " + (i + 1) + " | [" + safeTitle + "](" + c.url + ") | " + safeAuthor + " | " + license + " | " + ctype + " |\n";
    });

    // MLA citations
    md += "\n### MLA 9th Edition Citations\n\n";
    citations.forEach(function (c, i) {
      md += (i + 1) + ". " + c.mla + "\n\n";
    });

    // APA citations
    md += "### APA 7th Edition Citations\n\n";
    citations.forEach(function (c, i) {
      md += (i + 1) + ". " + (c.apa || "N/A") + "\n\n";
    });

    // License summary
    var licenses = new Set(citations.filter(function (c) { return c.license; }).map(function (c) { return c.license; }));
    if (licenses.size > 0) {
      md += "### Source Licenses\n\n";
      for (var lic of licenses) {
        var sources = citations.filter(function (c) { return c.license === lic; });
        md += "- **" + lic + "**: " + sources.length + " source(s)\n";
      }
      md += "\n";
    }

    return md;
  },

  /* ── Private helpers ── */
  _extractDomain(url) {
    try { return new URL(url).hostname; } catch (e) { return url; }
  },

  _parseDate(str) {
    if (!str) return null;
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  },

  _formatMLADate(date) {
    var months = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June",
      "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
    return date.getDate() + " " + months[date.getMonth()] + " " + date.getFullYear();
  },

  _formatAPADate(date) {
    var months = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    return date.getFullYear() + ", " + months[date.getMonth()] + " " + date.getDate();
  }
};

/* ── Sensitive Content Filter v0.7.1 ── */
/* Detects and optionally redacts PII, credentials, and inappropriate content */
/* Fully customizable — users choose what to filter via Settings */
/* eslint-env browser, webextensions */
/* Exported as: window.WSP_ContentFilter */

var WSP_ContentFilter = {

  /* Default filter configuration — all toggleable */
  _defaults: {
    enabled: false,
    filterEmails: true,
    filterPhones: true,
    filterCreditCards: true,
    filterSSN: true,
    filterAddresses: true,
    filterPasswords: true,
    filterAPIKeys: true,
    filter2FA: true,
    filterSlurs: true,
    filterNSFW: false,
    customPatterns: [],
    redactMode: "remove",   /* "remove" | "redact" | "flag" */
  },

  _config: null,

  /**
   * Load filter config from storage.
   */
  init: function () {
    var self = this;
    return browser.storage.local.get(["contentFilterConfig"]).then(function (data) {
      self._config = Object.assign({}, self._defaults, data.contentFilterConfig || {});
      return self._config;
    }).catch(function () {
      self._config = Object.assign({}, self._defaults);
      return self._config;
    });
  },

  /**
   * Get current config (loads if needed).
   */
  getConfig: function () {
    if (this._config) return Promise.resolve(this._config);
    return this.init();
  },

  /**
   * Save config to storage.
   */
  saveConfig: function (config) {
    this._config = Object.assign({}, this._defaults, config);
    return browser.storage.local.set({ contentFilterConfig: this._config });
  },

  /* ── Detection Patterns ── */

  _patterns: {
    /* Email addresses */
    email: /[a-zA-Z0-9._%+\-]{2,}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,

    /* Phone numbers (international formats) */
    phone: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+\d{1,4}[-.\s]?\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,

    /* Credit/debit card numbers (Visa, MC, Amex, Discover) */
    creditCard: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{3,4}\b/g,

    /* SSN (US Social Security Numbers) */
    ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,

    /* Street addresses (US-style) */
    address: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s*){1,4}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Pl|Place|Way|Cir|Circle)\b\.?(?:\s*(?:#|Apt|Suite|Ste|Unit)\s*\w+)?/gi,

    /* Passwords in common formats (password= or pwd= or pass:) */
    password: /(?:password|passwd|pwd|pass)\s*[:=]\s*["']?[^\s"',;]{4,}["']?/gi,

    /* API/Access keys (generic long hex/base64 tokens) */
    apiKey: /(?:api[_-]?key|access[_-]?token|secret[_-]?key|auth[_-]?token|bearer)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{16,}["']?/gi,

    /* Common API key formats */
    apiKeyFormats: /\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|AIza[A-Za-z0-9_\-]{35}|AKIA[A-Z0-9]{16}|xox[bpsa]-[A-Za-z0-9\-]{10,})\b/g,

    /* 2FA/OTP codes */
    twoFA: /\b(?:2FA|OTP|TOTP|verification)\s*(?:code)?\s*[:=]\s*\d{4,8}\b/gi,

    /* 2FA backup codes */
    backupCodes: /\b[A-Z0-9]{4}[-\s][A-Z0-9]{4}[-\s][A-Z0-9]{4}[-\s][A-Z0-9]{4}\b/g,
  },

  /* Slur/hate speech word list (hashed for responsible storage) */
  _slurHashes: null,
  _slurWords: [
    /* Common English slurs — kept minimal and hashed at runtime */
    /* This is a detection list, not a promotion list */
  ],

  /**
   * Scan text for all enabled sensitive categories.
   * Returns an object with detected items and optionally filtered text.
   */
  scan: function (text, config) {
    if (!text || typeof text !== "string") return { clean: text, detections: [], hasIssues: false };

    var cfg = config || this._config || this._defaults;
    if (!cfg.enabled) return { clean: text, detections: [], hasIssues: false };

    var detections = [];
    var filtered = text;

    /* Run each enabled filter */
    if (cfg.filterEmails) {
      detections = detections.concat(this._detect(text, this._patterns.email, "email"));
    }
    if (cfg.filterPhones) {
      detections = detections.concat(this._detect(text, this._patterns.phone, "phone"));
    }
    if (cfg.filterCreditCards) {
      detections = detections.concat(this._detect(text, this._patterns.creditCard, "credit_card"));
    }
    if (cfg.filterSSN) {
      detections = detections.concat(this._detect(text, this._patterns.ssn, "ssn"));
    }
    if (cfg.filterAddresses) {
      detections = detections.concat(this._detect(text, this._patterns.address, "address"));
    }
    if (cfg.filterPasswords) {
      detections = detections.concat(this._detect(text, this._patterns.password, "password"));
    }
    if (cfg.filterAPIKeys) {
      detections = detections.concat(this._detect(text, this._patterns.apiKey, "api_key"));
      detections = detections.concat(this._detect(text, this._patterns.apiKeyFormats, "api_key"));
    }
    if (cfg.filter2FA) {
      detections = detections.concat(this._detect(text, this._patterns.twoFA, "2fa_code"));
      detections = detections.concat(this._detect(text, this._patterns.backupCodes, "backup_code"));
    }

    /* Custom user-defined patterns */
    if (cfg.customPatterns && cfg.customPatterns.length > 0) {
      for (var i = 0; i < cfg.customPatterns.length; i++) {
        var cp = cfg.customPatterns[i];
        try {
          var re = new RegExp(cp.pattern, cp.flags || "gi");
          detections = detections.concat(this._detect(text, re, cp.name || "custom"));
        } catch (e) {
          /* Skip invalid regex */
        }
      }
    }

    /* Apply redaction mode */
    if (detections.length > 0 && cfg.redactMode !== "flag") {
      /* Sort detections by position (descending) so we can replace in-place */
      var sorted = detections.slice().sort(function (a, b) { return b.index - a.index; });
      for (var j = 0; j < sorted.length; j++) {
        var d = sorted[j];
        if (cfg.redactMode === "remove") {
          filtered = filtered.slice(0, d.index) + filtered.slice(d.index + d.match.length);
        } else if (cfg.redactMode === "redact") {
          var redacted = "[" + d.type.toUpperCase() + "_REDACTED]";
          filtered = filtered.slice(0, d.index) + redacted + filtered.slice(d.index + d.match.length);
        }
      }
    }

    return {
      clean: filtered,
      detections: detections,
      hasIssues: detections.length > 0,
      summary: this._summarize(detections),
    };
  },

  /**
   * Check if an image URL looks like it might be NSFW based on URL patterns.
   * This is a heuristic — not image analysis.
   */
  checkImageUrl: function (url, config) {
    var cfg = config || this._config || this._defaults;
    if (!cfg.enabled || !cfg.filterNSFW) return { safe: true };

    if (!url || typeof url !== "string") return { safe: true };
    var lower = url.toLowerCase();

    var nsfwPatterns = [
      /\bnsfw\b/, /\bxxx\b/, /\bporn\b/, /\bnude\b/, /\bnaked\b/,
      /\badult\b/, /\bexplicit\b/, /\bhentai\b/, /\berotic\b/
    ];

    for (var i = 0; i < nsfwPatterns.length; i++) {
      if (nsfwPatterns[i].test(lower)) {
        return { safe: false, reason: "NSFW URL pattern detected" };
      }
    }
    return { safe: true };
  },

  /**
   * Internal: find all matches for a pattern.
   */
  _detect: function (text, pattern, type) {
    var results = [];
    /* Reset lastIndex for global regex */
    pattern.lastIndex = 0;
    var match;
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        type: type,
        match: match[0],
        index: match.index,
      });
      /* Prevent infinite loops on zero-length matches */
      if (match.index === pattern.lastIndex) pattern.lastIndex++;
    }
    return results;
  },

  /**
   * Summarize detections by type.
   */
  _summarize: function (detections) {
    var counts = {};
    for (var i = 0; i < detections.length; i++) {
      var t = detections[i].type;
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  },

  /**
   * Filter a full scrape result object (texts, images, links).
   * Returns the filtered result and a report.
   */
  filterScrapeResult: function (data, config) {
    var cfg = config || this._config || this._defaults;
    if (!cfg || !cfg.enabled) return { data: data, report: null };

    var report = { totalDetections: 0, removedImages: 0, categories: {} };

    /* Filter text records */
    if (data.texts) {
      var filteredTexts = [];
      for (var i = 0; i < data.texts.length; i++) {
        var result = this.scan(data.texts[i].text, cfg);
        if (result.hasIssues) {
          report.totalDetections += result.detections.length;
          var summary = result.summary;
          for (var cat in summary) {
            report.categories[cat] = (report.categories[cat] || 0) + summary[cat];
          }
          if (cfg.redactMode === "remove" && result.clean.trim().length < 3) {
            continue; /* Skip entirely empty-after-removal texts */
          }
          data.texts[i].text = result.clean;
          data.texts[i]._filtered = true;
        }
        filteredTexts.push(data.texts[i]);
      }
      data.texts = filteredTexts;
    }

    /* Filter image URLs */
    if (data.images && cfg.filterNSFW) {
      var filteredImages = [];
      for (var j = 0; j < data.images.length; j++) {
        var check = this.checkImageUrl(data.images[j].src, cfg);
        if (!check.safe) {
          report.removedImages++;
          report.totalDetections++;
          continue;
        }
        filteredImages.push(data.images[j]);
      }
      data.images = filteredImages;
    }

    report.filtered = report.totalDetections > 0;
    return { data: data, report: report };
  }
};

/* Initialize on load */
WSP_ContentFilter.init();

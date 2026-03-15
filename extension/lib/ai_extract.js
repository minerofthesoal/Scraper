/* ── AI Extraction Module v0.6.3b ── */
/* Optional NuExtract-2.0-2B integration for structured data extraction */
/* Connects to a local NuExtract server started via the CLI */
/* eslint-env browser, webextensions */
/* Exported as: window.WSP_AI */

var WSP_AI = {

  /* Default server URL (CLI starts the server) */
  _serverUrl: "http://127.0.0.1:8377",
  _enabled: false,
  _status: "disconnected", // disconnected, connecting, ready, error

  /**
   * Initialize from stored config.
   */
  init() {
    var self = this;
    try {
      browser.storage.local.get(["aiEnabled", "aiServerUrl"]).then(function (cfg) {
        self._enabled = !!cfg.aiEnabled;
        if (cfg.aiServerUrl) self._serverUrl = cfg.aiServerUrl;
        if (self._enabled) self.checkServer();
      }).catch(function () {});
    } catch (e) {
      console.warn("[WSP] AI init error:", e);
    }
  },

  /**
   * Check if the NuExtract server is running.
   */
  checkServer() {
    var self = this;
    self._status = "connecting";
    return fetch(self._serverUrl + "/health", { method: "GET" })
      .then(function (resp) {
        if (resp.ok) {
          return resp.json().then(function (data) {
            self._status = "ready";
            self._modelInfo = data;
            return { status: "ready", model: data.model || "NuExtract-2.0-2B", device: data.device || "unknown" };
          });
        }
        self._status = "error";
        return { status: "error", message: "Server returned " + resp.status };
      })
      .catch(function () {
        self._status = "disconnected";
        return { status: "disconnected", message: "Cannot reach AI server at " + self._serverUrl + ". Start it with: scrape ai.serve" };
      });
  },

  /**
   * Extract structured data from text using NuExtract.
   *
   * @param {string} text - The text to extract from
   * @param {object} template - JSON template defining what to extract
   * @param {number} maxTokens - Max tokens to generate (default 2048)
   * @returns {Promise<object>} Extracted data matching the template
   */
  extract(text, template, maxTokens) {
    var self = this;
    if (!self._enabled) return Promise.reject(new Error("AI extraction is not enabled. Enable it in Settings."));
    if (self._status !== "ready") return Promise.reject(new Error("AI server not ready. Status: " + self._status));

    maxTokens = maxTokens || 2048;

    return fetch(self._serverUrl + "/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text,
        template: template,
        max_tokens: maxTokens,
      }),
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (err) {
          throw new Error("AI extraction failed: " + err);
        });
      }
      return resp.json();
    });
  },

  /**
   * Extract structured data from a scraped page.
   * Uses predefined templates for common extraction tasks.
   */
  extractFromPage(text, extractionType) {
    var template = this.getTemplate(extractionType);
    return this.extract(text, template);
  },

  /**
   * Get a predefined extraction template.
   */
  getTemplate(type) {
    var templates = {
      "article": {
        "title": "verbatim-string",
        "author": "verbatim-string",
        "date_published": "date-time",
        "summary": "string",
        "key_points": ["string"],
        "topics": [["Technology", "Science", "Politics", "Business", "Health", "Sports", "Entertainment", "Education", "Environment", "Other"]],
        "sentiment": ["Positive", "Negative", "Neutral", "Mixed"],
      },
      "product": {
        "product_name": "verbatim-string",
        "price": "number",
        "currency": "verbatim-string",
        "brand": "verbatim-string",
        "description": "string",
        "rating": "number",
        "features": ["string"],
        "availability": ["In Stock", "Out of Stock", "Pre-order", "Unknown"],
      },
      "contact": {
        "names": ["verbatim-string"],
        "emails": ["verbatim-string"],
        "phone_numbers": ["verbatim-string"],
        "addresses": ["string"],
        "companies": ["verbatim-string"],
        "job_titles": ["verbatim-string"],
      },
      "event": {
        "event_name": "verbatim-string",
        "date": "date-time",
        "location": "string",
        "organizer": "verbatim-string",
        "description": "string",
        "price": "number",
        "categories": [["Conference", "Workshop", "Meetup", "Webinar", "Concert", "Sports", "Other"]],
      },
      "recipe": {
        "recipe_name": "verbatim-string",
        "servings": "integer",
        "prep_time_minutes": "integer",
        "cook_time_minutes": "integer",
        "ingredients": ["string"],
        "instructions": ["string"],
        "cuisine": "string",
      },
      "research": {
        "title": "verbatim-string",
        "authors": ["verbatim-string"],
        "abstract": "string",
        "key_findings": ["string"],
        "methodology": "string",
        "publication_date": "date-time",
        "doi": "verbatim-string",
        "fields": [["Computer Science", "Biology", "Physics", "Chemistry", "Medicine", "Psychology", "Economics", "Other"]],
      },
    };

    return templates[type] || templates["article"];
  },

  /**
   * Get list of available templates.
   */
  getTemplateList() {
    return ["article", "product", "contact", "event", "recipe", "research"];
  },

  /**
   * Get current status.
   */
  getStatus() {
    return {
      enabled: this._enabled,
      status: this._status,
      serverUrl: this._serverUrl,
      model: this._modelInfo ? this._modelInfo.model : null,
      device: this._modelInfo ? this._modelInfo.device : null,
    };
  },

  /**
   * Batch extract from multiple text records.
   */
  batchExtract(records, template, onProgress) {
    var self = this;
    var results = [];
    var errors = [];

    function processNext(i) {
      if (i >= records.length) {
        return Promise.resolve({ results: results, errors: errors, total: records.length });
      }

      var text = records[i].text || records[i].content || "";
      if (!text || text.length < 20) {
        results.push({ index: i, skipped: true, reason: "text too short" });
        if (onProgress) onProgress(i + 1, records.length);
        return processNext(i + 1);
      }

      // Truncate very long texts to 4000 chars for the model
      if (text.length > 4000) text = text.slice(0, 4000);

      return self.extract(text, template)
        .then(function (data) {
          results.push({ index: i, data: data, source_url: records[i].source_url });
          if (onProgress) onProgress(i + 1, records.length);
        })
        .catch(function (err) {
          errors.push({ index: i, error: err.message, source_url: records[i].source_url });
          if (onProgress) onProgress(i + 1, records.length);
        })
        .then(function () {
          return processNext(i + 1);
        });
    }

    return processNext(0);
  }
};

// Initialize on load (safe)
WSP_AI.init();

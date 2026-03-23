/* ── Local Data Extraction Module v0.8 ── */
/* Regex-based structured data extraction — no external AI or server needed */
/* eslint-env browser, webextensions */
/* Exported as: window.WSP_AI (kept for backward compat) */

var WSP_AI = {

  _lastResults: [],

  /**
   * Initialize (no-op — no server to connect to).
   */
  init() {},

  /**
   * Extract structured data from text using local regex patterns.
   *
   * @param {string} text - The text to extract from
   * @param {object} template - JSON template defining what to extract
   * @returns {Promise<object>} Extracted data matching the template
   */
  extract(text, template) {
    return Promise.resolve(this._localExtract(text, template));
  },

  /**
   * Extract structured data from a scraped page.
   */
  extractFromPage(text, extractionType, customTemplate) {
    var template;
    if (extractionType === "custom" && customTemplate) {
      try {
        template = typeof customTemplate === "string" ? JSON.parse(customTemplate) : customTemplate;
      } catch (e) {
        return Promise.reject(new Error("Invalid custom template JSON: " + e.message));
      }
    } else {
      template = this.getTemplate(extractionType);
    }
    return this.extract(text, template);
  },

  /**
   * Get current status (always local).
   */
  getStatus() {
    return {
      enabled: true,
      status: "local",
      mode: "local_regex",
      lastResultCount: this._lastResults.length,
    };
  },

  /**
   * Local regex-based extraction (no server needed).
   * Extracts common patterns from text using regex.
   */
  _localExtract(text, template) {
    var result = {};
    if (!text) return result;

    /* Email addresses */
    if (template.emails || template.email) {
      var emails = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
      result.emails = emails ? Array.from(new Set(emails)) : [];
    }

    /* Phone numbers */
    if (template.phone_numbers || template.phone) {
      var phones = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g);
      result.phone_numbers = phones ? Array.from(new Set(phones)) : [];
    }

    /* Names — look for capitalized word sequences */
    if (template.names || template.author) {
      var nameRe = /(?:^|\.\s+|by\s+|author[:\s]+)([A-Z][a-z]+ (?:[A-Z]\.?\s+)?[A-Z][a-z]+)/gm;
      var names = [];
      var nm;
      while ((nm = nameRe.exec(text)) !== null) { names.push(nm[1]); }
      if (template.names) result.names = Array.from(new Set(names));
      if (template.author && names.length > 0) result.author = names[0];
    }

    /* Title — first substantial line or heading-like text */
    if (template.title) {
      var lines = text.split("\n").map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 5 && l.length < 200; });
      result.title = lines.length > 0 ? lines[0] : "";
    }

    /* Summary — first paragraph-like chunk */
    if (template.summary) {
      var paragraphs = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 50; });
      result.summary = paragraphs.length > 0 ? paragraphs[0].slice(0, 500) : "";
    }

    /* Dates */
    if (template.date_published || template.date || template.event_date) {
      var dateRe = /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\w+ \d{1,2},?\s*\d{4}|\d{1,2}\s+\w+\s+\d{4})\b/;
      var dateMatch = text.match(dateRe);
      var dateVal = dateMatch ? dateMatch[1] : "";
      if (template.date_published) result.date_published = dateVal;
      if (template.date) result.date = dateVal;
      if (template.event_date) result.event_date = dateVal;
    }

    /* Prices */
    if (template.price) {
      var priceRe = /(?:\$|USD|EUR|£|€)\s*([0-9,]+\.?\d*)/;
      var priceMatch = text.match(priceRe);
      result.price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : 0;
      result.currency = priceMatch ? (text.match(/(\$|USD|EUR|£|€)/) || ["$"])[0] : "";
    }

    /* Addresses */
    if (template.addresses) {
      var addrRe = /\d{1,5}\s+[\w\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Way|Court|Ct|Place|Pl)\.?(?:\s*,\s*[\w\s]+)?(?:\s*,\s*[A-Z]{2}\s+\d{5})?/gi;
      var addrs = text.match(addrRe);
      result.addresses = addrs ? Array.from(new Set(addrs)) : [];
    }

    /* Key points — extract sentences */
    if (template.key_points) {
      var sentences = text.split(/[.!?]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 20 && s.length < 300; });
      result.key_points = sentences.slice(0, 5);
    }

    /* Companies — look for Inc, LLC, Ltd, Corp patterns */
    if (template.companies) {
      var compRe = /([A-Z][\w\s&.]+(?:Inc|LLC|Ltd|Corp|Co|Group|Foundation|University|Institute)\.?)/g;
      var comps = [];
      var cm;
      while ((cm = compRe.exec(text)) !== null) { comps.push(cm[1].trim()); }
      result.companies = Array.from(new Set(comps));
    }

    /* URLs */
    if (template.urls || template.application_url) {
      var urlRe = /https?:\/\/[^\s<>"']+/g;
      var urls = text.match(urlRe);
      if (template.urls) result.urls = urls ? Array.from(new Set(urls)).slice(0, 20) : [];
      if (template.application_url && urls && urls.length > 0) result.application_url = urls[0];
    }

    /* Description fallback — use summary if not already set */
    if (template.description && !result.description) {
      var descParas = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 30; });
      result.description = descParas.length > 0 ? descParas[0].slice(0, 500) : "";
    }

    /* Topics — keyword-based classification */
    if (template.topics && !result.topics) {
      var topicMap = { Technology: /\b(software|app|code|program|digital|computer|AI|algorithm)\b/i, Science: /\b(research|study|experiment|hypothesis|scientific|biology|physics)\b/i, Business: /\b(company|market|revenue|profit|startup|enterprise|CEO)\b/i, Health: /\b(health|medical|doctor|patient|disease|treatment|hospital)\b/i };
      result.topics = [];
      for (var topicName in topicMap) {
        if (topicMap[topicName].test(text)) result.topics.push(topicName);
      }
      if (result.topics.length === 0) result.topics.push("Other");
    }

    /* Sentiment — simple keyword check */
    if (template.sentiment && !result.sentiment) {
      var posRe = /\b(great|good|excellent|amazing|best|love|fantastic|wonderful|happy|pleased)\b/gi;
      var negRe = /\b(bad|worst|terrible|awful|hate|poor|horrible|disappointing|angry|upset)\b/gi;
      var posCount = (text.match(posRe) || []).length;
      var negCount = (text.match(negRe) || []).length;
      result.sentiment = posCount > negCount ? "Positive" : negCount > posCount ? "Negative" : "Neutral";
    }

    result._extraction_method = "local_regex";
    return result;
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
      "job": {
        "job_title": "verbatim-string",
        "company": "verbatim-string",
        "location": "string",
        "salary_range": "string",
        "employment_type": ["Full-time", "Part-time", "Contract", "Freelance", "Internship", "Remote"],
        "experience_level": ["Entry", "Mid", "Senior", "Lead", "Executive"],
        "required_skills": ["verbatim-string"],
        "description": "string",
        "benefits": ["string"],
        "application_url": "verbatim-string",
      },
      "review": {
        "product_name": "verbatim-string",
        "reviewer": "verbatim-string",
        "rating": "number",
        "rating_max": "number",
        "title": "verbatim-string",
        "pros": ["string"],
        "cons": ["string"],
        "summary": "string",
        "verified_purchase": ["Yes", "No", "Unknown"],
        "date": "date-time",
      },
      "all": {
        "title": "verbatim-string",
        "author": "verbatim-string",
        "date_published": "date-time",
        "summary": "string",
        "key_points": ["string"],
        "topics": [["Technology", "Science", "Politics", "Business", "Health", "Sports", "Entertainment", "Education", "Environment", "Other"]],
        "sentiment": ["Positive", "Negative", "Neutral", "Mixed"],
        "product_name": "verbatim-string",
        "price": "number",
        "currency": "verbatim-string",
        "brand": "verbatim-string",
        "description": "string",
        "rating": "number",
        "features": ["string"],
        "names": ["verbatim-string"],
        "emails": ["verbatim-string"],
        "phone_numbers": ["verbatim-string"],
        "addresses": ["string"],
        "companies": ["verbatim-string"],
        "job_titles": ["verbatim-string"],
        "event_name": "verbatim-string",
        "event_date": "date-time",
        "location": "string",
        "organizer": "verbatim-string",
        "ingredients": ["string"],
        "instructions": ["string"],
      },
    };

    return templates[type] || templates["article"];
  },

  /**
   * Get list of available templates.
   */
  getTemplateList() {
    return ["all", "article", "product", "contact", "event", "recipe", "research", "job", "review"];
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
        self._lastResults = results;
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

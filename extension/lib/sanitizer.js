/* -- Content Sanitizer v0.6.6 -- */

(function() {
  "use strict";

  var DANGEROUS_TAGS = /(<\s*\/?\s*(script|iframe|object|embed|applet|form|base|link|meta|svg|math)(\s[^>]*)?>)/gi;
  var EVENT_HANDLER_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi;
  var DATA_URI_ATTR = /\s+(src|href|action|background|poster)\s*=\s*["']?\s*data\s*:/gi;
  var JAVASCRIPT_URI = /\s+(href|src|action)\s*=\s*["']?\s*javascript\s*:/gi;
  var STYLE_EXPRESSION = /expression\s*\(/gi;
  var STYLE_URL = /url\s*\(\s*["']?\s*javascript\s*:/gi;
  var STYLE_IMPORT = /@import/gi;

  var ALLOWED_SCHEMES = ["http:", "https:", "ftp:", "mailto:"];
  var BLOCKED_SCHEMES = ["javascript:", "data:text/html", "vbscript:", "blob:"];

  var XSS_PATTERNS = [
    { pattern: /<script[\s>]/i, name: "script tag" },
    { pattern: /on(load|error|click|mouse|focus|blur|key|submit|change|input|drag|touch|abort|resize)\s*=/i, name: "event handler attribute" },
    { pattern: /javascript\s*:/i, name: "javascript: URI" },
    { pattern: /vbscript\s*:/i, name: "vbscript: URI" },
    { pattern: /data\s*:\s*text\/html/i, name: "data:text/html URI" },
    { pattern: /expression\s*\(/i, name: "CSS expression" },
    { pattern: /<iframe[\s>]/i, name: "iframe tag" },
    { pattern: /<object[\s>]/i, name: "object tag" },
    { pattern: /<embed[\s>]/i, name: "embed tag" },
    { pattern: /<svg[\s>].*?on\w+\s*=/i, name: "SVG with event handler" },
    { pattern: /document\s*\.\s*(cookie|write|domain)/i, name: "document property access" },
    { pattern: /window\s*\.\s*location/i, name: "window.location manipulation" },
    { pattern: /eval\s*\(/i, name: "eval() call" },
    { pattern: /setTimeout\s*\(\s*["']/i, name: "setTimeout with string" },
    { pattern: /setInterval\s*\(\s*["']/i, name: "setInterval with string" },
    { pattern: /\.innerHTML\s*=/i, name: "innerHTML assignment" },
    { pattern: /String\s*\.\s*fromCharCode/i, name: "String.fromCharCode obfuscation" },
    { pattern: /&#x?[0-9a-f]+;/i, name: "HTML entity encoding (potential obfuscation)" },
    { pattern: /base64\s*,/i, name: "base64 encoded content" }
  ];

  function sanitizeHTML(html) {
    if (typeof html !== "string") {
      return "";
    }

    var clean = html;

    // Remove dangerous tags and their contents for script/style
    clean = clean.replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "");
    clean = clean.replace(/<\s*style\b[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "");

    // Remove other dangerous tags (self-closing or opening/closing)
    clean = clean.replace(DANGEROUS_TAGS, "");

    // Remove event handler attributes
    clean = clean.replace(EVENT_HANDLER_ATTR, "");

    // Remove data URIs in src/href/action attributes
    clean = clean.replace(DATA_URI_ATTR, "");

    // Remove javascript: URIs
    clean = clean.replace(JAVASCRIPT_URI, "");

    // Remove dangerous CSS
    clean = clean.replace(STYLE_EXPRESSION, "");
    clean = clean.replace(STYLE_URL, "");
    clean = clean.replace(STYLE_IMPORT, "");

    // Strip all remaining HTML tags to return clean text
    clean = clean.replace(/<[^>]*>/g, "");

    // Decode common HTML entities
    clean = clean.replace(/&amp;/g, "&");
    clean = clean.replace(/&lt;/g, "<");
    clean = clean.replace(/&gt;/g, ">");
    clean = clean.replace(/&quot;/g, '"');
    clean = clean.replace(/&#39;/g, "'");
    clean = clean.replace(/&nbsp;/g, " ");

    // Collapse whitespace
    clean = clean.replace(/\s+/g, " ").trim();

    return clean;
  }

  function sanitizeURL(url) {
    if (typeof url !== "string") {
      return null;
    }

    var trimmed = url.trim();

    if (trimmed.length === 0) {
      return null;
    }

    // Decode any percent-encoded characters for inspection
    var decoded;
    try {
      decoded = decodeURIComponent(trimmed);
    } catch (e) {
      decoded = trimmed;
    }

    // Normalize whitespace and control characters that could bypass checks
    var normalized = decoded.replace(/[\s\x00-\x1f\x7f]/g, "").toLowerCase();

    // Check for blocked schemes
    for (var i = 0; i < BLOCKED_SCHEMES.length; i++) {
      if (normalized.indexOf(BLOCKED_SCHEMES[i]) === 0) {
        return null;
      }
    }

    // Check for javascript: with possible whitespace/encoding tricks
    if (/^\s*j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i.test(trimmed)) {
      return null;
    }

    // Check for vbscript: with possible whitespace tricks
    if (/^\s*v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i.test(trimmed)) {
      return null;
    }

    // Parse the URL to validate structure
    var parsedScheme;
    var schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*)\s*:/);
    if (schemeMatch) {
      parsedScheme = schemeMatch[1].toLowerCase() + ":";
      var allowed = false;
      for (var j = 0; j < ALLOWED_SCHEMES.length; j++) {
        if (parsedScheme === ALLOWED_SCHEMES[j]) {
          allowed = true;
          break;
        }
      }
      if (!allowed) {
        return null;
      }
    } else {
      // Relative URL or protocol-relative — allow but check for tricks
      if (/^\/{2}/.test(trimmed)) {
        // Protocol-relative URL, acceptable
      } else if (/^[/?#]/.test(trimmed) || /^[a-zA-Z0-9]/.test(trimmed)) {
        // Relative path, acceptable
      } else {
        return null;
      }
    }

    // Validate with URL constructor if available
    try {
      if (parsedScheme) {
        var urlObj = new URL(trimmed);
        if (ALLOWED_SCHEMES.indexOf(urlObj.protocol) === -1) {
          return null;
        }
      }
    } catch (e) {
      // URL constructor failed — could be relative, allow through
      if (parsedScheme) {
        return null;
      }
    }

    return trimmed;
  }

  function sanitizeRecord(record) {
    if (!record || typeof record !== "object") {
      return record;
    }

    var clean = {};
    var keys = Object.keys(record);

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = record[key];

      if (typeof value === "string") {
        // Check if this field looks like a URL
        if (/^(https?:\/\/|ftp:\/\/|mailto:)/i.test(value.trim()) ||
            /url$/i.test(key) || /href$/i.test(key) || /link$/i.test(key) || /src$/i.test(key)) {
          var sanitizedUrl = sanitizeURL(value);
          clean[key] = sanitizedUrl !== null ? sanitizedUrl : "";
        } else {
          clean[key] = sanitizeHTML(value);
        }
      } else if (Array.isArray(value)) {
        clean[key] = [];
        for (var j = 0; j < value.length; j++) {
          if (typeof value[j] === "string") {
            clean[key].push(sanitizeHTML(value[j]));
          } else if (typeof value[j] === "object" && value[j] !== null) {
            clean[key].push(sanitizeRecord(value[j]));
          } else {
            clean[key].push(value[j]);
          }
        }
      } else if (typeof value === "object" && value !== null) {
        clean[key] = sanitizeRecord(value);
      } else {
        clean[key] = value;
      }
    }

    return clean;
  }

  function detectXSS(text) {
    var result = { safe: true, threats: [] };

    if (typeof text !== "string") {
      return result;
    }

    for (var i = 0; i < XSS_PATTERNS.length; i++) {
      var entry = XSS_PATTERNS[i];
      if (entry.pattern.test(text)) {
        result.safe = false;
        result.threats.push(entry.name);
      }
      // Reset lastIndex for global regexes
      entry.pattern.lastIndex = 0;
    }

    return result;
  }

  function validateCSP(url) {
    // Placeholder — actual CSP validation requires fetching headers from the target URL,
    // which cannot be done synchronously from a content script context. This returns
    // a structural stub for callers to populate after an async header fetch.
    return {
      url: typeof url === "string" ? url : "",
      checked: false,
      cspHeader: null,
      directives: {},
      issues: [],
      note: "CSP validation requires an async fetch of response headers. " +
            "Use browser.webRequest or a background script to retrieve the " +
            "Content-Security-Policy header, then parse directives here."
    };
  }

  window.WSP_Sanitizer = {
    sanitizeHTML: sanitizeHTML,
    sanitizeURL: sanitizeURL,
    sanitizeRecord: sanitizeRecord,
    detectXSS: detectXSS,
    validateCSP: validateCSP
  };

})();

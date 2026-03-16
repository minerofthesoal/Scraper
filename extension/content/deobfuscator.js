/* -- Deobfuscator Module v0.6.6 -- */
/* Detects and reverses common JS/HTML obfuscation techniques on web pages. */
/* DISABLED by default — enable via deobfuscateEnabled in storage. */
(function () {
  "use strict";

  /* ── Pattern definitions ── */

  // Base64: matches atob("...") or atob('...')
  var BASE64_CALL_RE = /atob\s*\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/g;

  // String.fromCharCode(72,101,108,108,111)
  var FROMCHARCODE_RE = /String\.fromCharCode\s*\(([0-9,\s]+)\)/g;

  // Hex-encoded strings: "\x48\x65\x6c\x6c\x6f"
  var HEX_STRING_RE = /((?:\\x[0-9A-Fa-f]{2}){3,})/g;

  // Unicode escape sequences: "\u0048\u0065\u006c"
  var UNICODE_ESC_RE = /((?:\\u[0-9A-Fa-f]{4}){3,})/g;

  // ROT13 heuristic — we check for mostly-alpha strings that decode to English-like text
  var ALPHA_BLOCK_RE = /[A-Za-z]{8,}/g;

  // Excessive HTML entity encoding: &#72;&#101;&#108; (3+ consecutive entities)
  var HTML_ENTITY_RE = /((?:&#x?[0-9A-Fa-f]+;){3,})/g;

  // Zero-width characters: ZWJ (\u200D), ZWNJ (\u200C), ZWSP (\u200B), FEFF
  var ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF]/g;

  /* ── Helper utilities ── */

  /**
   * Decode a hex-escaped string like \x48\x65 -> "He"
   */
  function decodeHexString(str) {
    return str.replace(/\\x([0-9A-Fa-f]{2})/g, function (_m, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
  }

  /**
   * Decode a unicode-escaped string like \u0048\u0065 -> "He"
   */
  function decodeUnicodeEscapes(str) {
    return str.replace(/\\u([0-9A-Fa-f]{4})/g, function (_m, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
  }

  /**
   * Decode HTML numeric entities: &#72; -> "H", &#x48; -> "H"
   */
  function decodeHTMLEntities(str) {
    return str.replace(/&#x([0-9A-Fa-f]+);/g, function (_m, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    }).replace(/&#(\d+);/g, function (_m, dec) {
      return String.fromCharCode(parseInt(dec, 10));
    });
  }

  /**
   * ROT13 transform.
   */
  function rot13(str) {
    return str.replace(/[A-Za-z]/g, function (c) {
      var base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
  }

  /**
   * Strip zero-width characters from text.
   */
  function stripZeroWidth(str) {
    return str.replace(ZERO_WIDTH_RE, "");
  }

  /**
   * Simple heuristic: does a string look like readable English/text?
   * Checks for vowel ratio and space-like structure.
   */
  function looksLikeReadableText(str) {
    if (!str || str.length < 4) return false;
    var vowels = (str.match(/[aeiouAEIOU]/g) || []).length;
    var ratio = vowels / str.length;
    // Readable text typically has 25-55% vowels
    return ratio > 0.2 && ratio < 0.6;
  }

  /* ── Core deobfuscation ── */

  /**
   * Attempt to deobfuscate a text string. Returns an array of findings.
   * Each finding: { type, original, decoded, confidence }
   */
  function deobfuscateText(text) {
    var findings = [];
    var match;

    // 1. Base64 atob() calls
    BASE64_CALL_RE.lastIndex = 0;
    while ((match = BASE64_CALL_RE.exec(text)) !== null) {
      try {
        var decoded = atob(match[1]);
        findings.push({
          type: "base64",
          original: match[0],
          decoded: decoded,
          confidence: looksLikeReadableText(decoded) ? "high" : "medium"
        });
      } catch (e) {
        // Invalid base64, skip
      }
    }

    // 2. String.fromCharCode calls
    FROMCHARCODE_RE.lastIndex = 0;
    while ((match = FROMCHARCODE_RE.exec(text)) !== null) {
      try {
        var codes = match[1].split(",").map(function (s) { return parseInt(s.trim(), 10); });
        var decoded = String.fromCharCode.apply(null, codes);
        findings.push({
          type: "charcode",
          original: match[0],
          decoded: decoded,
          confidence: "high"
        });
      } catch (e) {
        // Malformed, skip
      }
    }

    // 3. Hex-encoded strings
    HEX_STRING_RE.lastIndex = 0;
    while ((match = HEX_STRING_RE.exec(text)) !== null) {
      var decoded = decodeHexString(match[1]);
      findings.push({
        type: "hex_string",
        original: match[1],
        decoded: decoded,
        confidence: looksLikeReadableText(decoded) ? "high" : "medium"
      });
    }

    // 4. Unicode escape sequences
    UNICODE_ESC_RE.lastIndex = 0;
    while ((match = UNICODE_ESC_RE.exec(text)) !== null) {
      var decoded = decodeUnicodeEscapes(match[1]);
      findings.push({
        type: "unicode_escape",
        original: match[1],
        decoded: decoded,
        confidence: looksLikeReadableText(decoded) ? "high" : "medium"
      });
    }

    // 5. HTML entity obfuscation
    HTML_ENTITY_RE.lastIndex = 0;
    while ((match = HTML_ENTITY_RE.exec(text)) !== null) {
      var decoded = decodeHTMLEntities(match[1]);
      findings.push({
        type: "html_entities",
        original: match[1],
        decoded: decoded,
        confidence: looksLikeReadableText(decoded) ? "high" : "medium"
      });
    }

    // 6. ROT13 detection (heuristic — check alpha blocks)
    ALPHA_BLOCK_RE.lastIndex = 0;
    while ((match = ALPHA_BLOCK_RE.exec(text)) !== null) {
      var candidate = match[0];
      var decoded = rot13(candidate);
      // Only flag if the decoded version looks more like real text than the original
      if (looksLikeReadableText(decoded) && !looksLikeReadableText(candidate)) {
        findings.push({
          type: "rot13",
          original: candidate,
          decoded: decoded,
          confidence: "low"
        });
      }
    }

    return findings;
  }

  /* ── DOM scanning ── */

  /**
   * Check a single element for CSS-based hiding/obfuscation.
   * Returns findings array for that element.
   */
  function checkCSSObfuscation(el) {
    var findings = [];
    var style = window.getComputedStyle(el);
    var text = (el.textContent || "").trim();

    if (!text || text.length < 2) return findings;

    // font-size: 0 with actual content
    if (parseFloat(style.fontSize) === 0 && text.length > 0) {
      findings.push({
        type: "css_hidden_fontsize",
        original: "font-size:0 on element",
        decoded: text,
        confidence: "high",
        element: describeElement(el)
      });
    }

    // display:none with content (potential hidden data)
    if (style.display === "none" && text.length > 20) {
      findings.push({
        type: "css_hidden_display",
        original: "display:none on element with content",
        decoded: text.slice(0, 200),
        confidence: "low",
        element: describeElement(el)
      });
    }

    // text-indent pushed off-screen
    var indent = parseFloat(style.textIndent);
    if (indent < -999 && text.length > 0) {
      findings.push({
        type: "css_hidden_indent",
        original: "text-indent:" + style.textIndent,
        decoded: text,
        confidence: "medium",
        element: describeElement(el)
      });
    }

    // direction:rtl used to reverse visible text
    if (style.direction === "rtl" && style.unicodeBidi === "bidi-override") {
      var reversed = text.split("").reverse().join("");
      if (looksLikeReadableText(reversed) && !looksLikeReadableText(text)) {
        findings.push({
          type: "css_rtl_reversed",
          original: text,
          decoded: reversed,
          confidence: "high",
          element: describeElement(el)
        });
      }
    }

    return findings;
  }

  /**
   * Produce a short description of a DOM element for reporting.
   */
  function describeElement(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id ? "#" + el.id : "";
    var cls = el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
    return tag + id + cls;
  }

  /**
   * Scan the full page DOM for obfuscation patterns.
   * Returns { findings, stats }.
   */
  function scanPageForObfuscation() {
    var allFindings = [];

    // Scan inline scripts for text-based obfuscation
    var scripts = document.querySelectorAll("script:not([src])");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].textContent || "";
      if (src.length < 10) continue;
      var results = deobfuscateText(src);
      for (var j = 0; j < results.length; j++) {
        results[j].source = "inline_script";
        allFindings.push(results[j]);
      }
    }

    // Scan text nodes and element attributes for encoded content
    var walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    var node;
    while ((node = walker.nextNode())) {
      var text = node.nodeValue || "";
      if (text.trim().length < 6) continue;

      // Check for zero-width character insertion
      if (ZERO_WIDTH_RE.test(text)) {
        var cleaned = stripZeroWidth(text);
        if (cleaned !== text && cleaned.trim().length > 0) {
          allFindings.push({
            type: "zero_width_chars",
            original: text.slice(0, 100) + (text.length > 100 ? "..." : ""),
            decoded: cleaned.slice(0, 100) + (cleaned.length > 100 ? "..." : ""),
            confidence: "medium",
            source: "text_node"
          });
        }
        // Reset regex lastIndex after .test()
        ZERO_WIDTH_RE.lastIndex = 0;
      }

      // Check text content for encoded patterns
      var textFindings = deobfuscateText(text);
      for (var k = 0; k < textFindings.length; k++) {
        textFindings[k].source = "text_node";
        allFindings.push(textFindings[k]);
      }
    }

    // Scan elements for CSS-based obfuscation (limit scope for performance)
    var candidates = document.querySelectorAll(
      "[style], [class*='hidden'], [class*='hide'], [class*='obf'], " +
      "[class*='cloak'], [class*='mask'], span, div, p"
    );
    // Cap to avoid locking up on huge pages
    var scanLimit = Math.min(candidates.length, 2000);
    for (var m = 0; m < scanLimit; m++) {
      var cssFindings = checkCSSObfuscation(candidates[m]);
      for (var n = 0; n < cssFindings.length; n++) {
        cssFindings[n].source = "css_style";
        allFindings.push(cssFindings[n]);
      }
    }

    // Deduplicate findings by original+type
    var seen = {};
    var unique = [];
    for (var u = 0; u < allFindings.length; u++) {
      var key = allFindings[u].type + "|" + allFindings[u].original;
      if (!seen[key]) {
        seen[key] = true;
        unique.push(allFindings[u]);
      }
    }

    return {
      url: location.href,
      findings: unique,
      stats: {
        total: unique.length,
        highConfidence: unique.filter(function (f) { return f.confidence === "high"; }).length,
        mediumConfidence: unique.filter(function (f) { return f.confidence === "medium"; }).length,
        lowConfidence: unique.filter(function (f) { return f.confidence === "low"; }).length
      },
      scannedAt: new Date().toISOString()
    };
  }

  /* ── Message listener ── */
  browser.runtime.onMessage.addListener(function (msg) {
    if (msg.action !== "DEOBFUSCATE_PAGE") return;

    // Check if the feature is enabled before doing any work
    return browser.storage.local.get(["deobfuscateEnabled"]).then(function (cfg) {
      if (!cfg.deobfuscateEnabled) {
        browser.runtime.sendMessage({
          action: "DEOBFUSCATE_RESULT",
          data: { error: "Deobfuscation is disabled. Enable it in settings.", findings: [], stats: { total: 0 } }
        });
        return;
      }

      var result = scanPageForObfuscation();
      browser.runtime.sendMessage({
        action: "DEOBFUSCATE_RESULT",
        data: result
      });
    });
  });

})();

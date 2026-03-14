/* ── Robots.txt Checker Module ── */
/* Checks robots.txt before scraping to respect site rules */
(function () {
  "use strict";

  const robotsCache = {};

  const WSP_Robots = {

    /**
     * Check if scraping is allowed for the current URL.
     */
    async isAllowed(url) {
      try {
        const cfg = await browser.storage.local.get(["respectRobots"]);
        if (cfg.respectRobots === false) return true; // User disabled check

        const parsed = new URL(url);
        const robotsUrl = `${parsed.protocol}//${parsed.hostname}/robots.txt`;

        // Check cache
        if (robotsCache[parsed.hostname]) {
          return this._checkRules(robotsCache[parsed.hostname], parsed.pathname);
        }

        // Fetch robots.txt
        try {
          const resp = await fetch(robotsUrl, { mode: "cors" });
          if (!resp.ok) {
            // No robots.txt = all allowed
            robotsCache[parsed.hostname] = { allowed: true, rules: [] };
            return true;
          }

          const text = await resp.text();
          const rules = this._parseRobotsTxt(text);
          robotsCache[parsed.hostname] = rules;
          return this._checkRules(rules, parsed.pathname);
        } catch {
          // Can't fetch robots.txt (CORS etc.) = allow
          return true;
        }
      } catch {
        return true;
      }
    },

    /**
     * Parse robots.txt into rules.
     */
    _parseRobotsTxt(text) {
      const rules = { disallow: [], allow: [] };
      let isRelevantAgent = false;

      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const [key, ...valueParts] = trimmed.split(":");
        const value = valueParts.join(":").trim();

        if (key.toLowerCase() === "user-agent") {
          isRelevantAgent = value === "*" || value.toLowerCase().includes("webscraper");
        } else if (isRelevantAgent) {
          if (key.toLowerCase() === "disallow" && value) {
            rules.disallow.push(value);
          } else if (key.toLowerCase() === "allow" && value) {
            rules.allow.push(value);
          }
        }
      }

      return rules;
    },

    /**
     * Check if a path is allowed by the rules.
     */
    _checkRules(rules, path) {
      // Allow rules take precedence over disallow
      for (const pattern of rules.allow || []) {
        if (this._matchPattern(pattern, path)) return true;
      }
      for (const pattern of rules.disallow || []) {
        if (this._matchPattern(pattern, path)) return false;
      }
      return true; // Default allow
    },

    /**
     * Simple robots.txt pattern matching.
     */
    _matchPattern(pattern, path) {
      if (pattern === "/") return true; // Disallow all
      if (pattern.endsWith("*")) {
        return path.startsWith(pattern.slice(0, -1));
      }
      if (pattern.endsWith("$")) {
        return path === pattern.slice(0, -1);
      }
      return path.startsWith(pattern);
    },

    /**
     * Clear the robots.txt cache.
     */
    clearCache() {
      Object.keys(robotsCache).forEach((k) => delete robotsCache[k]);
    }
  };

  window.WSP_Robots = WSP_Robots;
})();

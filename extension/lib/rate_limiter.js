/* ── Rate Limiter Module v0.6b ── */
/* Prevents getting blocked by sites with configurable per-domain rate limiting */
(function () {
  "use strict";

  const WSP_RateLimiter = {
    /* Per-domain request timestamps */
    _domainRequests: {},

    /* Default: max 5 requests per 10 seconds per domain */
    _defaults: {
      maxRequests: 5,
      windowMs: 10000,
      cooldownMs: 2000,
    },

    /* Custom per-domain overrides */
    _overrides: {},

    /**
     * Initialize rate limiter from stored config.
     */
    async init() {
      const cfg = await browser.storage.local.get(["rateLimitConfig"]);
      if (cfg.rateLimitConfig) {
        if (cfg.rateLimitConfig.defaults) Object.assign(this._defaults, cfg.rateLimitConfig.defaults);
        if (cfg.rateLimitConfig.overrides) this._overrides = cfg.rateLimitConfig.overrides;
      }
    },

    /**
     * Get domain from URL.
     */
    _getDomain(url) {
      try { return new URL(url).hostname; } catch { return "unknown"; }
    },

    /**
     * Get rate limit config for a domain.
     */
    _getConfig(domain) {
      return this._overrides[domain] || this._defaults;
    },

    /**
     * Check if a request to domain is allowed right now.
     * Returns { allowed: bool, waitMs: number }
     */
    check(url) {
      const domain = this._getDomain(url);
      const config = this._getConfig(domain);
      const now = Date.now();

      if (!this._domainRequests[domain]) {
        this._domainRequests[domain] = [];
      }

      // Clean old timestamps outside the window
      this._domainRequests[domain] = this._domainRequests[domain].filter(
        ts => (now - ts) < config.windowMs
      );

      const recentCount = this._domainRequests[domain].length;

      if (recentCount >= config.maxRequests) {
        const oldest = this._domainRequests[domain][0];
        const waitMs = config.windowMs - (now - oldest) + 100;
        return { allowed: false, waitMs };
      }

      return { allowed: true, waitMs: 0 };
    },

    /**
     * Record a request to a domain.
     */
    record(url) {
      const domain = this._getDomain(url);
      if (!this._domainRequests[domain]) {
        this._domainRequests[domain] = [];
      }
      this._domainRequests[domain].push(Date.now());
    },

    /**
     * Wait until a request to the URL is allowed, then record it.
     * Returns a promise that resolves when the request can proceed.
     */
    async acquire(url) {
      const status = this.check(url);
      if (!status.allowed) {
        await new Promise(r => setTimeout(r, status.waitMs));
      }
      this.record(url);
    },

    /**
     * Get stats for display.
     */
    getStats() {
      const now = Date.now();
      const stats = {};
      for (const [domain, timestamps] of Object.entries(this._domainRequests)) {
        const config = this._getConfig(domain);
        const recent = timestamps.filter(ts => (now - ts) < config.windowMs);
        stats[domain] = {
          recent: recent.length,
          max: config.maxRequests,
          windowMs: config.windowMs,
        };
      }
      return stats;
    },

    /**
     * Update rate limit configuration.
     */
    async updateConfig(newConfig) {
      if (newConfig.defaults) Object.assign(this._defaults, newConfig.defaults);
      if (newConfig.overrides) Object.assign(this._overrides, newConfig.overrides);
      await browser.storage.local.set({ rateLimitConfig: { defaults: this._defaults, overrides: this._overrides } });
    },

    /**
     * Reset all tracking.
     */
    reset() {
      this._domainRequests = {};
    }
  };

  // Initialize on load
  WSP_RateLimiter.init();

  if (typeof window !== "undefined") window.WSP_RateLimiter = WSP_RateLimiter;
  if (typeof globalThis !== "undefined") globalThis.WSP_RateLimiter = WSP_RateLimiter;
})();

/* ── Rate Limiter Module v0.6.2b ── */
/* Prevents getting blocked by sites with configurable per-domain rate limiting */
/* eslint-env browser, webextensions */
/* Exported as: window.WSP_RateLimiter */
var WSP_RateLimiter = {
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
  init() {
    try {
      browser.storage.local.get(["rateLimitConfig"]).then(function (cfg) {
        if (cfg.rateLimitConfig) {
          if (cfg.rateLimitConfig.defaults) Object.assign(WSP_RateLimiter._defaults, cfg.rateLimitConfig.defaults);
          if (cfg.rateLimitConfig.overrides) WSP_RateLimiter._overrides = cfg.rateLimitConfig.overrides;
        }
      }).catch(function (e) {
        console.warn("[WSP] Rate limiter init failed:", e);
      });
    } catch (e) {
      console.warn("[WSP] Rate limiter init error:", e);
    }
  },

  /**
   * Get domain from URL.
   */
  _getDomain(url) {
    try { return new URL(url).hostname; } catch (e) { return "unknown"; }
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
    var domain = this._getDomain(url);
    var config = this._getConfig(domain);
    var now = Date.now();

    if (!this._domainRequests[domain]) {
      this._domainRequests[domain] = [];
    }

    // Clean old timestamps outside the window
    this._domainRequests[domain] = this._domainRequests[domain].filter(
      function (ts) { return (now - ts) < config.windowMs; }
    );

    var recentCount = this._domainRequests[domain].length;

    if (recentCount >= config.maxRequests) {
      var oldest = this._domainRequests[domain][0];
      var waitMs = config.windowMs - (now - oldest) + 100;
      return { allowed: false, waitMs: waitMs };
    }

    return { allowed: true, waitMs: 0 };
  },

  /**
   * Record a request to a domain.
   */
  record(url) {
    var domain = this._getDomain(url);
    if (!this._domainRequests[domain]) {
      this._domainRequests[domain] = [];
    }
    this._domainRequests[domain].push(Date.now());
  },

  /**
   * Wait until a request to the URL is allowed, then record it.
   * Returns a promise that resolves when the request can proceed.
   */
  acquire(url) {
    var self = this;
    var status = this.check(url);
    if (!status.allowed) {
      return new Promise(function (r) { setTimeout(r, status.waitMs); }).then(function () {
        self.record(url);
      });
    }
    this.record(url);
    return Promise.resolve();
  },

  /**
   * Get stats for display.
   */
  getStats() {
    var now = Date.now();
    var stats = {};
    var self = this;
    Object.keys(this._domainRequests).forEach(function (domain) {
      var timestamps = self._domainRequests[domain];
      var config = self._getConfig(domain);
      var recent = timestamps.filter(function (ts) { return (now - ts) < config.windowMs; });
      stats[domain] = {
        recent: recent.length,
        max: config.maxRequests,
        windowMs: config.windowMs,
      };
    });
    return stats;
  },

  /**
   * Update rate limit configuration.
   */
  updateConfig(newConfig) {
    if (newConfig.defaults) Object.assign(this._defaults, newConfig.defaults);
    if (newConfig.overrides) Object.assign(this._overrides, newConfig.overrides);
    return browser.storage.local.set({ rateLimitConfig: { defaults: this._defaults, overrides: this._overrides } });
  },

  /**
   * Reset all tracking.
   */
  reset() {
    this._domainRequests = {};
  }
};

// Initialize on load (safe — won't break script chain)
WSP_RateLimiter.init();

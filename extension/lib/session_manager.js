/* ── Session Manager v0.6.3b1 ── */
/* Named session save/restore, batch URL queue, domain filtering */
/* eslint-env browser, webextensions */
/* Exported as: window.WSP_Session, window.WSP_DomainFilter, window.WSP_Queue */

var WSP_Session = {

  /**
   * Save current session with a name.
   */
  save(name) {
    return browser.storage.local.get(["scrapedRecords", "citations", "sessionStats", "lastUploadRecordCount"]).then(function (data) {
      var session = {
        name: name,
        savedAt: new Date().toISOString(),
        records: data.scrapedRecords || [],
        citations: data.citations || [],
        stats: data.sessionStats || {},
        lastUploadRecordCount: data.lastUploadRecordCount || 0,
      };

      return WSP_Session.list().then(function (sessions) {
        var existingIdx = sessions.findIndex(function (s) { return s.name === name; });
        if (existingIdx >= 0) {
          sessions[existingIdx] = session;
        } else {
          sessions.push(session);
        }
        return browser.storage.local.set({ savedSessions: sessions }).then(function () {
          return session;
        });
      });
    });
  },

  /**
   * List all saved sessions (metadata only).
   */
  list() {
    return browser.storage.local.get(["savedSessions"]).then(function (data) {
      return data.savedSessions || [];
    });
  },

  /**
   * Restore a session by name.
   */
  restore(name) {
    return this.list().then(function (sessions) {
      var session = sessions.find(function (s) { return s.name === name; });
      if (!session) throw new Error('Session "' + name + '" not found');

      return browser.storage.local.set({
        scrapedRecords: session.records,
        citations: session.citations,
        sessionStats: session.stats,
        lastUploadRecordCount: session.lastUploadRecordCount,
      }).then(function () {
        return session;
      });
    });
  },

  /**
   * Delete a saved session.
   */
  remove(name) {
    return this.list().then(function (sessions) {
      var filtered = sessions.filter(function (s) { return s.name !== name; });
      return browser.storage.local.set({ savedSessions: filtered });
    });
  },

  /**
   * Merge a saved session into the current one.
   */
  merge(name) {
    return this.list().then(function (sessions) {
      var session = sessions.find(function (s) { return s.name === name; });
      if (!session) throw new Error('Session "' + name + '" not found');

      return browser.storage.local.get(["scrapedRecords", "citations", "sessionStats"]).then(function (current) {
        var records = current.scrapedRecords || [];
        var citations = current.citations || [];
        var stats = current.sessionStats || { words: 0, pages: 0, images: 0, links: 0, audio: 0 };

        // Merge records (dedup by _fp)
        var existingFps = new Set(records.map(function (r) { return r._fp; }).filter(Boolean));
        for (var i = 0; i < session.records.length; i++) {
          var r = session.records[i];
          if (!r._fp || !existingFps.has(r._fp)) {
            records.push(r);
            if (r._fp) existingFps.add(r._fp);
          }
        }

        // Merge citations (dedup by URL)
        var existingUrls = new Set(citations.map(function (c) { return c.url; }));
        for (var j = 0; j < session.citations.length; j++) {
          var c = session.citations[j];
          if (!existingUrls.has(c.url)) {
            citations.push(c);
            existingUrls.add(c.url);
          }
        }

        // Merge stats
        stats.words += session.stats.words || 0;
        stats.pages += session.stats.pages || 0;
        stats.images += session.stats.images || 0;
        stats.links += session.stats.links || 0;
        stats.audio += session.stats.audio || 0;

        return browser.storage.local.set({
          scrapedRecords: records,
          citations: citations,
          sessionStats: stats,
        }).then(function () {
          return { recordCount: records.length, citationCount: citations.length };
        });
      });
    });
  }
};

/* ── Domain Filter ── */
var WSP_DomainFilter = {

  /**
   * Check if a URL is allowed by domain filters.
   */
  isAllowed(url) {
    var domain;
    try { domain = new URL(url).hostname; } catch (e) { return Promise.resolve(true); }

    return browser.storage.local.get(["domainAllowlist", "domainBlocklist"]).then(function (cfg) {
      var allowlist = cfg.domainAllowlist || [];
      var blocklist = cfg.domainBlocklist || [];

      // If allowlist is set, only allow those domains
      if (allowlist.length > 0) {
        return allowlist.some(function (d) { return domain === d || domain.endsWith("." + d); });
      }

      // If blocklist is set, block those domains
      if (blocklist.length > 0) {
        return !blocklist.some(function (d) { return domain === d || domain.endsWith("." + d); });
      }

      return true;
    });
  },

  /**
   * Get current filter configuration.
   */
  getConfig() {
    return browser.storage.local.get(["domainAllowlist", "domainBlocklist"]).then(function (cfg) {
      return {
        allowlist: cfg.domainAllowlist || [],
        blocklist: cfg.domainBlocklist || [],
      };
    });
  },

  /**
   * Update filter configuration.
   */
  setConfig(allowlist, blocklist) {
    return browser.storage.local.set({
      domainAllowlist: allowlist || [],
      domainBlocklist: blocklist || [],
    });
  }
};

/* ── Scrape Queue ── */
var WSP_Queue = {
  _queue: [],
  _processing: false,
  _currentIndex: -1,

  /**
   * Add URLs to the queue.
   */
  add(urls) {
    for (var i = 0; i < urls.length; i++) {
      var trimmed = urls[i].trim();
      if (trimmed && trimmed.startsWith("http")) {
        this._queue.push({
          url: trimmed,
          status: "pending",
          addedAt: Date.now(),
        });
      }
    }
    this._persist();
  },

  /**
   * Get current queue state.
   */
  getAll() {
    return this._queue.slice();
  },

  /**
   * Clear the queue.
   */
  clear() {
    this._queue = [];
    this._processing = false;
    this._currentIndex = -1;
    this._persist();
  },

  /**
   * Remove a specific URL from the queue.
   */
  remove(index) {
    this._queue.splice(index, 1);
    this._persist();
  },

  /**
   * Start processing the queue.
   */
  start() {
    if (this._processing) return;
    this._processing = true;
    var self = this;

    function processNext(i) {
      if (!self._processing || i >= self._queue.length) {
        self._processing = false;
        self._currentIndex = -1;
        self._persist();
        return;
      }

      var item = self._queue[i];
      if (item.status !== "pending") {
        processNext(i + 1);
        return;
      }

      self._currentIndex = i;

      // Check domain filter
      WSP_DomainFilter.isAllowed(item.url).then(function (allowed) {
        if (!allowed) {
          item.status = "skipped";
          item.reason = "blocked by domain filter";
          self._persist();
          processNext(i + 1);
          return;
        }

        // Check rate limit
        var rateLimitPromise = (typeof WSP_RateLimiter !== "undefined")
          ? WSP_RateLimiter.acquire(item.url)
          : Promise.resolve();

        rateLimitPromise.then(function () {
          item.status = "scraping";
          self._persist();

          return self._scrapeUrl(item.url);
        }).then(function () {
          item.status = "done";
          item.completedAt = Date.now();
          self._persist();
          processNext(i + 1);
        }).catch(function (err) {
          item.status = "failed";
          item.error = err.message;
          self._persist();
          processNext(i + 1);
        });
      });
    }

    processNext(0);
  },

  /**
   * Stop processing.
   */
  stop() {
    this._processing = false;
  },

  /**
   * Navigate to URL and trigger scrape. Returns a promise.
   */
  _scrapeUrl(url) {
    return new Promise(function (resolve, reject) {
      /* Create a new tab for queue scraping so it works even with popup closed */
      browser.tabs.create({ url: url, active: false }).then(function (tab) {
        var tabId = tab.id;
        var resolved = false;
        var timeout;

        /* Listen for the tab to finish loading */
        function onUpdated(tid, changeInfo) {
          if (tid !== tabId || changeInfo.status !== "complete") return;
          browser.tabs.onUpdated.removeListener(onUpdated);

          /* Wait for content scripts to initialize, then scrape */
          setTimeout(function () {
            browser.tabs.sendMessage(tabId, { action: "SCRAPE_FULL_PAGE" })
              .then(function () {
                /* Wait for background to receive and process SCRAPED_DATA */
                setTimeout(function () {
                  if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    /* Close the tab after scraping */
                    browser.tabs.remove(tabId).catch(function () {});
                    resolve();
                  }
                }, 4000);
              })
              .catch(function (err) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  browser.tabs.remove(tabId).catch(function () {});
                  reject(err);
                }
              });
          }, 3000); /* 3s for content scripts to inject */
        }

        browser.tabs.onUpdated.addListener(onUpdated);

        /* Timeout after 45 seconds */
        timeout = setTimeout(function () {
          if (!resolved) {
            resolved = true;
            browser.tabs.onUpdated.removeListener(onUpdated);
            browser.tabs.remove(tabId).catch(function () {});
            reject(new Error("Page load timeout for " + url));
          }
        }, 45000);
      }).catch(reject);
    });
  },

  /**
   * Persist queue state.
   */
  _persist() {
    browser.storage.local.set({
      scrapeQueue: this._queue,
      queueProcessing: this._processing,
      queueCurrentIndex: this._currentIndex,
    });
    // Broadcast queue update
    browser.runtime.sendMessage({
      action: "QUEUE_UPDATE",
      queue: this._queue,
      processing: this._processing,
      currentIndex: this._currentIndex,
    }).catch(function () {});
  },

  /**
   * Load queue from storage.
   */
  load() {
    try {
      browser.storage.local.get(["scrapeQueue"]).then(function (data) {
        if (data.scrapeQueue) WSP_Queue._queue = data.scrapeQueue;
      }).catch(function (e) {
        console.warn("[WSP] Queue load failed:", e);
      });
    } catch (e) {
      console.warn("[WSP] Queue load error:", e);
    }
  },

  /**
   * Get queue stats.
   */
  stats() {
    var total = this._queue.length;
    var done = this._queue.filter(function (q) { return q.status === "done"; }).length;
    var failed = this._queue.filter(function (q) { return q.status === "failed"; }).length;
    var pending = this._queue.filter(function (q) { return q.status === "pending"; }).length;
    var skipped = this._queue.filter(function (q) { return q.status === "skipped"; }).length;
    return { total: total, done: done, failed: failed, pending: pending, skipped: skipped, processing: this._processing };
  }
};

// Load queue on init (safe — won't break script chain)
WSP_Queue.load();

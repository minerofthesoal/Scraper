/* ── Session Manager v0.6b ── */
/* Named session save/restore, batch URL queue, domain filtering */
(function () {
  "use strict";

  const WSP_Session = {

    /**
     * Save current session with a name.
     */
    async save(name) {
      const data = await browser.storage.local.get(["scrapedRecords", "citations", "sessionStats", "lastUploadRecordCount"]);
      const session = {
        name,
        savedAt: new Date().toISOString(),
        records: data.scrapedRecords || [],
        citations: data.citations || [],
        stats: data.sessionStats || {},
        lastUploadRecordCount: data.lastUploadRecordCount || 0,
      };

      const sessions = await this.list();
      const existingIdx = sessions.findIndex(s => s.name === name);
      if (existingIdx >= 0) {
        sessions[existingIdx] = session;
      } else {
        sessions.push(session);
      }

      await browser.storage.local.set({ savedSessions: sessions });
      return session;
    },

    /**
     * List all saved sessions (metadata only).
     */
    async list() {
      const data = await browser.storage.local.get(["savedSessions"]);
      return data.savedSessions || [];
    },

    /**
     * Restore a session by name.
     */
    async restore(name) {
      const sessions = await this.list();
      const session = sessions.find(s => s.name === name);
      if (!session) throw new Error(`Session "${name}" not found`);

      await browser.storage.local.set({
        scrapedRecords: session.records,
        citations: session.citations,
        sessionStats: session.stats,
        lastUploadRecordCount: session.lastUploadRecordCount,
      });
      return session;
    },

    /**
     * Delete a saved session.
     */
    async remove(name) {
      const sessions = await this.list();
      const filtered = sessions.filter(s => s.name !== name);
      await browser.storage.local.set({ savedSessions: filtered });
    },

    /**
     * Merge a saved session into the current one.
     */
    async merge(name) {
      const sessions = await this.list();
      const session = sessions.find(s => s.name === name);
      if (!session) throw new Error(`Session "${name}" not found`);

      const current = await browser.storage.local.get(["scrapedRecords", "citations", "sessionStats"]);
      const records = current.scrapedRecords || [];
      const citations = current.citations || [];
      const stats = current.sessionStats || { words: 0, pages: 0, images: 0, links: 0, audio: 0 };

      // Merge records (dedup by _fp)
      const existingFps = new Set(records.map(r => r._fp).filter(Boolean));
      for (const r of session.records) {
        if (!r._fp || !existingFps.has(r._fp)) {
          records.push(r);
          if (r._fp) existingFps.add(r._fp);
        }
      }

      // Merge citations (dedup by URL)
      const existingUrls = new Set(citations.map(c => c.url));
      for (const c of session.citations) {
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

      await browser.storage.local.set({
        scrapedRecords: records,
        citations,
        sessionStats: stats,
      });
      return { recordCount: records.length, citationCount: citations.length };
    }
  };

  /* ── Domain Filter ── */
  const WSP_DomainFilter = {

    /**
     * Check if a URL is allowed by domain filters.
     */
    async isAllowed(url) {
      let domain;
      try { domain = new URL(url).hostname; } catch { return true; }

      const cfg = await browser.storage.local.get(["domainAllowlist", "domainBlocklist"]);
      const allowlist = cfg.domainAllowlist || [];
      const blocklist = cfg.domainBlocklist || [];

      // If allowlist is set, only allow those domains
      if (allowlist.length > 0) {
        return allowlist.some(d => domain === d || domain.endsWith("." + d));
      }

      // If blocklist is set, block those domains
      if (blocklist.length > 0) {
        return !blocklist.some(d => domain === d || domain.endsWith("." + d));
      }

      return true;
    },

    /**
     * Get current filter configuration.
     */
    async getConfig() {
      const cfg = await browser.storage.local.get(["domainAllowlist", "domainBlocklist"]);
      return {
        allowlist: cfg.domainAllowlist || [],
        blocklist: cfg.domainBlocklist || [],
      };
    },

    /**
     * Update filter configuration.
     */
    async setConfig(allowlist, blocklist) {
      await browser.storage.local.set({
        domainAllowlist: allowlist || [],
        domainBlocklist: blocklist || [],
      });
    }
  };

  /* ── Scrape Queue ── */
  const WSP_Queue = {
    _queue: [],
    _processing: false,
    _currentIndex: -1,

    /**
     * Add URLs to the queue.
     */
    add(urls) {
      for (const url of urls) {
        const trimmed = url.trim();
        if (trimmed && trimmed.startsWith("http")) {
          this._queue.push({
            url: trimmed,
            status: "pending", // pending, scraping, done, failed, skipped
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
      return [...this._queue];
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
    async start() {
      if (this._processing) return;
      this._processing = true;

      for (let i = 0; i < this._queue.length; i++) {
        if (!this._processing) break;

        const item = this._queue[i];
        if (item.status !== "pending") continue;

        this._currentIndex = i;

        // Check domain filter
        const allowed = await WSP_DomainFilter.isAllowed(item.url);
        if (!allowed) {
          item.status = "skipped";
          item.reason = "blocked by domain filter";
          this._persist();
          continue;
        }

        // Check rate limit
        if (typeof WSP_RateLimiter !== "undefined") {
          await WSP_RateLimiter.acquire(item.url);
        }

        item.status = "scraping";
        this._persist();

        // Navigate to the URL and scrape
        try {
          await this._scrapeUrl(item.url);
          item.status = "done";
          item.completedAt = Date.now();
        } catch (err) {
          item.status = "failed";
          item.error = err.message;
        }

        this._persist();
      }

      this._processing = false;
      this._currentIndex = -1;
      this._persist();
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
      return new Promise((resolve, reject) => {
        browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
          if (!tabs[0]) return reject(new Error("No active tab"));

          const tabId = tabs[0].id;
          browser.tabs.update(tabId, { url }).then(() => {
            // Wait for page to load
            const listener = (tid, changeInfo) => {
              if (tid === tabId && changeInfo.status === "complete") {
                browser.webNavigation.onCompleted.removeListener(listener);
                // Wait a bit for content scripts to initialize, then scrape
                setTimeout(() => {
                  browser.tabs.sendMessage(tabId, { action: "SCRAPE_WITH_SCROLL" })
                    .then(() => setTimeout(resolve, 3000))
                    .catch(reject);
                }, 2000);
              }
            };
            browser.webNavigation.onCompleted.addListener(listener);

            // Timeout after 30 seconds
            setTimeout(() => {
              browser.webNavigation.onCompleted.removeListener(listener);
              reject(new Error("Page load timeout"));
            }, 30000);
          });
        });
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
      }).catch(() => {});
    },

    /**
     * Load queue from storage.
     */
    async load() {
      const data = await browser.storage.local.get(["scrapeQueue"]);
      if (data.scrapeQueue) this._queue = data.scrapeQueue;
    },

    /**
     * Get queue stats.
     */
    stats() {
      const total = this._queue.length;
      const done = this._queue.filter(q => q.status === "done").length;
      const failed = this._queue.filter(q => q.status === "failed").length;
      const pending = this._queue.filter(q => q.status === "pending").length;
      const skipped = this._queue.filter(q => q.status === "skipped").length;
      return { total, done, failed, pending, skipped, processing: this._processing };
    }
  };

  // Load queue on init
  WSP_Queue.load();

  if (typeof window !== "undefined") {
    window.WSP_Session = WSP_Session;
    window.WSP_DomainFilter = WSP_DomainFilter;
    window.WSP_Queue = WSP_Queue;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.WSP_Session = WSP_Session;
    globalThis.WSP_DomainFilter = WSP_DomainFilter;
    globalThis.WSP_Queue = WSP_Queue;
  }
})();

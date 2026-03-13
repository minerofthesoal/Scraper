/* ── WebScraper Pro Utilities ── */
/* eslint-env browser, webextensions */
(function () {
  "use strict";

  const WSP_Utils = {

    /**
     * Generate a short unique ID.
     */
    uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    /**
     * Get current ISO timestamp.
     */
    now() {
      return new Date().toISOString();
    },

    /**
     * Sanitize a filename.
     */
    sanitizeFilename(name) {
      return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
    },

    /**
     * Convert a data URL or blob URL to a Blob for download.
     */
    async urlToBlob(url) {
      const resp = await fetch(url);
      return resp.blob();
    },

    /**
     * Download a blob as a file using browser.downloads.
     */
    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      return browser.downloads.download({ url, filename, saveAs: false }).then((id) => {
        // Revoke after a delay
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        return id;
      });
    },

    /**
     * Download a text string as a file.
     */
    downloadText(text, filename, mimeType = "application/json") {
      const blob = new Blob([text], { type: mimeType });
      return this.downloadBlob(blob, filename);
    },

    /**
     * Format bytes to human-readable.
     */
    formatBytes(bytes) {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    },

    /**
     * Debounce helper.
     */
    debounce(fn, ms) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
      };
    },

    /**
     * Extract domain from URL.
     */
    extractDomain(url) {
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    },

    /**
     * Parse date string to Date object, trying multiple formats.
     */
    parseDate(str) {
      if (!str) return null;
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d;
      return null;
    },

    /**
     * Format date for MLA citation (Day Month Year).
     */
    formatMLADate(date) {
      if (!date) date = new Date();
      const months = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June",
        "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
      return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    },

    /**
     * Convert JSONL array to different formats.
     */
    toJSONL(dataArray) {
      return dataArray.map((d) => JSON.stringify(d)).join("\n") + "\n";
    },

    toCSV(dataArray) {
      if (dataArray.length === 0) return "";
      const keys = Object.keys(dataArray[0]);
      const header = keys.join(",");
      const rows = dataArray.map((d) =>
        keys.map((k) => {
          const val = typeof d[k] === "object" ? JSON.stringify(d[k]) : String(d[k] || "");
          return '"' + val.replace(/"/g, '""') + '"';
        }).join(",")
      );
      return header + "\n" + rows.join("\n") + "\n";
    }
  };

  // Export globally for background and content scripts
  if (typeof window !== "undefined") window.WSP_Utils = WSP_Utils;
  if (typeof globalThis !== "undefined") globalThis.WSP_Utils = WSP_Utils;
})();

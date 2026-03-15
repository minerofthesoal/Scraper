/* ── WebScraper Pro Utilities v0.6.2b ── */
/* eslint-env browser, webextensions */
/* Exported as: window.WSP_Utils */
var WSP_Utils = {

  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  now() {
    return new Date().toISOString();
  },

  sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  },

  async urlToBlob(url) {
    const resp = await fetch(url);
    return resp.blob();
  },

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    return browser.downloads.download({ url, filename, saveAs: false }).then((id) => {
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return id;
    });
  },

  downloadText(text, filename, mimeType) {
    mimeType = mimeType || "application/json";
    const blob = new Blob([text], { type: mimeType });
    return this.downloadBlob(blob, filename);
  },

  formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    var k = 1024;
    var sizes = ["B", "KB", "MB", "GB"];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  },

  debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  },

  extractDomain(url) {
    try { return new URL(url).hostname; }
    catch (e) { return url; }
  },

  parseDate(str) {
    if (!str) return null;
    var d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    return null;
  },

  formatMLADate(date) {
    if (!date) date = new Date();
    var months = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June",
      "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
    return date.getDate() + " " + months[date.getMonth()] + " " + date.getFullYear();
  },

  toJSONL(dataArray) {
    return dataArray.map(function (d) { return JSON.stringify(d); }).join("\n") + "\n";
  },

  toCSV(dataArray) {
    if (dataArray.length === 0) return "";
    var keys = Object.keys(dataArray[0]);
    var header = keys.join(",");
    var rows = dataArray.map(function (d) {
      return keys.map(function (k) {
        var val = typeof d[k] === "object" ? JSON.stringify(d[k]) : String(d[k] || "");
        return '"' + val.replace(/"/g, '""') + '"';
      }).join(",");
    });
    return header + "\n" + rows.join("\n") + "\n";
  },

  /**
   * Truncate text to maxLen with ellipsis.
   */
  truncate(text, maxLen) {
    if (!text) return "";
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + "...";
  },

  /**
   * Deep clone an object (JSON-safe only).
   */
  clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
};

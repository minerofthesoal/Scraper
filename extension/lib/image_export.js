/* ── Image Export Module v0.6.3b1 ── */
/* Export scraped images in multiple formats: PNG, WebP, BMP, SVG, JPEG */
/* eslint-env browser, webextensions */
/* Exported as: window.WSP_ImageExport */

var WSP_ImageExport = {

  /* Supported output formats and their MIME types */
  FORMATS: {
    png:  { mime: "image/png",  ext: ".png"  },
    webp: { mime: "image/webp", ext: ".webp" },
    jpeg: { mime: "image/jpeg", ext: ".jpg"  },
    bmp:  { mime: "image/bmp",  ext: ".bmp"  },
    svg:  { mime: "image/svg+xml", ext: ".svg" },
  },

  /**
   * Get list of scraped image records from storage.
   */
  getImageRecords() {
    return browser.storage.local.get(["scrapedRecords"]).then(function (data) {
      var records = data.scrapedRecords || [];
      return records.filter(function (r) { return r.type === "image"; });
    });
  },

  /**
   * Load an image from URL into an HTMLImageElement.
   * Returns a promise that resolves with the loaded Image.
   */
  _loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Failed to load image: " + src)); };
      img.src = src;
    });
  },

  /**
   * Convert an image to a specific format via OffscreenCanvas or Canvas.
   * Returns a promise resolving to a Blob.
   */
  convertImage(src, format, quality) {
    format = format || "png";
    quality = quality || 0.92;
    var fmt = this.FORMATS[format];
    if (!fmt) return Promise.reject(new Error("Unsupported format: " + format));

    // SVG export is special — we wrap the image in an SVG container
    if (format === "svg") {
      return this._convertToSVG(src);
    }

    return this._loadImage(src).then(function (img) {
      var canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Canvas toBlob failed for format: " + format));
          }
        }, fmt.mime, quality);
      });
    });
  },

  /**
   * Convert an image to SVG by embedding it as a base64 data URI inside an SVG wrapper.
   */
  _convertToSVG(src) {
    return this._loadImage(src).then(function (img) {
      var canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      var dataUrl = canvas.toDataURL("image/png");
      var svgContent = '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<svg xmlns="http://www.w3.org/2000/svg" '
        + 'xmlns:xlink="http://www.w3.org/1999/xlink" '
        + 'width="' + canvas.width + '" height="' + canvas.height + '" '
        + 'viewBox="0 0 ' + canvas.width + ' ' + canvas.height + '">\n'
        + '  <image width="' + canvas.width + '" height="' + canvas.height + '" '
        + 'href="' + dataUrl + '"/>\n'
        + '</svg>';

      return new Blob([svgContent], { type: "image/svg+xml" });
    });
  },

  /**
   * Export a single image record in the specified format.
   * Downloads the file via the browser downloads API.
   */
  exportSingle(record, format, quality) {
    format = format || "png";
    var fmt = this.FORMATS[format];
    if (!fmt) return Promise.reject(new Error("Unsupported format: " + format));

    var filename = this._makeFilename(record, fmt.ext);

    return this.convertImage(record.src, format, quality).then(function (blob) {
      var url = URL.createObjectURL(blob);
      return browser.downloads.download({
        url: url,
        filename: "webscraper-pro/images/" + filename,
        saveAs: false,
      }).then(function (id) {
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        return id;
      });
    });
  },

  /**
   * Export multiple image records in the specified format.
   * Returns a promise that resolves when all downloads are queued.
   */
  exportBatch(records, format, quality, onProgress) {
    var self = this;
    var completed = 0;
    var errors = [];

    function processNext(i) {
      if (i >= records.length) {
        return Promise.resolve({ completed: completed, errors: errors, total: records.length });
      }

      return self.exportSingle(records[i], format, quality)
        .then(function () {
          completed++;
          if (onProgress) onProgress(completed, records.length);
        })
        .catch(function (err) {
          errors.push({ src: records[i].src, error: err.message });
        })
        .then(function () {
          return processNext(i + 1);
        });
    }

    return processNext(0);
  },

  /**
   * Generate a safe filename from an image record.
   */
  _makeFilename(record, ext) {
    var name = "";
    if (record.alt) {
      name = record.alt;
    } else if (record.src) {
      try {
        var url = new URL(record.src);
        name = url.pathname.split("/").pop().split(".")[0] || "image";
      } catch (e) {
        name = "image";
      }
    } else {
      name = "image";
    }
    // Sanitize
    name = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    if (!name) name = "image";
    // Add timestamp for uniqueness
    name += "_" + Date.now().toString(36);
    return name + ext;
  },

  /**
   * Get image info (dimensions, estimated size) without full download.
   */
  getImageInfo(src) {
    return this._loadImage(src).then(function (img) {
      return {
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        src: src,
      };
    }).catch(function () {
      return { width: 0, height: 0, src: src, error: true };
    });
  }
};

/* ── Download Manager Module ── */
/* Handles downloading images and audio from scraped content */
(function () {
  "use strict";

  const WSP_Downloads = {

    /**
     * Download an image from URL, optionally converting format.
     */
    async downloadImage(url, filename, format = "png") {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const blob = await resp.blob();

        if (format !== "original" && blob.type.startsWith("image/")) {
          // Convert using canvas
          const convertedBlob = await this._convertImageFormat(blob, format);
          return this._triggerDownload(convertedBlob, filename);
        }

        return this._triggerDownload(blob, filename);
      } catch (err) {
        console.error(`[WSP] Download failed: ${url}`, err);
        return null;
      }
    },

    /**
     * Download audio from URL, with optional WAV conversion note.
     */
    async downloadAudio(url, filename) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        return this._triggerDownload(blob, filename);
      } catch (err) {
        console.error(`[WSP] Audio download failed: ${url}`, err);
        return null;
      }
    },

    /**
     * Batch download all images from scraped data.
     */
    async batchDownloadImages(images, format = "png") {
      let downloaded = 0;
      let failed = 0;

      for (const img of images) {
        if (!img.src) continue;
        const ext = format === "original" ? (img.src.split(".").pop().split("?")[0] || "png") : format;
        const filename = `webscraper-pro/images/${this._sanitize(img.alt || img.id || "image")}_${downloaded}.${ext}`;

        const result = await this.downloadImage(img.src, filename, format);
        if (result) {
          downloaded++;
        } else {
          failed++;
        }

        // Rate limit
        await new Promise((r) => setTimeout(r, 200));
      }

      return { downloaded, failed };
    },

    /**
     * Batch download all audio files.
     */
    async batchDownloadAudio(audioItems) {
      let downloaded = 0;

      for (const item of audioItems) {
        if (!item.src) continue;
        const ext = item.src.split(".").pop().split("?")[0] || "wav";
        const filename = `webscraper-pro/audio/${item.id || "audio"}_${downloaded}.${ext}`;

        const result = await this.downloadAudio(item.src, filename);
        if (result) downloaded++;

        await new Promise((r) => setTimeout(r, 200));
      }

      return { downloaded };
    },

    /* ── Private helpers ── */

    _convertImageFormat(blob, format) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          const mimeType = format === "png" ? "image/png" :
                           format === "webp" ? "image/webp" :
                           format === "jpg" || format === "jpeg" ? "image/jpeg" : "image/png";

          canvas.toBlob((convertedBlob) => {
            if (convertedBlob) resolve(convertedBlob);
            else reject(new Error("Conversion failed"));
          }, mimeType, 0.92);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
      });
    },

    _triggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob);
      return browser.downloads.download({
        url,
        filename,
        saveAs: false,
      }).then((id) => {
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        return id;
      });
    },

    _sanitize(name) {
      return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    }
  };

  /* ── Message listener ── */
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "DOWNLOAD_ALL_IMAGES") {
      return WSP_Downloads.batchDownloadImages(msg.images, msg.format || "png").then((result) => {
        if (typeof WSP_Toast !== "undefined") {
          WSP_Toast.show(`Downloaded ${result.downloaded} images (${result.failed} failed)`);
        }
        return result;
      });
    }
    if (msg.action === "DOWNLOAD_ALL_AUDIO") {
      return WSP_Downloads.batchDownloadAudio(msg.audio).then((result) => {
        if (typeof WSP_Toast !== "undefined") {
          WSP_Toast.show(`Downloaded ${result.downloaded} audio files`);
        }
        return result;
      });
    }
  });

  window.WSP_Downloads = WSP_Downloads;
})();

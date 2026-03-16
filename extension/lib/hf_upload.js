/* ── HuggingFace Upload Module v0.6.6 ── */
/* Correct API endpoints, retry logic, incremental uploads, progress tracking */
/* eslint-env browser, webextensions */
/* Exported as: window.WSP_HFUpload */
var WSP_HF_API = "https://huggingface.co/api";

var WSP_HFUpload = {

  /* ── Last upload hash for incremental uploads ── */
  _lastUploadHash: null,

  /**
   * Check if a HuggingFace token is valid.
   * Tries /api/whoami-v2 first, falls back to /api/whoami.
   * A 404 on whoami usually means the token is a fine-grained token
   * that doesn't support the whoami endpoint - we verify by attempting
   * a lightweight repos listing instead.
   */
  validateToken(token) {
    if (!token || !token.trim()) return Promise.reject(new Error("No HuggingFace token provided"));
    var cleanToken = token.trim();
    var authHeaders = { Authorization: "Bearer " + cleanToken };

    /* credentials: "omit" is critical — prevents browser cookies from leaking
     * the user's logged-in HF session. Without this, validation always returns
     * the cookie-authenticated user instead of validating the actual token. */
    return fetch(WSP_HF_API + "/whoami-v2", {
      headers: authHeaders,
      credentials: "omit"
    }).then(function (resp) {
      if (resp.ok) return resp.json();
      if (resp.status === 401) throw new Error("Invalid HuggingFace token - check your token at huggingface.co/settings/tokens");
      /* whoami-v2 failed (404 etc), try legacy /whoami */
      return fetch(WSP_HF_API + "/whoami", {
        headers: authHeaders,
        credentials: "omit"
      });
    }).then(function (resp) {
      /* If we already got a JSON object from whoami-v2, pass through */
      if (resp && typeof resp === "object" && !(resp instanceof Response)) return resp;
      if (resp.ok) return resp.json();
      if (resp.status === 401) throw new Error("Invalid HuggingFace token - check your token at huggingface.co/settings/tokens");
      /* Both whoami endpoints failed (404/403) - try listing repos as a final check */
      return fetch(WSP_HF_API + "/datasets?author=me&limit=1", {
        headers: authHeaders,
        credentials: "omit"
      });
    }).then(function (resp) {
      if (resp && typeof resp === "object" && !(resp instanceof Response)) return resp;
      if (resp.ok) {
        console.info("[WSP] HF token validated via datasets listing");
        return { name: "verified-user" };
      }
      if (resp.status === 401) throw new Error("Invalid HuggingFace token - check your token at huggingface.co/settings/tokens");
      console.warn("[WSP] HF API returned " + resp.status + " on all endpoints - proceeding with token");
      return { name: "unknown" };
    });
  },

  /**
   * Create a new HF dataset repo.
   */
  createRepo(token, repoId, isPrivate) {
    return fetch(WSP_HF_API + "/repos/create", {
      method: "POST",
      credentials: "omit",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: repoId.indexOf("/") !== -1 ? repoId.split("/")[1] : repoId,
        type: "dataset",
        private: !!isPrivate,
      }),
    }).then(function (resp) {
      if (resp.status === 409) {
        return { exists: true, repoId: repoId };
      }
      if (!resp.ok) {
        return resp.text().then(function (err) {
          throw new Error("Failed to create repo: " + err);
        });
      }
      return resp.json();
    });
  },

  /**
   * Upload a single file using the HF Hub upload API.
   */
  uploadFile(token, repoId, filePath, content, commitMsg) {
    var url = WSP_HF_API + "/datasets/" + repoId + "/upload/main";

    var formData = new FormData();
    var blob = typeof content === "string"
      ? new Blob([content], { type: "text/plain" })
      : content;

    formData.append("file", blob, filePath);
    formData.append("path_in_repo", filePath);
    if (commitMsg) {
      formData.append("commit_message", commitMsg);
    }

    return fetch(url, {
      method: "POST",
      credentials: "omit",
      headers: {
        Authorization: "Bearer " + token,
      },
      body: formData,
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (errText) {
          throw new Error("Upload failed for " + filePath + " (" + resp.status + "): " + errText);
        });
      }

      return resp.json().catch(function () {
        return { success: true };
      });
    });
  },

  /**
   * Commit multiple files to a HF dataset repo using the commit API.
   */
  commitFiles(token, repoId, files, commitMessage) {
    commitMessage = commitMessage || "Update dataset";
    var self = this;
    var url = WSP_HF_API + "/datasets/" + repoId + "/commit/main";

    var formData = new FormData();

    // Commit header
    var header = JSON.stringify({ summary: commitMessage });
    formData.append("header", new Blob([header], { type: "application/json" }));

    // Each file: an operation descriptor + the file content
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var opDescriptor = JSON.stringify({
        key: "file",
        value: { path: file.path },
      });
      formData.append("operations", new Blob([opDescriptor], { type: "application/json" }));

      var fileBlob = typeof file.content === "string"
        ? new Blob([file.content], { type: "text/plain" })
        : file.content;
      formData.append("files", fileBlob, file.path);
    }

    return fetch(url, {
      method: "POST",
      credentials: "omit",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    }).then(function (resp) {
      if (resp.ok) {
        return resp.json().catch(function () { return { success: true }; });
      }

      // If commit API fails, fall back to uploading files one at a time
      console.warn("[WSP] Commit API failed (" + resp.status + "), falling back to individual uploads");
      var errors = [];

      function uploadSequentially(idx) {
        if (idx >= files.length) {
          if (errors.length === files.length) {
            // All uploads failed — try the last resort: JSON API
            console.warn("[WSP] All uploads failed, trying JSON content API...");
            return self._uploadViaContentAPI(token, repoId, files, commitMessage);
          }
          if (errors.length > 0) {
            console.warn("[WSP] " + errors.length + "/" + files.length + " files failed:", errors);
          }
          return { success: true, errors: errors };
        }

        return self.uploadFile(token, repoId, files[idx].path, files[idx].content, commitMessage)
          .catch(function (e) {
            console.error("[WSP] Individual upload failed for " + files[idx].path + ":", e);
            errors.push({ path: files[idx].path, error: e.message });
          })
          .then(function () {
            return uploadSequentially(idx + 1);
          });
      }

      return uploadSequentially(0);
    });
  },

  /**
   * Last-resort upload method: uses the HF content creation API.
   */
  _uploadViaContentAPI(token, repoId, files, commitMessage) {
    var self = this;

    function uploadOneByOne(idx) {
      if (idx >= files.length) return Promise.resolve();

      var file = files[idx];
      var contentPromise = typeof file.content === "string"
        ? Promise.resolve(file.content)
        : self._blobToText(file.content);

      return contentPromise.then(function (content) {
        var url = WSP_HF_API + "/datasets/" + repoId + "/commit/main";

        var body = {
          summary: commitMessage,
          operations: [{
            type: "create",
            path: file.path,
            content: content,
            encoding: "utf-8",
          }],
        };

        return fetch(url, {
          method: "POST",
          credentials: "omit",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      }).then(function (resp) {
        if (!resp.ok) {
          return resp.text().then(function (errText) {
            throw new Error("Content API upload failed for " + file.path + ": " + errText);
          });
        }
      }).then(function () {
        return uploadOneByOne(idx + 1);
      });
    }

    return uploadOneByOne(0);
  },

  /**
   * Upload with retry logic (exponential backoff).
   */
  commitFilesWithRetry(token, repoId, files, commitMessage, maxRetries) {
    maxRetries = maxRetries || 3;
    var self = this;
    var lastError;

    function attempt(n) {
      return self.commitFiles(token, repoId, files, commitMessage).catch(function (e) {
        lastError = e;
        if (n < maxRetries) {
          var delay = Math.pow(2, n) * 1000;
          console.warn("[WSP] Upload attempt " + (n + 1) + " failed, retrying in " + delay + "ms...");
          return new Promise(function (r) { setTimeout(r, delay); }).then(function () {
            return attempt(n + 1);
          });
        }
        throw lastError;
      });
    }

    return attempt(0);
  },

  /**
   * Helper: convert Blob to text.
   */
  _blobToText(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsText(blob);
    });
  },

  /**
   * Check what files already exist in a repo (for incremental uploads).
   */
  listRepoFiles(token, repoId) {
    return fetch(WSP_HF_API + "/datasets/" + repoId, {
      headers: { Authorization: "Bearer " + token },
      credentials: "omit"
    }).then(function (resp) {
      if (!resp.ok) return [];
      return resp.json().then(function (data) {
        return (data.siblings || []).map(function (s) { return s.rfilename; });
      });
    }).catch(function () {
      return [];
    });
  },

  /**
   * Generate a comprehensive README.md for the dataset.
   */
  generateReadme(config, citations, stats) {
    var repoName = config.hfRepoId ? config.hfRepoId.split("/").pop() : "web-scraped-dataset";
    var now = new Date();
    var totalRecords = stats.totalRecords || 0;
    var totalWords = stats.words || 0;

    var sourceLicenses = new Set();
    var sourceAuthors = new Set();
    var sourceDomains = new Set();
    for (var i = 0; i < citations.length; i++) {
      var c = citations[i];
      if (c.license) sourceLicenses.add(c.license);
      if (c.author && c.author !== "Unknown") sourceAuthors.add(c.author);
      try { sourceDomains.add(new URL(c.url).hostname); } catch (e) { /* skip */ }
    }

    var langs = ["en"];

    var collectionDate = (typeof WSP_Utils !== "undefined") ? WSP_Utils.formatMLADate(now) : now.toISOString();

    var domainsStr = sourceDomains.size > 0
      ? Array.from(sourceDomains).map(function (d) { return "- " + d; }).join("\n")
      : "No domains recorded yet.";

    var citationsStr = (citations.length > 0 && typeof WSP_Citation !== "undefined")
      ? WSP_Citation.generateReadmeCitations(citations)
      : "## Sources\n\nNo citations recorded yet.";

    var licensesStr = sourceLicenses.size > 0
      ? "Known source licenses:\n" + Array.from(sourceLicenses).map(function (l) { return "- " + l; }).join("\n")
      : "Source licenses should be verified individually at the original URLs.";

    var sizeCategory = this._sizeCategory(totalRecords);

    var md = "---\n"
      + "license: other\n"
      + "task_categories:\n"
      + "  - text-generation\n"
      + "  - text-classification\n"
      + "  - image-classification\n"
      + "  - question-answering\n"
      + "  - summarization\n"
      + "  - feature-extraction\n"
      + "language:\n"
      + langs.map(function (l) { return "  - " + l; }).join("\n") + "\n"
      + "tags:\n"
      + "  - web-scraping\n"
      + "  - dataset\n"
      + "  - webscraper-pro\n"
      + "  - curated\n"
      + "  - citations\n"
      + "pretty_name: " + repoName + "\n"
      + "size_categories:\n"
      + "  - " + sizeCategory + "\n"
      + "---\n\n"
      + "# " + repoName + "\n\n"
      + "> Collected with [WebScraper Pro](https://github.com/minerofthesoal/Scraper) v0.6.6\n\n"
      + "## Dataset Description\n\n"
      + "This dataset was collected using [WebScraper Pro](https://github.com/minerofthesoal/Scraper), an open-source Firefox extension and CLI tool for structured web data collection with automatic scroll-first pagination, MLA/APA citations, and HuggingFace integration.\n\n"
      + "### Dataset Summary\n\n"
      + "| Metric | Value |\n"
      + "|--------|-------|\n"
      + "| **Total Records** | " + totalRecords + " |\n"
      + "| **Total Words** | " + totalWords + " |\n"
      + "| **Images** | " + (stats.images || 0) + " |\n"
      + "| **Links** | " + (stats.links || 0) + " |\n"
      + "| **Audio Files** | " + (stats.audio || 0) + " |\n"
      + "| **Pages Scraped** | " + (stats.pages || 0) + " |\n"
      + "| **Unique Sources** | " + citations.length + " |\n"
      + "| **Unique Domains** | " + sourceDomains.size + " |\n"
      + "| **Unique Authors** | " + sourceAuthors.size + " |\n"
      + "| **Collection Date** | " + collectionDate + " |\n"
      + "| **Last Updated** | " + now.toISOString() + " |\n\n"
      + "### Intended Uses\n\n"
      + "- **Text Generation** — Training or fine-tuning language models on web content\n"
      + "- **Text Classification** — Categorizing web content by topic, sentiment, or type\n"
      + "- **Summarization** — Generating summaries from scraped articles\n"
      + "- **Question Answering** — Building QA datasets from structured web content\n"
      + "- **Image Classification** — Training image models on web-sourced images\n"
      + "- **Link Analysis** — Web graph construction and analysis\n"
      + "- **Audio Transcription** — Processing audio files (converted to .wav)\n"
      + "- **Citation Analysis** — Studying citation patterns and web attribution\n"
      + "- **Information Retrieval** — Building search indices from web content\n"
      + "- **Dataset Curation** — As a base for creating refined, domain-specific datasets\n\n"
      + "### Out-of-Scope Uses\n\n"
      + "- This dataset should NOT be used to train models for generating deceptive content\n"
      + "- Content should not be re-published without proper attribution\n"
      + "- Individual source licenses may restrict certain commercial uses\n\n"
      + "### Data Format\n\n"
      + "| File | Format | Description |\n"
      + "|------|--------|-------------|\n"
      + "| `data/text_data.jsonl` | JSONL | Scraped text content with full metadata and citations |\n"
      + "| `data/images.jsonl` | JSONL | Image references with alt text and dimensions |\n"
      + "| `data/links.jsonl` | JSONL | Extracted hyperlinks with anchor text |\n"
      + "| `data/audio.jsonl` | JSONL | Audio/video file references |\n"
      + "| `data/citations.jsonl` | JSONL | MLA + APA citation records per source |\n\n"
      + "### Data Fields\n\n"
      + "Each JSONL text record contains:\n\n"
      + "```json\n"
      + "{\n"
      + '  "id": "unique-record-id",\n'
      + '  "type": "text",\n'
      + '  "text": "scraped text content",\n'
      + '  "tag": "html-element-tag",\n'
      + '  "source_url": "https://example.com/page",\n'
      + '  "source_title": "Page Title",\n'
      + '  "author": "Original Author",\n'
      + '  "site_name": "example.com",\n'
      + '  "scraped_at": "2024-01-01T12:00:00Z",\n'
      + '  "citation_mla": "MLA 9th edition formatted citation",\n'
      + '  "citation_apa": "APA 7th edition formatted citation"\n'
      + "}\n"
      + "```\n\n"
      + "## Data Collection\n\n"
      + "Data was collected using WebScraper Pro's scroll-first auto-scan approach:\n"
      + "1. The scraper first scrolls down each page to determine its full length and trigger lazy-loaded content\n"
      + "2. It then scrolls back up and scrapes viewport by viewport, deduplicating across viewports\n"
      + "3. After fully scraping the current page, it looks for \"Next\" buttons or pagination links\n"
      + "4. All sources are automatically cited in both MLA 9th and APA 7th edition formats\n\n"
      + "### Collection Configuration\n\n"
      + "- **Scroll-First Mode:** Enabled (checks page length before scraping)\n"
      + "- **Auto-scroll:** " + (config.autoScroll !== false ? "Enabled" : "Disabled") + "\n"
      + "- **Auto-next page:** " + (config.autoNext !== false ? "Enabled" : "Disabled") + "\n"
      + "- **Robots.txt:** Respected\n"
      + "- **Export Format:** " + (config.dataFormat || "JSONL") + "\n"
      + "- **Citation Format:** MLA 9th + APA 7th\n\n"
      + "## Source Domains\n\n"
      + domainsStr + "\n\n"
      + citationsStr + "\n\n"
      + "## Licensing\n\n"
      + "### Uni-S License v2.0 (Universal Scraping License)\n\n"
      + "This dataset and the tool that collected it are governed by the **[Uni-S License v2.0](https://github.com/minerofthesoal/Scraper/blob/main/LICENSE)**.\n\n"
      + "**Key points:**\n\n"
      + "1. **We do NOT own any of this data.** All rights to scraped content belong to the original authors, creators, publishers, and rights holders.\n"
      + "2. **The Software (WebScraper Pro) is open source.** Standalone scraper forks must stay open source. Library use in other projects is unrestricted.\n"
      + "3. **Compatible with MIT, Apache 2.0, BSD, ISC, and MPL 2.0** — other projects can freely use this code.\n"
      + "4. **Users are solely responsible** for ensuring they have the legal right to scrape, store, and redistribute any content they collect.\n"
      + "5. **Citations are provided to assist attribution**, not to grant permission to use content.\n\n"
      + "### Source Content Licenses\n\n"
      + "Individual content items retain their original licensing from their respective sources. Users of this dataset MUST verify and comply with the licensing terms of each individual source before use.\n\n"
      + "**The dataset maintainer (minerofthesoal / ray0rf1re) explicitly does NOT claim ownership of any scraped content. All rights remain with original creators.**\n\n"
      + licensesStr + "\n\n"
      + "### Attribution Requirements\n\n"
      + "- All original authors and sources are cited in both MLA 9th and APA 7th edition formats\n"
      + "- When using content from this dataset, you MUST cite the original source\n"
      + "- Citation data is available in `data/citations.jsonl`\n"
      + "- Any rights holder may request removal of their content by opening an issue at [github.com/minerofthesoal/Scraper](https://github.com/minerofthesoal/Scraper/issues)\n\n"
      + "## Ethical Considerations\n\n"
      + "- All data was collected from publicly accessible web pages\n"
      + "- Original authors and sources are cited using MLA 9th and APA 7th edition formats\n"
      + "- This dataset respects `robots.txt` directives\n"
      + "- No paywalled or login-required content was collected\n"
      + "- Users of this dataset should verify licensing of individual sources\n"
      + "- Personal information should be handled in accordance with applicable privacy laws\n\n"
      + "## Additional Information\n\n"
      + "### Collection Tool\n\n"
      + "- **Tool:** [WebScraper Pro](https://github.com/minerofthesoal/Scraper) v0.6.6\n"
      + "- **Type:** Firefox Extension + Python CLI + GUI\n"
      + "- **Features:** Area selection, scroll-first auto-scan, MLA/APA citations, HuggingFace upload\n"
      + "- **Owner Dataset:** [ray0rf1re/Site.scraped](https://huggingface.co/datasets/ray0rf1re/Site.scraped)\n\n"
      + "### Contact\n\n"
      + "For questions about this dataset, please open an issue at [github.com/minerofthesoal/Scraper](https://github.com/minerofthesoal/Scraper/issues).\n\n"
      + "---\n\n"
      + "*Generated by [WebScraper Pro](https://github.com/minerofthesoal/Scraper) v0.6.6*\n";

    return md;
  },

  /**
   * Size category for HF metadata.
   */
  _sizeCategory(n) {
    if (n < 1000) return "n<1K";
    if (n < 10000) return "1K<n<10K";
    if (n < 100000) return "10K<n<100K";
    return "100K<n<1M";
  }
};

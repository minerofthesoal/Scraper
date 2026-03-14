/* ── HuggingFace Upload Module ── */
(function () {
  "use strict";

  const HF_API = "https://huggingface.co/api";

  const WSP_HFUpload = {

    /**
     * Check if a HuggingFace token is valid.
     */
    async validateToken(token) {
      if (!token || !token.trim()) throw new Error("No HuggingFace token provided");
      const cleanToken = token.trim();
      const resp = await fetch(`${HF_API}/whoami`, {
        headers: { Authorization: `Bearer ${cleanToken}` }
      });
      if (resp.status === 401) throw new Error("Invalid HuggingFace token - check your token at huggingface.co/settings/tokens");
      if (!resp.ok) {
        // Non-401 errors (rate limit, server error) - don't invalidate the token
        console.warn(`[WSP] HF API returned ${resp.status} - proceeding anyway`);
        return { name: "unknown" };
      }
      return resp.json();
    },

    /**
     * Create a new HF dataset repo.
     */
    async createRepo(token, repoId, isPrivate = false) {
      const resp = await fetch(`${HF_API}/repos/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: repoId.includes("/") ? repoId.split("/")[1] : repoId,
          type: "dataset",
          private: isPrivate,
        }),
      });

      if (resp.status === 409) {
        // Repo already exists — that's fine
        return { exists: true, repoId };
      }
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Failed to create repo: ${err}`);
      }
      return resp.json();
    },

    /**
     * Upload a single file to a HF dataset repo.
     */
    async uploadFile(token, repoId, filePath, content, commitMsg) {
      const url = `${HF_API}/datasets/${repoId}/upload/main/${filePath}`;
      const blob = typeof content === "string" ? new Blob([content], { type: "application/octet-stream" }) : content;

      const resp = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: blob,
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Upload failed for ${filePath}: ${err}`);
      }
      return resp.json();
    },

    /**
     * Commit multiple files to a HF dataset repo using the commit API.
     */
    async commitFiles(token, repoId, files, commitMessage = "Update dataset") {
      // Use the new commit API
      const operations = files.map((f) => ({
        key: "file",
        value: {
          content: f.content,
          path: f.path,
          encoding: f.encoding || "utf-8",
        }
      }));

      // For the commit API, we use a multipart form
      const formData = new FormData();

      // Header with commit info
      const header = JSON.stringify({
        summary: commitMessage,
        parentCommit: undefined,
      });
      formData.append("header", new Blob([header], { type: "application/json" }));

      // Add each file operation
      for (const file of files) {
        const opHeader = JSON.stringify({
          key: "file",
          value: { path: file.path }
        });
        formData.append("operations", new Blob([opHeader], { type: "application/json" }));
        const fileContent = typeof file.content === "string"
          ? new Blob([file.content], { type: "application/octet-stream" })
          : file.content;
        formData.append("files", fileContent);
      }

      const resp = await fetch(
        `${HF_API}/datasets/${repoId}/commit/main`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!resp.ok) {
        // Fall back to individual uploads
        for (const file of files) {
          await this.uploadFile(token, repoId, file.path, file.content, commitMessage);
        }
      }

      return { success: true };
    },

    /**
     * Generate a comprehensive README.md for the dataset.
     */
    generateReadme(config, citations, stats) {
      const repoName = config.hfRepoId ? config.hfRepoId.split("/").pop() : "web-scraped-dataset";
      const now = new Date();
      const totalRecords = stats.totalRecords || 0;
      const totalWords = stats.words || 0;

      // Collect unique licenses from citations
      const sourceLicenses = new Set();
      const sourceAuthors = new Set();
      const sourceDomains = new Set();
      for (const c of citations) {
        if (c.license) sourceLicenses.add(c.license);
        if (c.author && c.author !== "Unknown") sourceAuthors.add(c.author);
        try { sourceDomains.add(new URL(c.url).hostname); } catch { /* skip */ }
      }

      // Language detection from content
      const langs = new Set(["en"]);

      let md = `---
license: cc-by-4.0
task_categories:
  - text-generation
  - text-classification
  - image-classification
  - question-answering
  - summarization
  - feature-extraction
language:
${Array.from(langs).map(l => `  - ${l}`).join("\n")}
tags:
  - web-scraping
  - dataset
  - webscraper-pro
  - curated
  - citations
pretty_name: ${repoName}
size_categories:
  - ${this._sizeCategory(totalRecords)}
---

# ${repoName}

> Collected with [WebScraper Pro](https://github.com/minerofthesoal/Scraper) v0.5b

## Dataset Description

This dataset was collected using [WebScraper Pro](https://github.com/minerofthesoal/Scraper), an open-source Firefox extension and CLI tool for structured web data collection with automatic scroll-first pagination, MLA/APA citations, and HuggingFace integration.

### Dataset Summary

| Metric | Value |
|--------|-------|
| **Total Records** | ${totalRecords} |
| **Total Words** | ${totalWords} |
| **Images** | ${stats.images || 0} |
| **Links** | ${stats.links || 0} |
| **Audio Files** | ${stats.audio || 0} |
| **Pages Scraped** | ${stats.pages || 0} |
| **Unique Sources** | ${citations.length} |
| **Unique Domains** | ${sourceDomains.size} |
| **Unique Authors** | ${sourceAuthors.size} |
| **Collection Date** | ${WSP_Utils ? WSP_Utils.formatMLADate(now) : now.toISOString()} |
| **Last Updated** | ${now.toISOString()} |

### Intended Uses

This dataset can be used for:

- **Text Generation** - Training or fine-tuning language models on web content
- **Text Classification** - Categorizing web content by topic, sentiment, or type
- **Summarization** - Generating summaries from scraped articles
- **Question Answering** - Building QA datasets from structured web content
- **Image Classification** - Training image models on web-sourced images
- **Link Analysis** - Web graph construction and analysis
- **Audio Transcription** - Processing audio files (converted to .wav)
- **Citation Analysis** - Studying citation patterns and web attribution
- **Information Retrieval** - Building search indices from web content
- **Dataset Curation** - As a base for creating refined, domain-specific datasets

### Out-of-Scope Uses

- This dataset should NOT be used to train models for generating deceptive content
- Content should not be re-published without proper attribution
- Individual source licenses may restrict certain commercial uses

### Data Format

| File | Format | Description |
|------|--------|-------------|
| \`data/text_data.jsonl\` | JSONL | Scraped text content with full metadata and citations |
| \`data/images.jsonl\` | JSONL | Image references with alt text and dimensions |
| \`data/links.jsonl\` | JSONL | Extracted hyperlinks with anchor text |
| \`data/audio.jsonl\` | JSONL | Audio/video file references |
| \`data/citations.jsonl\` | JSONL | MLA + APA citation records per source |

### Data Fields

Each JSONL text record contains:

\`\`\`json
{
  "id": "unique-record-id",
  "type": "text",
  "text": "scraped text content",
  "tag": "html-element-tag",
  "source_url": "https://example.com/page",
  "source_title": "Page Title",
  "author": "Original Author",
  "site_name": "example.com",
  "scraped_at": "2024-01-01T12:00:00Z",
  "citation_mla": "MLA 9th edition formatted citation",
  "citation_apa": "APA 7th edition formatted citation"
}
\`\`\`

## Data Collection

Data was collected using WebScraper Pro's scroll-first auto-scan approach:
1. The scraper first scrolls down each page to determine its full length and trigger lazy-loaded content
2. It then scrolls back up and scrapes viewport by viewport, deduplicating across viewports
3. After fully scraping the current page, it looks for "Next" buttons or pagination links
4. All sources are automatically cited in both MLA 9th and APA 7th edition formats

### Collection Configuration

- **Scroll-First Mode:** Enabled (checks page length before scraping)
- **Auto-scroll:** ${config.autoScroll !== false ? "Enabled" : "Disabled"}
- **Auto-next page:** ${config.autoNext !== false ? "Enabled" : "Disabled"}
- **Robots.txt:** Respected
- **Export Format:** ${config.dataFormat || "JSONL"}
- **Citation Format:** MLA 9th + APA 7th

## Source Domains

${sourceDomains.size > 0 ? Array.from(sourceDomains).map(d => `- ${d}`).join("\n") : "No domains recorded yet."}

${citations.length > 0 ? WSP_Citation.generateReadmeCitations(citations) : "## Sources\\n\\nNo citations recorded yet."}

## Licensing

### Dataset License

This dataset compilation is released under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).

### Source Content Licenses

Individual content items retain their original licensing from their respective sources. Users of this dataset must verify and comply with the licensing terms of each individual source.

${sourceLicenses.size > 0 ? "Known source licenses:\n" + Array.from(sourceLicenses).map(l => `- ${l}`).join("\n") : "Source licenses should be verified individually at the original URLs."}

### Attribution Requirements

- All original authors and sources are cited in both MLA 9th and APA 7th edition formats
- When using content from this dataset, please cite the original source
- Citation data is available in \`data/citations.jsonl\`

## Ethical Considerations

- All data was collected from publicly accessible web pages
- Original authors and sources are cited using MLA 9th and APA 7th edition formats
- This dataset respects \`robots.txt\` directives
- No paywalled or login-required content was collected
- Users of this dataset should verify licensing of individual sources
- Personal information should be handled in accordance with applicable privacy laws

## Additional Information

### Collection Tool

- **Tool:** [WebScraper Pro](https://github.com/minerofthesoal/Scraper) v0.5b
- **Type:** Firefox Extension + Python CLI + GUI
- **Features:** Area selection, scroll-first auto-scan, MLA/APA citations, HuggingFace upload
- **Owner Dataset:** [ray0rf1re/Site.scraped](https://huggingface.co/datasets/ray0rf1re/Site.scraped)

### Contact

For questions about this dataset, please open an issue at [github.com/minerofthesoal/Scraper](https://github.com/minerofthesoal/Scraper/issues).

---

*Generated by [WebScraper Pro](https://github.com/minerofthesoal/Scraper) v0.5b*
`;

      return md;
    },

    /**
     * Size category for HF metadata.
     */
    _sizeCategory(n) {
      if (n < 100) return "n<1K";
      if (n < 1000) return "n<1K";
      if (n < 10000) return "1K<n<10K";
      if (n < 100000) return "10K<n<100K";
      return "100K<n<1M";
    }
  };

  if (typeof window !== "undefined") window.WSP_HFUpload = WSP_HFUpload;
  if (typeof globalThis !== "undefined") globalThis.WSP_HFUpload = WSP_HFUpload;
})();

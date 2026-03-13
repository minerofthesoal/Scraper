/* ── HuggingFace Upload Module ── */
(function () {
  "use strict";

  const HF_API = "https://huggingface.co/api";

  const WSP_HFUpload = {

    /**
     * Check if a HuggingFace token is valid.
     */
    async validateToken(token) {
      const resp = await fetch(`${HF_API}/whoami`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error("Invalid HuggingFace token");
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

      let md = `---
license: cc-by-4.0
task_categories:
  - text-generation
  - image-classification
language:
  - en
tags:
  - web-scraping
  - dataset
  - webscraper-pro
pretty_name: ${repoName}
size_categories:
  - ${this._sizeCategory(stats.totalRecords || 0)}
---

# ${repoName}

## Dataset Description

This dataset was collected using [WebScraper Pro](https://github.com/minerofthesoal/Scraper), an open-source Firefox extension for structured web data collection with automatic pagination support.

### Dataset Summary

- **Total Records:** ${stats.totalRecords || 0}
- **Text Entries:** ${stats.texts || 0}
- **Images:** ${stats.images || 0}
- **Links:** ${stats.links || 0}
- **Audio Files:** ${stats.audio || 0}
- **Pages Scraped:** ${stats.pages || 0}
- **Collection Date:** ${WSP_Utils ? WSP_Utils.formatMLADate(now) : now.toISOString()}
- **Last Updated:** ${now.toISOString()}

### Supported Tasks

- Text generation and analysis
- Image classification and captioning
- Link analysis and web graph construction
- Audio transcription (files converted to .wav)

### Data Format

| File | Format | Description |
|------|--------|-------------|
| \`data/text_data.jsonl\` | JSONL | Scraped text content with metadata |
| \`data/images/\` | PNG/WebP/JPG | Collected images |
| \`data/audio/\` | WAV | Audio files (converted to .wav) |
| \`data/links.jsonl\` | JSONL | Extracted hyperlinks |
| \`data/citations.jsonl\` | JSONL | MLA citation records |

### Data Fields

Each JSONL record contains:

\`\`\`json
{
  "id": "unique-record-id",
  "text": "scraped text content",
  "tag": "html-element-tag",
  "source_url": "https://example.com/page",
  "source_title": "Page Title",
  "author": "Original Author",
  "scraped_at": "2024-01-01T00:00:00Z",
  "citation_mla": "MLA formatted citation"
}
\`\`\`

## Data Collection

Data was collected automatically using WebScraper Pro's area selection and auto-pagination features. All sources are cited below in MLA 9th edition format.

### Collection Configuration

- **Auto-scroll:** ${config.autoScroll !== false ? "Enabled" : "Disabled"}
- **Auto-next page:** ${config.autoNext !== false ? "Enabled" : "Disabled"}
- **Export Format:** ${config.dataFormat || "JSONL"}

${citations.length > 0 ? WSP_Citation.generateReadmeCitations(citations) : "## Sources\\n\\nNo citations recorded yet."}

## Ethical Considerations

- All data was collected from publicly accessible web pages.
- Original authors and sources are cited using MLA 9th edition format.
- This dataset respects \`robots.txt\` directives where applicable.
- Users of this dataset should verify licensing of individual sources.

## Licensing

This dataset compilation is released under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
Individual content items retain their original licensing from their respective sources.

---

*Generated by [WebScraper Pro](https://github.com/minerofthesoal/Scraper) v1.0.0*
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

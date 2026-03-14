#!/usr/bin/env python3
"""
WebScraper Pro GUI - Full graphical interface using tkinter.
Launch with: scrape gui.start
"""

import os
import sys
import json
import threading
import webbrowser
from datetime import datetime
from pathlib import Path

try:
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox, scrolledtext
except ImportError:
    print("tkinter not available. Install it:")
    print("  Arch: sudo pacman -S tk")
    print("  Ubuntu: sudo apt install python3-tk")
    print("  Fedora: sudo dnf install python3-tkinter")
    sys.exit(1)

# Import CLI helpers
SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))
from scrape import (
    load_config, save_config, load_records, get_scraped_files,
    log_history, format_bytes, generate_readme_cli, DEFAULT_CONFIG,
    DATA_DIR, VERSION
)


class WebScraperGUI:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(f"WebScraper Pro v{VERSION}")
        self.root.geometry("920x700")
        self.root.minsize(800, 600)
        self.root.configure(bg="#1a1a2e")

        self.cfg = load_config()
        self.style = ttk.Style()
        self._setup_theme()
        self._build_ui()
        self._load_settings()
        self._refresh_stats()

    # ── Theme ──
    def _setup_theme(self):
        self.style.theme_use("clam")
        self.style.configure(".", background="#1a1a2e", foreground="#e0e0e0",
                             fieldbackground="#2d3748", font=("Segoe UI", 10))
        self.style.configure("TNotebook", background="#1a1a2e")
        self.style.configure("TNotebook.Tab", background="#2d3748", foreground="#e0e0e0",
                             padding=[12, 4], font=("Segoe UI", 10, "bold"))
        self.style.map("TNotebook.Tab", background=[("selected", "#7c83ff")],
                       foreground=[("selected", "#ffffff")])
        self.style.configure("TFrame", background="#1a1a2e")
        self.style.configure("TLabel", background="#1a1a2e", foreground="#e0e0e0")
        self.style.configure("TButton", background="#7c83ff", foreground="#ffffff",
                             padding=[10, 5], font=("Segoe UI", 10))
        self.style.map("TButton", background=[("active", "#6a71e0")])
        self.style.configure("Danger.TButton", background="#e74c3c")
        self.style.map("Danger.TButton", background=[("active", "#c0392b")])
        self.style.configure("Success.TButton", background="#27ae60")
        self.style.map("Success.TButton", background=[("active", "#219a52")])
        self.style.configure("Accent.TButton", background="#e67e22")
        self.style.map("Accent.TButton", background=[("active", "#d35400")])
        self.style.configure("TCheckbutton", background="#1a1a2e", foreground="#e0e0e0")
        self.style.configure("TEntry", fieldbackground="#2d3748", foreground="#e0e0e0")
        self.style.configure("Header.TLabel", font=("Segoe UI", 18, "bold"), foreground="#7c83ff")
        self.style.configure("Sub.TLabel", font=("Segoe UI", 9), foreground="#888888")
        self.style.configure("Stat.TLabel", font=("Segoe UI", 22, "bold"), foreground="#7c83ff")
        self.style.configure("TLabelframe", background="#1a1a2e", foreground="#7c83ff")
        self.style.configure("TLabelframe.Label", background="#1a1a2e", foreground="#7c83ff",
                             font=("Segoe UI", 10, "bold"))

    # ── Build UI ──
    def _build_ui(self):
        # Header
        header = ttk.Frame(self.root)
        header.pack(fill="x", padx=16, pady=(12, 4))
        ttk.Label(header, text="WebScraper Pro", style="Header.TLabel").pack(side="left")
        ttk.Label(header, text=f"v{VERSION}", style="Sub.TLabel").pack(side="left", padx=(8, 0), pady=(8, 0))

        self.status_var = tk.StringVar(value="Idle")
        self.status_label = ttk.Label(header, textvariable=self.status_var,
                                      font=("Segoe UI", 10, "bold"), foreground="#888")
        self.status_label.pack(side="right")

        # Notebook (tabs)
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill="both", expand=True, padx=12, pady=8)

        self._build_dashboard_tab()
        self._build_scraping_tab()
        self._build_hf_tab()
        self._build_local_tab()
        self._build_citations_tab()
        self._build_tools_tab()
        self._build_log_tab()

    # ── Dashboard Tab ──
    def _build_dashboard_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="  Dashboard  ")

        # Stats grid
        stats_frame = ttk.LabelFrame(tab, text="Session Statistics")
        stats_frame.pack(fill="x", padx=12, pady=8)

        self.stat_vars = {}
        stat_names = [("Total Records", "total"), ("Pages", "pages"), ("Texts", "texts"),
                      ("Images", "images"), ("Links", "links"), ("Audio", "audio"),
                      ("Files", "files"), ("Size", "size")]

        for i, (label, key) in enumerate(stat_names):
            col = i % 4
            row = i // 4
            frame = ttk.Frame(stats_frame)
            frame.grid(row=row, column=col, padx=16, pady=8, sticky="nsew")
            stats_frame.columnconfigure(col, weight=1)

            var = tk.StringVar(value="0")
            self.stat_vars[key] = var
            ttk.Label(frame, textvariable=var, style="Stat.TLabel").pack()
            ttk.Label(frame, text=label, style="Sub.TLabel").pack()

        # Quick actions
        actions = ttk.LabelFrame(tab, text="Quick Actions")
        actions.pack(fill="x", padx=12, pady=8)

        btn_frame = ttk.Frame(actions)
        btn_frame.pack(fill="x", padx=8, pady=8)

        ttk.Button(btn_frame, text="Start Session", command=self._start_session).pack(side="left", padx=4)
        ttk.Button(btn_frame, text="Stop Session", command=self._stop_session,
                   style="Danger.TButton").pack(side="left", padx=4)
        ttk.Button(btn_frame, text="Export Data", command=self._export_data,
                   style="Accent.TButton").pack(side="left", padx=4)
        ttk.Button(btn_frame, text="Upload to HF", command=self._upload_hf,
                   style="Success.TButton").pack(side="left", padx=4)
        ttk.Button(btn_frame, text="Refresh", command=self._refresh_stats).pack(side="left", padx=4)
        ttk.Button(btn_frame, text="Open Data Dir", command=self._open_data_dir).pack(side="right", padx=4)

        # Recent history
        hist_frame = ttk.LabelFrame(tab, text="Recent Activity")
        hist_frame.pack(fill="both", expand=True, padx=12, pady=8)

        cols = ("time", "action", "details")
        self.hist_tree = ttk.Treeview(hist_frame, columns=cols, show="headings", height=8)
        self.hist_tree.heading("time", text="Time")
        self.hist_tree.heading("action", text="Action")
        self.hist_tree.heading("details", text="Details")
        self.hist_tree.column("time", width=150)
        self.hist_tree.column("action", width=120)
        self.hist_tree.column("details", width=400)
        self.hist_tree.pack(fill="both", expand=True, padx=4, pady=4)

    # ── Scraping Tab ──
    def _build_scraping_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="  Scraping  ")

        frame = ttk.LabelFrame(tab, text="Scraping Configuration")
        frame.pack(fill="x", padx=12, pady=8)

        self.auto_start_var = tk.BooleanVar()
        self.auto_scroll_var = tk.BooleanVar(value=True)
        self.auto_next_var = tk.BooleanVar(value=True)

        ttk.Checkbutton(frame, text="Auto-start scraping on new pages",
                        variable=self.auto_start_var).pack(anchor="w", padx=12, pady=2)
        ttk.Checkbutton(frame, text="Auto-scroll for infinite-scroll pages",
                        variable=self.auto_scroll_var).pack(anchor="w", padx=12, pady=2)
        ttk.Checkbutton(frame, text="Auto-detect and click Next buttons",
                        variable=self.auto_next_var).pack(anchor="w", padx=12, pady=2)

        row_frame = ttk.Frame(frame)
        row_frame.pack(fill="x", padx=12, pady=4)
        ttk.Label(row_frame, text="Delay between pages (ms):").pack(side="left")
        self.delay_var = tk.StringVar(value="1500")
        ttk.Entry(row_frame, textvariable=self.delay_var, width=8).pack(side="left", padx=8)

        row_frame2 = ttk.Frame(frame)
        row_frame2.pack(fill="x", padx=12, pady=4)
        ttk.Label(row_frame2, text="Max pages per session:").pack(side="left")
        self.max_pages_var = tk.StringVar(value="200")
        ttk.Entry(row_frame2, textvariable=self.max_pages_var, width=8).pack(side="left", padx=8)

        row_frame3 = ttk.Frame(frame)
        row_frame3.pack(fill="x", padx=12, pady=4)
        ttk.Label(row_frame3, text="Data format:").pack(side="left")
        self.format_var = tk.StringVar(value="jsonl")
        fmt_combo = ttk.Combobox(row_frame3, textvariable=self.format_var,
                                 values=["jsonl", "json", "csv"], state="readonly", width=10)
        fmt_combo.pack(side="left", padx=8)

        # URL scraping
        url_frame = ttk.LabelFrame(tab, text="Scrape URL (CLI)")
        url_frame.pack(fill="x", padx=12, pady=8)

        row = ttk.Frame(url_frame)
        row.pack(fill="x", padx=12, pady=8)
        ttk.Label(row, text="URL:").pack(side="left")
        self.url_var = tk.StringVar()
        ttk.Entry(row, textvariable=self.url_var, width=50).pack(side="left", padx=8, fill="x", expand=True)
        ttk.Button(row, text="Scrape", command=self._scrape_url).pack(side="right", padx=4)

        # Batch URLs
        batch_frame = ttk.LabelFrame(tab, text="Batch Scrape (one URL per line)")
        batch_frame.pack(fill="both", expand=True, padx=12, pady=8)
        self.batch_text = scrolledtext.ScrolledText(batch_frame, height=6, bg="#2d3748", fg="#e0e0e0",
                                                     insertbackground="#e0e0e0", font=("Consolas", 10))
        self.batch_text.pack(fill="both", expand=True, padx=4, pady=4)
        ttk.Button(batch_frame, text="Scrape All URLs", command=self._scrape_batch,
                   style="Accent.TButton").pack(pady=4)

    # ── HuggingFace Tab ──
    def _build_hf_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="  HuggingFace  ")

        frame = ttk.LabelFrame(tab, text="HuggingFace Configuration")
        frame.pack(fill="x", padx=12, pady=8)

        # Token
        row = ttk.Frame(frame)
        row.pack(fill="x", padx=12, pady=4)
        ttk.Label(row, text="API Token:").pack(side="left")
        self.hf_token_var = tk.StringVar()
        self.hf_token_entry = ttk.Entry(row, textvariable=self.hf_token_var, show="*", width=40)
        self.hf_token_entry.pack(side="left", padx=8)
        ttk.Button(row, text="Validate", command=self._validate_token).pack(side="left", padx=4)
        self.token_status = ttk.Label(row, text="", style="Sub.TLabel")
        self.token_status.pack(side="left", padx=4)

        # Repo
        row2 = ttk.Frame(frame)
        row2.pack(fill="x", padx=12, pady=4)
        ttk.Label(row2, text="Your Repo ID:").pack(side="left")
        self.hf_repo_var = tk.StringVar()
        ttk.Entry(row2, textvariable=self.hf_repo_var, width=40).pack(side="left", padx=8)

        self.hf_create_var = tk.BooleanVar(value=True)
        self.hf_private_var = tk.BooleanVar()
        self.hf_auto_upload_var = tk.BooleanVar()

        ttk.Checkbutton(frame, text="Auto-create repo if it doesn't exist",
                        variable=self.hf_create_var).pack(anchor="w", padx=12, pady=2)
        ttk.Checkbutton(frame, text="Make repo private",
                        variable=self.hf_private_var).pack(anchor="w", padx=12, pady=2)
        ttk.Checkbutton(frame, text="Auto-upload after session ends",
                        variable=self.hf_auto_upload_var).pack(anchor="w", padx=12, pady=2)

        # Owner repo
        owner_frame = ttk.LabelFrame(tab, text="Extension Owner's Repo")
        owner_frame.pack(fill="x", padx=12, pady=8)

        row3 = ttk.Frame(owner_frame)
        row3.pack(fill="x", padx=12, pady=8)
        ttk.Label(row3, text="Owner Repo:").pack(side="left")
        self.owner_repo_var = tk.StringVar(value="ray0rf1re/Site.scraped")
        ttk.Entry(row3, textvariable=self.owner_repo_var, width=40, state="readonly").pack(side="left", padx=8)
        self.upload_owner_var = tk.BooleanVar()
        ttk.Checkbutton(owner_frame, text="Also upload to owner's shared dataset",
                        variable=self.upload_owner_var).pack(anchor="w", padx=12, pady=2)

        # Actions
        btn_frame = ttk.Frame(tab)
        btn_frame.pack(fill="x", padx=12, pady=8)
        ttk.Button(btn_frame, text="Upload to Your Repo", command=self._upload_hf,
                   style="Success.TButton").pack(side="left", padx=4)
        ttk.Button(btn_frame, text="Upload to Owner Repo", command=self._upload_owner,
                   style="Accent.TButton").pack(side="left", padx=4)
        ttk.Button(btn_frame, text="Check Upload Status", command=self._check_upload).pack(side="left", padx=4)
        ttk.Button(btn_frame, text="Generate README", command=self._gen_readme).pack(side="left", padx=4)

    # ── Local Storage Tab ──
    def _build_local_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="  Local Storage  ")

        frame = ttk.LabelFrame(tab, text="Save Settings")
        frame.pack(fill="x", padx=12, pady=8)

        row = ttk.Frame(frame)
        row.pack(fill="x", padx=12, pady=4)
        ttk.Label(row, text="Save path:").pack(side="left")
        self.save_path_var = tk.StringVar()
        ttk.Entry(row, textvariable=self.save_path_var, width=40).pack(side="left", padx=8)
        ttk.Button(row, text="Browse", command=self._browse_path).pack(side="left", padx=4)

        self.save_local_var = tk.BooleanVar(value=True)
        self.download_images_var = tk.BooleanVar()
        self.convert_audio_var = tk.BooleanVar()

        ttk.Checkbutton(frame, text="Save scraped data locally",
                        variable=self.save_local_var).pack(anchor="w", padx=12, pady=2)
        ttk.Checkbutton(frame, text="Download images as PNG files",
                        variable=self.download_images_var).pack(anchor="w", padx=12, pady=2)
        ttk.Checkbutton(frame, text="Convert audio to .wav format",
                        variable=self.convert_audio_var).pack(anchor="w", padx=12, pady=2)

        # Conversion tools
        conv_frame = ttk.LabelFrame(tab, text="Conversion Tools")
        conv_frame.pack(fill="x", padx=12, pady=8)

        btn_row = ttk.Frame(conv_frame)
        btn_row.pack(fill="x", padx=12, pady=8)
        ttk.Button(btn_row, text="Convert Images to PNG", command=lambda: self._convert("images", "png")).pack(side="left", padx=4)
        ttk.Button(btn_row, text="Convert Images to WebP", command=lambda: self._convert("images", "webp")).pack(side="left", padx=4)
        ttk.Button(btn_row, text="Convert Audio to WAV", command=lambda: self._convert("audio", "wav")).pack(side="left", padx=4)

        # File browser
        files_frame = ttk.LabelFrame(tab, text="Scraped Files")
        files_frame.pack(fill="both", expand=True, padx=12, pady=8)

        self.files_tree = ttk.Treeview(files_frame, columns=("path", "size"), show="headings", height=8)
        self.files_tree.heading("path", text="File")
        self.files_tree.heading("size", text="Size")
        self.files_tree.column("path", width=500)
        self.files_tree.column("size", width=100)
        self.files_tree.pack(fill="both", expand=True, padx=4, pady=4)

        ttk.Button(files_frame, text="Refresh Files", command=self._refresh_files).pack(pady=4)

    # ── Citations Tab ──
    def _build_citations_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="  Citations  ")

        frame = ttk.LabelFrame(tab, text="MLA Citation Settings")
        frame.pack(fill="x", padx=12, pady=8)

        self.auto_cite_var = tk.BooleanVar(value=True)
        self.cite_readme_var = tk.BooleanVar(value=True)
        self.cite_links_var = tk.BooleanVar(value=True)

        ttk.Checkbutton(frame, text="Auto-generate MLA citations for all sources",
                        variable=self.auto_cite_var).pack(anchor="w", padx=12, pady=2)
        ttk.Checkbutton(frame, text="Include citations in HF README",
                        variable=self.cite_readme_var).pack(anchor="w", padx=12, pady=2)
        ttk.Checkbutton(frame, text="Cite all original links and creators",
                        variable=self.cite_links_var).pack(anchor="w", padx=12, pady=2)

        # Citations display
        cite_frame = ttk.LabelFrame(tab, text="Generated Citations")
        cite_frame.pack(fill="both", expand=True, padx=12, pady=8)

        self.cite_text = scrolledtext.ScrolledText(cite_frame, height=15, bg="#2d3748", fg="#e0e0e0",
                                                    insertbackground="#e0e0e0", font=("Consolas", 10))
        self.cite_text.pack(fill="both", expand=True, padx=4, pady=4)

        btn_row = ttk.Frame(cite_frame)
        btn_row.pack(fill="x", padx=4, pady=4)
        ttk.Button(btn_row, text="Generate Citations", command=self._generate_citations).pack(side="left", padx=4)
        ttk.Button(btn_row, text="Export to File", command=self._export_citations).pack(side="left", padx=4)
        ttk.Button(btn_row, text="Copy to Clipboard", command=self._copy_citations).pack(side="left", padx=4)

    # ── Tools Tab ──
    def _build_tools_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="  Tools  ")

        # Data tools
        data_frame = ttk.LabelFrame(tab, text="Data Management")
        data_frame.pack(fill="x", padx=12, pady=8)

        btn_row = ttk.Frame(data_frame)
        btn_row.pack(fill="x", padx=12, pady=8)
        ttk.Button(btn_row, text="Validate Data", command=self._validate_data).pack(side="left", padx=4)
        ttk.Button(btn_row, text="Merge Files", command=self._merge_dialog).pack(side="left", padx=4)
        ttk.Button(btn_row, text="Clear Cache", command=self._clear_cache).pack(side="left", padx=4)
        ttk.Button(btn_row, text="Clear All Data", command=self._clear_all,
                   style="Danger.TButton").pack(side="left", padx=4)

        # Extension
        ext_frame = ttk.LabelFrame(tab, text="Firefox Extension")
        ext_frame.pack(fill="x", padx=12, pady=8)

        btn_row2 = ttk.Frame(ext_frame)
        btn_row2.pack(fill="x", padx=12, pady=8)
        ttk.Button(btn_row2, text="Install Temp (about:debugging)",
                   command=self._install_temp).pack(side="left", padx=4)
        ttk.Button(btn_row2, text="Package .xpi", command=self._package_xpi).pack(side="left", padx=4)
        ttk.Button(btn_row2, text="Open Extension Dir",
                   command=lambda: self._open_dir(str(SCRIPT_DIR.parent / "extension"))).pack(side="left", padx=4)

        # System
        sys_frame = ttk.LabelFrame(tab, text="System")
        sys_frame.pack(fill="x", padx=12, pady=8)

        btn_row3 = ttk.Frame(sys_frame)
        btn_row3.pack(fill="x", padx=12, pady=8)
        ttk.Button(btn_row3, text="Check for Updates", command=self._check_updates).pack(side="left", padx=4)
        ttk.Button(btn_row3, text="Reset Config", command=self._reset_config,
                   style="Danger.TButton").pack(side="left", padx=4)
        ttk.Button(btn_row3, text="Open Config Dir",
                   command=lambda: self._open_dir(str(Path(self.cfg.get("save_path", DATA_DIR)).parent))).pack(side="left", padx=4)

        # Save bar
        save_frame = ttk.Frame(tab)
        save_frame.pack(fill="x", padx=12, pady=12)
        self.save_status_var = tk.StringVar()
        ttk.Label(save_frame, textvariable=self.save_status_var, style="Sub.TLabel").pack(side="left")
        ttk.Button(save_frame, text="Save All Settings", command=self._save_settings,
                   style="Success.TButton").pack(side="right", padx=4)

    # ── Log Tab ──
    def _build_log_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="  Log  ")

        self.log_text = scrolledtext.ScrolledText(tab, bg="#0f0f23", fg="#27ae60",
                                                   insertbackground="#27ae60", font=("Consolas", 10))
        self.log_text.pack(fill="both", expand=True, padx=8, pady=8)
        self._log("WebScraper Pro GUI started")

    # ══════════════════════════════════════════
    # Actions
    # ══════════════════════════════════════════

    def _log(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_text.insert("end", f"[{ts}] {msg}\n")
        self.log_text.see("end")

    def _set_status(self, status, color="#888"):
        self.status_var.set(status)
        self.status_label.configure(foreground=color)

    def _load_settings(self):
        c = self.cfg
        self.auto_start_var.set(c.get("auto_start", False))
        self.auto_scroll_var.set(c.get("auto_scroll", True))
        self.auto_next_var.set(c.get("auto_next", True))
        self.delay_var.set(str(c.get("delay_ms", 1500)))
        self.max_pages_var.set(str(c.get("max_pages", 200)))
        self.format_var.set(c.get("data_format", "jsonl"))
        self.hf_token_var.set(c.get("hf_token", ""))
        self.hf_repo_var.set(c.get("hf_repo_id", ""))
        self.hf_create_var.set(c.get("hf_create_repo", True))
        self.hf_private_var.set(c.get("hf_private", False))
        self.hf_auto_upload_var.set(c.get("hf_auto_upload", False))
        self.save_path_var.set(c.get("save_path", ""))
        self.save_local_var.set(c.get("save_local", True))
        self.download_images_var.set(c.get("download_images", False))
        self.convert_audio_var.set(c.get("convert_audio_to_wav", False))
        self.auto_cite_var.set(c.get("auto_cite", True))
        self.cite_readme_var.set(c.get("cite_readme", True))
        self.cite_links_var.set(c.get("cite_links", True))

    def _save_settings(self):
        self.cfg.update({
            "auto_start": self.auto_start_var.get(),
            "auto_scroll": self.auto_scroll_var.get(),
            "auto_next": self.auto_next_var.get(),
            "delay_ms": int(self.delay_var.get() or 1500),
            "max_pages": int(self.max_pages_var.get() or 200),
            "data_format": self.format_var.get(),
            "hf_token": self.hf_token_var.get(),
            "hf_repo_id": self.hf_repo_var.get(),
            "hf_create_repo": self.hf_create_var.get(),
            "hf_private": self.hf_private_var.get(),
            "hf_auto_upload": self.hf_auto_upload_var.get(),
            "hf_owner_repo": self.owner_repo_var.get(),
            "save_path": self.save_path_var.get(),
            "save_local": self.save_local_var.get(),
            "download_images": self.download_images_var.get(),
            "convert_audio_to_wav": self.convert_audio_var.get(),
            "auto_cite": self.auto_cite_var.get(),
            "cite_readme": self.cite_readme_var.get(),
            "cite_links": self.cite_links_var.get(),
        })
        save_config(self.cfg)
        self.save_status_var.set("Settings saved!")
        self._log("Settings saved")
        self.root.after(3000, lambda: self.save_status_var.set(""))

    def _refresh_stats(self):
        records = load_records(self.cfg)
        files = get_scraped_files(self.cfg)
        total_size = sum(os.path.getsize(f) for f in files) if files else 0

        self.stat_vars["total"].set(str(len(records)))
        self.stat_vars["pages"].set(str(len(set(r.get("source_url", "") for r in records))))
        self.stat_vars["texts"].set(str(sum(1 for r in records if r.get("type") == "text")))
        self.stat_vars["images"].set(str(sum(1 for r in records if r.get("type") == "image")))
        self.stat_vars["links"].set(str(sum(1 for r in records if r.get("type") == "link")))
        self.stat_vars["audio"].set(str(sum(1 for r in records if r.get("type") == "audio")))
        self.stat_vars["files"].set(str(len(files)))
        self.stat_vars["size"].set(format_bytes(total_size))

        # Refresh history
        self._refresh_history()
        self._refresh_files()

    def _refresh_history(self):
        from scrape import HISTORY_FILE
        for item in self.hist_tree.get_children():
            self.hist_tree.delete(item)

        if os.path.exists(HISTORY_FILE):
            entries = []
            with open(HISTORY_FILE, "r") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            entries.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass
            for e in reversed(entries[-20:]):
                ts = e.get("timestamp", "?")[:19].replace("T", " ")
                self.hist_tree.insert("", "end", values=(ts, e.get("action", ""), e.get("details", "")))

    def _refresh_files(self):
        for item in self.files_tree.get_children():
            self.files_tree.delete(item)
        files = get_scraped_files(self.cfg)
        for f in files:
            size = format_bytes(os.path.getsize(f)) if os.path.exists(f) else "?"
            self.files_tree.insert("", "end", values=(f, size))

    def _start_session(self):
        save_path = self.cfg.get("save_path", os.path.join(DATA_DIR, "scraped"))
        os.makedirs(save_path, exist_ok=True)
        session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        session_file = os.path.join(save_path, f"session_{session_id}.jsonl")
        self.cfg["active_session"] = session_file
        save_config(self.cfg)
        log_history("start", f"Session: {session_file}")
        self._set_status("Active", "#27ae60")
        self._log(f"Session started: {session_file}")
        self._refresh_stats()

    def _stop_session(self):
        session = self.cfg.pop("active_session", None)
        save_config(self.cfg)
        log_history("stop", f"Session stopped")
        self._set_status("Idle", "#888")
        self._log("Session stopped")
        self._refresh_stats()

    def _export_data(self):
        records = load_records(self.cfg)
        if not records:
            messagebox.showinfo("Export", "No data to export.")
            return
        fmt = self.format_var.get()
        fpath = filedialog.asksaveasfilename(defaultextension=f".{fmt}",
                                              filetypes=[(fmt.upper(), f"*.{fmt}")])
        if not fpath:
            return
        if fmt == "jsonl":
            with open(fpath, "w") as f:
                for r in records:
                    f.write(json.dumps(r) + "\n")
        elif fmt == "json":
            with open(fpath, "w") as f:
                json.dump(records, f, indent=2)
        log_history("export", f"Exported {len(records)} to {fpath}")
        self._log(f"Exported {len(records)} records to {fpath}")
        messagebox.showinfo("Export", f"Exported {len(records)} records!")

    def _upload_hf(self):
        self._log("Uploading to HuggingFace...")
        self._set_status("Uploading...", "#e67e22")
        threading.Thread(target=self._do_upload, args=(self.hf_repo_var.get(),), daemon=True).start()

    def _upload_owner(self):
        self._log("Uploading to owner repo...")
        self._set_status("Uploading to owner...", "#e67e22")
        threading.Thread(target=self._do_upload, args=("ray0rf1re/Site.scraped",), daemon=True).start()

    def _do_upload(self, repo_id):
        try:
            from huggingface_hub import HfApi, create_repo as hf_create_repo
            token = self.hf_token_var.get()
            if not token:
                self.root.after(0, lambda: messagebox.showerror("Error", "HF token not set!"))
                return

            api = HfApi(token=token)
            records = load_records(self.cfg)

            if self.hf_create_var.get():
                try:
                    hf_create_repo(repo_id, repo_type="dataset", private=self.hf_private_var.get(),
                                   token=token, exist_ok=True)
                except Exception:
                    pass

            save_path = self.cfg.get("save_path", os.path.join(DATA_DIR, "scraped"))
            os.makedirs(save_path, exist_ok=True)

            # Write README first
            readme = generate_readme_cli(self.cfg, records)
            with open(os.path.join(save_path, "README.md"), "w") as f:
                f.write(readme)

            # Write data
            with open(os.path.join(save_path, "data.jsonl"), "w") as f:
                for r in records:
                    f.write(json.dumps(r) + "\n")

            api.upload_folder(folder_path=save_path, repo_id=repo_id, repo_type="dataset",
                              commit_message=f"Update - {len(records)} records")

            log_history("upload", f"Uploaded {len(records)} to {repo_id}")
            self.root.after(0, lambda: self._log(f"Uploaded {len(records)} records to {repo_id}"))
            self.root.after(0, lambda: self._set_status("Idle", "#888"))
            self.root.after(0, lambda: messagebox.showinfo("Upload", f"Uploaded to {repo_id}!"))
        except Exception as e:
            self.root.after(0, lambda: self._log(f"Upload failed: {e}"))
            self.root.after(0, lambda: self._set_status("Error", "#e74c3c"))
            self.root.after(0, lambda: messagebox.showerror("Upload Error", str(e)))

    def _validate_token(self):
        import requests
        token = self.hf_token_var.get()
        if not token:
            self.token_status.configure(text="Enter token first", foreground="#e74c3c")
            return
        try:
            resp = requests.get("https://huggingface.co/api/whoami",
                                headers={"Authorization": f"Bearer {token}"}, timeout=10)
            if resp.ok:
                name = resp.json().get("name", "?")
                self.token_status.configure(text=f"Valid: {name}", foreground="#27ae60")
            else:
                self.token_status.configure(text="Invalid token", foreground="#e74c3c")
        except Exception:
            self.token_status.configure(text="Network error", foreground="#e74c3c")

    def _check_upload(self):
        self._log("Checking upload status...")
        try:
            from huggingface_hub import HfApi
            api = HfApi(token=self.hf_token_var.get())
            repo = self.hf_repo_var.get()
            if repo:
                info = api.dataset_info(repo)
                self._log(f"Repo: {info.id}, Last modified: {info.lastModified}")
        except Exception as e:
            self._log(f"Error: {e}")

    def _gen_readme(self):
        records = load_records(self.cfg)
        readme = generate_readme_cli(self.cfg, records)
        fpath = filedialog.asksaveasfilename(defaultextension=".md", initialfile="README.md")
        if fpath:
            with open(fpath, "w") as f:
                f.write(readme)
            self._log(f"README generated at {fpath}")

    def _browse_path(self):
        d = filedialog.askdirectory()
        if d:
            self.save_path_var.set(d)

    def _open_data_dir(self):
        self._open_dir(self.cfg.get("save_path", DATA_DIR))

    def _open_dir(self, path):
        import subprocess
        if sys.platform == "win32":
            os.startfile(path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])

    def _convert(self, kind, fmt):
        self._log(f"Converting {kind} to {fmt}...")
        import subprocess
        subprocess.Popen([sys.executable, str(SCRIPT_DIR / "scrape.py"), f"convert.{kind}", fmt])

    def _scrape_url(self):
        url = self.url_var.get().strip()
        if not url:
            return
        self._log(f"CLI scraping: {url}")
        import subprocess
        subprocess.Popen([sys.executable, str(SCRIPT_DIR / "scrape.py"), "url", url])

    def _scrape_batch(self):
        urls = [u.strip() for u in self.batch_text.get("1.0", "end").strip().split("\n") if u.strip()]
        if not urls:
            return
        self._log(f"Batch scraping {len(urls)} URLs...")
        import subprocess
        for url in urls:
            subprocess.Popen([sys.executable, str(SCRIPT_DIR / "scrape.py"), "url", url])

    def _generate_citations(self):
        records = load_records(self.cfg)
        self.cite_text.delete("1.0", "end")
        urls = set()
        i = 1
        for r in records:
            url = r.get("source_url")
            mla = r.get("citation_mla", "")
            if url and url not in urls and mla:
                urls.add(url)
                self.cite_text.insert("end", f"{i}. {mla}\n\n")
                i += 1
        if i == 1:
            self.cite_text.insert("end", "No citations found. Scrape some pages first.")

    def _export_citations(self):
        content = self.cite_text.get("1.0", "end").strip()
        if not content:
            return
        fpath = filedialog.asksaveasfilename(defaultextension=".txt", initialfile="citations.txt")
        if fpath:
            with open(fpath, "w") as f:
                f.write(content)
            self._log(f"Citations exported to {fpath}")

    def _copy_citations(self):
        content = self.cite_text.get("1.0", "end").strip()
        self.root.clipboard_clear()
        self.root.clipboard_append(content)
        self._log("Citations copied to clipboard")

    def _validate_data(self):
        files = get_scraped_files(self.cfg)
        self._log(f"Validating {len(files)} files...")
        errors = 0
        total = 0
        for fpath in files:
            with open(fpath, "r") as f:
                for line in f:
                    if line.strip():
                        try:
                            json.loads(line)
                            total += 1
                        except json.JSONDecodeError:
                            errors += 1
        msg = f"Validation: {total} valid, {errors} errors across {len(files)} files"
        self._log(msg)
        messagebox.showinfo("Validation", msg)

    def _merge_dialog(self):
        files = filedialog.askopenfilenames(filetypes=[("JSONL", "*.jsonl")])
        if not files:
            return
        output = filedialog.asksaveasfilename(defaultextension=".jsonl", initialfile="merged.jsonl")
        if not output:
            return
        import subprocess
        subprocess.run([sys.executable, str(SCRIPT_DIR / "scrape.py"), "merge", *files, "-o", output])
        self._log(f"Merged {len(files)} files to {output}")

    def _clear_cache(self):
        import shutil
        cache = os.path.join(DATA_DIR, "cache")
        if os.path.exists(cache):
            shutil.rmtree(cache)
            os.makedirs(cache)
        self._log("Cache cleared")

    def _clear_all(self):
        if messagebox.askyesno("Clear All", "Delete ALL scraped data?"):
            import shutil
            sp = self.cfg.get("save_path", os.path.join(DATA_DIR, "scraped"))
            if os.path.exists(sp):
                shutil.rmtree(sp)
                os.makedirs(sp)
            self.cfg.pop("active_session", None)
            save_config(self.cfg)
            log_history("clear", "All data cleared via GUI")
            self._log("All data cleared")
            self._refresh_stats()

    def _install_temp(self):
        webbrowser.open("about:debugging#/runtime/this-firefox")
        self._log("Opened about:debugging - load manifest.json from extension/ directory")

    def _package_xpi(self):
        import zipfile
        ext_dir = SCRIPT_DIR.parent / "extension"
        xpi_path = filedialog.asksaveasfilename(defaultextension=".xpi",
                                                 initialfile="webscraper-pro.xpi",
                                                 filetypes=[("XPI", "*.xpi")])
        if not xpi_path:
            return
        with zipfile.ZipFile(xpi_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(str(ext_dir)):
                dirs[:] = [d for d in dirs if d != "__pycache__"]
                for fname in files:
                    if fname.endswith((".py", ".pyc")):
                        continue
                    fpath = os.path.join(root, fname)
                    arcname = os.path.relpath(fpath, str(ext_dir))
                    zf.write(fpath, arcname)
        self._log(f"Extension packaged: {xpi_path}")
        messagebox.showinfo("Package", f"XPI created: {xpi_path}")

    def _check_updates(self):
        self._log("Checking for updates...")
        import subprocess
        result = subprocess.run([sys.executable, str(SCRIPT_DIR / "scrape.py"), "update"],
                                capture_output=True, text=True)
        self._log(result.stdout or result.stderr or "Update check complete")

    def _reset_config(self):
        if messagebox.askyesno("Reset", "Reset all settings to defaults?"):
            save_config(dict(DEFAULT_CONFIG))
            self.cfg = load_config()
            self._load_settings()
            self._log("Config reset to defaults")

    # ── Run ──
    def run(self):
        self.root.mainloop()


def launch_gui():
    """Entry point for scrape gui.start"""
    app = WebScraperGUI()
    app.run()


if __name__ == "__main__":
    launch_gui()

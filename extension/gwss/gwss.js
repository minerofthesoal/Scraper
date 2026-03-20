/* ── GwSS + SSDg Engine v0.7 ── */
/* Interactive node graph for visualizing scraped sites */
/* eslint-env browser, webextensions */
(function () {
  "use strict";

  /* ── Helpers ── */
  var $ = function (s) { return document.querySelector(s); };
  function formatBytes(b) {
    if (b <= 0) return "0 B";
    var k = 1024, s = ["B", "KB", "MB", "GB"];
    var i = Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1);
    return (b / Math.pow(k, i)).toFixed(1) + " " + s[i];
  }
  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }
  function safeDomain(url) {
    try { return new URL(url).hostname; } catch (e) { return url || "unknown"; }
  }
  // Deterministic color from string
  function hashColor(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    var hue = Math.abs(h) % 360;
    return "hsl(" + hue + ", 65%, 60%)";
  }

  /* ── State ── */
  var nodes = [];      // { id, domain, x, y, radius, color, records, types, dataSize, timeMs, images }
  var edges = [];      // { from, to }  (shared links between domains)
  var camera = { x: 0, y: 0, zoom: 1 };
  var drag = { active: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0 };
  var hoverNode = null;
  var selectedNode = null;
  var animFrame = null;
  var allRecords = [];

  /* ── Canvas Setup ── */
  var canvas = $("#gwss-canvas");
  var ctx = canvas.getContext("2d");

  function resizeCanvas() {
    var wrap = $("#canvas-wrap");
    canvas.width = wrap.clientWidth * devicePixelRatio;
    canvas.height = wrap.clientHeight * devicePixelRatio;
    canvas.style.width = wrap.clientWidth + "px";
    canvas.style.height = wrap.clientHeight + "px";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    render();
  }
  window.addEventListener("resize", resizeCanvas);

  /* ── Theme ── */
  browser.storage.local.get(["theme"]).then(function (cfg) {
    if (cfg.theme === "light") {
      document.body.setAttribute("data-theme", "light");
      var btn = $("#btn-theme");
      if (btn) btn.textContent = "\u2600";
    }
  });
  var btnTheme = $("#btn-theme");
  if (btnTheme) {
    btnTheme.addEventListener("click", function () {
      var isLight = document.body.getAttribute("data-theme") === "light";
      if (isLight) {
        document.body.removeAttribute("data-theme");
        btnTheme.textContent = "\u263E";
        browser.storage.local.set({ theme: "dark" });
      } else {
        document.body.setAttribute("data-theme", "light");
        btnTheme.textContent = "\u2600";
        browser.storage.local.set({ theme: "light" });
      }
      render();
    });
  }

  /* ── Data Loading ── */
  function loadData() {
    browser.runtime.sendMessage({ action: "GET_ALL_DATA" }).then(function (resp) {
      if (!resp) return;
      allRecords = resp.records || [];
      buildGraph(allRecords);
      fitView();
      render();
    }).catch(function (e) { console.warn("[GwSS] load failed:", e); });
  }

  function buildGraph(records) {
    var domainMap = {};
    records.forEach(function (r) {
      var d = safeDomain(r.source_url || "");
      if (!d) return;
      if (!domainMap[d]) {
        domainMap[d] = { domain: d, records: [], types: {}, dataSize: 0, timeMs: 0, images: [] };
      }
      domainMap[d].records.push(r);
      var t = r.type || "text";
      domainMap[d].types[t] = (domainMap[d].types[t] || 0) + 1;
      domainMap[d].dataSize += JSON.stringify(r).length;
      if (r.scrape_time_ms) domainMap[d].timeMs += r.scrape_time_ms;
      if (t === "image" && r.src) domainMap[d].images.push(r.src);
    });

    var domains = Object.keys(domainMap);
    nodes = [];
    edges = [];

    // Layout: force-directed simple simulation
    var cx = 0, cy = 0;
    domains.forEach(function (d, i) {
      var info = domainMap[d];
      var count = info.records.length;
      var radius = Math.max(18, Math.min(60, 10 + Math.sqrt(count) * 6));
      // Initial spiral layout
      var angle = i * 2.4; // golden angle
      var dist = 80 + i * 25;
      nodes.push({
        id: i,
        domain: d,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        radius: radius,
        color: hashColor(d),
        records: info.records,
        types: info.types,
        dataSize: info.dataSize,
        timeMs: info.timeMs,
        images: info.images.slice(0, 9)
      });
    });

    // Build edges: domains that share links
    var linkDomains = {};
    records.forEach(function (r) {
      if (r.type === "link" && r.href) {
        var fromD = safeDomain(r.source_url || "");
        var toD = safeDomain(r.href);
        if (fromD && toD && fromD !== toD) {
          var key = fromD < toD ? fromD + "|" + toD : toD + "|" + fromD;
          linkDomains[key] = (linkDomains[key] || 0) + 1;
        }
      }
    });

    var nodeIdx = {};
    nodes.forEach(function (n) { nodeIdx[n.domain] = n.id; });
    Object.keys(linkDomains).forEach(function (key) {
      var parts = key.split("|");
      if (nodeIdx[parts[0]] !== undefined && nodeIdx[parts[1]] !== undefined) {
        edges.push({ from: nodeIdx[parts[0]], to: nodeIdx[parts[1]], weight: linkDomains[key] });
      }
    });

    // Simple force simulation (50 iterations)
    for (var iter = 0; iter < 50; iter++) {
      // Repulsion between all nodes
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var dx = nodes[j].x - nodes[i].x;
          var dy = nodes[j].y - nodes[i].y;
          var dist2 = dx * dx + dy * dy;
          if (dist2 < 1) dist2 = 1;
          var force = 8000 / dist2;
          var fx = dx * force;
          var fy = dy * force;
          nodes[i].x -= fx;
          nodes[i].y -= fy;
          nodes[j].x += fx;
          nodes[j].y += fy;
        }
      }
      // Attraction along edges
      edges.forEach(function (e) {
        var a = nodes[e.from], b = nodes[e.to];
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var dist3 = Math.sqrt(dx * dx + dy * dy);
        if (dist3 < 1) return;
        var force2 = (dist3 - 150) * 0.01;
        var fx2 = (dx / dist3) * force2;
        var fy2 = (dy / dist3) * force2;
        a.x += fx2;
        a.y += fy2;
        b.x -= fx2;
        b.y -= fy2;
      });
    }

    var countEl = $("#node-count");
    if (countEl) countEl.textContent = nodes.length + " site" + (nodes.length !== 1 ? "s" : "");
  }

  /* ── Rendering ── */
  function render() {
    var w = canvas.width / devicePixelRatio;
    var h = canvas.height / devicePixelRatio;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + camera.x, h / 2 + camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // Draw edges
    edges.forEach(function (e) {
      var a = nodes[e.from], b = nodes[e.to];
      var style = getComputedStyle(document.body);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = style.getPropertyValue("--edge-color").trim() || "rgba(129,140,248,0.15)";
      ctx.lineWidth = Math.min(3, 0.5 + (e.weight || 1) * 0.3);
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach(function (n) {
      var isHover = hoverNode === n;
      var isSelected = selectedNode === n;

      // Glow
      if (isHover || isSelected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = n.color.replace("60%)", "60%, 0.2)").replace("hsl(", "hsla(");
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      var grad = ctx.createRadialGradient(n.x - n.radius * 0.3, n.y - n.radius * 0.3, 0, n.x, n.y, n.radius);
      grad.addColorStop(0, n.color.replace("60%)", "75%)"));
      grad.addColorStop(1, n.color.replace("60%)", "45%)"));
      ctx.fillStyle = grad;
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Label
      var fontSize = Math.max(9, Math.min(13, n.radius * 0.4));
      ctx.font = "600 " + fontSize + "px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      // Truncate domain
      var label = n.domain.length > 18 ? n.domain.slice(0, 16) + ".." : n.domain;
      ctx.fillText(label, n.x, n.y - 2);
      // Record count
      ctx.font = "500 " + (fontSize - 2) + "px -apple-system, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(n.records.length + " rec", n.x, n.y + fontSize - 1);

      // Type ring segments (pie around node)
      var typeKeys = Object.keys(n.types);
      if (typeKeys.length > 1) {
        var total = n.records.length;
        var startA = -Math.PI / 2;
        var typeColors = { text: "#818cf8", image: "#f59e0b", link: "#10b981", audio: "#8b5cf6", ai_extract: "#ec4899" };
        typeKeys.forEach(function (t) {
          var slice = (n.types[t] / total) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 3, startA, startA + slice);
          ctx.strokeStyle = typeColors[t] || "#818cf8";
          ctx.lineWidth = 3;
          ctx.stroke();
          startA += slice;
        });
      }
    });

    ctx.restore();

    var zoomEl = $("#zoom-level");
    if (zoomEl) zoomEl.textContent = Math.round(camera.zoom * 100) + "%";
  }

  /* ── Interaction: Pan & Zoom ── */
  canvas.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    var hit = hitTest(e);
    if (hit) {
      selectNode(hit);
      return;
    }
    drag.active = true;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.camStartX = camera.x;
    drag.camStartY = camera.y;
  });

  canvas.addEventListener("mousemove", function (e) {
    if (drag.active) {
      camera.x = drag.camStartX + (e.clientX - drag.startX);
      camera.y = drag.camStartY + (e.clientY - drag.startY);
      render();
      return;
    }
    var hit = hitTest(e);
    if (hit !== hoverNode) {
      hoverNode = hit;
      canvas.style.cursor = hit ? "pointer" : "grab";
      updateTooltip(e, hit);
      render();
    } else if (hit) {
      updateTooltip(e, hit);
    }
  });

  canvas.addEventListener("mouseup", function () { drag.active = false; });
  canvas.addEventListener("mouseleave", function () {
    drag.active = false;
    hoverNode = null;
    var tt = $("#tooltip");
    if (tt) tt.classList.add("hidden");
    render();
  });

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var factor = e.deltaY > 0 ? 0.9 : 1.1;
    camera.zoom = Math.max(0.1, Math.min(8, camera.zoom * factor));
    render();
  }, { passive: false });

  // Touch support for mobile
  var lastTouchDist = 0;
  canvas.addEventListener("touchstart", function (e) {
    if (e.touches.length === 1) {
      drag.active = true;
      drag.startX = e.touches[0].clientX;
      drag.startY = e.touches[0].clientY;
      drag.camStartX = camera.x;
      drag.camStartY = camera.y;
    } else if (e.touches.length === 2) {
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
    }
  });
  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    if (e.touches.length === 1 && drag.active) {
      camera.x = drag.camStartX + (e.touches[0].clientX - drag.startX);
      camera.y = drag.camStartY + (e.touches[0].clientY - drag.startY);
      render();
    } else if (e.touches.length === 2) {
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDist > 0) {
        camera.zoom = Math.max(0.1, Math.min(8, camera.zoom * (dist / lastTouchDist)));
        render();
      }
      lastTouchDist = dist;
    }
  }, { passive: false });
  canvas.addEventListener("touchend", function () { drag.active = false; lastTouchDist = 0; });

  function hitTest(e) {
    var rect = canvas.getBoundingClientRect();
    var w = rect.width, h = rect.height;
    var mx = (e.clientX - rect.left - w / 2 - camera.x) / camera.zoom;
    var my = (e.clientY - rect.top - h / 2 - camera.y) / camera.zoom;
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      var dx = mx - n.x, dy = my - n.y;
      if (dx * dx + dy * dy < n.radius * n.radius) return n;
    }
    return null;
  }

  function updateTooltip(e, node) {
    var tt = $("#tooltip");
    if (!tt) return;
    if (!node) { tt.classList.add("hidden"); return; }
    tt.classList.remove("hidden");
    var types = Object.entries(node.types).map(function (kv) { return kv[0] + ": " + kv[1]; }).join(", ");
    tt.innerHTML = '<span class="tt-domain">' + escapeHtml(node.domain) + '</span>'
      + '<span class="tt-meta">'
      + node.records.length + " records | " + formatBytes(node.dataSize) + "<br>"
      + types
      + (node.timeMs > 0 ? "<br>Time: " + (node.timeMs / 1000).toFixed(1) + "s" : "")
      + '</span>';
    tt.style.left = Math.min(e.clientX + 12, window.innerWidth - 270) + "px";
    tt.style.top = (e.clientY + 12) + "px";
  }

  /* ── Node Selection & Side Panel ── */
  function selectNode(node) {
    selectedNode = node;
    render();
    showSidePanel(node);
  }

  function showSidePanel(node) {
    var panel = $("#side-panel");
    if (!panel) return;
    panel.classList.remove("hidden");

    $("#sp-title").textContent = node.domain;
    $("#sp-domain").textContent = node.domain;
    $("#sp-records").textContent = node.records.length;
    $("#sp-size").textContent = formatBytes(node.dataSize);
    $("#sp-time").textContent = node.timeMs > 0 ? (node.timeMs / 1000).toFixed(1) + "s" : "N/A";

    var typeStr = Object.entries(node.types).map(function (kv) { return kv[0] + " (" + kv[1] + ")"; }).join(", ");
    $("#sp-types").textContent = typeStr || "mixed";

    // Image previews
    var imgSection = $("#sp-images");
    var imgGrid = $("#sp-image-grid");
    if (node.images.length > 0) {
      imgSection.classList.remove("hidden");
      imgGrid.innerHTML = node.images.slice(0, 9).map(function (src) {
        return '<img src="' + escapeHtml(src) + '" alt="scraped" loading="lazy" onerror="this.style.display=\'none\'">';
      }).join("");
    } else {
      imgSection.classList.add("hidden");
    }

    // Record list
    var countEl = $("#sp-rec-count");
    if (countEl) countEl.textContent = node.records.length;
    var list = $("#sp-rec-list");
    if (list) {
      list.innerHTML = node.records.slice(0, 50).map(function (r, i) {
        var content = r.text || r.src || r.href || r.content || "";
        if (content.length > 100) content = content.slice(0, 100) + "\u2026";
        return '<div class="sp-rec-item" data-idx="' + i + '">'
          + '<span class="sp-rec-type sp-rec-type-' + (r.type || "text") + '">' + (r.type || "text") + '</span>'
          + '<div class="sp-rec-content">' + escapeHtml(content) + '</div></div>';
      }).join("");
      if (node.records.length > 50) {
        list.innerHTML += '<div style="text-align:center;padding:8px;color:var(--text-muted);font-size:11px">' + (node.records.length - 50) + ' more records...</div>';
      }
    }

    // Render SSDg
    renderSSDg(node);
  }

  var spClose = $("#sp-close");
  if (spClose) {
    spClose.addEventListener("click", function () {
      var panel = $("#side-panel");
      if (panel) panel.classList.add("hidden");
      selectedNode = null;
      render();
    });
  }

  /* ── SSDg: Single Site Data Graph (Flowchart) ── */
  function renderSSDg(node) {
    var c = $("#ssdg-canvas");
    if (!c) return;
    var dpr = devicePixelRatio || 1;
    var w = c.parentElement.clientWidth - 32;
    var h = 300;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = w + "px";
    c.style.height = h + "px";
    var sc = c.getContext("2d");
    sc.setTransform(dpr, 0, 0, dpr, 0, 0);

    var style = getComputedStyle(document.body);
    var bgSec = style.getPropertyValue("--bg-secondary").trim();
    var border = style.getPropertyValue("--border").trim();
    var textPri = style.getPropertyValue("--text-primary").trim();
    var textMut = style.getPropertyValue("--text-muted").trim();
    var accent = style.getPropertyValue("--accent").trim();

    sc.fillStyle = bgSec;
    sc.fillRect(0, 0, w, h);

    // Flow: Domain -> Pages -> Types -> Records count
    var types = Object.entries(node.types);
    var pages = {};
    node.records.forEach(function (r) {
      var url = r.source_url || "unknown";
      try { url = new URL(url).pathname || "/"; } catch (e) { url = "/"; }
      if (url.length > 30) url = url.slice(0, 28) + "..";
      pages[url] = (pages[url] || 0) + 1;
    });
    var pageEntries = Object.entries(pages).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);

    var typeColors = { text: "#818cf8", image: "#f59e0b", link: "#10b981", audio: "#8b5cf6", ai_extract: "#ec4899" };

    // Column positions
    var col1 = 60, col2 = w * 0.42, col3 = w * 0.78;
    var rowStart = 40;

    // Draw domain node (root)
    sc.fillStyle = accent;
    drawRoundRect(sc, col1 - 40, h / 2 - 16, 80, 32, 8);
    sc.fill();
    sc.fillStyle = "#fff";
    sc.font = "600 10px -apple-system, sans-serif";
    sc.textAlign = "center";
    sc.textBaseline = "middle";
    var domLabel = node.domain.length > 12 ? node.domain.slice(0, 10) + ".." : node.domain;
    sc.fillText(domLabel, col1, h / 2);

    // Draw page nodes
    var pageSpacing = Math.min(32, (h - 50) / Math.max(pageEntries.length, 1));
    var pageStartY = rowStart + (h - 50 - pageEntries.length * pageSpacing) / 2;

    pageEntries.forEach(function (pe, i) {
      var py = pageStartY + i * pageSpacing + pageSpacing / 2;
      // Edge from domain
      sc.beginPath();
      sc.moveTo(col1 + 40, h / 2);
      sc.quadraticCurveTo(col1 + 60, h / 2, col2 - 50, py);
      sc.strokeStyle = border;
      sc.lineWidth = 1;
      sc.stroke();

      // Page box
      sc.fillStyle = style.getPropertyValue("--bg-tertiary").trim();
      drawRoundRect(sc, col2 - 50, py - 11, 100, 22, 5);
      sc.fill();
      sc.strokeStyle = border;
      sc.lineWidth = 0.5;
      sc.stroke();

      sc.fillStyle = textPri;
      sc.font = "500 9px -apple-system, sans-serif";
      sc.textAlign = "center";
      var pathLabel = pe[0].length > 14 ? pe[0].slice(0, 12) + ".." : pe[0];
      sc.fillText(pathLabel + " (" + pe[1] + ")", col2, py + 1);
    });

    // Draw type nodes
    var typeSpacing = Math.min(40, (h - 50) / Math.max(types.length, 1));
    var typeStartY = rowStart + (h - 50 - types.length * typeSpacing) / 2;

    types.forEach(function (te, i) {
      var ty = typeStartY + i * typeSpacing + typeSpacing / 2;

      // Edges from relevant pages
      pageEntries.forEach(function (pe, pi) {
        var py = pageStartY + pi * pageSpacing + pageSpacing / 2;
        sc.beginPath();
        sc.moveTo(col2 + 50, py);
        sc.quadraticCurveTo(col2 + 70, py, col3 - 35, ty);
        sc.strokeStyle = (typeColors[te[0]] || accent) + "33";
        sc.lineWidth = 0.5;
        sc.stroke();
      });

      // Type box
      sc.fillStyle = typeColors[te[0]] || accent;
      drawRoundRect(sc, col3 - 35, ty - 12, 70, 24, 6);
      sc.fill();
      sc.fillStyle = "#fff";
      sc.font = "700 9px -apple-system, sans-serif";
      sc.textAlign = "center";
      sc.fillText(te[0], col3, ty - 1);
      sc.font = "500 8px -apple-system, sans-serif";
      sc.fillStyle = "rgba(255,255,255,0.8)";
      sc.fillText(te[1] + " rec", col3, ty + 9);
    });

    // Column headers
    sc.fillStyle = textMut;
    sc.font = "600 8px -apple-system, sans-serif";
    sc.textAlign = "center";
    sc.fillText("DOMAIN", col1, 18);
    sc.fillText("PAGES", col2, 18);
    sc.fillText("TYPES", col3, 18);
  }

  function drawRoundRect(ctx2, x, y, w, h, r) {
    ctx2.beginPath();
    ctx2.moveTo(x + r, y);
    ctx2.lineTo(x + w - r, y);
    ctx2.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx2.lineTo(x + w, y + h - r);
    ctx2.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx2.lineTo(x + r, y + h);
    ctx2.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx2.lineTo(x, y + r);
    ctx2.quadraticCurveTo(x, y, x + r, y);
    ctx2.closePath();
  }

  /* ── Fit View ── */
  function fitView() {
    if (nodes.length === 0) return;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      minX = Math.min(minX, n.x - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    });
    var wrap = $("#canvas-wrap");
    var cw = wrap.clientWidth;
    var ch = wrap.clientHeight;
    var graphW = maxX - minX + 100;
    var graphH = maxY - minY + 100;
    camera.zoom = Math.min(cw / graphW, ch / graphH, 2);
    camera.x = -(minX + maxX) / 2 * camera.zoom;
    camera.y = -(minY + maxY) / 2 * camera.zoom;
  }

  /* ── Controls ── */
  var btnFit = $("#btn-fit");
  if (btnFit) btnFit.addEventListener("click", function () { fitView(); render(); });
  var btnReset = $("#btn-reset");
  if (btnReset) btnReset.addEventListener("click", function () {
    camera = { x: 0, y: 0, zoom: 1 };
    render();
  });

  /* ── Export: SVG ── */
  var btnSvg = $("#btn-export-svg");
  if (btnSvg) btnSvg.addEventListener("click", function () {
    exportSVG();
  });

  function exportSVG() {
    var padding = 40;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      minX = Math.min(minX, n.x - n.radius - padding);
      maxX = Math.max(maxX, n.x + n.radius + padding);
      minY = Math.min(minY, n.y - n.radius - padding);
      maxY = Math.max(maxY, n.y + n.radius + padding);
    });
    var w = maxX - minX, h = maxY - minY;

    var svgParts = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="' + minX + ' ' + minY + ' ' + w + ' ' + h + '">'];
    svgParts.push('<rect x="' + minX + '" y="' + minY + '" width="' + w + '" height="' + h + '" fill="#0d1117"/>');

    edges.forEach(function (e) {
      var a = nodes[e.from], b = nodes[e.to];
      svgParts.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="rgba(129,140,248,0.15)" stroke-width="1"/>');
    });

    nodes.forEach(function (n) {
      svgParts.push('<circle cx="' + n.x + '" cy="' + n.y + '" r="' + n.radius + '" fill="' + n.color + '"/>');
      svgParts.push('<text x="' + n.x + '" y="' + (n.y - 2) + '" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="' + Math.max(9, n.radius * 0.4) + '" font-weight="600" font-family="sans-serif">' + escapeHtml(n.domain.length > 18 ? n.domain.slice(0, 16) + ".." : n.domain) + '</text>');
      svgParts.push('<text x="' + n.x + '" y="' + (n.y + Math.max(9, n.radius * 0.4) - 1) + '" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.7)" font-size="' + (Math.max(9, n.radius * 0.4) - 2) + '" font-family="sans-serif">' + n.records.length + ' rec</text>');
    });

    svgParts.push("</svg>");
    downloadBlob(new Blob([svgParts.join("\n")], { type: "image/svg+xml" }), "gwss-graph.svg");
  }

  /* ── Export: PNG ── */
  var btnPng = $("#btn-export-png");
  if (btnPng) btnPng.addEventListener("click", function () {
    exportPNG();
  });

  function exportPNG() {
    // Render to offscreen canvas at high res
    var padding = 60;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      minX = Math.min(minX, n.x - n.radius - padding);
      maxX = Math.max(maxX, n.x + n.radius + padding);
      minY = Math.min(minY, n.y - n.radius - padding);
      maxY = Math.max(maxY, n.y + n.radius + padding);
    });
    var w = (maxX - minX) * 2;
    var h = (maxY - minY) * 2;
    var offCanvas = document.createElement("canvas");
    offCanvas.width = w;
    offCanvas.height = h;
    var oc = offCanvas.getContext("2d");
    oc.scale(2, 2);
    oc.translate(-minX, -minY);

    oc.fillStyle = "#0d1117";
    oc.fillRect(minX, minY, maxX - minX, maxY - minY);

    edges.forEach(function (e) {
      var a = nodes[e.from], b = nodes[e.to];
      oc.beginPath();
      oc.moveTo(a.x, a.y);
      oc.lineTo(b.x, b.y);
      oc.strokeStyle = "rgba(129,140,248,0.15)";
      oc.lineWidth = 1;
      oc.stroke();
    });

    nodes.forEach(function (n) {
      oc.beginPath();
      oc.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      oc.fillStyle = n.color;
      oc.fill();
      var fontSize = Math.max(9, n.radius * 0.4);
      oc.font = "600 " + fontSize + "px -apple-system, sans-serif";
      oc.textAlign = "center";
      oc.textBaseline = "middle";
      oc.fillStyle = "#fff";
      var label = n.domain.length > 18 ? n.domain.slice(0, 16) + ".." : n.domain;
      oc.fillText(label, n.x, n.y - 2);
      oc.font = "500 " + (fontSize - 2) + "px -apple-system, sans-serif";
      oc.fillStyle = "rgba(255,255,255,0.7)";
      oc.fillText(n.records.length + " rec", n.x, n.y + fontSize - 1);
    });

    offCanvas.toBlob(function (blob) {
      if (blob) downloadBlob(blob, "gwss-graph.png");
    }, "image/png");
  }

  /* ── Export: CSV ── */
  var btnCsv = $("#btn-export-csv");
  if (btnCsv) btnCsv.addEventListener("click", function () {
    exportCSV();
  });

  function exportCSV() {
    var rows = ["domain,records,data_size_bytes,time_ms,text,images,links,audio,ai_extract"];
    nodes.forEach(function (n) {
      rows.push([
        '"' + n.domain + '"',
        n.records.length,
        n.dataSize,
        n.timeMs,
        n.types.text || 0,
        n.types.image || 0,
        n.types.link || 0,
        n.types.audio || 0,
        n.types.ai_extract || 0,
      ].join(","));
    });
    downloadBlob(new Blob([rows.join("\n")], { type: "text/csv" }), "gwss-sites.csv");
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    browser.downloads.download({ url: url, filename: filename, saveAs: true }).then(function () {
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }).catch(function () {
      // Fallback for popup context
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    });
  }

  /* ── Init ── */
  resizeCanvas();
  loadData();

})();

/* ── GwSS + SSDg Engine v0.7.1.1 ── */
/* Interactive force-directed node graph with live physics, favicon, tags */
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
  function hashColor(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    var hue = Math.abs(h) % 360;
    return "hsl(" + hue + ", 65%, 60%)";
  }

  /* ── State ── */
  var nodes = [];      // { id, domain, x, y, vx, vy, radius, color, records, types, dataSize, timeMs, images, tags, favicon, faviconImg }
  var edges = [];      // { from, to, weight }
  var camera = { x: 0, y: 0, zoom: 1 };
  var panDrag = { active: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0 };
  var nodeDrag = { active: false, node: null, offX: 0, offY: 0 };
  var hoverNode = null;
  var selectedNode = null;
  var animFrame = null;
  var allRecords = [];
  var physicsLocked = false;  /* true = freeze positions */
  var physicsAlpha = 1.0;     /* simulation cooling factor */

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
      startPhysicsLoop();
    }).catch(function (e) { console.warn("[GwSS] load failed:", e); });
  }

  /* ── Auto-Tag Generation ── */
  function generateTags(records) {
    var words = {};
    var stopWords = new Set(["the","a","an","and","or","but","in","on","at","to","for","of","is","it","this","that","was","with","as","by","from","are","be","has","had","not","no","can","do","did","will","would","could","should","its","all","they","we","he","she","you","your","my","our","their","have","been","more","than","so","if","about","which","when","what","there","how","also","up","out","just","into","over","then","them","these","those","some","other","new","now","very","only","may","any","each","much","own","most"]);
    for (var i = 0; i < records.length; i++) {
      var text = (records[i].text || records[i].source_title || "").toLowerCase();
      var tokens = text.split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3 && !stopWords.has(w); });
      for (var j = 0; j < tokens.length; j++) {
        words[tokens[j]] = (words[tokens[j]] || 0) + 1;
      }
    }
    return Object.entries(words)
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, 5)
      .map(function (e) { return e[0]; });
  }

  /* ── Favicon Loader ── */
  var faviconCache = {};
  function loadFavicon(domain, faviconUrl) {
    if (faviconCache[domain]) return;
    faviconCache[domain] = "loading";
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      faviconCache[domain] = img;
      /* Update the node's faviconImg */
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].domain === domain) nodes[i].faviconImg = img;
      }
      render();
    };
    img.onerror = function () { faviconCache[domain] = "failed"; };
    img.src = faviconUrl;
  }

  function buildGraph(records) {
    var domainMap = {};
    records.forEach(function (r) {
      var d = safeDomain(r.source_url || "");
      if (!d) return;
      if (!domainMap[d]) {
        domainMap[d] = { domain: d, records: [], types: {}, dataSize: 0, timeMs: 0, images: [], favicon: "" };
      }
      domainMap[d].records.push(r);
      var t = r.type || "text";
      domainMap[d].types[t] = (domainMap[d].types[t] || 0) + 1;
      domainMap[d].dataSize += JSON.stringify(r).length;
      if (r.scrape_time_ms) domainMap[d].timeMs += r.scrape_time_ms;
      if (t === "image" && r.src) domainMap[d].images.push(r.src);
      if (r.favicon && !domainMap[d].favicon) domainMap[d].favicon = r.favicon;
    });

    var domains = Object.keys(domainMap);
    nodes = [];
    edges = [];

    /* Initial spiral layout + velocity init */
    domains.forEach(function (d, i) {
      var info = domainMap[d];
      var count = info.records.length;
      var radius = Math.max(18, Math.min(60, 10 + Math.sqrt(count) * 6));
      var angle = i * 2.4;
      var dist = 80 + i * 25;
      var tags = generateTags(info.records);
      var faviconUrl = info.favicon || ("https://" + d + "/favicon.ico");

      var node = {
        id: i,
        domain: d,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        vx: 0, vy: 0,
        radius: radius,
        color: hashColor(d),
        records: info.records,
        types: info.types,
        dataSize: info.dataSize,
        timeMs: info.timeMs,
        images: info.images.slice(0, 9),
        tags: tags,
        favicon: faviconUrl,
        faviconImg: null
      };
      nodes.push(node);
      loadFavicon(d, faviconUrl);
    });

    /* Build edges: domains that share links */
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

    /* Reset physics */
    physicsAlpha = 1.0;

    var countEl = $("#node-count");
    if (countEl) countEl.textContent = nodes.length + " site" + (nodes.length !== 1 ? "s" : "");
    var edgeEl = $("#edge-count");
    if (edgeEl) edgeEl.textContent = edges.length + " link" + (edges.length !== 1 ? "s" : "");
  }

  /* ── Live Force Simulation ── */
  function tickPhysics() {
    if (physicsLocked || nodes.length === 0) return;
    if (physicsAlpha < 0.001) return;
    physicsAlpha *= 0.995; /* cool down */

    var i, j, dx, dy, dist2, force, fx, fy;

    /* Repulsion (all pairs) */
    for (i = 0; i < nodes.length; i++) {
      for (j = i + 1; j < nodes.length; j++) {
        dx = nodes[j].x - nodes[i].x;
        dy = nodes[j].y - nodes[i].y;
        dist2 = dx * dx + dy * dy;
        if (dist2 < 1) dist2 = 1;
        force = 8000 / dist2 * physicsAlpha;
        fx = dx * force;
        fy = dy * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    /* Edge attraction */
    for (i = 0; i < edges.length; i++) {
      var a = nodes[edges[i].from], b = nodes[edges[i].to];
      dx = b.x - a.x;
      dy = b.y - a.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      force = (dist - 150) * 0.008 * physicsAlpha;
      fx = (dx / dist) * force;
      fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    /* Center gravity — pull nodes toward origin to prevent drift */
    for (i = 0; i < nodes.length; i++) {
      nodes[i].vx -= nodes[i].x * 0.002 * physicsAlpha;
      nodes[i].vy -= nodes[i].y * 0.002 * physicsAlpha;
    }

    /* Apply velocity with damping */
    for (i = 0; i < nodes.length; i++) {
      if (nodeDrag.active && nodeDrag.node === nodes[i]) continue;
      nodes[i].vx *= 0.6;
      nodes[i].vy *= 0.6;
      nodes[i].x += nodes[i].vx;
      nodes[i].y += nodes[i].vy;
    }
  }

  var physicsRunning = false;
  function startPhysicsLoop() {
    if (physicsRunning) return;
    physicsRunning = true;
    function loop() {
      tickPhysics();
      render();
      animFrame = requestAnimationFrame(loop);
    }
    loop();
  }

  /* ── Rendering ── */
  function render() {
    var w = canvas.width / devicePixelRatio;
    var h = canvas.height / devicePixelRatio;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + camera.x, h / 2 + camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    var style = getComputedStyle(document.body);
    var edgeColor = style.getPropertyValue("--edge-color").trim() || "rgba(129,140,248,0.15)";

    /* Edge dash patterns — each edge gets a unique style */
    var dashPatterns = [
      [],                // solid
      [6, 4],            // dashed
      [2, 3],            // dotted
      [8, 3, 2, 3],     // dash-dot
      [12, 4, 2, 4],    // long dash-dot
      [4, 2, 4, 2, 8, 2], // double-dash
    ];

    /* Draw edges */
    for (var ei = 0; ei < edges.length; ei++) {
      var ea = nodes[edges[ei].from], eb = nodes[edges[ei].to];
      ctx.beginPath();
      ctx.setLineDash(dashPatterns[ei % dashPatterns.length]);
      ctx.moveTo(ea.x, ea.y);
      ctx.lineTo(eb.x, eb.y);
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = Math.min(3, 0.5 + (edges[ei].weight || 1) * 0.3);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    var typeColors = { text: "#818cf8", image: "#f59e0b", link: "#10b981", audio: "#8b5cf6", ai_extract: "#ec4899" };

    /* Draw nodes */
    for (var ni = 0; ni < nodes.length; ni++) {
      var n = nodes[ni];
      var isHover = hoverNode === n;
      var isSelected = selectedNode === n;

      /* Glow ring */
      if (isHover || isSelected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = n.color.replace("60%)", "60%, 0.2)").replace("hsl(", "hsla(");
        ctx.fill();
      }

      /* Node circle with gradient */
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

      /* Favicon (drawn inside the node, top-center) */
      if (n.faviconImg && n.faviconImg.complete && n.faviconImg.naturalWidth > 0) {
        var iconSize = Math.max(12, n.radius * 0.45);
        try {
          ctx.drawImage(n.faviconImg, n.x - iconSize / 2, n.y - n.radius * 0.55 - iconSize / 2, iconSize, iconSize);
        } catch (e) { /* CORS or decode error */ }
      }

      /* Domain label */
      var fontSize = Math.max(9, Math.min(13, n.radius * 0.4));
      var labelY = n.faviconImg ? n.y + 2 : n.y - 2;
      ctx.font = "600 " + fontSize + "px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      var label = n.domain.length > 18 ? n.domain.slice(0, 16) + ".." : n.domain;
      ctx.fillText(label, n.x, labelY);

      /* Record count */
      ctx.font = "500 " + (fontSize - 2) + "px -apple-system, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(n.records.length + " rec", n.x, labelY + fontSize);

      /* Type ring segments */
      var typeKeys = Object.keys(n.types);
      if (typeKeys.length > 1) {
        var total = n.records.length;
        var startA = -Math.PI / 2;
        for (var ti = 0; ti < typeKeys.length; ti++) {
          var slice = (n.types[typeKeys[ti]] / total) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 3, startA, startA + slice);
          ctx.strokeStyle = typeColors[typeKeys[ti]] || "#818cf8";
          ctx.lineWidth = 3;
          ctx.stroke();
          startA += slice;
        }
      }
    }

    ctx.restore();

    var zoomEl = $("#zoom-level");
    if (zoomEl) zoomEl.textContent = Math.round(camera.zoom * 100) + "%";
  }

  /* ── Interaction: Pan, Zoom, Node Drag ── */
  canvas.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    var hit = hitTest(e);
    if (hit) {
      /* Start dragging this node */
      var coords = screenToWorld(e);
      nodeDrag.active = true;
      nodeDrag.node = hit;
      nodeDrag.offX = hit.x - coords.x;
      nodeDrag.offY = hit.y - coords.y;
      /* Re-heat physics so neighbors settle */
      physicsAlpha = Math.max(physicsAlpha, 0.3);
      canvas.style.cursor = "grabbing";
      return;
    }
    panDrag.active = true;
    panDrag.startX = e.clientX;
    panDrag.startY = e.clientY;
    panDrag.camStartX = camera.x;
    panDrag.camStartY = camera.y;
  });

  canvas.addEventListener("mousemove", function (e) {
    if (nodeDrag.active && nodeDrag.node) {
      var coords = screenToWorld(e);
      nodeDrag.node.x = coords.x + nodeDrag.offX;
      nodeDrag.node.y = coords.y + nodeDrag.offY;
      nodeDrag.node.vx = 0;
      nodeDrag.node.vy = 0;
      return;
    }
    if (panDrag.active) {
      camera.x = panDrag.camStartX + (e.clientX - panDrag.startX);
      camera.y = panDrag.camStartY + (e.clientY - panDrag.startY);
      return;
    }
    var hit = hitTest(e);
    if (hit !== hoverNode) {
      hoverNode = hit;
      canvas.style.cursor = hit ? "pointer" : "grab";
      updateTooltip(e, hit);
    } else if (hit) {
      updateTooltip(e, hit);
    }
  });

  canvas.addEventListener("mouseup", function (e) {
    if (nodeDrag.active) {
      /* If it was a click (not a real drag), select the node */
      if (nodeDrag.node) selectNode(nodeDrag.node);
      nodeDrag.active = false;
      nodeDrag.node = null;
      canvas.style.cursor = "grab";
      return;
    }
    panDrag.active = false;
  });

  canvas.addEventListener("mouseleave", function () {
    panDrag.active = false;
    nodeDrag.active = false;
    nodeDrag.node = null;
    hoverNode = null;
    var tt = $("#tooltip");
    if (tt) tt.classList.add("hidden");
  });

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left - rect.width / 2;
    var my = e.clientY - rect.top - rect.height / 2;
    var factor = e.deltaY > 0 ? 0.9 : 1.1;
    var newZoom = Math.max(0.1, Math.min(8, camera.zoom * factor));
    /* Adjust camera so the world point under the cursor stays fixed */
    camera.x = mx - (mx - camera.x) * (newZoom / camera.zoom);
    camera.y = my - (my - camera.y) * (newZoom / camera.zoom);
    camera.zoom = newZoom;
  }, { passive: false });

  /* Touch support */
  var lastTouchDist = 0;
  canvas.addEventListener("touchstart", function (e) {
    if (e.touches.length === 1) {
      panDrag.active = true;
      panDrag.startX = e.touches[0].clientX;
      panDrag.startY = e.touches[0].clientY;
      panDrag.camStartX = camera.x;
      panDrag.camStartY = camera.y;
    } else if (e.touches.length === 2) {
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
    }
  });
  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    if (e.touches.length === 1 && panDrag.active) {
      camera.x = panDrag.camStartX + (e.touches[0].clientX - panDrag.startX);
      camera.y = panDrag.camStartY + (e.touches[0].clientY - panDrag.startY);
    } else if (e.touches.length === 2) {
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDist > 0) {
        camera.zoom = Math.max(0.1, Math.min(8, camera.zoom * (dist / lastTouchDist)));
      }
      lastTouchDist = dist;
    }
  }, { passive: false });
  canvas.addEventListener("touchend", function () { panDrag.active = false; lastTouchDist = 0; });

  /* Convert screen coords to world coords */
  function screenToWorld(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - rect.width / 2 - camera.x) / camera.zoom,
      y: (e.clientY - rect.top - rect.height / 2 - camera.y) / camera.zoom
    };
  }

  function hitTest(e) {
    var m = screenToWorld(e);
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      var dx = m.x - n.x, dy = m.y - n.y;
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
    var tagsHtml = "";
    if (node.tags && node.tags.length > 0) {
      tagsHtml = '<div class="tt-tags">' + node.tags.map(function (t) { return '<span class="tt-tag">' + escapeHtml(t) + '</span>'; }).join("") + '</div>';
    }
    tt.innerHTML = '<span class="tt-domain">' + escapeHtml(node.domain) + '</span>'
      + '<span class="tt-meta">'
      + node.records.length + " records | " + formatBytes(node.dataSize) + "<br>"
      + types
      + (node.timeMs > 0 ? "<br>Time: " + (node.timeMs / 1000).toFixed(1) + "s" : "")
      + '</span>'
      + tagsHtml;
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

    /* Tags */
    var tagsEl = $("#sp-tags");
    if (tagsEl) {
      if (node.tags && node.tags.length > 0) {
        tagsEl.innerHTML = node.tags.map(function (t) { return '<span class="sp-tag">' + escapeHtml(t) + '</span>'; }).join("");
      } else {
        tagsEl.textContent = "none";
      }
    }

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
    var h = 340;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = w + "px";
    c.style.height = h + "px";
    var sc = c.getContext("2d");
    sc.setTransform(dpr, 0, 0, dpr, 0, 0);

    var style = getComputedStyle(document.body);
    var bgSec = style.getPropertyValue("--bg-secondary").trim();
    var bgTer = style.getPropertyValue("--bg-tertiary").trim();
    var border = style.getPropertyValue("--border").trim();
    var textPri = style.getPropertyValue("--text-primary").trim();
    var textSec = style.getPropertyValue("--text-secondary").trim();
    var textMut = style.getPropertyValue("--text-muted").trim();
    var accent = style.getPropertyValue("--accent").trim();

    sc.fillStyle = bgSec;
    sc.fillRect(0, 0, w, h);

    // Flow: Domain -> Pages -> Types -> Stats
    var types = Object.entries(node.types);
    var pages = {};
    var pageTypes = {}; /* track which types each page has */
    node.records.forEach(function (r) {
      var url = r.source_url || "unknown";
      try { url = new URL(url).pathname || "/"; } catch (e) { url = "/"; }
      if (url.length > 30) url = url.slice(0, 28) + "..";
      pages[url] = (pages[url] || 0) + 1;
      if (!pageTypes[url]) pageTypes[url] = {};
      var t = r.type || "text";
      pageTypes[url][t] = (pageTypes[url][t] || 0) + 1;
    });
    var pageEntries = Object.entries(pages).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);

    var typeColors = { text: "#818cf8", image: "#f59e0b", link: "#10b981", audio: "#8b5cf6", ai_extract: "#ec4899" };

    // Column positions — 4 columns now
    var col1 = 55, col2 = w * 0.32, col3 = w * 0.62, col4 = w * 0.88;
    var headerY = 22;
    var rowStart = 42;

    // Column headers with subtle underline
    sc.fillStyle = textMut;
    sc.font = "700 8px -apple-system, sans-serif";
    sc.textAlign = "center";
    sc.fillText("DOMAIN", col1, headerY);
    sc.fillText("PAGES", col2, headerY);
    sc.fillText("TYPES", col3, headerY);
    sc.fillText("STATS", col4, headerY);
    sc.beginPath();
    sc.moveTo(10, headerY + 8);
    sc.lineTo(w - 10, headerY + 8);
    sc.strokeStyle = border;
    sc.lineWidth = 0.5;
    sc.stroke();

    // Draw flow arrow helper
    function drawFlowArrow(x1, y1, x2, y2, color, width) {
      var cp1x = x1 + (x2 - x1) * 0.5;
      sc.beginPath();
      sc.moveTo(x1, y1);
      sc.bezierCurveTo(cp1x, y1, cp1x, y2, x2, y2);
      sc.strokeStyle = color;
      sc.lineWidth = width || 1;
      sc.stroke();
      // Arrow tip
      var angle = Math.atan2(y2 - (y1 + y2) / 2, x2 - cp1x);
      var aLen = 4;
      sc.beginPath();
      sc.moveTo(x2, y2);
      sc.lineTo(x2 - aLen * Math.cos(angle - 0.4), y2 - aLen * Math.sin(angle - 0.4));
      sc.lineTo(x2 - aLen * Math.cos(angle + 0.4), y2 - aLen * Math.sin(angle + 0.4));
      sc.closePath();
      sc.fillStyle = color;
      sc.fill();
    }

    // Domain node (root) — pill shape with favicon
    var domNodeY = (rowStart + h) / 2;
    sc.fillStyle = accent;
    drawRoundRect(sc, col1 - 40, domNodeY - 20, 80, 40, 10);
    sc.fill();
    /* subtle shadow */
    sc.shadowColor = accent + "44";
    sc.shadowBlur = 8;
    sc.fill();
    sc.shadowColor = "transparent";
    sc.shadowBlur = 0;

    if (node.faviconImg && node.faviconImg.complete && node.faviconImg.naturalWidth > 0) {
      try { sc.drawImage(node.faviconImg, col1 - 8, domNodeY - 16, 16, 16); } catch (e) {}
      sc.fillStyle = "#fff";
      sc.font = "600 9px -apple-system, sans-serif";
      sc.textAlign = "center";
      sc.textBaseline = "middle";
      var domLabel = node.domain.length > 10 ? node.domain.slice(0, 8) + ".." : node.domain;
      sc.fillText(domLabel, col1, domNodeY + 8);
    } else {
      sc.fillStyle = "#fff";
      sc.font = "600 10px -apple-system, sans-serif";
      sc.textAlign = "center";
      sc.textBaseline = "middle";
      var domLabel2 = node.domain.length > 10 ? node.domain.slice(0, 8) + ".." : node.domain;
      sc.fillText(domLabel2, col1, domNodeY - 2);
      sc.font = "400 8px -apple-system, sans-serif";
      sc.fillStyle = "rgba(255,255,255,0.7)";
      sc.fillText(node.records.length + " rec", col1, domNodeY + 10);
    }

    // Draw page nodes
    var usableH = h - rowStart - 20;
    var pageSpacing = Math.min(36, usableH / Math.max(pageEntries.length, 1));
    var pageStartY = rowStart + (usableH - pageEntries.length * pageSpacing) / 2;

    pageEntries.forEach(function (pe, i) {
      var py = pageStartY + i * pageSpacing + pageSpacing / 2;

      // Flow arrow from domain to page
      drawFlowArrow(col1 + 40, domNodeY, col2 - 52, py, border, 1);

      // Page box with record count bar
      var boxW = 104, boxH = 26;
      sc.fillStyle = bgTer;
      drawRoundRect(sc, col2 - boxW / 2, py - boxH / 2, boxW, boxH, 5);
      sc.fill();
      sc.strokeStyle = border;
      sc.lineWidth = 0.5;
      sc.stroke();

      // Mini progress bar showing relative size
      var barMax = pageEntries[0][1]; // largest page
      var barW = (pe[1] / barMax) * (boxW - 8);
      sc.fillStyle = accent + "22";
      drawRoundRect(sc, col2 - boxW / 2 + 4, py + boxH / 2 - 5, barW, 3, 1.5);
      sc.fill();

      sc.fillStyle = textPri;
      sc.font = "500 8.5px -apple-system, sans-serif";
      sc.textAlign = "center";
      var pathLabel = pe[0].length > 12 ? pe[0].slice(0, 10) + ".." : pe[0];
      sc.fillText(pathLabel, col2, py - 1);
      sc.font = "600 7px -apple-system, sans-serif";
      sc.fillStyle = textMut;
      sc.fillText(pe[1] + " records", col2, py + 9);
    });

    // Draw type nodes — only draw edges from pages that have that type
    var typeSpacing = Math.min(44, usableH / Math.max(types.length, 1));
    var typeStartY = rowStart + (usableH - types.length * typeSpacing) / 2;

    types.forEach(function (te, i) {
      var ty = typeStartY + i * typeSpacing + typeSpacing / 2;
      var tColor = typeColors[te[0]] || accent;

      // Edges from pages that actually contain this type
      pageEntries.forEach(function (pe, pi) {
        if (!pageTypes[pe[0]] || !pageTypes[pe[0]][te[0]]) return;
        var py = pageStartY + pi * pageSpacing + pageSpacing / 2;
        var thickness = Math.min(2.5, 0.5 + pageTypes[pe[0]][te[0]] * 0.3);
        drawFlowArrow(col2 + 52, py, col3 - 38, ty, tColor + "66", thickness);
      });

      // Type pill
      sc.fillStyle = tColor;
      drawRoundRect(sc, col3 - 36, ty - 14, 72, 28, 7);
      sc.fill();

      // Icon character for type
      var typeIcons = { text: "\u2261", image: "\u25A3", link: "\u26D3", audio: "\u266B", ai_extract: "\u2726" };
      sc.fillStyle = "rgba(255,255,255,0.9)";
      sc.font = "400 11px -apple-system, sans-serif";
      sc.textAlign = "center";
      sc.fillText(typeIcons[te[0]] || "\u25CF", col3 - 18, ty + 1);

      sc.fillStyle = "#fff";
      sc.font = "700 9px -apple-system, sans-serif";
      sc.fillText(te[0], col3 + 6, ty - 2);
      sc.font = "500 7.5px -apple-system, sans-serif";
      sc.fillStyle = "rgba(255,255,255,0.75)";
      sc.fillText(te[1] + " rec", col3 + 6, ty + 8);
    });

    // Stats column — summary boxes
    var statsData = [
      { label: "Total", value: node.records.length + "", color: accent },
      { label: "Size", value: formatBytes(node.dataSize), color: "#06b6d4" },
      { label: "Time", value: node.timeMs > 0 ? (node.timeMs / 1000).toFixed(1) + "s" : "N/A", color: "#10b981" },
      { label: "Tags", value: (node.tags || []).length + "", color: "#f59e0b" },
    ];
    var statSpacing = Math.min(46, usableH / statsData.length);
    var statStartY = rowStart + (usableH - statsData.length * statSpacing) / 2;

    statsData.forEach(function (st, i) {
      var sy = statStartY + i * statSpacing + statSpacing / 2;

      // Flow arrow from types to stats (only for first stat)
      if (i === 0) {
        types.forEach(function (te, ti) {
          var ty = typeStartY + ti * typeSpacing + typeSpacing / 2;
          drawFlowArrow(col3 + 36, ty, col4 - 28, sy, border + "66", 0.5);
        });
      }

      // Stat box
      sc.fillStyle = bgTer;
      drawRoundRect(sc, col4 - 26, sy - 13, 52, 26, 5);
      sc.fill();
      sc.strokeStyle = st.color + "55";
      sc.lineWidth = 1;
      sc.stroke();

      sc.fillStyle = st.color;
      sc.font = "700 10px -apple-system, sans-serif";
      sc.textAlign = "center";
      sc.fillText(st.value, col4, sy - 1);
      sc.fillStyle = textMut;
      sc.font = "600 7px -apple-system, sans-serif";
      sc.fillText(st.label, col4, sy + 9);
    });
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
    physicsAlpha = 1.0; /* reheat */
  });

  /* ── Reorganize: re-scatter nodes into a new spiral layout and reheat physics ── */
  var btnReorg = $("#btn-reorganize");
  if (btnReorg) btnReorg.addEventListener("click", function () {
    for (var i = 0; i < nodes.length; i++) {
      var angle = i * 2.4;
      var dist = 80 + i * 25;
      nodes[i].x = Math.cos(angle) * dist;
      nodes[i].y = Math.sin(angle) * dist;
      nodes[i].vx = 0;
      nodes[i].vy = 0;
    }
    physicsAlpha = 1.0;
    physicsLocked = false;
    var lockBtn = $("#btn-lock");
    if (lockBtn) {
      lockBtn.classList.remove("locked");
      lockBtn.innerHTML = "&#128274; Lock";
    }
    var badge = $("#physics-badge");
    if (badge) {
      badge.textContent = "Physics: ON";
      badge.classList.remove("off");
    }
    fitView();
  });

  /* ── Lock/Unlock movement ── */
  var btnLock = $("#btn-lock");
  if (btnLock) {
    btnLock.addEventListener("click", function () {
      physicsLocked = !physicsLocked;
      btnLock.classList.toggle("locked", physicsLocked);
      btnLock.innerHTML = physicsLocked ? "&#128275; Unlock" : "&#128274; Lock";
      var badge = $("#physics-badge");
      if (badge) {
        badge.textContent = physicsLocked ? "Physics: OFF" : "Physics: ON";
        badge.classList.toggle("off", physicsLocked);
      }
      if (!physicsLocked) physicsAlpha = 0.5; /* reheat on unlock */
    });
  }

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
    var rows = ["domain,records,data_size_bytes,time_ms,text,images,links,audio,ai_extract,tags"];
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
        '"' + (n.tags || []).join(";") + '"',
      ].join(","));
    });
    downloadBlob(new Blob([rows.join("\n")], { type: "text/csv" }), "gwss-sites.csv");
  }

  /* ── Export: JSON ── */
  var btnJson = $("#btn-export-json");
  if (btnJson) btnJson.addEventListener("click", function () { exportJSON(); });

  function exportJSON() {
    var data = {
      version: "0.7.1.1",
      exported: new Date().toISOString(),
      nodes: nodes.map(function (n) {
        return {
          id: n.id,
          domain: n.domain,
          records: n.records.length,
          dataSize: n.dataSize,
          timeMs: n.timeMs,
          types: n.types,
          tags: n.tags || [],
          x: Math.round(n.x),
          y: Math.round(n.y),
        };
      }),
      edges: edges.map(function (e) {
        return { source: nodes[e.from].domain, target: nodes[e.to].domain, weight: e.weight };
      })
    };
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "gwss-graph.json");
  }

  /* ── Export: GraphML ── */
  var btnGraphML = $("#btn-export-graphml");
  if (btnGraphML) btnGraphML.addEventListener("click", function () { exportGraphML(); });

  function exportGraphML() {
    var esc = function (s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<graphml xmlns="http://graphml.graphstudio.org/xmlns">\n';
    xml += '  <key id="d0" for="node" attr.name="domain" attr.type="string"/>\n';
    xml += '  <key id="d1" for="node" attr.name="records" attr.type="int"/>\n';
    xml += '  <key id="d2" for="node" attr.name="dataSize" attr.type="int"/>\n';
    xml += '  <key id="d3" for="node" attr.name="tags" attr.type="string"/>\n';
    xml += '  <key id="d4" for="edge" attr.name="weight" attr.type="int"/>\n';
    xml += '  <graph id="GwSS" edgedefault="undirected">\n';
    nodes.forEach(function (n) {
      xml += '    <node id="n' + n.id + '">\n';
      xml += '      <data key="d0">' + esc(n.domain) + '</data>\n';
      xml += '      <data key="d1">' + n.records.length + '</data>\n';
      xml += '      <data key="d2">' + n.dataSize + '</data>\n';
      xml += '      <data key="d3">' + esc((n.tags || []).join(", ")) + '</data>\n';
      xml += '    </node>\n';
    });
    edges.forEach(function (e, i) {
      xml += '    <edge id="e' + i + '" source="n' + e.from + '" target="n' + e.to + '">\n';
      xml += '      <data key="d4">' + (e.weight || 1) + '</data>\n';
      xml += '    </edge>\n';
    });
    xml += '  </graph>\n</graphml>\n';
    downloadBlob(new Blob([xml], { type: "application/xml" }), "gwss-graph.graphml");
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

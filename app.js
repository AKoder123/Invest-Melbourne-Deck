/* =====================================================================
   FlowPitch — Invest Melbourne Advisory Board Prep
   Vanilla JS. One shared renderer powers Edit / Thumbnail / Present / PDF.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------- constants */
  const CONTENT_URL = "content.json";
  const FALLBACK_DECK_ID = "flowpitch-deck";
  const lsKey = (id) => `flowpitch:${id}:draft`;

  const THEMES = {
    "civic-gold":   { gold: "#e8b65a", soft: "#f3d493", deep: "#c8923a", teal: "#5ad7c8" },
    "harbor-teal":  { gold: "#5ad7c8", soft: "#9ff0e6", deep: "#2b8f86", teal: "#e8b65a" },
    "violet-civic": { gold: "#a98bff", soft: "#cdbcff", deep: "#6c4bd6", teal: "#5ad7c8" },
    "ember":        { gold: "#ff8a5c", soft: "#ffb89c", deep: "#d6492b", teal: "#ffce5c" },
  };

  const TYPE_LABELS = {
    title: "Title", section: "Section", content: "Content", cards: "Cards",
    proof: "Proof", process: "Process", beforeAfter: "Before / After",
    visual: "Visual", closing: "Closing",
  };

  /* ------------------------------------------------------------- state */
  let deck = null;
  let selected = 0;
  let storageOK = true;
  let saveTimer = null;
  let present = { open: false, index: 0 };

  /* ------------------------------------------------------------- $ refs */
  const $ = (id) => document.getElementById(id);
  const editorFrame = $("editorFrame");
  const railList = $("railList");
  const deckTitleEl = $("deckTitle");
  const presentEl = $("present");
  const presentFrame = $("presentFrame");
  const presentBg = $("presentBg");
  const pdfStage = $("pdfStage");
  const toastEl = $("toast");

  /* =====================================================================
     UTILITIES
     ===================================================================== */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function getByPath(obj, path) {
    return path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);
  }
  function setByPath(obj, path, val) {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (cur[keys[i]] == null) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = val;
  }

  let toastTimer = null;
  function toast(msg, ms = 3200) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-show"), ms);
  }

  function applyTheme(name) {
    const t = THEMES[name] || THEMES["civic-gold"];
    const r = document.documentElement.style;
    r.setProperty("--gold", t.gold);
    r.setProperty("--gold-soft", t.soft);
    r.setProperty("--gold-deep", t.deep);
    r.setProperty("--teal", t.teal);
  }

  /* =====================================================================
     LOAD / SAVE
     ===================================================================== */
  function loadDeck() {
    // Try localStorage first only after we know the deckId; so fetch original,
    // then prefer a saved draft for that id.
    fetchJSON(CONTENT_URL)
      .then((original) => {
        const id = (original.meta && original.meta.deckId) || FALLBACK_DECK_ID;
        const draft = readDraft(id);
        deck = draft || original;
        deck._originalRef = original; // kept in memory only (not serialized below)
        boot();
      })
      .catch(() => {
        // fetch failed (often file:// restrictions). Try any saved draft.
        const draft = readAnyDraft();
        if (draft) { deck = draft; boot(); return; }
        showFetchFallback();
      });
  }

  function fetchJSON(url) {
    if (window.fetch && location.protocol !== "file:") {
      return fetch(url, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error("bad status");
        return r.json();
      });
    }
    // file:// — attempt XHR (works in some browsers), else reject
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
              try { resolve(JSON.parse(xhr.responseText)); }
              catch (e) { reject(e); }
            } else reject(new Error("xhr status " + xhr.status));
          }
        };
        xhr.onerror = () => reject(new Error("xhr error"));
        xhr.send();
      } catch (e) { reject(e); }
    });
  }

  function readDraft(id) {
    if (!storageOK) return null;
    try {
      const raw = localStorage.getItem(lsKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function readAnyDraft() {
    if (!storageOK) return null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("flowpitch:") && k.endsWith(":draft")) {
          return JSON.parse(localStorage.getItem(k));
        }
      }
    } catch (e) {}
    return null;
  }

  function serialDeck() {
    const d = clone(deck);
    delete d._originalRef;
    return d;
  }

  function saveDraft() {
    if (!storageOK) return;
    try {
      const id = deck.meta.deckId || FALLBACK_DECK_ID;
      localStorage.setItem(lsKey(id), JSON.stringify(serialDeck()));
    } catch (e) {
      storageOK = false;
      toast("Heads up: edits can't be saved (storage unavailable). Changes stay in memory only.");
    }
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveDraft(); renderRail(); }, 320);
  }

  function showFetchFallback() {
    editorFrame.innerHTML =
      '<div class="slide slide--section" style="padding:7cqw 8cqw">' +
      '<div class="eyebrow">FlowPitch</div>' +
      '<h1 class="headline" style="font-size:4cqw">Open via a local server to load content.json</h1>' +
      '<p class="subheadline">Some browsers block file access for local files. ' +
      'Run a tiny server in this folder, e.g. <b>python3 -m http.server</b>, then open the shown address.</p>' +
      "</div>";
    toast("content.json could not be loaded directly. Start a local server, then reload.", 7000);
  }

  /* =====================================================================
     BOOT
     ===================================================================== */
  function boot() {
    if (!deck.meta) deck.meta = { deckId: FALLBACK_DECK_ID, title: "Untitled deck", theme: "civic-gold" };
    if (!Array.isArray(deck.slides) || deck.slides.length === 0) {
      deck.slides = [blankSlide("title")];
    }
    selected = Math.min(selected, deck.slides.length - 1);
    applyTheme(deck.meta.theme || "civic-gold");
    deckTitleEl.textContent = deck.meta.title || "Untitled deck";
    renderAll();
    measureTopbar();
  }

  function renderAll() {
    renderEditor();
    renderRail();
    renderInspector();
  }

  /* =====================================================================
     SHARED SLIDE RENDERER  (the heart of the app)
     mode: "edit" | "present" | "thumbnail" | "pdf"
     ===================================================================== */
  function renderSlide(slide, index, mode) {
    const isEdit = mode === "edit";
    const isPresent = mode === "present";
    let d = 0; // stagger counter

    // editable text element
    const ed = (path, val, tag, cls, opt) => {
      opt = opt || {};
      const animate = opt.animate !== false;
      const safe = esc(val);
      if (isEdit) {
        return `<${tag} class="${cls}" contenteditable="true" spellcheck="true" ` +
          `data-edit-path="slides.${index}.${path}" data-placeholder="${esc(opt.ph || "")}">${safe}</${tag}>`;
      }
      const a = isPresent && animate
        ? ` data-animate${opt.dir ? `="${opt.dir}"` : ""} style="--d:${d++}"` : "";
      return `<${tag} class="${cls}"${a}>${safe}</${tag}>`;
    };
    // animation wrapper attrs for containers (cards, metrics, etc.)
    const wA = (dir) => (isPresent ? ` data-animate${dir ? `="${dir}"` : ""} style="--d:${d++}"` : "");
    const gradCls = isEdit ? "" : " grad"; // gradient text only outside edit mode

    const t = slide.type || "content";
    const el = document.createElement("div");
    el.className = "slide slide--" + t;
    el.setAttribute("data-type", t);

    let h = '<div class="slide-bg"></div>';

    if (t === "title") {
      h += '<div class="slide-grid"></div>';
      if (slide.eyebrow !== undefined) h += ed("eyebrow", slide.eyebrow, "div", "eyebrow", { ph: "Eyebrow" });
      h += ed("headline", slide.headline || "", "h1", "headline" + gradCls, { ph: "Headline" });
      if (slide.subheadline !== undefined) h += ed("subheadline", slide.subheadline, "p", "subheadline", { ph: "Subheadline" });
      if (slide.cta !== undefined) h += ed("cta", slide.cta, "div", "title-meta", { ph: "Footer / metadata" });

    } else if (t === "section") {
      h += `<div class="section-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</div>`;
      if (slide.eyebrow !== undefined) h += ed("eyebrow", slide.eyebrow, "div", "eyebrow", { ph: "Eyebrow" });
      h += ed("headline", slide.headline || "", "h2", "headline", { ph: "Section title" });
      if (slide.subheadline !== undefined) h += ed("subheadline", slide.subheadline, "p", "subheadline", { ph: "Subheadline" });

    } else if (t === "content") {
      if (slide.eyebrow !== undefined) h += ed("eyebrow", slide.eyebrow, "div", "eyebrow", { ph: "Eyebrow" });
      h += ed("headline", slide.headline || "", "h2", "headline", { ph: "Headline" });
      if (slide.subheadline !== undefined) h += ed("subheadline", slide.subheadline, "p", "subheadline", { ph: "Subheadline" });
      const bullets = slide.bullets || [];
      if (bullets.length) {
        h += "<ul class='bullets'>";
        bullets.forEach((b, i) => {
          h += ed("bullets." + i, b, "li", "", { ph: "Bullet" });
        });
        h += "</ul>";
      }

    } else if (t === "cards") {
      if (slide.eyebrow !== undefined) h += ed("eyebrow", slide.eyebrow, "div", "eyebrow", { ph: "Eyebrow" });
      h += ed("headline", slide.headline || "", "h2", "headline", { ph: "Headline" });
      if (slide.subheadline !== undefined) h += ed("subheadline", slide.subheadline, "p", "subheadline", { ph: "Subheadline" });
      const cards = slide.cards || [];
      h += `<div class="card-grid" data-count="${cards.length}">`;
      cards.forEach((c, i) => {
        h += `<div class="card"${wA()}>`;
        h += ed("cards." + i + ".title", c.title || "", "h3", "card-title", { ph: "Card title", animate: false });
        h += ed("cards." + i + ".body", c.body || "", "p", "card-body", { ph: "Card body", animate: false });
        h += "</div>";
      });
      h += "</div>";

    } else if (t === "proof") {
      if (slide.eyebrow !== undefined) h += ed("eyebrow", slide.eyebrow, "div", "eyebrow", { ph: "Eyebrow" });
      h += ed("headline", slide.headline || "", "h2", "headline", { ph: "Headline" });
      if (slide.subheadline !== undefined) h += ed("subheadline", slide.subheadline, "p", "subheadline", { ph: "Subheadline" });
      const metrics = slide.metrics || [];
      h += "<div class='metric-grid'>";
      metrics.forEach((m, i) => {
        h += `<div class="metric"${wA("scale")}>`;
        if (isEdit) {
          h += `<div class="metric-value" contenteditable="true" spellcheck="false" data-edit-path="slides.${index}.metrics.${i}.value" data-placeholder="Value">${esc(m.value)}</div>`;
        } else if (isPresent) {
          h += `<div class="metric-value" data-countup data-target="${esc(m.value)}">${esc(m.value)}</div>`;
        } else {
          h += `<div class="metric-value">${esc(m.value)}</div>`;
        }
        h += ed("metrics." + i + ".label", m.label || "", "span", "metric-label", { ph: "Label", animate: false });
        h += "</div>";
      });
      h += "</div>";

    } else if (t === "process") {
      if (slide.eyebrow !== undefined) h += ed("eyebrow", slide.eyebrow, "div", "eyebrow", { ph: "Eyebrow" });
      h += ed("headline", slide.headline || "", "h2", "headline", { ph: "Headline" });
      const steps = slide.steps || [];
      h += "<div class='process-flow'><div class='process-line'></div>";
      steps.forEach((s, i) => {
        h += `<div class="step"${wA()}>`;
        h += `<div class="step-num" aria-hidden="true">${i + 1}</div>`;
        h += ed("steps." + i + ".title", s.title || "", "h3", "step-title", { ph: "Step title", animate: false });
        h += ed("steps." + i + ".body", s.body || "", "p", "step-body", { ph: "Step body", animate: false });
        h += "</div>";
      });
      h += "</div>";

    } else if (t === "beforeAfter") {
      if (slide.eyebrow !== undefined) h += ed("eyebrow", slide.eyebrow, "div", "eyebrow", { ph: "Eyebrow" });
      h += ed("headline", slide.headline || "", "h2", "headline", { ph: "Headline" });
      const L = slide.left || { title: "", bullets: [] };
      const R = slide.right || { title: "", bullets: [] };
      h += "<div class='ba-grid'>";
      h += `<div class="ba-col ba-col--before"${wA("left")}>`;
      h += ed("left.title", L.title || "", "h4", "", { ph: "Before", animate: false });
      h += "<ul>";
      (L.bullets || []).forEach((b, i) => { h += ed("left.bullets." + i, b, "li", "", { ph: "Point", animate: false }); });
      h += "</ul></div>";
      h += `<div class="ba-arrow" aria-hidden="true"${wA("scale")}>&rarr;</div>`;
      h += `<div class="ba-col ba-col--after"${wA("right")}>`;
      h += ed("right.title", R.title || "", "h4", "", { ph: "After", animate: false });
      h += "<ul>";
      (R.bullets || []).forEach((b, i) => { h += ed("right.bullets." + i, b, "li", "", { ph: "Point", animate: false }); });
      h += "</ul></div>";
      h += "</div>";

    } else if (t === "visual") {
      h += '<div class="quote-mark" aria-hidden="true">&ldquo;</div>';
      if (slide.eyebrow !== undefined) h += ed("eyebrow", slide.eyebrow, "div", "eyebrow", { ph: "Eyebrow" });
      h += ed("headline", slide.headline || "", "h2", "headline", { ph: "Statement" });
      if (slide.subheadline !== undefined) h += ed("subheadline", slide.subheadline, "p", "subheadline", { ph: "Subheadline" });
      if (slide.cta !== undefined) h += ed("cta", slide.cta, "div", "visual-attr", { ph: "Attribution" });

    } else if (t === "closing") {
      h += '<div class="slide-grid"></div>';
      if (slide.eyebrow !== undefined) h += ed("eyebrow", slide.eyebrow, "div", "eyebrow", { ph: "Eyebrow" });
      h += ed("headline", slide.headline || "", "h2", "headline" + gradCls, { ph: "Closing message" });
      if (slide.cta !== undefined) h += ed("cta", slide.cta, "div", "cta", { ph: "Call to action" });
    } else {
      h += ed("headline", slide.headline || "", "h2", "headline", { ph: "Headline" });
    }

    el.innerHTML = h;
    return el;
  }

  /* =====================================================================
     EDITOR CANVAS
     ===================================================================== */
  function renderEditor() {
    editorFrame.classList.add("mode-edit");
    editorFrame.innerHTML = "";
    const slide = deck.slides[selected];
    if (!slide) return;
    editorFrame.appendChild(renderSlide(slide, selected, "edit"));
  }

  // input handling (delegated) — update state, keep cursor, debounce save
  editorFrame.addEventListener("input", (e) => {
    const el = e.target.closest("[data-edit-path]");
    if (!el) return;
    setByPath(deck, el.getAttribute("data-edit-path"), el.innerText);
    scheduleSave();
  });
  // plain-text paste
  editorFrame.addEventListener("paste", (e) => {
    if (!e.target.closest("[contenteditable]")) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  /* =====================================================================
     THUMBNAIL RAIL
     ===================================================================== */
  function renderRail() {
    railList.innerHTML = "";
    deck.slides.forEach((slide, i) => {
      const item = document.createElement("div");
      item.className = "thumb" + (i === selected ? " is-selected" : "");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", i === selected ? "true" : "false");
      item.innerHTML = `<span class="thumb-num">${i + 1}</span><div class="thumb-frame"></div>`;
      const frame = item.querySelector(".thumb-frame");
      frame.appendChild(renderSlide(slide, i, "thumbnail"));
      item.addEventListener("click", () => selectSlide(i));
      railList.appendChild(item);
    });
  }

  function selectSlide(i) {
    selected = Math.max(0, Math.min(i, deck.slides.length - 1));
    renderEditor();
    renderRail();
    renderInspector();
    const sel = railList.children[selected];
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /* =====================================================================
     INSPECTOR
     ===================================================================== */
  function renderInspector() {
    const slide = deck.slides[selected];
    if (!slide) return;
    $("slideTypeSelect").value = slide.type || "content";
    $("noteField").value = slide.note || "";
    document.querySelectorAll("#swatches .swatch").forEach((sw) => {
      sw.classList.toggle("is-active", sw.dataset.theme === (deck.meta.theme || "civic-gold"));
    });
  }

  $("slideTypeSelect").addEventListener("change", (e) => {
    const slide = deck.slides[selected];
    const newType = e.target.value;
    const keep = {
      headline: slide.headline, subheadline: slide.subheadline,
      eyebrow: slide.eyebrow, bullets: slide.bullets, note: slide.note,
    };
    const base = blankSlide(newType);
    // preserve common fields where the new type supports them
    ["headline", "subheadline", "eyebrow", "note"].forEach((k) => {
      if (keep[k] !== undefined && base[k] !== undefined) base[k] = keep[k];
    });
    if (newType === "content" && Array.isArray(keep.bullets)) base.bullets = keep.bullets;
    deck.slides[selected] = base;
    saveDraft();
    renderAll();
  });

  document.querySelectorAll("#swatches .swatch").forEach((sw) => {
    sw.addEventListener("click", () => {
      deck.meta.theme = sw.dataset.theme;
      applyTheme(deck.meta.theme);
      saveDraft();
      renderInspector();
      renderRail();
    });
  });

  $("noteField").addEventListener("input", (e) => {
    deck.slides[selected].note = e.target.value;
    scheduleSave();
  });

  deckTitleEl.addEventListener("input", () => {
    deck.meta.title = deckTitleEl.innerText.trim();
    scheduleSave();
  });

  /* =====================================================================
     SLIDE OPERATIONS
     ===================================================================== */
  function blankSlide(type) {
    switch (type) {
      case "title":   return { type, eyebrow: "Eyebrow label", headline: "Your headline here", subheadline: "A strong one-line positioning statement.", cta: "Footer or metadata" };
      case "section": return { type, eyebrow: "Section", headline: "Section title", subheadline: "Short setup line." };
      case "cards":   return { type, eyebrow: "Eyebrow", headline: "Cards headline", subheadline: "", cards: [ { title: "Card one", body: "Card body text." }, { title: "Card two", body: "Card body text." }, { title: "Card three", body: "Card body text." } ] };
      case "proof":   return { type, eyebrow: "Proof", headline: "Traction headline", subheadline: "", metrics: [ { value: "00", label: "Metric: ___" }, { value: "00", label: "Metric: ___" }, { value: "00", label: "Metric: ___" } ] };
      case "process": return { type, eyebrow: "Process", headline: "How it works", steps: [ { title: "Step one", body: "Step detail." }, { title: "Step two", body: "Step detail." }, { title: "Step three", body: "Step detail." } ] };
      case "beforeAfter": return { type, eyebrow: "Contrast", headline: "Before & after", left: { title: "Before", bullets: ["Point one", "Point two"] }, right: { title: "After", bullets: ["Point one", "Point two"] } };
      case "visual":  return { type, eyebrow: "Eyebrow", headline: "A cinematic statement that earns the slide.", subheadline: "Supporting line.", cta: "Attribution" };
      case "closing": return { type, eyebrow: "Closing", headline: "Your closing message.", cta: "Next step: ___" };
      default:        return { type: "content", eyebrow: "Eyebrow", headline: "Content headline", subheadline: "", bullets: ["First point", "Second point", "Third point"] };
    }
  }

  $("addSlideBtn").addEventListener("click", () => {
    deck.slides.splice(selected + 1, 0, blankSlide("content"));
    saveDraft();
    selectSlide(selected + 1);
  });
  $("dupSlideBtn").addEventListener("click", () => {
    deck.slides.splice(selected + 1, 0, clone(deck.slides[selected]));
    saveDraft();
    selectSlide(selected + 1);
  });
  $("delSlideBtn").addEventListener("click", () => {
    if (deck.slides.length <= 1) {
      deck.slides[0] = blankSlide("content");
      saveDraft();
      selectSlide(0);
      toast("Last slide cleared to a placeholder — a deck needs at least one slide.");
      return;
    }
    deck.slides.splice(selected, 1);
    if (selected >= deck.slides.length) selected = deck.slides.length - 1;
    saveDraft();
    selectSlide(selected);
  });
  $("moveUpBtn").addEventListener("click", () => {
    if (selected === 0) return;
    [deck.slides[selected - 1], deck.slides[selected]] = [deck.slides[selected], deck.slides[selected - 1]];
    saveDraft();
    selectSlide(selected - 1);
  });
  $("moveDownBtn").addEventListener("click", () => {
    if (selected >= deck.slides.length - 1) return;
    [deck.slides[selected + 1], deck.slides[selected]] = [deck.slides[selected], deck.slides[selected + 1]];
    saveDraft();
    selectSlide(selected + 1);
  });

  /* =====================================================================
     PRESENT MODE
     ===================================================================== */
  function buildPresent() {
    presentFrame.innerHTML = "";
    deck.slides.forEach((slide, i) => {
      const el = renderSlide(slide, i, "present");
      presentFrame.appendChild(el);
    });
    // progress dots
    const dots = $("presentDots");
    dots.innerHTML = "";
    deck.slides.forEach((_, i) => {
      const b = document.createElement("button");
      b.className = "dot";
      b.type = "button";
      b.setAttribute("aria-label", "Go to slide " + (i + 1));
      b.addEventListener("click", () => goTo(i));
      dots.appendChild(b);
    });
    $("counterTot").textContent = deck.slides.length;
  }

  function openPresent() {
    if (!deck || !deck.slides.length) return;
    buildPresent();
    present.open = true;
    present.index = selected;
    presentEl.classList.add("is-open");
    presentEl.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (presentEl.requestFullscreen) {
      presentEl.requestFullscreen().catch(() => {});
    }
    activate(present.index, 0, true);
  }

  function closePresent() {
    present.open = false;
    presentEl.classList.remove("is-open");
    presentEl.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    // keep editor synced to last presented slide
    selectSlide(present.index);
  }

  function activate(index, dir, initial) {
    const slides = presentFrame.querySelectorAll(".slide");
    slides.forEach((s, i) => {
      s.classList.remove("is-active");
      if (i === index) {
        // force reflow so [data-animate] reveal transitions replay cleanly
        void s.offsetWidth;
        s.classList.add("is-active");
        triggerCounters(s);
      }
    });
    present.index = index;
    $("counterCur").textContent = index + 1;
    const fill = $("progressFill");
    fill.style.width = ((index + 1) / deck.slides.length) * 100 + "%";
    const dots = $("presentDots").children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("is-active", i === index);
  }

  function goTo(index) {
    index = Math.max(0, Math.min(index, deck.slides.length - 1));
    if (index === present.index) return;
    const dir = index > present.index ? 1 : -1;
    activate(index, dir);
  }
  function next() { if (present.index < deck.slides.length - 1) goTo(present.index + 1); }
  function prev() { if (present.index > 0) goTo(present.index - 1); }

  function triggerCounters(slideEl) {
    slideEl.querySelectorAll(".metric-value[data-countup]").forEach((el) => {
      animateCount(el, el.getAttribute("data-target"));
    });
  }

  function animateCount(el, target) {
    const m = String(target).match(/-?\d[\d,]*\.?\d*/);
    if (!m) { el.textContent = target; return; }
    const numStr = m[0];
    const grouped = numStr.indexOf(",") !== -1;
    const num = parseFloat(numStr.replace(/,/g, ""));
    const decimals = (numStr.split(".")[1] || "").length;
    const prefix = target.slice(0, m.index);
    const suffix = target.slice(m.index + numStr.length);
    const dur = 1100;
    const start = performance.now();
    function fmt(v) {
      let s = v.toFixed(decimals);
      if (grouped) s = Number(s).toLocaleString("en-US");
      return s;
    }
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + fmt(num * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    }
    requestAnimationFrame(tick);
  }

  $("presentBtn").addEventListener("click", openPresent);
  $("exitPresentBtn").addEventListener("click", closePresent);
  $("nextBtn").addEventListener("click", next);
  $("prevBtn").addEventListener("click", prev);

  document.addEventListener("keydown", (e) => {
    if (!present.open) return;
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
    else if (e.key === "Escape") { e.preventDefault(); closePresent(); }
    else if (e.key === "Home") { e.preventDefault(); goTo(0); }
    else if (e.key === "End") { e.preventDefault(); goTo(deck.slides.length - 1); }
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && present.open) {
      // user left fullscreen with browser control — keep present overlay open
    }
  });

  // cursor-responsive glow in present mode
  presentEl.addEventListener("mousemove", (e) => {
    const x = (e.clientX / window.innerWidth) * 100;
    const y = (e.clientY / window.innerHeight) * 100;
    presentBg.style.setProperty("--mx", x + "%");
    presentBg.style.setProperty("--my", y + "%");
  });

  /* =====================================================================
     EXPORT / RESET / DOWNLOAD
     ===================================================================== */
  $("downloadJsonBtn").addEventListener("click", () => {
    const data = JSON.stringify(serialDeck(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "content.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  $("resetDeckBtn").addEventListener("click", () => {
    if (!confirm("Reset the deck to the original content.json? Your edits will be discarded.")) return;
    try {
      const id = deck.meta.deckId || FALLBACK_DECK_ID;
      if (storageOK) localStorage.removeItem(lsKey(id));
    } catch (e) {}
    selected = 0;
    loadDeck();
    toast("Deck reset to original content.");
  });

  /* ---- PDF EXPORT ---- */
  const CDN = {
    h2c: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  };
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }
  function ensurePdfLibs() {
    const need = [];
    if (typeof window.html2canvas === "undefined") need.push(loadScript(CDN.h2c));
    if (!(window.jspdf && window.jspdf.jsPDF)) need.push(loadScript(CDN.jspdf));
    return Promise.all(need);
  }

  $("exportPdfBtn").addEventListener("click", async () => {
    const btn = $("exportPdfBtn");
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Exporting…";
    try {
      await ensurePdfLibs();
    } catch (err) {
      alert(
        "PDF export needs two libraries from cdnjs.cloudflare.com:\n\n" +
        "• html2canvas\n• jsPDF\n\n" +
        "Allow access to cdnjs.cloudflare.com, or self-host these scripts, then try again."
      );
      btn.disabled = false; btn.textContent = original;
      return;
    }

    document.body.classList.add("exportingPdf");
    const { jsPDF } = window.jspdf;
    let pdf = null;

    try {
      for (let i = 0; i < deck.slides.length; i++) {
        pdfStage.innerHTML = "";
        const frame = document.createElement("div");
        frame.className = "pdf-frame";
        const slideEl = renderSlide(deck.slides[i], i, "pdf");
        frame.appendChild(slideEl);
        pdfStage.appendChild(frame);

        // ensure visible/entered state
        slideEl.querySelectorAll("[data-animate]").forEach((n) => {
          n.style.opacity = "1"; n.style.transform = "none"; n.style.filter = "none";
        });

        const canvas = await window.html2canvas(pdfStage, {
          backgroundColor: "#060912",
          scale: Math.max(window.devicePixelRatio || 1, 2),
          useCORS: true,
          width: 1920,
          height: 1080,
          windowWidth: 1920,
          windowHeight: 1080,
        });
        const img = canvas.toDataURL("image/png");

        if (!pdf) {
          pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, 1080] });
        } else {
          pdf.addPage([1920, 1080], "landscape");
        }
        pdf.addImage(img, "PNG", 0, 0, 1920, 1080);
      }
      pdf.save("FlowPitch.pdf");
    } catch (err) {
      console.error(err);
      alert("Something went wrong during PDF export. See the console for details.");
    } finally {
      pdfStage.innerHTML = "";
      document.body.classList.remove("exportingPdf");
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  /* =====================================================================
     RESPONSIVE — topbar height -> --topOffset
     ===================================================================== */
  function measureTopbar() {
    const tb = $("topbar");
    if (!tb) return;
    const h = Math.round(tb.getBoundingClientRect().height);
    if (h) document.documentElement.style.setProperty("--topOffset", h + "px");
  }
  window.addEventListener("resize", measureTopbar);

  /* =====================================================================
     STORAGE PROBE + START
     ===================================================================== */
  try {
    const k = "__fp_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
  } catch (e) {
    storageOK = false;
  }

  document.addEventListener("DOMContentLoaded", () => {
    measureTopbar();
    loadDeck();
    if (!storageOK) toast("Storage is unavailable — edits will work in memory but won't persist on reload.", 5000);
  });
  if (document.readyState !== "loading") {
    measureTopbar();
    loadDeck();
  }
})();

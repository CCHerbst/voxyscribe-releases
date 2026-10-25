/* VoxyScribe product page: the latest release, the dictation demo, and the listening bar playground.
   The bars are drawn the way the app draws them (ListeningIndicatorViewModel / ListeningIndicatorWindow). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const REPO = "CCHerbst/voxyscribe-releases";
  const BARS = 24, MIN = 2, STEP = 50; // the app: 24 bars, one per 50 ms buffer, at least 2 px tall
  const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
  const HINTS = {
    scrolling: "Your last second of sound scrolls past, newest on the right.",
    pulse: "The bars bounce together with your voice.",
    ripple: "Each moment starts in the middle and spreads out to both edges.",
    spectrum: "Pitch, low on the left and high on the right: vowels light the left, “s” sounds the right.",
    wave: "Your last second of sound as one smooth, flowing shape.",
    glow: "A light in the middle stretches and glows with your voice, and so does the microphone.",
  };

  /* ---------- Latest release: direct download link, version and size ---------- */
  async function release() {
    let r = null;
    try { r = JSON.parse(sessionStorage.getItem("vx-release") || "null"); } catch { /* storage blocked */ }
    if (!r) {
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
        if (!res.ok) return;
        const j = await res.json();
        const msi = (j.assets || []).find(a => /\.msi$/i.test(a.name));
        r = { v: String(j.tag_name || "").replace(/^v/, ""), url: msi && msi.browser_download_url, mb: msi ? Math.round(msi.size / 1048576) : 0, notes: j.html_url, date: j.published_at };
        try { sessionStorage.setItem("vx-release", JSON.stringify(r)); } catch { /* fine */ }
      } catch { return; } // offline or rate-limited: the links already go to the releases page
    }
    if (!r.v) return;
    if (r.url) $$("[data-download]").forEach(a => { a.href = r.url; });
    const size = r.mb ? ` · ${r.mb} MB` : "";
    $$("[data-meta]").forEach(e => { e.textContent = `Free · Version ${r.v}${size}`; });
    const when = r.date ? new Date(r.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "";
    $$("[data-version]").forEach(e => { e.textContent = `Version ${r.v}${when ? ", " + when : ""}`; });
    $$("[data-notes]").forEach(a => { a.href = r.notes; });
  }

  /* ---------- The listening bar ---------- */
  let pills = 0;
  class Pill {
    constructor(el) {
      const id = "wave-fill-" + pills++;
      el.innerHTML = `<span class="pill-mic">${MIC}</span>`
        + `<span class="pill-bars"><svg class="pill-wave" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0"></linearGradient></defs><path fill="url(#${id})"/></svg><span class="pill-glow"></span></span>`
        + `<span class="pill-stop"></span><span class="pill-text"></span>`
        + `<span class="pill-busy"><span class="spin"></span>Transcribing…</span>`;
      this.el = el;
      this.barsEl = $(".pill-bars", el);
      this.bars = Array.from({ length: BARS }, () => this.barsEl.appendChild(document.createElement("i")));
      this.svg = $(".pill-wave", el);
      this.path = $(".pill-wave path", el);
      const grad = $(".pill-wave linearGradient", el);
      this.stops = Array.from({ length: BARS }, (_, i) => {
        const s = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        s.setAttribute("offset", String(i / (BARS - 1)));
        return grad.appendChild(s);
      });
      this.glow = $(".pill-glow", el);
      this.mic = $(".pill-mic", el);
      this.text = $(".pill-text", el);
      this.heights = new Float32Array(BARS).fill(MIN);
      this.vel = new Float32Array(BARS);
      this.phase = Float32Array.from({ length: BARS }, () => rand(0, Math.PI * 2));
      this.speed = Float32Array.from({ length: BARS }, () => rand(0.8, 1.25));
      this.shown = new Float32Array(BARS);
      this.pulseLevel = 0; this.pulseVel = 0; this.glowLevel = 0;
      this.colors();
    }
    colors() {
      const cs = getComputedStyle(this.el);
      this.speech = cs.getPropertyValue("--bar-speech").trim() || "#3d8eff";
      this.noise = cs.getPropertyValue("--bar-noise").trim() || "#5c5c5c";
    }
    preview(s) {
      // The app shows the last 56 characters; here, as many as fit.
      const n = Math.max(18, Math.floor((this.text.clientWidth || 280) / 6.8));
      this.text.textContent = s.length <= n ? s : "…" + s.slice(-(n - 1)).trimStart();
    }
    /** One frame. levels/speech: the last second, oldest first; bands: the spectrum; t: seconds. */
    frame(levels, speech, bands, t) {
      const style = this.el.dataset.style, n = BARS, H = this.barsEl.clientHeight || 26;
      const now = levels[n - 1], sp = speech[n - 1], h = new Float32Array(n), s = new Array(n);
      if (style === "pulse") {
        this.pulseVel = this.pulseVel * 0.65 + (now - this.pulseLevel) * 0.65;
        this.pulseLevel = clamp(this.pulseLevel + this.pulseVel);
        const mid = n / 2;
        for (let i = 0; i < n; i++) {
          let target = MIN;
          if (this.pulseLevel > 0.02) {
            const cw = 1 - Math.abs(i - mid) / mid * 0.3;
            const osc = Math.sin(t * 10 * this.speed[i] + this.phase[i]) * 0.7 + Math.sin(t * 6 * this.speed[i] + this.phase[i] * 1.5) * 0.3;
            target = clamp(MIN + (H - MIN) * this.pulseLevel * cw * (0.4 + osc * 0.6), MIN, H);
          }
          this.vel[i] = this.vel[i] * 0.55 + (target - this.heights[i]) * 0.55;
          this.heights[i] += this.vel[i];
          h[i] = this.heights[i]; s[i] = sp;
        }
      } else if (style === "ripple") {
        // The newest moment in the middle, older ones further out on both sides.
        for (let i = 0; i < n; i++) {
          const age = i < n / 2 ? n / 2 - 1 - i : i - n / 2;
          h[i] = MIN + (H - MIN) * levels[n - 1 - age]; s[i] = speech[n - 1 - age];
        }
      } else if (style === "spectrum") {
        // Bands jump up and fall back over about 0.4 s, like a stereo's display.
        for (let i = 0; i < n; i++) {
          this.shown[i] = Math.max(bands ? bands[i] : 0, this.shown[i] - 0.04);
          h[i] = MIN + (H - MIN) * this.shown[i]; s[i] = sp;
        }
      } else {
        for (let i = 0; i < n; i++) { h[i] = MIN + (H - MIN) * levels[i]; s[i] = speech[i]; }
      }

      if (style === "wave") this.drawWave(h, s, H);
      else if (style === "glow") this.drawGlow(now, sp);
      else for (let i = 0; i < n; i++) {
        this.bars[i].style.height = h[i].toFixed(1) + "px";
        this.bars[i].classList.toggle("s", s[i]);
      }
      if (style !== "glow" && this.glowLevel) {
        this.glowLevel = 0;
        this.mic.style.transform = ""; this.mic.style.boxShadow = "";
      }
    }
    /** Wave: the heights as one smooth outline mirrored about the middle, colored along its length. */
    drawWave(h, s, H) {
      const n = BARS, w = this.svg.clientWidth || 120, mid = H / 2, pts = [];
      this.svg.setAttribute("viewBox", `0 0 ${w} ${H}`);
      for (let i = 0; i < n; i++) pts.push([i * w / (n - 1), mid - Math.max(1, h[i]) / 2]);
      for (let i = n - 1; i >= 0; i--) pts.push([i * w / (n - 1), mid + Math.max(1, h[i]) / 2]);
      const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], f = v => v.toFixed(1);
      const start = m(pts[pts.length - 1], pts[0]);
      let d = `M${f(start[0])} ${f(start[1])}`;
      for (let i = 0; i < pts.length; i++) {
        const c = pts[i], e = m(c, pts[(i + 1) % pts.length]);
        d += `Q${f(c[0])} ${f(c[1])} ${f(e[0])} ${f(e[1])}`;
      }
      this.path.setAttribute("d", d);
      for (let i = 0; i < n; i++) this.stops[i].setAttribute("stop-color", s[i] ? this.speech : this.noise);
    }
    /** Glow: rises quickly with the voice and fades more slowly; the microphone swells and glows too. */
    drawGlow(now, sp) {
      const g = this.glowLevel = now > this.glowLevel ? this.glowLevel + (now - this.glowLevel) * 0.5 : this.glowLevel * 0.94;
      const color = sp ? this.speech : this.noise;
      this.glow.style.width = (12 + g * 74).toFixed(1) + "%";
      this.glow.style.background = color;
      this.glow.style.opacity = (0.45 + g * 0.55).toFixed(2);
      this.glow.style.boxShadow = sp ? `0 0 ${(4 + g * 28).toFixed(0)}px ${(g * 5).toFixed(1)}px rgba(61, 142, 255, ${(0.2 + g * 0.55).toFixed(2)})` : "none";
      this.mic.style.transform = `scale(${(1 + g * 0.1).toFixed(3)})`;
      this.mic.style.boxShadow = sp ? `0 0 ${(g * 26).toFixed(0)}px ${(g * 5).toFixed(1)}px rgba(61, 142, 255, ${(g * 0.6).toFixed(2)})` : "none";
    }
  }

  /** The last second of sound, one entry per 50 ms buffer. */
  class History {
    constructor() { this.levels = new Float32Array(BARS); this.speech = new Array(BARS).fill(false); }
    push(level, speech) {
      this.levels.copyWithin(0, 1); this.levels[BARS - 1] = level;
      this.speech.shift(); this.speech.push(speech);
    }
  }

  /** Made-up speech: syllables in words, short gaps, and now and then a pause with only room noise. */
  class Voice {
    constructor() { this.left = 0; this.state = "pause"; this.words = 0; this.t = 0; this.dur = 1; this.amp = 0; }
    next() {
      if (this.left <= 0) this.plan();
      this.left -= STEP; this.t += STEP;
      if (this.state === "pause") return [rand(0.02, 0.09), false];
      if (this.state === "gap") return [rand(0.06, 0.16), true];
      const x = Math.min(1, this.t / this.dur);
      return [clamp(this.amp * Math.pow(Math.sin(Math.PI * x), 0.5) * rand(0.72, 1)), true];
    }
    plan() {
      this.t = 0;
      if (this.state === "syl") {
        if (++this.words > rand(7, 13)) { this.words = 0; this.state = "pause"; this.dur = this.left = rand(500, 1300); }
        else { this.state = "gap"; this.dur = this.left = rand(50, 140); }
      } else { this.state = "syl"; this.amp = rand(0.45, 1); this.dur = this.left = rand(140, 360); }
    }
    spectrum(level) {
      const b = new Float32Array(BARS);
      if (level < 0.18) { for (let i = 0; i < BARS; i++) b[i] = clamp(level * rand(0, 1.2) * (1 - i / BARS)); return b; }
      const hiss = Math.random() < 0.2, f1 = rand(2, 6), f2 = rand(8, 13), fs = rand(17, 21);
      for (let i = 0; i < BARS; i++) {
        const v = hiss ? Math.exp(-((i - fs) ** 2) / 14) : Math.exp(-((i - f1) ** 2) / 5) + 0.6 * Math.exp(-((i - f2) ** 2) / 7);
        b[i] = clamp(level * v * rand(0.75, 1.1) + rand(0, 0.05));
      }
      return b;
    }
  }

  /** The visitor's microphone, analysed in the browser only: a level scaled from the room's noise to their voice. */
  class Mic {
    async start() {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.an = this.ctx.createAnalyser();
      this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0.25;
      this.ctx.createMediaStreamSource(this.stream).connect(this.an);
      this.time = new Float32Array(this.an.fftSize);
      this.freq = new Uint8Array(this.an.frequencyBinCount);
      const hz = this.ctx.sampleRate / this.an.fftSize;
      this.edges = Array.from({ length: BARS + 1 }, (_, i) => Math.round(120 * Math.pow(7000 / 120, i / BARS) / hz));
      this.floor = -55; this.peak = -25;
    }
    next() {
      this.an.getFloatTimeDomainData(this.time);
      let sum = 0;
      for (let i = 0; i < this.time.length; i++) sum += this.time[i] * this.time[i];
      const db = 10 * Math.log10(sum / this.time.length + 1e-10);
      this.floor = db < this.floor ? db : this.floor + 0.04; // down at once, up slowly: the room's noise
      this.peak = Math.max(db, this.peak - 0.02, this.floor + 18); // the voice, fading slowly
      return [clamp((db - this.floor - 4) / (this.peak - this.floor - 4)), db > this.floor + 10];
    }
    spectrum() {
      this.an.getByteFrequencyData(this.freq);
      const b = new Float32Array(BARS);
      for (let i = 0; i < BARS; i++) {
        const a = this.edges[i], z = Math.max(a + 1, this.edges[i + 1]);
        let s = 0;
        for (let k = a; k < z; k++) s += this.freq[k];
        b[i] = clamp((s / (z - a) / 255 - 0.3) / 0.5);
      }
      return b;
    }
    stop() {
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this.ctx) this.ctx.close();
    }
  }

  /** Whether el is on screen (or nearly) and the tab is visible; onChange runs when that may have changed. */
  function seen(el, onChange) {
    let on = false;
    new IntersectionObserver(es => { on = es[0].isIntersecting; if (onChange) onChange(); }, { rootMargin: "80px" }).observe(el);
    if (onChange) document.addEventListener("visibilitychange", onChange);
    return () => on && !document.hidden;
  }

  /** Calls fn with the elapsed time on each frame while el is on screen and the tab is visible. */
  function whileVisible(el, fn) {
    let raf = 0, last = 0;
    const visible = seen(el, () => kick());
    const loop = now => {
      raf = 0;
      if (!visible()) return;
      fn(Math.min(200, now - (last || now)));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    function kick() { if (visible() && !raf) { last = 0; raf = requestAnimationFrame(loop); } }
    return visible;
  }

  /* ---------- Hero: a dictation into Notepad ---------- */
  function hero() {
    const el = $("#hero-pill"), doc = $("#doc"), hold = $("#hold"), lbl = $("#hold-lbl");
    if (!el || !doc) return;
    const caret = $(".caret", doc);
    const script = [
      { say: "Hi Siobhan, thanks for sending the notes from Tuesday." },
      { say: "I moved the Kubernetes upgrade to next week, so we have time to test it properly." },
      { say: "New paragraph.", type: "\n\n" },
      { say: "Could you send me the updated numbers before noon?" },
    ];
    if (reduced) {
      doc.insertBefore(document.createTextNode(script.map(s => s.type || s.say + " ").join("")), caret);
      return;
    }
    const pill = new Pill(el), hist = new History();
    let syl = null, acc = 0, frames = 0;
    const feed = () => {
      if (!syl) return [rand(0.02, 0.08), false];
      const x = (performance.now() - syl.t0) / syl.dur;
      if (x > 1) return [rand(0.06, 0.15), true]; // the short gap between words is still speech
      return [clamp(syl.amp * Math.pow(Math.sin(Math.PI * x), 0.5) * rand(0.72, 1)), true];
    };
    const visible = whileVisible($(".stage"), dt => {
      acc += dt;
      while (acc >= STEP) { acc -= STEP; hist.push(...feed()); }
      if (el.classList.contains("on")) pill.frame(hist.levels, hist.speech, null, frames++ * 0.016);
    });
    const gate = async () => { while (!visible()) await sleep(300); };

    async function speak(text) {
      let shown = "";
      for (const word of text.split(" ")) {
        const n = Math.max(1, Math.round(word.replace(/[^a-z]/gi, "").length / 3));
        for (let k = 0; k < n; k++) {
          syl = { t0: performance.now(), dur: rand(120, 190), amp: rand(0.5, 1) };
          await sleep(syl.dur);
        }
        shown += (shown ? " " : "") + word;
        pill.preview(shown);
        await sleep(rand(50, 120));
      }
      syl = null;
    }
    function type(text) {
      if (!text.trim()) { doc.insertBefore(document.createTextNode(text), caret); return; }
      text.split(/(\s+)/).forEach((part, i) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { doc.insertBefore(document.createTextNode(part), caret); return; }
        const w = document.createElement("span");
        w.className = "w"; w.textContent = part; w.style.animationDelay = (i * 22) + "ms";
        doc.insertBefore(w, caret);
      });
    }
    async function dictate(item) {
      await gate();
      hold.classList.add("down"); lbl.textContent = "Listening";
      pill.preview(""); el.classList.remove("busy"); el.classList.add("on");
      await sleep(420);
      await speak(item.say);
      await sleep(480);
      hold.classList.remove("down"); lbl.textContent = "Let go";
      el.classList.add("busy");
      await sleep(380);
      el.classList.remove("on");
      type(item.type || item.say + " ");
      lbl.textContent = "Hold to talk";
    }
    (async () => {
      await sleep(900);
      for (;;) {
        for (const item of script) { await dictate(item); await sleep(item.type ? 450 : 1000); }
        await sleep(3800);
        doc.classList.add("fade"); await sleep(550);
        Array.from(doc.childNodes).forEach(n => { if (n !== caret) n.remove(); });
        doc.classList.remove("fade"); await sleep(700);
      }
    })();
  }

  /* ---------- Playground: six styles, light or dark, and the visitor's own voice ---------- */
  function playground() {
    const el = $("#play-pill"), stage = $("#play-stage");
    if (!el) return;
    const pill = new Pill(el), hist = new History(), voice = new Voice();
    const SAMPLE = "Could you take a look at the interface's look and feel and let me know what you think?";
    let src = voice, mic = null, bands = new Float32Array(BARS), acc = 0, frames = 0;
    const step = () => {
      const [l, s] = src.next();
      hist.push(l, s);
      if (el.dataset.style === "spectrum") bands = src.spectrum(l, s);
    };
    const draw = () => pill.frame(hist.levels, hist.speech, bands, frames++ * 0.016);
    requestAnimationFrame(() => pill.preview(SAMPLE));
    if (reduced) { for (let i = 0; i < 60; i++) step(); for (let i = 0; i < 30; i++) draw(); }
    whileVisible(stage, dt => {
      if (reduced && !mic) return;
      acc += dt;
      while (acc >= STEP) { acc -= STEP; step(); }
      draw();
    });
    const redrawStill = () => { if (reduced && !mic) for (let i = 0; i < 30; i++) draw(); };

    const radio = (group, attr, apply) => {
      $$("button", group).forEach(b => b.addEventListener("click", () => {
        $$("button", group).forEach(x => x.setAttribute("aria-checked", String(x === b)));
        apply(b.dataset[attr]);
      }));
      group.addEventListener("keydown", e => {
        if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
        const all = $$("button", group), i = all.indexOf(document.activeElement);
        if (i < 0) return;
        const next = all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
        next.focus(); next.click(); e.preventDefault();
      });
    };
    radio($("#style-seg"), "style", style => {
      el.dataset.style = style;
      $("#play-hint").textContent = HINTS[style];
      redrawStill();
    });
    radio($("#theme-seg"), "theme", theme => {
      el.dataset.theme = theme; stage.dataset.bg = theme;
      pill.colors(); redrawStill();
    });

    const btn = $("#mic-btn"), lbl = $("#mic-lbl"), note = $("#mic-note");
    const stopMic = () => {
      if (mic) mic.stop();
      mic = null; src = voice;
      btn.setAttribute("aria-pressed", "false"); lbl.textContent = "Try it with your voice";
      note.textContent = "Your microphone stays in this browser tab. Nothing is recorded or sent.";
      pill.preview(SAMPLE);
    };
    btn.addEventListener("click", async () => {
      if (mic) { stopMic(); return; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        note.textContent = "This browser can't share a microphone with a page.";
        return;
      }
      try {
        const m = new Mic();
        await m.start();
        mic = m; src = m;
        btn.setAttribute("aria-pressed", "true"); lbl.textContent = "Stop the microphone";
        note.textContent = "Listening in this tab only. The page shows your sound level; it doesn't record or transcribe.";
        pill.preview("Talk, and watch it listen…");
      } catch {
        note.textContent = "The microphone isn't available. Check the browser's permission for this site and try again.";
      }
    });
    window.addEventListener("pagehide", () => { if (mic) mic.stop(); });
  }

  /* ---------- Small things ---------- */
  function header() {
    const top = $("#top");
    const on = () => top.classList.toggle("scrolled", scrollY > 8);
    addEventListener("scroll", on, { passive: true }); on();
  }
  function reveal() {
    const els = $$("[data-reveal]");
    if (!("IntersectionObserver" in window) || reduced) { els.forEach(e => e.classList.add("in")); return; }
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    els.forEach(e => io.observe(e));
  }
  function spotlight() {
    $$(".card").forEach(c => c.addEventListener("pointermove", e => {
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px");
      c.style.setProperty("--my", (e.clientY - r.top) + "px");
    }));
  }
  function phrases() {
    const box = $("#phrases");
    if (!box) return;
    const parts = $$("span", box);
    if (reduced) { parts.forEach(p => p.classList.add("on")); return; }
    let i = 0;
    const visible = seen(box);
    setInterval(() => {
      if (!visible()) return;
      if (i === parts.length) { parts.forEach(p => p.classList.remove("on")); i = 0; return; }
      parts[i++].classList.add("on");
    }, 1500);
  }
  function tray() {
    const bar = $("#tipbar"), pct = $("#tippct"), fill = $("#trayfill");
    if (!bar || reduced) return;
    const tip = bar.parentElement, visible = seen(tip);
    let p = 62;
    setInterval(() => {
      if (!visible()) return;
      p = p >= 100 ? 8 : p + 1;
      const tenths = Math.floor(p / 10), left = (100 - p) / 100 * 6;
      bar.textContent = "█".repeat(tenths) + "░".repeat(10 - tenths);
      pct.textContent = p + "%";
      tip.lastChild.textContent = left < 1 ? ", under a minute left" : `, about ${Math.ceil(left)} min left`;
      fill.style.setProperty("--p", (p / 100).toFixed(2));
    }, 1200);
  }
  function finalBars() {
    const box = $("#final-bars");
    if (!box) return;
    for (let k = 0; k < 41; k++) {
      const i = document.createElement("i"), x = (k - 20) / 20;
      i.style.setProperty("--k", k);
      i.style.setProperty("--h", Math.round((1 - x * x) * 46 + Math.random() * 14));
      box.appendChild(i);
    }
  }

  header();
  reveal();
  spotlight();
  release();
  hero();
  playground();
  phrases();
  tray();
  finalBars();
})();

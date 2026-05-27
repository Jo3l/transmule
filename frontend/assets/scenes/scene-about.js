// =============================================================================
// "About Scene" – Scrolling text using font sprite sheet + orbiting spheres
// Uses a bitmap font that only supports uppercase letters (A-Z, 0-9).
// The text is automatically uppercased before drawing.
// Reads SCROLL_TEXT from canvas.dataset.scrollText.
// =============================================================================

export function init(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // ── Fixed canvas size ────────────────────────────────────────────────
  const CANVAS_WIDTH = 300;
  const CANVAS_HEIGHT = 200;
  const centerX = CANVAS_WIDTH / 2.35;
  const centerY = CANVAS_HEIGHT / 2.6;

  // ── Config ───────────────────────────────────────────────────────────
  const TEXT_SCALE = 1;
  const AMPLITUDE_BASE = 12;
  const FREQUENCY_BASE = 0.05;
  const ORB_WIDTH = 48;
  const ORB_HEIGHT = 48;
  const FONT_IMAGE_URL = "/images/chrome32x32font.gif";
  const ORB_IMAGE_URL = "/images/orb.png";

  // Font sprite grid: 10 columns × 5 rows (320 × 160, 32px chars)

  // Convert text to uppercase — the bitmap font only has A-Z, 0-9
  const SCROLL_TEXT = (canvas.dataset.scrollText || "TRANSMULE").toUpperCase();

  // Derived from TEXT_SCALE
  const CHAR_ORIG_SIZE = 32;
  const CHAR_W = CHAR_ORIG_SIZE * TEXT_SCALE;
  const CHAR_H = CHAR_ORIG_SIZE * TEXT_SCALE;
  const AMPLITUDE = AMPLITUDE_BASE * TEXT_SCALE;
  const FREQUENCY = FREQUENCY_BASE / TEXT_SCALE;
  const SCROLL_SPEED = TEXT_SCALE;

  // ── State ────────────────────────────────────────────────────────────
  let fontImage = null;
  let charMap = [];
  let orbImage = null;
  let orbSystem = null;
  let crtImage = null;
  let starfield = null;
  let scrollerCanvas = null;
  let scrollerCtx = null;
  let offset = CANVAS_WIDTH;
  let s = 0;
  let animationActive = false;
  let rafId = null;

  // ── Setup ─────────────────────────────────────────────────────────────
  function setup() {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
  }

  // ── Font map (A-Z, 0-9, punctuation) ──────────────────────────────────
  // Grid: 10 cols × 5 rows (320 × 160, 32px chars)
  // Position ordering (row-major):
  //   Row 0-1:  A B C D E F G H I J / K L M N O P Q R S T
  //   Row 2:    U V W X Y Z   . 0 1
  //   Row 3:    2 3 4 5 6 7 8 9 ! (
  //   Row 4:    ) , ' ? : -  · · · ·
  function buildCharMap() {
    charMap = [];
    const FONT_COLS = 10;

    // A-Z at positions 0-25
    for (let i = 0; i < 26; i++) {
      charMap[65 + i] = [(i % FONT_COLS) * CHAR_ORIG_SIZE, Math.floor(i / FONT_COLS) * CHAR_ORIG_SIZE];
    }

    // Manual mapping for non-letter chars (after Z)
    const extra = [
      [32, 26],  // space
      [46, 27],  // .
      [48, 28],  // 0
      [49, 29],  // 1
      [50, 30],  // 2
      [51, 31],  // 3
      [52, 32],  // 4
      [53, 33],  // 5
      [54, 34],  // 6
      [55, 35],  // 7
      [56, 36],  // 8
      [57, 37],  // 9
      [33, 38],  // !
      [40, 39],  // (
      [41, 40],  // )
      [44, 41],  // ,
      [39, 42],  // '
      [63, 43],  // ?
      [58, 44],  // :
      [45, 45],  // -
    ];

    for (const [code, pos] of extra) {
      charMap[code] = [
        (pos % FONT_COLS) * CHAR_ORIG_SIZE,
        Math.floor(pos / FONT_COLS) * CHAR_ORIG_SIZE,
      ];
    }
  }

  // ── Image promises ───────────────────────────────────────────────────
  const fontPromise = new Promise((resolve) => {
    fontImage = new Image();
    fontImage.src = FONT_IMAGE_URL;
    fontImage.onload = () => resolve();
    fontImage.onerror = () => resolve();
  });

  const orbPromise = new Promise((resolve) => {
    const img = new Image();
    img.src = ORB_IMAGE_URL;
    img.onload = () => {
      orbImage = img;
      resolve();
    };
    img.onerror = () => {
      const fb = document.createElement("canvas");
      fb.width = 32;
      fb.height = 32;
      const fc = fb.getContext("2d");
      if (fc) {
        fc.fillStyle = "#ffaa44";
        fc.beginPath();
        fc.arc(16, 16, 14, 0, Math.PI * 2);
        fc.fill();
      }
      orbImage = new Image();
      orbImage.src = fb.toDataURL();
      orbImage.onload = () => resolve();
    };
  });

  const crtPromise = new Promise((resolve) => {
    const img = new Image();
    img.src = "/images/crt.png";
    img.onload = () => {
      crtImage = img;
      resolve();
    };
    img.onerror = () => resolve();
  });

  // ── Starfield (background layer) ────────────────────────────────────
  class Starfield {
    constructor(w, h, count) {
      this.w = w;
      this.h = h;
      this.points = [];
      for (let i = 0; i < count; i++) {
        this.points.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: this._randomSize(),
        });
      }
    }

    _randomSize() {
      const r = Math.random();
      if (r < 0.35) return 1;
      if (r < 0.65) return 1.5;
      if (r < 0.85) return 2;
      return 3;
    }

    _speed(size) {
      if (size <= 1) return 0.3;
      if (size <= 1.5) return 0.6;
      if (size <= 2) return 1.2;
      return 2.4;
    }

    update() {
      for (const p of this.points) {
        p.x -= this._speed(p.size);
        if (p.x < 0) {
          p.x = this.w;
          p.y = Math.random() * this.h;
          p.size = this._randomSize();
        }
      }
    }

    render() {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      for (const p of this.points) {
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
  }

  // ── Build scroller canvas ────────────────────────────────────────────
  function buildScrollerCanvas() {
    scrollerCanvas = document.createElement("canvas");
    scrollerCanvas.width = SCROLL_TEXT.length * CHAR_W;
    scrollerCanvas.height = CHAR_H;
    scrollerCtx = scrollerCanvas.getContext("2d");

    for (let i = 0; i < SCROLL_TEXT.length; i++) {
      const code = SCROLL_TEXT.charCodeAt(i);
      if (charMap[code]) {
        const [sx, sy] = charMap[code];
        scrollerCtx.drawImage(
          fontImage,
          sx,
          sy,
          CHAR_ORIG_SIZE,
          CHAR_ORIG_SIZE,
          i * CHAR_W,
          0,
          CHAR_W,
          CHAR_H,
        );
      }
    }
  }

  // ── Orb system ───────────────────────────────────────────────────────
  class OrbSystem {
    constructor(ctx, centerX, centerY, orbImg, orbW, orbH) {
      this.ctx = ctx;
      this.centerX = centerX;
      this.centerY = centerY;
      this.orbImg = orbImg;
      this.orbW = orbW;
      this.orbH = orbH;
      this.NUM_ORBS = 11;
      this.speedx = 4;
      this.speedy = 2;
      this.rangex = 100;
      this.rangey = 40;
      this.mod = 0;
      this.orbs = [];
      this._init();
    }

    _init() {
      for (let i = 0; i < this.NUM_ORBS; i++) {
        this.orbs.push({ id: i, x: 0, y: 0, offset: 0 });
      }
      this.orbs.forEach((orb, idx) => {
        orb.setMod = () => {
          orb.offset = this.mod === 0 ? idx / this.NUM_ORBS : idx / Math.max(1, this.NUM_ORBS % this.mod);
        };
        orb.update = (t) => {
          orb.x = this.centerX + Math.floor(Math.sin((t + orb.offset) * this.speedx) * this.rangex);
          orb.y = this.centerY + Math.floor(Math.cos((t + orb.offset) * this.speedy) * this.rangey);
        };
        orb.render = () => {
          this.ctx.drawImage(this.orbImg, orb.x, orb.y, this.orbW, this.orbH);
        };
        orb.setMod();
      });
    }

    tweakMod(newMod) {
      this.mod = parseFloat(newMod) || 0;
      this.orbs.forEach((orb) => orb.setMod());
    }

    update(t) {
      this.orbs.forEach((orb) => orb.update(t));
    }
    render() {
      this.orbs.forEach((orb) => orb.render());
    }
  }

  // ── Draw scroller (text only, no background fill) ────────────────────
  function drawScroller() {
    s += 0.05;
    offset -= SCROLL_SPEED;
    if (offset < -SCROLL_TEXT.length * CHAR_W) offset = CANVAS_WIDTH;

    const halfHeight = CANVAS_HEIGHT / 2;

    const visibleStart = Math.max(0, -offset);
    const visibleEnd = Math.min(SCROLL_TEXT.length * CHAR_W, -offset + CANVAS_WIDTH);

    for (let x = visibleStart; x < visibleEnd; x++) {
      const yOffset = halfHeight + AMPLITUDE * Math.sin(x * FREQUENCY + s);
      ctx.drawImage(scrollerCanvas, x, 0, 1, CHAR_H, x + offset, yOffset, 1, CHAR_H);
    }
  }

  // ── Animation loop ───────────────────────────────────────────────────
  function loop() {
    if (!animationActive) return;

    // 1. Clear canvas to black (starfield draws on top of black bg)
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Starfield layer (bottom)
    if (starfield) {
      starfield.update();
      starfield.render();
    }

    // 3. Scrolling text
    drawScroller();

    // 4. Orbiting spheres
    if (orbSystem) {
      orbSystem.update(Date.now() / 1000);
      orbSystem.render();
    }

    // 5. CRT overlay (top)
    if (crtImage) {
      ctx.drawImage(crtImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    rafId = requestAnimationFrame(loop);
  }

  // ── Background music ───────────────────────────────────────────────────
  let bgAudio = null;
  const MUSIC_URL = "/music/MASK_III_VENOM_Strikes_Back.m4a";

  function startMusic() {
    try {
      bgAudio = new Audio(MUSIC_URL);
      bgAudio.loop = true;
      bgAudio.volume = 0.4;
      bgAudio.play().catch(() => {
        // Autoplay blocked — user interaction required
      });
    } catch {
      /* ignore */
    }
  }

  function stopMusic() {
    if (bgAudio) {
      bgAudio.pause();
      bgAudio.src = "";
      bgAudio = null;
    }
  }

  // ── Start ────────────────────────────────────────────────────────────
  setup();
  Promise.all([fontPromise, orbPromise, crtPromise]).then(() => {
    buildCharMap();
    buildScrollerCanvas();
    starfield = new Starfield(CANVAS_WIDTH, CANVAS_HEIGHT, 120);
    orbSystem = new OrbSystem(ctx, centerX, centerY, orbImage, ORB_WIDTH, ORB_HEIGHT);
    startMusic();
    animationActive = true;
    loop();
  });

  return {
    destroy() {
      animationActive = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      stopMusic();
      starfield = null;
      scrollerCanvas = null;
      orbSystem = null;
      crtImage = null;
    },
    toggleMusic() {
      if (!bgAudio) return;
      if (bgAudio.paused) {
        bgAudio.play().catch(() => {});
      } else {
        bgAudio.pause();
      }
    },
    isMusicPlaying() {
      return bgAudio ? !bgAudio.paused : false;
    },
  };
}

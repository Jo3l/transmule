// =============================================================================
// "Lumon Numbers" – 2D Canvas scene for the Lumon/Severance theme
// Animated number grid with per-number tempers (woe, frolic, dread, malice)
// and a hover magnification effect.
// =============================================================================

export function init(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const CONFIG = {
    CELL_SPACING: 50,
    INITIAL_ZOOM: 1.0,
    MIN_ZOOM: 0.2,
    MAX_ZOOM: 5.0,
    ZOOM_SENSITIVITY: 0.002,
    PAN_SPEED: 15,
    FONT_FAMILY: "'Plus Jakarta Sans', monospace",
    FONT_BASE_SIZE: 20,
    FONT_COLOR: "#44e2f6",
    BACKGROUND_COLOR: "#001628",
    ANIM_AMPLITUDE: 5,
    ANIM_SPEED_WOE: 1.25,
    ANIM_SPEED_FROLIC: 1.5,
    ANIM_SPEED_DREAD: 1.0,
    ANIM_SPEED_MALICE: 3.5,
    HOVER_RADIUS: 150,
    HOVER_MAX_SCALE: 3.5,
  };

  const TEMPER = { WOE: "woe", FROLIC: "frolic", DREAD: "dread", MALICE: "malice" };
  const ALL_TEMPERS = Object.values(TEMPER);

  class LumonNumber {
    constructor(baseX, baseY) {
      this.displayNumber = Math.floor(Math.random() * 10);
      this.temper = ALL_TEMPERS[Math.floor(Math.random() * ALL_TEMPERS.length)];
      this.baseWorldX = baseX;
      this.baseWorldY = baseY;
      this.offsetX = 0;
      this.offsetY = 0;
      this.animationPhase = Math.random() * Math.PI * 2;
    }

    update(deltaTime, time) {
      const amp = CONFIG.ANIM_AMPLITUDE;
      switch (this.temper) {
        case TEMPER.WOE:
          this.offsetX = 0;
          this.offsetY = Math.sin(time * CONFIG.ANIM_SPEED_WOE + this.animationPhase) * amp;
          break;
        case TEMPER.FROLIC:
          this.offsetX = Math.sin(time * CONFIG.ANIM_SPEED_FROLIC + this.animationPhase) * amp;
          this.offsetY = 0;
          break;
        case TEMPER.DREAD: {
          const angle = Math.PI / 4;
          const m = Math.sin(time * CONFIG.ANIM_SPEED_DREAD + this.animationPhase) * amp;
          this.offsetX = Math.cos(angle) * m;
          this.offsetY = Math.sin(angle) * m;
          break;
        }
        case TEMPER.MALICE:
          this.offsetX = Math.cos(time * CONFIG.ANIM_SPEED_MALICE + this.animationPhase) * amp;
          this.offsetY =
            Math.sin(time * CONFIG.ANIM_SPEED_MALICE * 0.7 + this.animationPhase) * amp * 0.7;
          break;
        default:
          this.offsetX = 0;
          this.offsetY = 0;
      }
    }
  }

  class Spreadsheet {
    constructor(cols = 200, rows = 150) {
      this.cols = cols;
      this.rows = rows;
      this.cellSpace = CONFIG.CELL_SPACING;
      this.numbers = [];
      for (let i = 0; i < rows; i++) {
        this.numbers.push([]);
        for (let j = 0; j < cols; j++) {
          const baseX = j * this.cellSpace + this.cellSpace / 2;
          const baseY = i * this.cellSpace + this.cellSpace / 2;
          this.numbers[i].push(new LumonNumber(baseX, baseY));
        }
      }
    }
    getWorldWidth() {
      return this.cols * this.cellSpace;
    }
    getWorldHeight() {
      return this.rows * this.cellSpace;
    }
  }

  class Camera {
    constructor(world) {
      this.world = world;
      this.centerX = world.getWorldWidth() / 2;
      this.centerY = world.getWorldHeight() / 2;
      this.zoom = CONFIG.INITIAL_ZOOM;
      this.canvasWidth = canvas.width;
      this.canvasHeight = canvas.height;
      this.isPanning = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      this.mouseScreenX = -1000;
      this.mouseScreenY = -1000;
      this.isMouseOver = false;

      this._onKeyDown = this.handleKeyDown.bind(this);
      this._onWheel = this.handleWheel.bind(this);
      this._onMouseDown = this.handleMouseDown.bind(this);
      this._onMouseMove = this.handleMouseMove.bind(this);
      this._onMouseUp = this.handleMouseUp.bind(this);
      this._onMouseEnter = this.handleMouseEnter.bind(this);
      this._onMouseLeave = this.handleMouseLeave.bind(this);

      document.addEventListener("keydown", this._onKeyDown);
      document.addEventListener("wheel", this._onWheel, { passive: false });
      canvas.addEventListener("mouseenter", this._onMouseEnter);
      canvas.addEventListener("mousedown", this._onMouseDown);
      canvas.addEventListener("mousemove", this._onMouseMove);
      canvas.addEventListener("mouseup", this._onMouseUp);
      canvas.addEventListener("mouseleave", this._onMouseLeave);
    }

    destroy() {
      document.removeEventListener("keydown", this._onKeyDown);
      document.removeEventListener("wheel", this._onWheel);
      canvas.removeEventListener("mouseenter", this._onMouseEnter);
      canvas.removeEventListener("mousedown", this._onMouseDown);
      canvas.removeEventListener("mousemove", this._onMouseMove);
      canvas.removeEventListener("mouseup", this._onMouseUp);
      canvas.removeEventListener("mouseleave", this._onMouseLeave);
    }

    screenToWorld(sx, sy) {
      return {
        x: (sx - this.canvasWidth / 2) / this.zoom + this.centerX,
        y: (sy - this.canvasHeight / 2) / this.zoom + this.centerY,
      };
    }
    worldToScreen(wx, wy) {
      return {
        x: (wx - this.centerX) * this.zoom + this.canvasWidth / 2,
        y: (wy - this.centerY) * this.zoom + this.canvasHeight / 2,
      };
    }
    getVisibleWorldBounds() {
      const hw = this.canvasWidth / 2 / this.zoom;
      const hh = this.canvasHeight / 2 / this.zoom;
      const buf = (CONFIG.ANIM_AMPLITUDE + CONFIG.CELL_SPACING / 2) / this.zoom;
      return {
        minX: this.centerX - hw - buf,
        maxX: this.centerX + hw + buf,
        minY: this.centerY - hh - buf,
        maxY: this.centerY + hh + buf,
      };
    }

    render() {
      const bounds = this.getVisibleWorldBounds();
      const cs = this.world.cellSpace;
      const minCol = Math.max(0, Math.floor(bounds.minX / cs));
      const maxCol = Math.min(this.world.cols - 1, Math.ceil(bounds.maxX / cs));
      const minRow = Math.max(0, Math.floor(bounds.minY / cs));
      const maxRow = Math.min(this.world.rows - 1, Math.ceil(bounds.maxY / cs));

      const baseSize = Math.max(2, Math.min(40, CONFIG.FONT_BASE_SIZE * this.zoom));
      ctx.fillStyle = CONFIG.FONT_COLOR;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const n = this.world.numbers[row][col];
          if (!n) continue;
          const sp = this.worldToScreen(n.baseWorldX + n.offsetX, n.baseWorldY + n.offsetY);
          let hoverScale = 1.0;
          const dx = sp.x - this.mouseScreenX;
          const dy = sp.y - this.mouseScreenY;
          const distSq = dx * dx + dy * dy;
          const rSq = CONFIG.HOVER_RADIUS * CONFIG.HOVER_RADIUS;
          if (distSq < rSq) {
            const t = 1.0 - Math.sqrt(distSq) / CONFIG.HOVER_RADIUS;
            hoverScale = 1.0 + (CONFIG.HOVER_MAX_SCALE - 1.0) * t * t;
          }
          const finalSize = baseSize * hoverScale;
          const buf = finalSize / 2;
          if (
            sp.x >= -buf &&
            sp.x <= this.canvasWidth + buf &&
            sp.y >= -buf &&
            sp.y <= this.canvasHeight + buf
          ) {
            ctx.font = `${finalSize}px ${CONFIG.FONT_FAMILY}`;
            ctx.fillText(n.displayNumber, sp.x, sp.y);
          }
        }
      }
    }

    updateVisibleNumbers(deltaTime, time) {
      const bounds = this.getVisibleWorldBounds();
      const cs = this.world.cellSpace;
      const minCol = Math.max(0, Math.floor(bounds.minX / cs));
      const maxCol = Math.min(this.world.cols - 1, Math.ceil(bounds.maxX / cs));
      const minRow = Math.max(0, Math.floor(bounds.minY / cs));
      const maxRow = Math.min(this.world.rows - 1, Math.ceil(bounds.maxY / cs));
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const n = this.world.numbers[row][col];
          if (n) n.update(deltaTime, time);
        }
      }
    }

    updateCanvasSize(w, h) {
      this.canvasWidth = w;
      this.canvasHeight = h;
    }

    handleKeyDown(e) {
      const pan = CONFIG.PAN_SPEED / this.zoom;
      if (e.key === "ArrowLeft") {
        this.centerX -= pan;
      } else if (e.key === "ArrowRight") {
        this.centerX += pan;
      } else if (e.key === "ArrowUp") {
        this.centerY -= pan;
      } else if (e.key === "ArrowDown") {
        this.centerY += pan;
      } else return;
    }
    handleMouseDown(e) {
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      canvas.style.cursor = "grabbing";
    }
    handleMouseMove(e) {
      const rect = canvas.getBoundingClientRect();
      this.mouseScreenX = e.clientX - rect.left;
      this.mouseScreenY = e.clientY - rect.top;
      if (!this.isPanning) return;
      this.centerX -= (e.clientX - this.lastMouseX) / this.zoom;
      this.centerY -= (e.clientY - this.lastMouseY) / this.zoom;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
    handleMouseUp() {
      this.isPanning = false;
      canvas.style.cursor = "grab";
    }
    handleMouseEnter() {
      this.isMouseOver = true;
    }
    handleMouseLeave() {
      this.isMouseOver = false;
      this.mouseScreenX = -CONFIG.HOVER_RADIUS * 2;
      this.mouseScreenY = -CONFIG.HOVER_RADIUS * 2;
    }
    handleWheel(e) {
      if (!this.isMouseOver) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const delta =
        e.deltaY > 0
          ? (e.deltaY * CONFIG.ZOOM_SENSITIVITY) / 2
          : e.deltaY * CONFIG.ZOOM_SENSITIVITY;
      const before = this.screenToWorld(mx, my);
      const newZoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, this.zoom * (1 - delta)));
      if (newZoom === this.zoom) return;
      this.zoom = newZoom;
      const after = this.screenToWorld(mx, my);
      this.centerX += before.x - after.x;
      this.centerY += before.y - after.y;
    }
  }

  function setup() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width) || window.innerWidth;
    canvas.height = Math.round(rect.height) || window.innerHeight;
    if (cam) cam.updateCanvasSize(canvas.width, canvas.height);
  }

  const ss = new Spreadsheet();
  let cam = null;
  let rafId = null;
  let lastTimestamp = 0;
  let totalTime = 0;

  function loop(timestamp) {
    const dt = (timestamp - lastTimestamp) / 1000 || 0;
    lastTimestamp = timestamp;
    totalTime += dt;
    cam.updateVisibleNumbers(dt, totalTime);
    ctx.fillStyle = CONFIG.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    cam.render();
    rafId = requestAnimationFrame(loop);
  }

  const onResize = () => setup();
  window.addEventListener("resize", onResize);

  rafId = requestAnimationFrame(() => {
    setup();
    cam = new Camera(ss);
    rafId = requestAnimationFrame(loop);
  });

  return function destroy() {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    if (cam) cam.destroy();
  };
}

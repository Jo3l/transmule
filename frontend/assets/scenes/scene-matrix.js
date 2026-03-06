// =============================================================================
// "Matrix Rain" – 2D Canvas scene for the Matrix theme
// =============================================================================

export function init(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const str = "А+Б0В-Г1Д=Е2Ё Ж3З И4Й К5Л М6Н О7П Р8С Т9У Ф!Х Ц?Ч Ш.ЩЪ,Ы Ь:ЭЮ;Я";
  const matrix = str.split("");

  let W, H, col, arr;
  const font = 11;

  function setup() {
    // getBoundingClientRect forces layout recalculation and is reliable for
    // both position:fixed (login/setup) and position:absolute (sidebar) canvases.
    const rect = canvas.getBoundingClientRect();
    W = canvas.width = Math.round(rect.width) || window.innerWidth;
    H = canvas.height = Math.round(rect.height) || window.innerHeight;
    col = Math.max(1, Math.floor(W / font));
    arr = Array.from({ length: col }, () => Math.floor(Math.random() * (H / font)));
    // Paint an opaque black base so the canvas is never transparent.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
  }

  // Defer first setup to next animation frame so layout is guaranteed settled.
  let interval = null;
  let rafId = requestAnimationFrame(() => {
    setup();
    interval = setInterval(draw, 50);
  });

  function draw() {
    ctx.fillStyle = "rgba(0,0,0,.05)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#00ff41";
    ctx.font = font + "px monospace";
    for (let i = 0; i < arr.length; i++) {
      const txt = matrix[Math.floor(Math.random() * matrix.length)];
      ctx.fillText(txt, i * font, arr[i] * font);
      if (arr[i] * font > H && Math.random() > 0.975) arr[i] = 0;
      arr[i]++;
    }
  }

  function onResize() {
    setup();
  }

  window.addEventListener("resize", onResize);

  return function destroy() {
    cancelAnimationFrame(rafId);
    if (interval) clearInterval(interval);
    window.removeEventListener("resize", onResize);
  };
}

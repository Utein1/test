/**
 * A lightweight, dependency-free starfield for a fixed full-screen canvas.
 * Supports twinkling, pointer parallax and occasional shooting stars.
 */
export function initStarfield(canvas, { density = 7000, maxStars = 320 } = {}) {
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let stars = [];
  let shooting = [];
  let raf = 0;
  let running = false;
  let lastFrame = 0;
  let nextShootingAt = 4000 + Math.random() * 5000;
  let lastShootingAt = 0;
  let startedAt = performance.now();

  const pointer = { x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };

  function makeStar() {
    const depth = 0.25 + Math.random() * 0.75;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * (depth > 0.75 ? 1.5 : 1.05) + 0.25,
      baseAlpha: 0.18 + Math.random() * 0.5,
      speed: 0.25 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      depth,
      hue: Math.random() > 0.86 ? 'rgba(190, 225, 255,' : 'rgba(255, 255, 255,'
    };
  }

  function build() {
    const count = Math.min(maxStars, Math.max(70, Math.round((width * height) / density)));
    stars = Array.from({ length: count }, makeStar);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    draw(performance.now(), true);
  }

  function draw(time, staticFrame = false) {
    ctx.clearRect(0, 0, width, height);

    pointer.x += (pointerTarget.x - pointer.x) * 0.045;
    pointer.y += (pointerTarget.y - pointer.y) * 0.045;

    const seconds = (time - startedAt) / 1000;

    for (const star of stars) {
      const offsetX = pointer.x * star.depth * (coarsePointer ? 0 : 14);
      const offsetY = pointer.y * star.depth * (coarsePointer ? 0 : 14);
      const x = star.x + offsetX;
      const y = star.y + offsetY;

      if (x < -4 || x > width + 4 || y < -4 || y > height + 4) continue;

      const twinkle = staticFrame
        ? 0.8
        : 0.72 + Math.sin(seconds * star.speed + star.phase) * 0.28;

      if (star.r > 1.05) {
        ctx.globalAlpha = star.baseAlpha * twinkle * 0.2;
        ctx.fillStyle = star.hue + '1)';
        ctx.beginPath();
        ctx.arc(x, y, star.r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = star.baseAlpha * twinkle;
      ctx.fillStyle = star.hue + '1)';
      ctx.beginPath();
      ctx.arc(x, y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (reduceMotion || staticFrame) return;

    // Shooting stars
    for (let i = shooting.length - 1; i >= 0; i--) {
      const s = shooting[i];
      s.progress += s.speed;
      if (s.progress >= 1) {
        shooting.splice(i, 1);
        continue;
      }

      const headX = s.startX + s.dx * s.progress;
      const headY = s.startY + s.dy * s.progress;
      const tailX = headX - s.dx * s.tail;
      const tailY = headY - s.dy * s.tail;
      const fade = Math.sin(Math.PI * s.progress);

      const gradient = ctx.createLinearGradient(headX, headY, tailX, tailY);
      gradient.addColorStop(0, `rgba(220, 245, 255, ${0.85 * fade})`);
      gradient.addColorStop(0.4, `rgba(140, 210, 255, ${0.32 * fade})`);
      gradient.addColorStop(1, 'rgba(120, 190, 255, 0)');

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(headX, headY);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#e8f9ff';
      ctx.beginPath();
      ctx.arc(headX, headY, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function spawnShootingStar() {
    const fromTop = Math.random() > 0.45;
    shooting.push({
      startX: Math.random() * width * 0.85,
      startY: fromTop ? Math.random() * height * 0.25 : Math.random() * height * 0.4,
      dx: width * (0.18 + Math.random() * 0.16),
      dy: height * (0.1 + Math.random() * 0.12),
      tail: 0.28,
      progress: 0,
      speed: 0.012 + Math.random() * 0.012
    });
  }

  function frame(now) {
    if (!running) return;
    const delta = Math.min(64, now - lastFrame);
    lastFrame = now;

    if (!reduceMotion && now - lastShootingAt > nextShootingAt) {
      spawnShootingStar();
      lastShootingAt = now;
      nextShootingAt = 7000 + Math.random() * 9000;
    }

    // Keep animation speed independent from frame rate.
    const steps = Math.max(1, Math.round(delta / 16.67));
    for (let i = 0; i < steps - 1 && shooting.length; i++) {
      for (const s of shooting) s.progress += s.speed;
    }

    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (reduceMotion || running) return;
    running = true;
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function onPointerMove(event) {
    if (coarsePointer) return;
    pointerTarget.x = event.clientX / width - 0.5;
    pointerTarget.y = event.clientY / height - 0.5;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 140);
  }

  resize();
  start();
  window.addEventListener('resize', onResize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stop();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('visibilitychange', onVisibility);
    clearTimeout(resizeTimer);
  };
}

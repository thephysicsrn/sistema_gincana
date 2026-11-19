/**
 * Efeito visual de Confetes (Canvas) de alta performance
 * Leve, sem dependências externas.
 */
class ConfettiManager {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.animationId = null;
    this.colors = ['#FF4B4B', '#FFB800', '#00D26A', '#00A3FF', '#9D4EDD', '#FF6B8B', '#00F0FF'];
  }

  init() {
    if (this.canvas) return;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'gincana-confetti-canvas';
    this.canvas.style.position = 'fixed';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100vw';
    this.canvas.style.height = '100vh';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '99999';
    document.body.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');
    this.resize();

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  celebrate() {
    this.init();
    // Dispara canhões dos dois cantos inferiores
    const count = 120;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Lado esquerdo
    for (let i = 0; i < count; i++) {
      this.particles.push(this.createParticle(0.1 * w, h, 60, -80, 8, 16));
    }
    // Lado direito
    for (let i = 0; i < count; i++) {
      this.particles.push(this.createParticle(0.9 * w, h, -60, -80, 8, 16));
    }
    // Centro
    for (let i = 0; i < count / 2; i++) {
      this.particles.push(this.createParticle(0.5 * w, h, 0, -90, 10, 18));
    }

    if (!this.animationId) {
      this.loop();
    }
  }

  burst(x, y) {
    this.init();
    const count = 70;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 10;
      this.particles.push(this.createParticle(x, y, Math.cos(angle) * speed * 4, Math.sin(angle) * speed * 4, 3, 10));
    }
    if (!this.animationId) {
      this.loop();
    }
  }

  createParticle(x, y, vxBase, vyBase, speedMin, speedMax) {
    const angle = (Math.random() - 0.5) * 0.8;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    return {
      x,
      y,
      vx: (vxBase * 0.15) + (Math.sin(angle) * speed),
      vy: (vyBase * 0.15) - (Math.cos(angle) * speed * (0.8 + Math.random() * 0.6)),
      size: 7 + Math.random() * 8,
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      gravity: 0.28,
      drag: 0.985,
      opacity: 1,
      decay: 0.006 + Math.random() * 0.008,
      shape: Math.random() > 0.4 ? 'rect' : 'circle'
    };
  }

  loop() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.rotation += p.rotationSpeed;
      p.opacity -= p.decay;

      if (p.opacity <= 0 || p.y > this.canvas.height + 50) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, p.opacity);
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animationId = requestAnimationFrame(() => this.loop());
    } else {
      this.animationId = null;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

window.gincanaConfetti = new ConfettiManager();

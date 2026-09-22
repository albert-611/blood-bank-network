/**
 * ============================================================================
 * BLOOD BANK PLATFORM — RED BLOOD CELLS & PLATELETS BACKGROUND SIMULATION
 * ============================================================================
 * Generates an ambient, bio-realistic background of floating Red Blood Cells
 * (erythrocytes) and Blood Platelets (thrombocytes) with depth-of-field blur,
 * 3D tumbling rotation, and gentle cursor repulsion.
 */

(function () {
  const canvas = document.getElementById('platelets-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  // Resize handler
  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  // Mouse interaction
  const mouse = { x: -1000, y: -1000, radius: 120 };
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('mouseleave', () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  // Entity types: 'rbc' (Red Blood Cell / Erythrocyte) and 'platelet' (Thrombocyte)
  const PARTICLES_COUNT = Math.min(32, Math.floor((width * height) / 38000));
  const particles = [];

  class BioParticle {
    constructor() {
      this.reset(true);
    }

    reset(initial = false) {
      this.type = Math.random() > 0.45 ? 'rbc' : 'platelet';
      this.x = Math.random() * width;
      this.y = initial ? Math.random() * height : -60;
      
      // Depth layer (0.2 = far/blurry/slow, 1.0 = near/crisp/faster)
      this.depth = 0.25 + Math.random() * 0.75;
      
      // Scale based on type and depth
      if (this.type === 'rbc') {
        this.baseRadius = (16 + Math.random() * 18) * this.depth;
      } else {
        // Platelets are smaller, irregular
        this.baseRadius = (7 + Math.random() * 8) * this.depth;
      }

      this.speedY = (0.25 + Math.random() * 0.5) * this.depth;
      this.speedX = (Math.random() - 0.5) * 0.3 * this.depth;

      // 3D tumbling rotation angles
      this.angle = Math.random() * Math.PI * 2;
      this.rotationSpeed = (Math.random() - 0.5) * 0.015;
      this.tilt = Math.random() * Math.PI * 2;
      this.tiltSpeed = (0.005 + Math.random() * 0.012) * (Math.random() > 0.5 ? 1 : -1);

      // Opacity adjusted for gentle background aesthetic (never overbearing)
      this.alpha = (0.15 + this.depth * 0.28);
    }

    update() {
      this.y += this.speedY;
      this.x += this.speedX;

      this.angle += this.rotationSpeed;
      this.tilt += this.tiltSpeed;

      // Mouse repulsion (organic drift away from cursor)
      const dx = this.x - mouse.x;
      const dy = this.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < mouse.radius) {
        const force = (1 - dist / mouse.radius) * 2 * this.depth;
        this.x += (dx / (dist || 1)) * force;
        this.y += (dy / (dist || 1)) * force;
      }

      // Wrap around bounds
      if (this.y > height + 80) {
        this.y = -60;
        this.x = Math.random() * width;
      }
      if (this.x < -80) this.x = width + 60;
      if (this.x > width + 80) this.x = -60;
    }

    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Pseudo-3D projection: tilt alters the vertical compression of the cell disc
      const compression = 0.35 + 0.65 * Math.abs(Math.cos(this.tilt));
      ctx.scale(1, compression);

      ctx.globalAlpha = this.alpha;

      if (this.type === 'rbc') {
        this.drawRBC();
      } else {
        this.drawPlatelet();
      }

      ctx.restore();
    }

    /**
     * Draw Biconcave Red Blood Cell (Erythrocyte)
     */
    drawRBC() {
      const r = this.baseRadius;

      // Outer rim gradient (deep crimson to vibrant scarlet)
      const grad = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
      grad.addColorStop(0, '#991b1b');    // Dark central depression
      grad.addColorStop(0.35, '#7f1d1d'); // Core dip shadow
      grad.addColorStop(0.65, '#dc2626'); // Thick outer doughnut rim
      grad.addColorStop(0.9, '#ef4444');  // Specular rim light
      grad.addColorStop(1, '#b91c1c');    // Outer perimeter edge

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // Soft central biconcave dimple highlight
      const innerGrad = ctx.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r * 0.55);
      innerGrad.addColorStop(0, 'rgba(254, 202, 202, 0.45)');
      innerGrad.addColorStop(0.5, 'rgba(220, 38, 38, 0.1)');
      innerGrad.addColorStop(1, 'rgba(127, 29, 29, 0.6)');

      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    /**
     * Draw Blood Platelet (Thrombocyte - smaller, oval with soft pseudopodia nodes)
     */
    drawPlatelet() {
      const r = this.baseRadius;

      // Soft platelet body
      const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
      grad.addColorStop(0, '#fca5a5');    // Glowing pale center
      grad.addColorStop(0.5, '#ef4444');  // Platelet membrane
      grad.addColorStop(1, '#b91c1c');    // Edge

      ctx.fillStyle = grad;

      // Organic amoeboid/oval shape with small soft protrusions
      ctx.beginPath();
      const points = 7;
      for (let i = 0; i < points; i++) {
        const a = (i / points) * Math.PI * 2;
        // subtle variation in radius creating organic platelet form
        const wave = 1 + 0.18 * Math.sin(a * 3 + this.angle);
        const px = Math.cos(a) * r * wave;
        const py = Math.sin(a) * r * wave * 0.8;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Micro-granules inside platelet
      ctx.fillStyle = 'rgba(153, 27, 27, 0.4)';
      ctx.beginPath();
      ctx.arc(-r * 0.2, -r * 0.1, r * 0.2, 0, Math.PI * 2);
      ctx.arc(r * 0.25, r * 0.15, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Populate initial particles
  for (let i = 0; i < PARTICLES_COUNT; i++) {
    particles.push(new BioParticle());
  }

  // Animation Loop
  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
    }

    requestAnimationFrame(animate);
  }

  // Start animation loop
  requestAnimationFrame(animate);
})();

(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  const panel = document.getElementById('centerPanel');
  const startBtn = document.getElementById('startBtn');
  const hud = document.getElementById('hud');
  const scoreEl = document.getElementById('score');
  const shieldBar = document.getElementById('shieldBar');
  const speedEl = document.getElementById('speed');
  const pauseBadge = document.getElementById('pauseBadge');

  if (!gl) {
    panel.innerHTML = '<h1>WebGL недоступен</h1><p>Открой игру в современном браузере с включённым аппаратным ускорением.</p>';
    return;
  }

  const TAU = Math.PI * 2;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const choice = (arr) => arr[(Math.random() * arr.length) | 0];

  const Vec3 = {
    sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
    norm(v) {
      const len = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / len, v[1] / len, v[2] / len];
    },
  };

  const Mat4 = {
    identity() {
      return new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]);
    },
    multiply(a, b) {
      const out = new Float32Array(16);
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
      out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
      out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
      out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
      out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      return out;
    },
    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2);
      const nf = 1 / (near - far);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, (2 * far * near) * nf, 0,
      ]);
    },
    lookAt(eye, center, up) {
      const z = Vec3.norm(Vec3.sub(eye, center));
      const x = Vec3.norm(Vec3.cross(up, z));
      const y = Vec3.cross(z, x);
      return new Float32Array([
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
        -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
        -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
        1,
      ]);
    },
    model(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
      const cx = Math.cos(rx), sxn = Math.sin(rx);
      const cy = Math.cos(ry), syn = Math.sin(ry);
      const cz = Math.cos(rz), szn = Math.sin(rz);

      // Rotation matrix Rz * Ry * Rx, scaled per basis vector.
      const m00 = cz * cy;
      const m01 = szn * cy;
      const m02 = -syn;

      const m10 = cz * syn * sxn - szn * cx;
      const m11 = szn * syn * sxn + cz * cx;
      const m12 = cy * sxn;

      const m20 = cz * syn * cx + szn * sxn;
      const m21 = szn * syn * cx - cz * sxn;
      const m22 = cy * cx;

      return new Float32Array([
        m00 * sx, m01 * sx, m02 * sx, 0,
        m10 * sy, m11 * sy, m12 * sy, 0,
        m20 * sz, m21 * sz, m22 * sz, 0,
        x, y, z, 1,
      ]);
    },
  };

  const VERT = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uModel;
    uniform mat4 uViewProj;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vWorld = world.xyz;
      vNormal = normalize(mat3(uModel) * aNormal);
      gl_Position = uViewProj * world;
    }
  `;

  const FRAG = `
    precision mediump float;
    uniform vec3 uColor;
    uniform float uGlow;
    uniform vec3 uLight;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vec3 n = normalize(vNormal);
      float d = max(dot(n, normalize(uLight)), 0.0);
      float rim = pow(1.0 - max(dot(n, normalize(vec3(0.0, 0.4, 1.0))), 0.0), 2.0);
      vec3 col = uColor * (0.20 + 0.74 * d) + uColor * rim * (0.20 + uGlow * 0.75);
      col += uColor * uGlow * 0.18;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function createProgram(vs, fs) {
    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  const program = createProgram(VERT, FRAG);
  const loc = {
    position: gl.getAttribLocation(program, 'aPosition'),
    normal: gl.getAttribLocation(program, 'aNormal'),
    model: gl.getUniformLocation(program, 'uModel'),
    viewProj: gl.getUniformLocation(program, 'uViewProj'),
    color: gl.getUniformLocation(program, 'uColor'),
    glow: gl.getUniformLocation(program, 'uGlow'),
    light: gl.getUniformLocation(program, 'uLight'),
  };

  function makeCubeData() {
    const p = [
      // front
      -1,-1, 1,  1,-1, 1,  1, 1, 1,  -1,-1, 1,  1, 1, 1,  -1, 1, 1,
      // back
       1,-1,-1, -1,-1,-1, -1, 1,-1,   1,-1,-1, -1, 1,-1,   1, 1,-1,
      // top
      -1, 1, 1,  1, 1, 1,  1, 1,-1,  -1, 1, 1,  1, 1,-1,  -1, 1,-1,
      // bottom
      -1,-1,-1,  1,-1,-1,  1,-1, 1,  -1,-1,-1,  1,-1, 1,  -1,-1, 1,
      // right
       1,-1, 1,  1,-1,-1,  1, 1,-1,   1,-1, 1,  1, 1,-1,   1, 1, 1,
      // left
      -1,-1,-1, -1,-1, 1, -1, 1, 1,  -1,-1,-1, -1, 1, 1,  -1, 1,-1,
    ];
    const ns = [
      [0,0,1], [0,0,-1], [0,1,0], [0,-1,0], [1,0,0], [-1,0,0]
    ];
    const n = [];
    for (const face of ns) for (let i = 0; i < 6; i++) n.push(face[0], face[1], face[2]);
    return { positions: new Float32Array(p), normals: new Float32Array(n), count: 36 };
  }

  function makePyramidData() {
    const verts = [
      [0, 1.25, 0], [-1, -1, 1], [1, -1, 1],
      [0, 1.25, 0], [1, -1, 1], [1, -1, -1],
      [0, 1.25, 0], [1, -1, -1], [-1, -1, -1],
      [0, 1.25, 0], [-1, -1, -1], [-1, -1, 1],
      [-1, -1, 1], [-1, -1, -1], [1, -1, -1],
      [-1, -1, 1], [1, -1, -1], [1, -1, 1],
    ];
    const positions = [];
    const normals = [];
    for (let i = 0; i < verts.length; i += 3) {
      const a = verts[i], b = verts[i + 1], c = verts[i + 2];
      const normal = Vec3.norm(Vec3.cross(Vec3.sub(b, a), Vec3.sub(c, a)));
      for (const v of [a, b, c]) {
        positions.push(v[0], v[1], v[2]);
        normals.push(normal[0], normal[1], normal[2]);
      }
    }
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), count: verts.length };
  }

  function makeBuffer(data) {
    const vao = {
      p: gl.createBuffer(),
      n: gl.createBuffer(),
      count: data.count,
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, vao.p);
    gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, vao.n);
    gl.bufferData(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);
    return vao;
  }

  const meshes = {
    cube: makeBuffer(makeCubeData()),
    pyramid: makeBuffer(makePyramidData()),
  };

  function useMesh(mesh) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p);
    gl.enableVertexAttribArray(loc.position);
    gl.vertexAttribPointer(loc.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.n);
    gl.enableVertexAttribArray(loc.normal);
    gl.vertexAttribPointer(loc.normal, 3, gl.FLOAT, false, 0, 0);
  }

  const COLORS = {
    player: [0.30, 0.92, 1.00],
    player2: [1.00, 0.30, 0.84],
    road: [0.08, 0.16, 0.36],
    rail: [0.10, 0.90, 1.00],
    obstacle: [1.00, 0.17, 0.32],
    crystal: [0.72, 1.00, 0.30],
    enemy: [1.00, 0.52, 0.12],
    projectile: [0.96, 1.00, 0.78],
    star: [0.56, 0.68, 1.00],
    tunnel: [0.45, 0.18, 1.00],
    particle: [1.00, 0.78, 0.28],
  };

  class AudioKit {
    constructor() {
      this.ctx = null;
      this.enabled = true;
    }
    ensure() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    tone(freq = 440, dur = 0.08, type = 'sine', gain = 0.05) {
      if (!this.enabled) return;
      this.ensure();
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + dur);
    }
    collect() { this.tone(880, 0.06, 'triangle', 0.04); this.tone(1320, 0.08, 'triangle', 0.025); }
    shoot() { this.tone(520, 0.05, 'square', 0.025); }
    hit() { this.tone(120, 0.14, 'sawtooth', 0.075); }
    boom() { this.tone(90, 0.18, 'sawtooth', 0.08); this.tone(55, 0.24, 'square', 0.045); }
    start() { this.tone(420, 0.06, 'triangle', 0.045); setTimeout(() => this.tone(720, 0.08, 'triangle', 0.045), 70); }
  }

  class Game {
    constructor() {
      this.state = 'menu';
      this.keys = new Set();
      this.audio = new AudioKit();
      this.pointer = { active: false, x: 0, y: 0 };
      this.last = performance.now();
      this.initStars();
      this.reset();
      this.bind();
      this.resize();
      requestAnimationFrame((t) => this.loop(t));
    }

    initStars() {
      this.stars = [];
      for (let i = 0; i < 150; i++) {
        this.stars.push({ x: rand(-30, 30), y: rand(-18, 18), z: rand(-130, 18), s: rand(0.03, 0.13), tw: rand(0, TAU) });
      }
    }

    reset() {
      this.time = 0;
      this.score = 0;
      this.best = Number(localStorage.getItem('neon-rift-best') || '0');
      this.shield = 100;
      this.speed = 18;
      this.spawnObstacle = 0.25;
      this.spawnCrystal = 0.8;
      this.spawnEnemy = 2.6;
      this.spawnTunnel = 0.1;
      this.shootCooldown = 0;
      this.invuln = 0;
      this.player = { x: 0, y: 0, z: 0, vx: 0, vy: 0, tilt: 0, bob: 0 };
      this.obstacles = [];
      this.crystals = [];
      this.enemies = [];
      this.projectiles = [];
      this.tunnels = [];
      this.particles = [];
      this.roadSegments = [];
      for (let i = 0; i < 16; i++) this.roadSegments.push({ z: -i * 12, pulse: Math.random() * TAU });
      scoreEl.textContent = '0';
      shieldBar.style.transform = 'scaleX(1)';
      speedEl.textContent = '1.0x';
    }

    bind() {
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('keydown', (e) => {
        const code = e.code;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
        this.keys.add(code);
        if (code === 'KeyP') this.togglePause();
        if (code === 'KeyR') this.start(true);
        if (code === 'Enter' && this.state !== 'running') this.start(true);
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      startBtn.addEventListener('click', () => this.start(true));
      canvas.addEventListener('pointerdown', (e) => { this.pointer.active = true; this.setPointer(e); if (this.state === 'menu') this.start(true); });
      canvas.addEventListener('pointermove', (e) => { if (this.pointer.active) this.setPointer(e); });
      window.addEventListener('pointerup', () => { this.pointer.active = false; });
    }

    setPointer(e) {
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(innerWidth * dpr);
      const h = Math.floor(innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      this.proj = Mat4.perspective(Math.PI / 3, canvas.width / canvas.height, 0.1, 260);
    }

    start(forceReset = false) {
      if (forceReset || this.state === 'gameover') this.reset();
      this.state = 'running';
      panel.classList.add('hidden');
      hud.classList.remove('hidden');
      pauseBadge.classList.add('hidden');
      this.audio.start();
    }

    togglePause() {
      if (this.state === 'running') {
        this.state = 'paused';
        pauseBadge.classList.remove('hidden');
      } else if (this.state === 'paused') {
        this.state = 'running';
        pauseBadge.classList.add('hidden');
      }
    }

    endGame() {
      this.state = 'gameover';
      this.best = Math.max(this.best, Math.floor(this.score));
      localStorage.setItem('neon-rift-best', String(this.best));
      hud.classList.add('hidden');
      panel.classList.remove('hidden');
      panel.innerHTML = `
        <div>
          <h1>РАЗЛОМ ЗАКРЫТ</h1>
          <p class="subtitle">Счёт: <b>${Math.floor(this.score)}</b> · Лучший: <b>${this.best}</b></p>
          <div class="controls">
            <p>Ты потерял щит. Собирай кристаллы, держись дальше от красных блоков и сбивай дронов.</p>
          </div>
          <button id="restartBtn">Играть снова</button>
          <p class="tip">Клавиша R тоже запускает рестарт.</p>
        </div>`;
      document.getElementById('restartBtn').addEventListener('click', () => this.start(true));
      this.audio.boom();
    }

    loop(now) {
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      if (this.state === 'running') this.update(dt);
      else this.updateMenu(dt);
      this.render();
      requestAnimationFrame((t) => this.loop(t));
    }

    updateMenu(dt) {
      this.time += dt * 0.7;
      for (const star of this.stars) {
        star.z += 8 * dt;
        if (star.z > 16) { star.z = -135; star.x = rand(-32, 32); star.y = rand(-18, 18); }
      }
      for (const seg of this.roadSegments) {
        seg.z += 8 * dt;
        if (seg.z > 14) seg.z -= 16 * 12;
      }
    }

    update(dt) {
      this.time += dt;
      this.speed = 18 + this.time * 0.62 + Math.floor(this.score / 550) * 1.2;
      this.score += dt * (9 + this.speed * 0.55);
      this.shootCooldown = Math.max(0, this.shootCooldown - dt);
      this.invuln = Math.max(0, this.invuln - dt);

      const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
      const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
      const up = this.keys.has('ArrowUp') || this.keys.has('KeyW');
      const down = this.keys.has('ArrowDown') || this.keys.has('KeyS');
      let targetX = (right ? 1 : 0) - (left ? 1 : 0);
      let targetY = (up ? 1 : 0) - (down ? 1 : 0);

      if (this.pointer.active) {
        const px = clamp(this.pointer.x * 9, -8.5, 8.5);
        const py = clamp(this.pointer.y * 4.2, -3.2, 4.2);
        this.player.x = lerp(this.player.x, px, 1 - Math.pow(0.003, dt));
        this.player.y = lerp(this.player.y, py, 1 - Math.pow(0.006, dt));
      } else {
        this.player.vx = lerp(this.player.vx, targetX * 22, 1 - Math.pow(0.0008, dt));
        this.player.vy = lerp(this.player.vy, targetY * 13, 1 - Math.pow(0.001, dt));
        this.player.x = clamp(this.player.x + this.player.vx * dt, -8.6, 8.6);
        this.player.y = clamp(this.player.y + this.player.vy * dt, -3.2, 4.2);
      }
      this.player.tilt = lerp(this.player.tilt, clamp(-this.player.vx * 0.032, -0.55, 0.55), 1 - Math.pow(0.002, dt));
      this.player.bob += dt * 6;

      if ((this.keys.has('Space') || this.pointer.active) && this.shootCooldown <= 0) this.fire();

      this.spawnObstacle -= dt;
      this.spawnCrystal -= dt;
      this.spawnEnemy -= dt;
      this.spawnTunnel -= dt;
      if (this.spawnObstacle <= 0) { this.makeObstacle(); this.spawnObstacle = rand(0.36, 0.72) * Math.max(0.48, 1.18 - this.time * 0.008); }
      if (this.spawnCrystal <= 0) { this.makeCrystal(); this.spawnCrystal = rand(0.48, 0.95); }
      if (this.spawnEnemy <= 0) { this.makeEnemy(); this.spawnEnemy = rand(2.0, 4.5) * Math.max(0.54, 1.0 - this.time * 0.006); }
      if (this.spawnTunnel <= 0) { this.makeTunnel(); this.spawnTunnel = 1.45; }

      this.moveWorld(dt);
      this.collisions();
      this.updateHud();
      if (this.shield <= 0) this.endGame();
    }

    fire() {
      this.shootCooldown = 0.18;
      this.projectiles.push({ x: this.player.x - 0.48, y: this.player.y, z: -2.8, life: 1.3 });
      this.projectiles.push({ x: this.player.x + 0.48, y: this.player.y, z: -2.8, life: 1.3 });
      this.audio.shoot();
    }

    makeObstacle() {
      const lane = choice([-7.2, -4.8, -2.4, 0, 2.4, 4.8, 7.2]);
      const y = rand(-2.8, 3.6);
      const tall = Math.random() < 0.35;
      this.obstacles.push({
        x: lane + rand(-0.5, 0.5),
        y,
        z: -95,
        sx: tall ? rand(0.7, 1.2) : rand(1.0, 1.8),
        sy: tall ? rand(2.2, 3.8) : rand(0.8, 1.5),
        sz: rand(1.1, 2.5),
        rot: rand(0, TAU),
        hp: 1,
      });
    }

    makeCrystal() {
      const count = Math.random() < 0.32 ? 4 : 1;
      const baseX = rand(-7, 7);
      const baseY = rand(-2.5, 3.5);
      for (let i = 0; i < count; i++) {
        this.crystals.push({ x: clamp(baseX + i * 1.2 - count * 0.55, -8, 8), y: baseY + Math.sin(i) * 0.5, z: -95 - i * 2.2, rot: rand(0, TAU), taken: false });
      }
    }

    makeEnemy() {
      this.enemies.push({
        x: rand(-7.5, 7.5),
        y: rand(-2.2, 3.7),
        z: -105,
        hp: 2,
        wobble: rand(0, TAU),
        baseX: rand(-7.0, 7.0),
        rot: 0,
      });
    }

    makeTunnel() {
      this.tunnels.push({ z: -110, rot: rand(0, TAU), pulse: rand(0, TAU) });
    }

    makeExplosion(x, y, z, color = COLORS.particle, amount = 16) {
      for (let i = 0; i < amount; i++) {
        this.particles.push({
          x, y, z,
          vx: rand(-9, 9), vy: rand(-7, 7), vz: rand(-8, 8),
          life: rand(0.28, 0.75), max: 0.75,
          s: rand(0.05, 0.18), color,
        });
      }
    }

    moveWorld(dt) {
      const dz = this.speed * dt;
      for (const star of this.stars) {
        star.z += dz * 1.2;
        star.tw += dt * 4;
        if (star.z > 18) { star.z = -135; star.x = rand(-32, 32); star.y = rand(-18, 18); }
      }
      for (const seg of this.roadSegments) {
        seg.z += dz;
        if (seg.z > 15) seg.z -= 16 * 12;
      }
      for (const o of this.obstacles) { o.z += dz; o.rot += dt * 1.2; }
      for (const c of this.crystals) { c.z += dz; c.rot += dt * 4.0; }
      for (const e of this.enemies) {
        e.z += dz * 0.95;
        e.wobble += dt * 2.8;
        e.x = e.baseX + Math.sin(e.wobble) * 1.2;
        e.rot += dt * 2;
      }
      for (const p of this.projectiles) { p.z -= 56 * dt; p.life -= dt; }
      for (const t of this.tunnels) { t.z += dz; t.rot += dt * 0.4; t.pulse += dt * 3.0; }
      for (const p of this.particles) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += (p.vz + dz) * dt;
        p.vx *= Math.pow(0.08, dt); p.vy *= Math.pow(0.08, dt); p.vz *= Math.pow(0.08, dt);
        p.life -= dt;
      }
      this.obstacles = this.obstacles.filter((o) => o.z < 13 && o.hp > 0);
      this.crystals = this.crystals.filter((c) => c.z < 13 && !c.taken);
      this.enemies = this.enemies.filter((e) => e.z < 14 && e.hp > 0);
      this.projectiles = this.projectiles.filter((p) => p.life > 0 && p.z > -125);
      this.tunnels = this.tunnels.filter((t) => t.z < 18);
      this.particles = this.particles.filter((p) => p.life > 0);
    }

    distToPlayer(o) {
      return Math.hypot(o.x - this.player.x, o.y - this.player.y, o.z - this.player.z);
    }

    collisions() {
      for (const c of this.crystals) {
        if (this.distToPlayer(c) < 1.35) {
          c.taken = true;
          this.score += 75;
          this.shield = Math.min(100, this.shield + 3.5);
          this.makeExplosion(c.x, c.y, c.z, COLORS.crystal, 8);
          this.audio.collect();
        }
      }
      for (const o of this.obstacles) {
        const radius = Math.max(o.sx, o.sy, o.sz) * 0.92;
        if (this.invuln <= 0 && this.distToPlayer(o) < radius + 0.92) {
          o.hp = 0;
          this.shield -= 22;
          this.invuln = 0.85;
          this.makeExplosion(o.x, o.y, o.z, COLORS.obstacle, 20);
          this.audio.hit();
        }
      }
      for (const e of this.enemies) {
        if (this.invuln <= 0 && this.distToPlayer(e) < 1.55) {
          e.hp = 0;
          this.shield -= 16;
          this.invuln = 0.6;
          this.makeExplosion(e.x, e.y, e.z, COLORS.enemy, 20);
          this.audio.hit();
        }
      }
      for (const p of this.projectiles) {
        for (const e of this.enemies) {
          if (Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) < 1.5) {
            p.life = 0;
            e.hp -= 1;
            this.score += 55;
            this.makeExplosion(e.x, e.y, e.z, COLORS.enemy, 9);
            if (e.hp <= 0) { this.score += 160; this.audio.collect(); }
          }
        }
        for (const o of this.obstacles) {
          if (Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z) < Math.max(o.sx, o.sy, o.sz) + 0.5) {
            p.life = 0;
            o.hp -= 1;
            this.score += 25;
            this.makeExplosion(o.x, o.y, o.z, COLORS.obstacle, 8);
          }
        }
      }
    }

    updateHud() {
      scoreEl.textContent = String(Math.floor(this.score));
      shieldBar.style.transform = `scaleX(${clamp(this.shield, 0, 100) / 100})`;
      speedEl.textContent = `${(this.speed / 18).toFixed(1)}x`;
    }

    draw(meshName, x, y, z, sx, sy, sz, color, glow = 0.0, rx = 0, ry = 0, rz = 0) {
      const mesh = meshes[meshName];
      useMesh(mesh);
      gl.uniformMatrix4fv(loc.model, false, Mat4.model(x, y, z, sx, sy, sz, rx, ry, rz));
      gl.uniform3fv(loc.color, color);
      gl.uniform1f(loc.glow, glow);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }

    render() {
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.clearColor(0.015, 0.025, 0.065, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform3fv(loc.light, [0.35, 0.65, 0.9]);

      const camShake = this.invuln > 0 ? Math.sin(this.time * 78) * 0.12 : 0;
      const eye = [this.player.x * 0.22 + camShake, 5.4 + this.player.y * 0.12, 11.5];
      const center = [this.player.x * 0.40, this.player.y * 0.23, -18];
      const view = Mat4.lookAt(eye, center, [0, 1, 0]);
      const viewProj = Mat4.multiply(this.proj, view);
      gl.uniformMatrix4fv(loc.viewProj, false, viewProj);

      this.drawBackground();
      this.drawTunnel();
      this.drawRoad();
      this.drawObjects();
      this.drawPlayer();
      this.drawParticles();
    }

    drawBackground() {
      for (const s of this.stars) {
        const glow = 0.15 + Math.sin(s.tw) * 0.08;
        this.draw('cube', s.x, s.y, s.z, s.s, s.s, s.s, COLORS.star, glow, 0, 0, 0);
      }
    }

    drawRoad() {
      for (const seg of this.roadSegments) {
        const pulse = 0.05 + Math.sin(this.time * 5 + seg.pulse) * 0.025;
        this.draw('cube', 0, -6.2, seg.z, 11.0, 0.08, 5.2, COLORS.road, pulse, 0, 0, 0);
        this.draw('cube', -10.2, -2.0, seg.z, 0.06, 4.4, 5.2, COLORS.rail, 0.35, 0, 0, 0);
        this.draw('cube', 10.2, -2.0, seg.z, 0.06, 4.4, 5.2, COLORS.rail, 0.35, 0, 0, 0);
        this.draw('cube', 0, 6.0, seg.z, 11.0, 0.06, 5.2, COLORS.tunnel, 0.12, 0, 0, 0);
      }
    }

    drawTunnel() {
      for (const t of this.tunnels) {
        const s = 1 + Math.sin(t.pulse) * 0.06;
        const z = t.z;
        this.draw('cube', 0, -6.5, z, 12.5 * s, 0.08, 0.18, COLORS.tunnel, 0.45, 0, 0, t.rot);
        this.draw('cube', 0, 6.5, z, 12.5 * s, 0.08, 0.18, COLORS.tunnel, 0.45, 0, 0, -t.rot);
        this.draw('cube', -10.5, 0, z, 0.08, 6.8 * s, 0.18, COLORS.tunnel, 0.45, 0, 0, t.rot * 0.4);
        this.draw('cube', 10.5, 0, z, 0.08, 6.8 * s, 0.18, COLORS.tunnel, 0.45, 0, 0, -t.rot * 0.4);
      }
    }

    drawObjects() {
      for (const o of this.obstacles) {
        this.draw('cube', o.x, o.y, o.z, o.sx, o.sy, o.sz, COLORS.obstacle, 0.22, o.rot * 0.5, o.rot, o.rot * 0.3);
      }
      for (const c of this.crystals) {
        const bob = Math.sin(this.time * 6 + c.rot) * 0.18;
        this.draw('pyramid', c.x, c.y + bob, c.z, 0.55, 0.82, 0.55, COLORS.crystal, 0.55, 0, c.rot, 0);
        this.draw('pyramid', c.x, c.y - 0.95 + bob, c.z, 0.48, -0.55, 0.48, COLORS.crystal, 0.38, 0, -c.rot, 0);
      }
      for (const e of this.enemies) {
        this.draw('cube', e.x, e.y, e.z, 1.05, 0.55, 0.55, COLORS.enemy, 0.22, 0, e.rot, 0);
        this.draw('cube', e.x - 1.18, e.y, e.z, 0.22, 0.16, 0.9, COLORS.enemy, 0.28, 0, e.rot, 0.45);
        this.draw('cube', e.x + 1.18, e.y, e.z, 0.22, 0.16, 0.9, COLORS.enemy, 0.28, 0, e.rot, -0.45);
      }
      for (const p of this.projectiles) {
        this.draw('cube', p.x, p.y, p.z, 0.11, 0.11, 0.72, COLORS.projectile, 0.7, 0, 0, 0);
      }
    }

    drawPlayer() {
      const flicker = this.invuln > 0 && Math.floor(this.time * 24) % 2 === 0;
      if (flicker) return;
      const p = this.player;
      const bob = Math.sin(p.bob) * 0.08;
      this.draw('pyramid', p.x, p.y + bob, p.z, 0.72, 0.52, 1.25, COLORS.player, 0.28, -0.18, Math.PI, p.tilt);
      this.draw('cube', p.x, p.y - 0.36 + bob, p.z + 0.15, 0.64, 0.18, 0.72, COLORS.player2, 0.26, 0, 0, p.tilt);
      this.draw('cube', p.x - 0.86, p.y - 0.12 + bob, p.z + 0.2, 0.42, 0.08, 0.88, COLORS.player, 0.36, 0.05, 0, p.tilt + 0.25);
      this.draw('cube', p.x + 0.86, p.y - 0.12 + bob, p.z + 0.2, 0.42, 0.08, 0.88, COLORS.player, 0.36, -0.05, 0, p.tilt - 0.25);
      this.draw('cube', p.x, p.y - 0.18 + bob, p.z + 1.18, 0.28, 0.09, 0.18, COLORS.projectile, 0.65, 0, 0, 0);
    }

    drawParticles() {
      for (const p of this.particles) {
        const k = Math.max(0.02, p.life / p.max);
        this.draw('cube', p.x, p.y, p.z, p.s * k, p.s * k, p.s * k, p.color, 0.5 * k, 0, this.time * 3, 0);
      }
    }
  }

  new Game();
})();

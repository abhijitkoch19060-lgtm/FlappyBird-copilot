/* Flappy Bird — Ancient Pillars
   - Canvas-based game
   - Menu: New Game, Settings, Quit
   - Settings: bird color, eye size, volume, mute
   - Countdown 3→0
   - Controls: Left click or Space to flap
   - Score up to 999
   - Sounds: pass pillar, hit/fall
   - Fullscreen 16:9 via CSS container
*/

(() => {
  // Canvas and context
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // UI elements
  const homeMenu = document.getElementById('homeMenu');
  const btnNewGame = document.getElementById('btnNewGame');
  const btnSettings = document.getElementById('btnSettings');
  const btnQuit = document.getElementById('btnQuit');

  const countdownEl = document.getElementById('countdown');
  const hud = document.getElementById('hud');
  const scoreValue = document.getElementById('scoreValue');

  const gameOverPanel = document.getElementById('gameOverPanel');
  const finalScoreEl = document.getElementById('finalScore');
  const btnReset = document.getElementById('btnReset');
  const btnBackToMenu = document.getElementById('btnBackToMenu');

  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const birdColorInput = document.getElementById('birdColor');
  const eyeSizeInput = document.getElementById('eyeSize');
  const volumeInput = document.getElementById('volume');
  const muteToggle = document.getElementById('muteToggle');

  // Game state
  const state = {
    running: false,
    gameOver: false,
    score: 0,
    gravity: 0.45,
    flapStrength: -8.5,
    bird: {
      x: 320,
      y: 360,
      vy: 0,
      radius: 18, // medium bird
      color: '#2ecc71',
      eyeSize: 10, // medium eyes
    },
    pillars: [],
    pillarGap: 160,
    pillarWidth: 80,
    pillarSpeed: 3.2,
    spawnInterval: 1600, // ms
    lastSpawn: 0,
    maxScore: 999,
    clouds: [],
    lastTime: 0,
    countdown: 3,
    inCountdown: false,
    audio: {
      context: null,
      volume: 0.7,
      muted: false,
    }
  };

  // Persist settings in localStorage
  const SETTINGS_KEY = 'flappy_settings_v1';
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.birdColor) state.bird.color = s.birdColor;
      if (typeof s.eyeSize === 'number') state.bird.eyeSize = s.eyeSize;
      if (typeof s.volume === 'number') state.audio.volume = s.volume;
      if (typeof s.muted === 'boolean') state.audio.muted = s.muted;

      // Reflect in UI
      birdColorInput.value = state.bird.color;
      eyeSizeInput.value = String(state.bird.eyeSize);
      volumeInput.value = String(Math.round(state.audio.volume * 100));
      muteToggle.checked = state.audio.muted;
    } catch (e) {}
  }
  function saveSettings() {
    const s = {
      birdColor: state.bird.color,
      eyeSize: state.bird.eyeSize,
      volume: state.audio.volume,
      muted: state.audio.muted
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  // Audio (WebAudio simple beeps)
  function initAudio() {
    if (state.audio.context) return;
    try {
      state.audio.context = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      state.audio.context = null;
    }
  }
  function playBeep(freq = 600, duration = 0.08, type = 'sine', gain = 0.25) {
    if (!state.audio.context || state.audio.muted) return;
    const ctxA = state.audio.context;
    const osc = ctxA.createOscillator();
    const g = ctxA.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain * state.audio.volume;
    osc.connect(g);
    g.connect(ctxA.destination);
    osc.start();
    osc.stop(ctxA.currentTime + duration);
  }
  const sfx = {
    pass() { playBeep(880, 0.06, 'square', 0.22); },
    hit() { playBeep(220, 0.18, 'sawtooth', 0.35); }
  };

  // Clouds for background
  function spawnCloud() {
    const w = rand(120, 260);
    const h = rand(40, 90);
    const y = rand(40, canvas.height * 0.5);
    const speed = rand(0.3, 0.8);
    state.clouds.push({ x: canvas.width + w, y, w, h, speed, alpha: rand(0.5, 0.9) });
  }
  function updateClouds(dt) {
    if (Math.random() < 0.02) spawnCloud();
    for (let c of state.clouds) c.x -= c.speed * dt * 0.06;
    state.clouds = state.clouds.filter(c => c.x + c.w > -20);
  }
  function drawClouds() {
    for (let c of state.clouds) {
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = '#ffffff';
      roundedRect(c.x, c.y, c.w, c.h, Math.min(24, c.h/2));
      ctx.globalAlpha = 1;
    }
  }

  // Ancient pillar style (1200s-inspired): fluted shaft, base, capital
  function spawnPillar() {
    const gapY = rand(160, canvas.height - 160);
    const topHeight = gapY - state.pillarGap / 2;
    const bottomY = gapY + state.pillarGap / 2;
    const bottomHeight = canvas.height - bottomY;

    state.pillars.push({
      x: canvas.width + 40,
      width: state.pillarWidth,
      topHeight,
      bottomY,
      bottomHeight,
      passed: false
    });
  }
  function updatePillars(dt) {
    for (let p of state.pillars) p.x -= state.pillarSpeed * dt * 0.06;
    state.pillars = state.pillars.filter(p => p.x + p.width > -20);
  }
  function drawPillarSegment(x, y, w, h, isTop) {
    // Shaft
    ctx.fillStyle = '#c2b280'; // sandstone
    ctx.fillRect(x, y, w, h);

    // Fluting lines
    ctx.strokeStyle = '#a8956a';
    ctx.lineWidth = 2;
    const flutes = 6;
    for (let i = 1; i < flutes; i++) {
      const fx = x + (w * i) / flutes;
      ctx.beginPath();
      ctx.moveTo(fx, y + 4);
      ctx.lineTo(fx, y + h - 4);
      ctx.stroke();
    }

    // Base or capital
    ctx.fillStyle = '#b8a36a';
    const capHeight = 16;
    if (isTop) {
      // Capital at bottom of top pillar
      ctx.fillRect(x - 6, y + h - capHeight, w + 12, capHeight);
      // Decorative abacus
      ctx.fillStyle = '#a88f57';
      ctx.fillRect(x - 10, y + h - capHeight - 6, w + 20, 6);
    } else {
      // Base at top of bottom pillar
      ctx.fillRect(x - 6, y, w + 12, capHeight);
      ctx.fillStyle = '#a88f57';
      ctx.fillRect(x - 10, y + capHeight, w + 20, 6);
    }
  }
  function drawPillars() {
    for (let p of state.pillars) {
      // Top pillar
      drawPillarSegment(p.x, 0, p.width, p.topHeight, true);
      // Bottom pillar
      drawPillarSegment(p.x, p.bottomY, p.width, p.bottomHeight, false);
    }
  }

  // Bird
  function drawBird() {
    const b = state.bird;
    // Body
    ctx.fillStyle = b.color;
    circle(b.x, b.y, b.radius);

    // Wing (simple arc)
    ctx.strokeStyle = shadeColor(b.color, -20);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(b.x - 6, b.y + 2, b.radius - 8, Math.PI * 0.2, Math.PI * 1.2);
    ctx.stroke();

    // Eye
    const eyeR = b.eyeSize;
    ctx.fillStyle = '#ffffff';
    circle(b.x + 8, b.y - 6, eyeR);
    ctx.fillStyle = '#1c1c1c';
    circle(b.x + 8 + eyeR * 0.3, b.y - 6, Math.max(2, eyeR * 0.45));

    // Beak
    ctx.fillStyle = '#f1c40f';
    triangle(b.x + b.radius - 2, b.y + 2, b.x + b.radius + 16, b.y - 2, b.x + b.radius + 16, b.y + 6);
  }

  // Collision
  function checkCollision() {
    const b = state.bird;
    // Ground/ceiling
    if (b.y + b.radius >= canvas.height || b.y - b.radius <= 0) return true;

    // Pillars
    for (let p of state.pillars) {
      const inX = b.x + b.radius > p.x && b.x - b.radius < p.x + p.width;
      if (inX) {
        const inTop = b.y - b.radius < p.topHeight;
        const inBottom = b.y + b.radius > p.bottomY;
        if (inTop || inBottom) return true;
      }
    }
    return false;
  }

  // Scoring
  function updateScore() {
    for (let p of state.pillars) {
      if (!p.passed && state.bird.x > p.x + p.width) {
        p.passed = true;
        if (state.score < state.maxScore) {
          state.score++;
          scoreValue.textContent = String(state.score);
          sfx.pass();
        }
      }
    }
  }

  // Game loop
  function resetGame() {
    state.running = false;
    state.gameOver = false;
    state.score = 0;
    scoreValue.textContent = '0';
    state.bird.x = 320;
    state.bird.y = canvas.height / 2;
    state.bird.vy = 0;
    state.pillars = [];
    state.clouds = [];
    state.lastSpawn = performance.now();
  }

  function startCountdown() {
    state.inCountdown = true;
    countdownEl.classList.remove('hidden');
    hud.classList.add('hidden');
    let count = 3;
    countdownEl.textContent = String(count);
    const tick = () => {
      count--;
      if (count >= 0) {
        countdownEl.textContent = String(count);
        setTimeout(tick, 1000);
      } else {
        countdownEl.classList.add('hidden');
        state.inCountdown = false;
        startGame();
      }
    };
    setTimeout(tick, 1000);
  }

  function startGame() {
    resetGame();
    state.running = true;
    hud.classList.remove('hidden');
    homeMenu.classList.add('hidden');
    gameOverPanel.classList.add('hidden');
    state.lastTime = performance.now();
    state.lastSpawn = state.lastTime;
    requestAnimationFrame(loop);
  }

  function endGame() {
    state.running = false;
    state.gameOver = true;
    finalScoreEl.textContent = String(state.score);
    gameOverPanel.classList.remove('hidden');
    sfx.hit();
  }

  function loop(ts) {
    if (!state.running) return;
    const dt = ts - state.lastTime;
    state.lastTime = ts;

    // Update
    state.bird.vy += state.gravity;
    state.bird.y += state.bird.vy;

    // Spawn pillars
    if (ts - state.lastSpawn > state.spawnInterval) {
      spawnPillar();
      state.lastSpawn = ts;
    }

    updatePillars(dt);
    updateClouds(dt);
    updateScore();

    // Collision
    if (checkCollision()) {
      endGame();
      return;
    }

    // Draw
    drawScene();

    requestAnimationFrame(loop);
  }

  function drawScene() {
    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#87ceeb');
    g.addColorStop(1, '#b3e5ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clouds
    drawClouds();

    // Ground line (subtle)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 1);
    ctx.lineTo(canvas.width, canvas.height - 1);
    ctx.stroke();

    // Pillars
    drawPillars();

    // Bird
    drawBird();
  }

  // Input
  function flap() {
    if (state.inCountdown) return;
    if (!state.running) return;
    state.bird.vy = state.flapStrength;
  }

  // Mouse click
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) flap();
  });

  // Space bar
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      flap();
    }
  });

  // Menu buttons
  btnNewGame.addEventListener('click', () => {
    initAudio();
    startCountdown();
  });
  btnSettings.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });
  btnQuit.addEventListener('click', () => {
    // Simulate quit: show a confirmation and return to menu state
    if (confirm('Quit the game?')) {
      // If running, stop
      state.running = false;
      state.gameOver = false;
      hud.classList.add('hidden');
      gameOverPanel.classList.add('hidden');
      homeMenu.classList.remove('hidden');
    }
  });

  // Settings modal
  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });
  btnSaveSettings.addEventListener('click', () => {
    state.bird.color = birdColorInput.value;
    state.bird.eyeSize = parseInt(eyeSizeInput.value, 10);
    state.audio.volume = Math.max(0, Math.min(1, parseInt(volumeInput.value, 10) / 100));
    state.audio.muted = !!muteToggle.checked;
    saveSettings();
    settingsModal.classList.add('hidden');
  });

  // Game over buttons
  btnReset.addEventListener('click', () => {
    initAudio();
    startCountdown();
  });
  btnBackToMenu.addEventListener('click', () => {
    state.running = false;
    state.gameOver = false;
    hud.classList.add('hidden');
    gameOverPanel.classList.add('hidden');
    homeMenu.classList.remove('hidden');
  });

  // Helpers
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function triangle(x1, y1, x2, y2, x3, y3) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
  }
  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }
  function shadeColor(hex, percent) {
    const f = parseInt(hex.slice(1), 16);
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent) / 100;
    const R = f >> 16, G = (f >> 8) & 0x00FF, B = f & 0x0000FF;
    const newR = Math.round((t - R) * p) + R;
    const newG = Math.round((t - G) * p) + G;
    const newB = Math.round((t - B) * p) + B;
    return `#${(0x1000000 + (newR << 16) + (newG << 8) + newB).toString(16).slice(1)}`;
  }

  // Initialize
  loadSettings();
  // Pre-populate some clouds
  for (let i = 0; i < 6; i++) spawnCloud();
})();

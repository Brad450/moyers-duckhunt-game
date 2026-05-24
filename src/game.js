const STORAGE_KEY = "moyers-duck-hunt-v1";
const MAX_SHELLS = 6;
const MAX_ROUNDS = 5;
const ROUND_CONFIGS = [
  { hits: 10, misses: 5, speed: 0.92, spawnDelay: 1.18, doubleSpawnChance: 0 },
  { hits: 12, misses: 5, speed: 1.02, spawnDelay: 1.04, doubleSpawnChance: 0.08 },
  { hits: 14, misses: 4, speed: 1.14, spawnDelay: 0.9, doubleSpawnChance: 0.22 },
  { hits: 16, misses: 4, speed: 1.27, spawnDelay: 0.76, doubleSpawnChance: 0.34 },
  { hits: 20, misses: 3, speed: 1.42, spawnDelay: 0.62, doubleSpawnChance: 0.46 }
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);
const now = () => performance.now();

const loadImage = (src) => {
  const image = new Image();
  image.src = src;
  return image;
};

export class MoyersDuckHunt {
  constructor({ canvas, overlay, message, startButton, muteButton, endSummary, ctaButton, ui }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.overlay = overlay;
    this.message = message;
    this.startButton = startButton;
    this.muteButton = muteButton;
    this.endSummary = endSummary;
    this.ctaButton = ctaButton;
    this.ui = ui;
    this.pointer = { x: 0, y: 0, active: false };
    this.audio = null;
    this.soundEnabled = true;
    this.storage = this.loadStorage();
    this.assets = {
      background: loadImage("/assets/marsh-background.png"),
      ducks: [
        loadImage("/assets/duck-1.png"),
        loadImage("/assets/duck-2.png"),
        loadImage("/assets/duck-3.png"),
        loadImage("/assets/duck-5.png")
      ],
      eagle: loadImage("/assets/bonus-eagle.png")
    };
    this.state = "start";
    this.lastFrame = now();
    this.resetRun();
  }

  init() {
    this.bindEvents();
    this.resize();
    this.updateUi();
    this.renderStart();
    requestAnimationFrame((time) => this.tick(time));
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    this.startButton.addEventListener("click", () => this.handlePrimaryAction());
    this.muteButton.addEventListener("click", () => {
      this.soundEnabled = !this.soundEnabled;
      this.muteButton.textContent = this.soundEnabled ? "Sound On" : "Muted";
    });

    this.canvas.addEventListener("pointermove", (event) => this.updatePointer(event));
    this.canvas.addEventListener("pointerdown", (event) => {
      this.updatePointer(event);
      this.canvas.setPointerCapture?.(event.pointerId);
      this.shoot();
    });
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" && this.state === "playing") {
        event.preventDefault();
        this.shoot();
      }
      if (event.code === "Enter" && ["start", "gameOver", "roundSummary"].includes(this.state)) {
        this.handlePrimaryAction();
      }
    });
  }

  handlePrimaryAction() {
    if (this.state === "roundSummary") {
      if (this.round >= MAX_ROUNDS) {
        this.endGame("completed");
      } else {
        this.continueRound();
      }
      return;
    }
    this.startGame();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(320, rect.width);
    this.height = Math.max(360, rect.height);
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pointer.x = this.width / 2;
    this.pointer.y = this.height / 2;
  }

  loadStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { highScore: 0, runs: [] };
    } catch {
      return { highScore: 0, runs: [] };
    }
  }

  saveStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.storage));
  }

  resetRun() {
    this.score = 0;
    this.round = 1;
    this.roundEscaped = 0;
    this.totalEscaped = 0;
    this.shells = MAX_SHELLS;
    this.streak = 0;
    this.totalHits = 0;
    this.bestStreak = 0;
    this.roundBestStreak = 0;
    this.completedRounds = 0;
    this.roundStartScore = 0;
    this.ducks = [];
    this.particles = [];
    this.popups = [];
    this.trails = [];
    this.shellCasings = [];
    this.muzzleFlash = 0;
    this.spawnTimer = 0.8;
    this.reloadTimer = 0;
    this.roundTimer = 0;
    this.roundHits = 0;
    this.shake = 0;
    this.recoil = 0;
    this.dog = null;
    this.lastFlavorAt = 0;
  }

  getRoundConfig() {
    return ROUND_CONFIGS[this.round - 1] || ROUND_CONFIGS[ROUND_CONFIGS.length - 1];
  }

  startGame() {
    this.ensureAudio();
    this.resetRun();
    this.state = "playing";
    this.overlay.classList.remove("is-visible");
    this.overlay.classList.add("is-hidden");
    this.overlay.querySelector("h1").textContent = "Moyers Duck Hunt";
    this.overlay.querySelector("p").textContent = "Classic arcade marsh shooting with streaks, bonus birds, and local high scores.";
    this.startButton.textContent = "Press Start";
    if (this.endSummary) this.endSummary.textContent = "";
    this.hideCta();
    this.showMessage("Round 1", "Make it count");
    this.playTone(260, 0.08, "square", 0.05);
    this.updateUi();
  }

  updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = clamp(event.clientX - rect.left, 0, this.width);
    this.pointer.y = clamp(event.clientY - rect.top, 0, this.height);
    this.pointer.active = true;
  }

  ensureAudio() {
    if (!this.audio) {
      this.audio = new AudioContext();
    }
    if (this.audio.state === "suspended") {
      this.audio.resume();
    }
  }

  playTone(frequency, duration, type = "sine", gain = 0.08) {
    if (!this.soundEnabled || !this.audio) return;
    const osc = this.audio.createOscillator();
    const amp = this.audio.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    amp.gain.setValueAtTime(gain, this.audio.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + duration);
    osc.connect(amp).connect(this.audio.destination);
    osc.start();
    osc.stop(this.audio.currentTime + duration);
  }

  shoot() {
    if (this.state !== "playing") return;
    if (this.shells <= 0) {
      this.beginReload();
      return;
    }

    this.shells -= 1;
    this.shake = 8;
    this.recoil = 18;
    this.muzzleFlash = 0.1;
    this.ejectShell();
    this.playTone(90, 0.08, "sawtooth", 0.11);
    this.playTone(52, 0.12, "square", 0.04);

    const hit = this.findHitDuck();
    if (hit) {
      this.hitDuck(hit);
    } else {
      this.streak = 0;
      this.addPopup("MISS", this.pointer.x, this.pointer.y - 20, "#f1d19b");
    }

    if (this.shells <= 0) {
      this.beginReload();
    }
    this.updateUi();
  }

  beginReload() {
    if (this.state !== "playing") return;
    this.state = "reloading";
    this.reloadTimer = 1.05;
    this.showMessage("Reloading", "Hold steady");
    this.playTone(220, 0.05, "triangle", 0.04);
    setTimeout(() => this.playTone(330, 0.05, "triangle", 0.04), 180);
  }

  findHitDuck() {
    let best = null;
    let bestDistance = Infinity;
    for (const duck of this.ducks) {
      if (duck.falling) continue;
      const dx = this.pointer.x - duck.x;
      const dy = this.pointer.y - duck.y;
      const distance = Math.hypot(dx, dy);
      const radius = duck.kind === "eagle" ? 34 : 28 * duck.scale;
      if (distance < radius && distance < bestDistance) {
        best = duck;
        bestDistance = distance;
      }
    }
    return best;
  }

  hitDuck(duck) {
    duck.falling = true;
    duck.vy = 190;
    duck.vx *= 0.35;
    duck.spin = rand(-8, 8);
    this.streak += 1;
    this.totalHits += 1;
    this.roundHits += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.roundBestStreak = Math.max(this.roundBestStreak, this.streak);

    const longShot = duck.scale < 0.85 || duck.y < this.height * 0.34;
    const multiplier = this.streak >= 10 ? 3 : this.streak >= 5 ? 2 : 1;
    const base = duck.kind === "eagle" ? 500 : 100;
    const bonus = longShot ? 50 : 0;
    const points = (base + bonus) * multiplier;
    this.score += points;

    this.spawnParticles(duck.x, duck.y, duck.kind === "eagle" ? "#f8d36f" : "#d63f2e");
    this.addPopup(`+${points}`, duck.x, duck.y - 28, duck.kind === "eagle" ? "#f8d36f" : "#ffffff");
    this.playTone(520, 0.07, "triangle", 0.06);
    this.playTone(780, 0.05, "sine", 0.04);

    if (duck.kind === "eagle") {
      const restoredMiss = this.roundEscaped > 0;
      if (restoredMiss) {
        this.roundEscaped -= 1;
        this.addPopup("MISS RESTORED", duck.x, duck.y - 56, "#f8d36f");
      }
      this.showMessage("Freedom Eagle", restoredMiss ? "Miss restored" : "Bonus bird!");
    } else if (this.streak === 5) {
      this.showMessage("HOT STREAK", "2x multiplier");
    } else if (this.streak === 10) {
      this.showMessage("Moyers Marksman", "3x multiplier");
    } else if (this.totalHits % 7 === 0) {
      this.triggerDog(duck.x);
    } else if (this.totalHits % 5 === 0 && now() - this.lastFlavorAt > 2500) {
      this.lastFlavorAt = now();
      this.showMessage("GET HIM!", "Nice shot");
    }
  }

  triggerDog(x) {
    this.dog = {
      x: -90,
      y: this.height - 68,
      targetX: clamp(x, 80, this.width - 80),
      phase: "in",
      timer: 0
    };
  }

  spawnDuck() {
    const side = Math.random() > 0.5 ? "left" : "right";
    const scale = rand(0.72, 1.14);
    const config = this.getRoundConfig();
    const roundBoost = config.speed;
    const kind = Math.random() < 0.035 + this.round * 0.004 ? "eagle" : "duck";
    const speed = (kind === "eagle" ? rand(170, 230) : rand(105, 180)) * roundBoost;
    const fromLeft = side === "left";
    const x = fromLeft ? -60 : this.width + 60;
    const y = rand(this.height * 0.18, this.height * 0.66);
    const amp = rand(16, 58);
    const frequency = rand(1.4, 3.2);
    this.ducks.push({
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      kind,
      x,
      y,
      startY: y,
      vx: fromLeft ? speed : -speed,
      vy: rand(-10, 16),
      scale,
      wing: 0,
      amp,
      frequency,
      age: 0,
      falling: false,
      escaped: false,
      spin: 0,
      rotation: 0,
      spriteIndex: Math.floor(Math.random() * this.assets.ducks.length)
    });
  }

  tick(time) {
    const dt = Math.min(0.033, (time - this.lastFrame) / 1000 || 0);
    this.lastFrame = time;
    this.update(dt);
    this.render();
    requestAnimationFrame((next) => this.tick(next));
  }

  update(dt) {
    this.shake = Math.max(0, this.shake - 32 * dt);
    this.recoil = Math.max(0, this.recoil - 70 * dt);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
    this.updateShellCasings(dt);
    this.updateParticles(dt);
    this.updatePopups(dt);
    this.updateDog(dt);

    if (this.state === "reloading") {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.shells = MAX_SHELLS;
        this.state = "playing";
        this.showMessage("Loaded", "Back on target");
        this.updateUi();
      }
    }

    if (this.state !== "playing") {
      this.updateDucks(dt);
      return;
    }

    this.roundTimer += dt;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnDuck();
      const config = this.getRoundConfig();
      const baseDelay = config.spawnDelay;
      this.spawnTimer = rand(baseDelay * 0.55, baseDelay * 1.2);
      if (Math.random() < config.doubleSpawnChance) this.spawnDuck();
    }
    this.updateDucks(dt);

    if (this.state !== "playing") return;

    if (this.roundHits >= this.getRoundConfig().hits) {
      this.completeRound();
    }
  }

  updateDucks(dt) {
    for (const duck of this.ducks) {
      duck.age += dt;
      duck.wing += dt * 12;
      if (duck.falling) {
        duck.x += duck.vx * dt;
        duck.y += duck.vy * dt;
        duck.vy += 430 * dt;
        duck.rotation += duck.spin * dt;
      } else {
        duck.x += duck.vx * dt;
        duck.y = duck.startY + Math.sin(duck.age * duck.frequency) * duck.amp + duck.vy * duck.age;
      }

      if (!duck.falling && !duck.escaped && (duck.x < -90 || duck.x > this.width + 90)) {
        duck.escaped = true;
        if (this.state === "playing" || this.state === "reloading") {
          this.roundEscaped += 1;
          this.totalEscaped += 1;
          this.streak = 0;
          this.addPopup("MISS", clamp(duck.x, 60, this.width - 60), duck.y, "#efb45d");
          this.updateUi();
          if (this.roundEscaped > this.getRoundConfig().misses) {
            this.endGame("failed");
          }
        }
      }
    }
    this.ducks = this.ducks.filter((duck) => duck.y < this.height + 140 && duck.x > -160 && duck.x < this.width + 160);
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 80 * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  ejectShell() {
    const originX = this.width * 0.5 + 22;
    const originY = this.height - 125 + this.recoil;
    this.shellCasings.push({
      x: originX,
      y: originY,
      vx: rand(115, 190),
      vy: rand(-260, -180),
      rotation: rand(0, Math.PI),
      spin: rand(8, 14),
      life: 1.15
    });
  }

  updateShellCasings(dt) {
    for (const shell of this.shellCasings) {
      shell.life -= dt;
      shell.x += shell.vx * dt;
      shell.y += shell.vy * dt;
      shell.vy += 480 * dt;
      shell.rotation += shell.spin * dt;
    }
    this.shellCasings = this.shellCasings.filter((shell) => shell.life > 0 && shell.y < this.height + 50);
  }

  updatePopups(dt) {
    for (const popup of this.popups) {
      popup.life -= dt;
      popup.y -= 34 * dt;
    }
    this.popups = this.popups.filter((popup) => popup.life > 0);
  }

  updateDog(dt) {
    if (!this.dog) return;
    this.dog.timer += dt;
    if (this.dog.phase === "in") {
      this.dog.x += 280 * dt;
      if (this.dog.x >= this.dog.targetX) {
        this.dog.phase = "pause";
        this.dog.timer = 0;
      }
    } else if (this.dog.phase === "pause" && this.dog.timer > 0.35) {
      this.dog.phase = "out";
    } else if (this.dog.phase === "out") {
      this.dog.x += 280 * dt;
      if (this.dog.x > this.width + 120) this.dog = null;
    }
  }

  completeRound() {
    this.state = "roundSummary";
    this.completedRounds = Math.max(this.completedRounds, this.round);
    this.ducks = [];
    this.shells = MAX_SHELLS;
    const roundScore = this.score - this.roundStartScore;
    const perfect = this.roundEscaped === 0;
    const clean = this.roundEscaped <= 1;
    if (perfect) {
      const bonus = 250 * this.round;
      this.score += bonus;
      this.showMessage("Perfect Round", `+${bonus} clean bonus`);
    } else {
      this.showMessage(`Round ${this.round} Complete`, clean ? "Clean shooting" : "Keep moving");
    }

    this.overlay.classList.add("is-visible");
    this.overlay.classList.remove("is-hidden");
    this.overlay.querySelector("h1").textContent = `Round ${this.round} Complete`;
    this.overlay.querySelector("p").innerHTML = [
      `Round score ${this.format(this.score - this.roundStartScore)}`,
      `Hits ${this.roundHits} / ${this.getRoundConfig().hits}`,
      `Misses ${this.roundEscaped} / ${this.getRoundConfig().misses}`,
      `Best streak ${this.roundBestStreak}`
    ].join("<br>");
    if (this.endSummary) {
      this.endSummary.textContent = perfect
        ? "Perfect round bonus banked. That is how you clear a swamp."
        : clean
          ? "Low-miss round. Keep the barrel warm."
          : "Round survived. Tighten up and keep hunting.";
    }
    this.startButton.textContent = this.round >= MAX_ROUNDS ? "Final Score" : "Continue Hunt";
    this.hideCta();
    this.updateUi();
  }

  continueRound() {
    this.round += 1;
    this.roundHits = 0;
    this.roundEscaped = 0;
    this.roundBestStreak = 0;
    this.roundStartScore = this.score;
    this.roundTimer = 0;
    this.spawnTimer = 0.9;
    this.shells = MAX_SHELLS;
    this.ducks = [];
    this.state = "playing";
    this.overlay.classList.remove("is-visible");
    this.overlay.classList.add("is-hidden");
    if (this.endSummary) this.endSummary.textContent = "";
    this.hideCta();
    this.showMessage(`Round ${this.round}`, this.round >= 4 ? "Weather rolling in" : "Ducks are moving faster");
    this.updateUi();
  }

  getGrade() {
    if (this.completedRounds >= MAX_ROUNDS && this.bestStreak >= 15 && this.totalEscaped <= 4) return "Swamp Legend";
    if (this.completedRounds >= MAX_ROUNDS && this.bestStreak >= 10) return "Moyers Marksman";
    if (this.completedRounds >= 4 || this.score >= 4500) return "Hot Barrel";
    if (this.completedRounds >= 2 || this.score >= 2000) return "Solid Hunt";
    return "Needs More Practice";
  }

  endGame(reason = "failed") {
    this.state = "gameOver";
    const previousHighScore = this.storage.highScore || 0;
    const bestRun = this.score > previousHighScore;
    const grade = this.getGrade();
    this.storage.highScore = Math.max(this.storage.highScore || 0, this.score);
    this.storage.runs = [
      {
        score: this.score,
        hits: this.totalHits,
        completedRounds: this.completedRounds,
        bestStreak: this.bestStreak,
        grade,
        date: new Date().toISOString()
      },
      ...(this.storage.runs || [])
    ].slice(0, 8);
    this.saveStorage();
    this.overlay.classList.add("is-visible");
    this.overlay.classList.remove("is-hidden");
    this.overlay.querySelector("h1").textContent = reason === "completed" ? "Final Score" : "Round Over";
    this.overlay.querySelector("p").textContent = bestRun
      ? `New high score: ${this.format(this.score)}`
      : `Score ${this.format(this.score)} with ${this.totalHits} hits. Grade: ${grade}.`;
    if (this.endSummary) {
      this.endSummary.textContent = `${grade}. Completed ${this.completedRounds} / ${MAX_ROUNDS} rounds with a ${this.bestStreak} best streak. Visit Moyers Firearms for suppressors, ammo, optics, accessories, and more.`;
    }
    this.startButton.textContent = "Play Again";
    this.showCta();
    this.updateUi();
    this.playTone(150, 0.2, "triangle", 0.05);
  }

  hideCta() {
    this.ctaButton?.classList.remove("is-visible");
  }

  showCta() {
    this.ctaButton?.classList.add("is-visible");
  }

  addPopup(text, x, y, color) {
    this.popups.push({ text, x, y, color, life: 0.8 });
  }

  spawnParticles(x, y, color) {
    for (let i = 0; i < 12; i += 1) {
      this.particles.push({
        x,
        y,
        vx: rand(-110, 110),
        vy: rand(-90, 50),
        radius: rand(2, 5),
        color,
        life: rand(0.3, 0.65)
      });
    }
  }

  showMessage(title, detail) {
    this.message.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
    this.message.classList.remove("show");
    void this.message.offsetWidth;
    this.message.classList.add("show");
  }

  updateUi() {
    const config = this.getRoundConfig();
    this.ui.score.textContent = this.format(this.score);
    this.ui.highScore.textContent = this.format(this.storage.highScore || 0);
    this.ui.menuHighScore.textContent = this.format(this.storage.highScore || 0);
    this.ui.round.textContent = this.round;
    this.ui.escaped.textContent = this.roundEscaped;
    this.ui.missLimit.textContent = config.misses;
    this.ui.ammoText.textContent = `${this.shells} / ${MAX_SHELLS}`;
    this.ui.streak.textContent = this.streak;
    this.ui.hits.textContent = this.roundHits;
    this.ui.roundGoal.textContent = config.hits;
    this.ui.nextReward.textContent = this.streak < 5 ? "5 Streak" : this.streak < 10 ? "10 Streak" : "Max Heat";
    this.ui.shells.innerHTML = "";
    for (let i = 0; i < MAX_SHELLS; i += 1) {
      const shell = document.createElement("span");
      shell.className = `shell ${i >= this.shells ? "spent" : ""}`;
      this.ui.shells.append(shell);
    }
  }

  format(value) {
    return Math.round(value).toLocaleString();
  }

  renderStart() {
    this.overlay.classList.add("is-visible");
    this.render();
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);
    const shakeX = this.shake ? rand(-this.shake, this.shake) : 0;
    const shakeY = this.shake ? rand(-this.shake, this.shake) : 0;
    ctx.translate(shakeX, shakeY);
    this.drawBackground(ctx);
    this.drawDucks(ctx);
    this.drawDog(ctx);
    this.drawParticles(ctx);
    this.drawBlind(ctx);
    this.drawShellCasings(ctx);
    this.drawShotgun(ctx);
    this.drawMuzzleFlash(ctx);
    this.drawCrosshair(ctx);
    this.drawPopups(ctx);
    ctx.restore();
  }

  drawBackground(ctx) {
    if (this.assets.background.complete && this.assets.background.naturalWidth > 0) {
      const img = this.assets.background;
      const scale = Math.max(this.width / img.naturalWidth, this.height / img.naturalHeight);
      const drawWidth = img.naturalWidth * scale;
      const drawHeight = img.naturalHeight * scale;
      const drawX = (this.width - drawWidth) / 2;
      const drawY = (this.height - drawHeight) / 2;
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      if (this.round >= 4) {
        ctx.fillStyle = "rgba(75, 72, 67, 0.24)";
        ctx.fillRect(0, 0, this.width, this.height);
      }
      return;
    }

    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, "#b9c0be");
    sky.addColorStop(0.38, this.round >= 4 ? "#807a72" : "#e8cda4");
    sky.addColorStop(0.7, "#6b714e");
    sky.addColorStop(1, "#1d2119");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.globalAlpha = 0.32;
    for (let i = 0; i < 9; i += 1) {
      const x = (i * 173 + this.round * 31) % (this.width + 180) - 90;
      this.drawTree(ctx, x, this.height * rand(0.42, 0.55), rand(0.7, 1.4));
    }
    ctx.globalAlpha = 1;

    const waterY = this.height * 0.66;
    ctx.fillStyle = "rgba(53, 67, 51, 0.78)";
    ctx.fillRect(0, waterY, this.width, this.height - waterY);
    ctx.strokeStyle = "rgba(242, 211, 160, 0.22)";
    ctx.lineWidth = 2;
    for (let y = waterY + 12; y < this.height - 50; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < this.width; x += 80) {
        ctx.quadraticCurveTo(x + 30, y + Math.sin(x * 0.03 + y) * 5, x + 80, y);
      }
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(33, 24, 17, 0.82)";
    ctx.fillRect(0, this.height - 72, this.width, 72);
    ctx.fillStyle = "rgba(15, 10, 7, 0.58)";
    for (let x = 0; x < this.width; x += 84) {
      ctx.fillRect(x, this.height - 72, 8, 72);
    }

    if (this.round >= 4) {
      ctx.fillStyle = "rgba(230, 232, 224, 0.12)";
      for (let i = 0; i < 18; i += 1) {
        const x = (i * 97 + performance.now() * 0.012) % this.width;
        ctx.fillRect(x, this.height * 0.12, 1, this.height * 0.54);
      }
    }
  }

  drawTree(ctx, x, y, scale) {
    ctx.strokeStyle = "#1b1b16";
    ctx.lineWidth = 5 * scale;
    ctx.beginPath();
    ctx.moveTo(x, this.height * 0.66);
    ctx.lineTo(x + 14 * scale, y);
    ctx.stroke();
    ctx.fillStyle = "#2d3425";
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.ellipse(x + rand(-30, 38) * scale, y + rand(-20, 22) * scale, 28 * scale, 18 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawDucks(ctx) {
    for (const duck of this.ducks) {
      ctx.save();
      ctx.translate(duck.x, duck.y);
      ctx.rotate(duck.rotation);
      ctx.scale(duck.vx < 0 ? -duck.scale : duck.scale, duck.scale);
      if (duck.kind === "eagle") {
        this.drawEagle(ctx, duck);
      } else {
        this.drawDuck(ctx, duck);
      }
      ctx.restore();
    }
  }

  drawDuck(ctx, duck) {
    const sprite = this.assets.ducks[duck.spriteIndex % this.assets.ducks.length];
    if (sprite?.complete && sprite.naturalWidth > 0) {
      const targetWidth = 92;
      const ratio = sprite.naturalHeight / sprite.naturalWidth;
      ctx.drawImage(sprite, -targetWidth / 2, -targetWidth * ratio / 2, targetWidth, targetWidth * ratio);
      return;
    }

    const flap = Math.sin(duck.wing) * 15;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(2, 8, 30, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5b4128";
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0f5a39";
    ctx.beginPath();
    ctx.arc(24, -6, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#10100f";
    ctx.beginPath();
    ctx.arc(28, -9, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2c45f";
    ctx.beginPath();
    ctx.moveTo(33, -6);
    ctx.lineTo(48, -10);
    ctx.lineTo(36, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ded1aa";
    ctx.beginPath();
    ctx.ellipse(-7, 0, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3b2a1b";
    ctx.beginPath();
    ctx.moveTo(-10, -3);
    ctx.quadraticCurveTo(-22, -33 - flap, -39, -17 - flap);
    ctx.quadraticCurveTo(-22, -7, -8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d66d2f";
    ctx.fillRect(4, 12, 15, 4);
    ctx.fillRect(8, 17, 13, 4);
  }

  drawEagle(ctx, duck) {
    const sprite = this.assets.eagle;
    if (sprite.complete && sprite.naturalWidth > 0) {
      const targetWidth = 112;
      const ratio = sprite.naturalHeight / sprite.naturalWidth;
      ctx.drawImage(sprite, -targetWidth / 2, -targetWidth * ratio / 2, targetWidth, targetWidth * ratio);
      return;
    }

    const flap = Math.sin(duck.wing) * 18;
    ctx.fillStyle = "rgba(255, 219, 113, 0.24)";
    ctx.beginPath();
    ctx.ellipse(0, 7, 44, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a3b22";
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f7f4de";
    ctx.beginPath();
    ctx.arc(24, -5, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0bf48";
    ctx.beginPath();
    ctx.moveTo(35, -5);
    ctx.lineTo(50, -8);
    ctx.lineTo(37, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#352215";
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(-24, -42 - flap, -54, -24 - flap);
    ctx.quadraticCurveTo(-28, -2, -7, 12);
    ctx.closePath();
    ctx.fill();
  }

  drawParticles(ctx) {
    for (const particle of this.particles) {
      ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawShellCasings(ctx) {
    for (const shell of this.shellCasings) {
      ctx.save();
      ctx.globalAlpha = clamp(shell.life, 0, 1);
      ctx.translate(shell.x, shell.y);
      ctx.rotate(shell.rotation);
      ctx.fillStyle = "#c99b55";
      ctx.fillRect(-4, -9, 8, 18);
      ctx.fillStyle = "#7c3526";
      ctx.fillRect(-4, -9, 8, 5);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawDog(ctx) {
    if (!this.dog) return;
    ctx.save();
    ctx.translate(this.dog.x, this.dog.y);
    ctx.fillStyle = "#6a3f24";
    ctx.beginPath();
    ctx.ellipse(0, 0, 42, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(36, -11, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2d1b11";
    ctx.beginPath();
    ctx.ellipse(49, -8, 8, 14, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6a3f24";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-37, -4);
    ctx.quadraticCurveTo(-62, -25, -76, -6);
    ctx.stroke();
    ctx.restore();
  }

  drawBlind(ctx) {
    ctx.fillStyle = "rgba(20, 13, 9, 0.45)";
    ctx.fillRect(0, 0, this.width, 11);
    ctx.fillRect(0, 0, 10, this.height);
    ctx.fillRect(this.width - 10, 0, 10, this.height);
  }

  drawShotgun(ctx) {
    const x = this.width * 0.5;
    const y = this.height + 18 + this.recoil;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.24);
    ctx.fillStyle = "#151516";
    ctx.fillRect(-8, -210, 18, 210);
    ctx.fillStyle = "#25262a";
    ctx.fillRect(8, -208, 14, 205);
    ctx.fillStyle = "#6f4226";
    ctx.fillRect(-25, -70, 28, 95);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(12, -202, 3, 185);
    ctx.restore();
  }

  drawMuzzleFlash(ctx) {
    if (this.muzzleFlash <= 0) return;
    const alpha = clamp(this.muzzleFlash * 10, 0, 1);
    const x = this.width * 0.5 - 34;
    const y = this.height - 205 + this.recoil;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.24);
    ctx.globalAlpha = alpha;
    const flash = ctx.createRadialGradient(0, 0, 0, 0, 0, 72);
    flash.addColorStop(0, "rgba(255,255,245,0.98)");
    flash.addColorStop(0.25, "rgba(255,207,83,0.82)");
    flash.addColorStop(0.62, "rgba(220,72,37,0.38)");
    flash.addColorStop(1, "rgba(220,72,37,0)");
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(-78, -1);
    ctx.lineTo(0, 18);
    ctx.lineTo(-24, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawCrosshair(ctx) {
    const { x, y } = this.pointer;
    ctx.save();
    ctx.strokeStyle = "rgba(12, 12, 12, 0.88)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.moveTo(x - 47, y);
    ctx.lineTo(x - 13, y);
    ctx.moveTo(x + 13, y);
    ctx.lineTo(x + 47, y);
    ctx.moveTo(x, y - 47);
    ctx.lineTo(x, y - 13);
    ctx.moveTo(x, y + 13);
    ctx.lineTo(x, y + 47);
    ctx.stroke();
    ctx.strokeStyle = "rgba(236, 45, 35, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawPopups(ctx) {
    ctx.font = '800 22px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = "center";
    for (const popup of this.popups) {
      ctx.globalAlpha = clamp(popup.life * 1.5, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fillText(popup.text, popup.x + 2, popup.y + 2);
      ctx.fillStyle = popup.color;
      ctx.fillText(popup.text, popup.x, popup.y);
    }
    ctx.globalAlpha = 1;
  }
}

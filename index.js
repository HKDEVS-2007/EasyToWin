// DOM Elements
const greeting = document.getElementById('greeting');
const loginLink = document.getElementById('login-link');
const logoutBtn = document.getElementById('logout-btn');
const balanceDisplay = document.getElementById('balance-display');

const withdrawBtn = document.getElementById('withdraw-btn');

const withdrawModal = document.getElementById('withdraw-modal');
const cancelWithdraw = document.getElementById('cancel-withdraw');
const confirmWithdraw = document.getElementById('confirm-withdraw');
const withdrawInput = document.getElementById('withdraw-input');
const withdrawMsg = document.getElementById('withdraw-msg');

const startGameBtn = document.getElementById('start-game-btn');
const gameOverlay = document.getElementById('game-overlay');
const waveCompleteModal = document.getElementById('wave-complete-modal');
const nextWaveBtn = document.getElementById('next-wave-btn');
const waveRewardAmount = document.getElementById('wave-reward-amount');
const waveRewardMsg = document.getElementById('wave-reward-msg');

const statScore = document.getElementById('stat-score');
const statWave = document.getElementById('stat-wave');
const statPhase = document.getElementById('stat-phase');
const statLives = document.getElementById('stat-lives');

let currentBalance = 0.0;
let currentUser = null;

// ---------- Session & Balance Management ----------
function checkSession() {
  currentUser = localStorage.getItem('arcade_current_user');
  if (!currentUser) {
    window.location.href = 'login.html';
    return;
  }
  
  greeting.textContent = `Welcome back, ${currentUser}! Defend the Galaxy!`;
  loginLink.classList.add('hidden');
  logoutBtn.classList.remove('hidden');
  fetchBalance();
}

function fetchBalance() {
  let users = JSON.parse(localStorage.getItem('arcade_users') || '[]');
  let user = users.find(u => u.username === currentUser);
  currentBalance = user ? (user.balance || 0.0) : 0.0;
  updateBalanceUI();
}

function updateBalance(delta) {
  let users = JSON.parse(localStorage.getItem('arcade_users') || '[]');
  let user = users.find(u => u.username === currentUser);
  if (!user) {
    alert('User not found.');
    return false;
  }

  let newBal = (user.balance || 0.0) + delta;
  if (newBal < 0) {
    alert('Insufficient funds!');
    return false;
  }

  user.balance = newBal;
  localStorage.setItem('arcade_users', JSON.stringify(users));
  currentBalance = newBal;
  updateBalanceUI();
  return true;
}

function updateBalanceUI() {
  balanceDisplay.textContent = `$${currentBalance.toFixed(2)}`;
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('arcade_current_user');
  checkSession();
});

// ---------- Modal Event Handlers ----------
withdrawBtn.addEventListener('click', () => {
  withdrawModal.classList.remove('hidden');
  withdrawInput.value = '';
  withdrawMsg.className = 'message';
  withdrawMsg.textContent = '';
});

cancelWithdraw.addEventListener('click', () => {
  withdrawModal.classList.add('hidden');
});

let withdrawalAttempts = parseInt(localStorage.getItem('withdrawal_attempts') || '0');

confirmWithdraw.addEventListener('click', () => {
  let requiredLimit = 100 + (withdrawalAttempts + 1) * 20; // 120, 140, 160, etc.

  if (currentBalance < requiredLimit) {
    withdrawMsg.textContent = `Withdrawal limit is currently $${requiredLimit}. You need a little more to withdraw!`;
    withdrawMsg.className = 'message show error';
    return;
  }

  withdrawalAttempts++;
  localStorage.setItem('withdrawal_attempts', withdrawalAttempts);

  const amt = parseFloat(withdrawInput.value);
  if (isNaN(amt) || amt <= 0) {
    withdrawMsg.textContent = 'Please enter a valid withdrawal amount.';
    withdrawMsg.className = 'message show error';
    return;
  }
  if (amt > currentBalance) {
    withdrawMsg.textContent = 'Insufficient balance for this withdrawal.';
    withdrawMsg.className = 'message show error';
    return;
  }

  const success = updateBalance(-amt);
  if (success) {
    const nextLimit = 100 + (withdrawalAttempts + 1) * 20;
    withdrawMsg.textContent = `Withdrawal processed! Next withdrawal limit has increased to $${nextLimit}.`;
    withdrawMsg.className = 'message show success';
    setTimeout(() => {
      withdrawModal.classList.add('hidden');
    }, 2000);
  }
});

checkSession();

// ---------- Reward Scaling based on Wave / Level ----------
function getWaveReward() {
  let base = 5.00;
  if (wave > 30) base = 1.00;
  else if (wave > 20) base = 1.50;
  else if (wave > 15) base = 2.50;
  
  if (wave % 5 === 0) {
    base += 20.00;
  }
  return base;
}

// ==========================================
// ---------- CHICKEN INVADERS GAME ---------
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameRunning = false;
let score = 0;
let wave = 1;
let wavePhase = 1;
let lives = 3;

let player = {
  x: canvas.width / 2 - 20,
  y: canvas.height - 60,
  width: 40,
  height: 30,
  speed: 6,
  dx: 0,
  hasShield: false,
  doubleShotTimer: 0,
  isTransitioning: false,
  transitionTimer: 0
};

let bullets = [];
let chickens = [];
let eggs = [];
let drumsticks = [];
let powerups = [];
let particles = [];

let keys = {
  left: false,
  right: false,
  shoot: false
};

let mouseDown = false;
let fireTimer = 0;

// Web Audio API Sound Synthesizer
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playSound(type) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'shoot') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'hit') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'coin') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'powerup') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.linearRampToValueAtTime(800, now + 0.2);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'gameover') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.6);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.6);
    }
  } catch (e) {}
}

// Input Listeners
window.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  if (e.code === 'Space') {
    keys.shoot = true;
    e.preventDefault();
  }
});

window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  if (e.code === 'Space') keys.shoot = false;
});

canvas.addEventListener('mousemove', e => {
  if (!gameRunning || player.isTransitioning) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const mouseX = (e.clientX - rect.left) * scaleX;
  player.x = mouseX - player.width / 2;
  if (player.x < 0) player.x = 0;
  if (player.x > canvas.width - player.width) player.x = canvas.width - player.width;
});

canvas.addEventListener('mousedown', () => { mouseDown = true; });
window.addEventListener('mouseup', () => { mouseDown = false; });

function shootBullet() {
  if (player.isTransitioning) return;
  if (player.doubleShotTimer > 0) {
    bullets.push({ x: player.x + 5, y: player.y, width: 5, height: 14, speed: 10 });
    bullets.push({ x: player.x + player.width - 10, y: player.y, width: 5, height: 14, speed: 10 });
  } else {
    bullets.push({ x: player.x + player.width / 2 - 3, y: player.y, width: 6, height: 14, speed: 10 });
  }
  playSound('shoot');
}

function initWavePhase() {
  chickens = [];
  
  if (wavePhase === 5) {
    const bossHp = 15 + wave * 2;
    chickens.push({
      x: canvas.width / 3 - 40,
      y: 50,
      width: 70,
      height: 50,
      dx: 1.2 + wave * 0.05,
      alive: true,
      type: 'miniboss',
      hp: bossHp,
      maxHp: bossHp
    });
    chickens.push({
      x: (canvas.width / 3) * 2 - 40,
      y: 50,
      width: 70,
      height: 50,
      dx: -(1.2 + wave * 0.05),
      alive: true,
      type: 'miniboss',
      hp: bossHp,
      maxHp: bossHp
    });
  } else {
    const rows = 2 + wavePhase;
    const cols = 8;
    const startX = 60;
    const startY = 40;
    const spacingX = 75;
    const spacingY = 45;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let cx = startX + c * spacingX;
        let cy = startY + r * spacingY;

        if (wavePhase === 2) {
          cx = canvas.width / 2 + (c - cols / 2) * 45 + (r * 20 * (c < cols / 2 ? -1 : 1));
        } else if (wavePhase === 3) {
          cy = startY + r * spacingY + Math.abs(c - cols / 2) * 18;
        } else if (wavePhase === 4) {
          cx += (r % 2 === 0 ? 30 : -30);
        }

        chickens.push({
          x: cx,
          y: cy,
          width: 34,
          height: 28,
          dx: (1 + wave * 0.04) * (r % 2 === 0 ? 1 : -1),
          alive: true,
          type: (wavePhase === 4 && r === 0) ? 'armored' : 'chicken',
          hp: (wavePhase === 4 && r === 0) ? 2 : 1
        });
      }
    }
  }
  updateStats();
}

startGameBtn.addEventListener('click', () => {
  initAudio();
  score = 0;
  wave = 1;
  wavePhase = 1;
  lives = 3;
  player.hasShield = false;
  player.doubleShotTimer = 0;
  updateStats();
  gameRunning = true;
  gameOverlay.classList.add('hidden');
  bullets = [];
  eggs = [];
  drumsticks = [];
  powerups = [];
  particles = [];
  player.x = canvas.width / 2 - player.width / 2;
  initWavePhase();
  requestAnimationFrame(gameLoop);
});

nextWaveBtn.addEventListener('click', () => {
  waveCompleteModal.classList.add('hidden');
  wave++;
  wavePhase = 1;
  bullets = [];
  eggs = [];
  drumsticks = [];
  powerups = [];
  particles = [];
  initWavePhase();
  gameRunning = true;
  requestAnimationFrame(gameLoop);
});

function updateStats() {
  statScore.textContent = score;
  statWave.textContent = wave;
  statPhase.textContent = `${wavePhase} / 5`;
  statLives.textContent = `${player.hasShield ? '🛡️ ' : ''}${'❤️ '.repeat(Math.max(0, lives))}`;
}

function spawnParticles(x, y, color) {
  for (let i = 0; i < 10; i++) {
    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      radius: Math.random() * 3 + 1,
      color: color,
      life: 35
    });
  }
}

function update() {
  if (!gameRunning) return;

  if (player.isTransitioning) {
    player.transitionTimer--;
    player.y -= 3;
    if (player.transitionTimer <= 0) {
      player.isTransitioning = false;
      player.y = canvas.height - 60;
      initWavePhase();
    }
    return;
  }

  fireTimer++;
  if ((keys.shoot || mouseDown) && fireTimer >= 12) {
    shootBullet();
    fireTimer = 0;
  }

  if (player.doubleShotTimer > 0) player.doubleShotTimer--;

  if (keys.left) player.x -= player.speed;
  if (keys.right) player.x += player.speed;
  if (player.x < 0) player.x = 0;
  if (player.x > canvas.width - player.width) player.x = canvas.width - player.width;

  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].y -= bullets[i].speed;
    if (bullets[i].y < 0) bullets.splice(i, 1);
  }

  let edgeReached = false;
  chickens.forEach(ch => {
    if (!ch.alive) return;
    ch.x += ch.dx;
    if (ch.x <= 15 || ch.x >= canvas.width - ch.width - 15) {
      edgeReached = true;
    }
  });

  if (edgeReached) {
    chickens.forEach(ch => {
      ch.dx *= -1;
      ch.y += 15;
      if (ch.y + ch.height >= player.y) {
        gameOver();
      }
    });
  }

  if (Math.random() < 0.02 + wave * 0.002 && chickens.length > 0) {
    const aliveChickens = chickens.filter(c => c.alive);
    if (aliveChickens.length > 0) {
      const shooter = aliveChickens[Math.floor(Math.random() * aliveChickens.length)];
      eggs.push({
        x: shooter.x + shooter.width / 2 - 6,
        y: shooter.y + shooter.height,
        width: shooter.type === 'miniboss' ? 16 : 12,
        height: shooter.type === 'miniboss' ? 22 : 16,
        speed: 3.5 + wave * 0.2
      });
    }
  }

  for (let i = eggs.length - 1; i >= 0; i--) {
    eggs[i].y += eggs[i].speed;
    const eg = eggs[i];
    if (
      eg.x < player.x + player.width &&
      eg.x + eg.width > player.x &&
      eg.y < player.y + player.height &&
      eg.y + eg.height > player.y
    ) {
      eggs.splice(i, 1);
      if (player.hasShield) {
        player.hasShield = false;
        playSound('hit');
      } else {
        lives--;
        playSound('hit');
        if (lives <= 0) gameOver();
      }
      spawnParticles(player.x + player.width / 2, player.y + player.height / 2, '#ef4444');
      updateStats();
      continue;
    }
    if (eg.y > canvas.height) eggs.splice(i, 1);
  }

  for (let i = drumsticks.length - 1; i >= 0; i--) {
    drumsticks[i].y += 2.5;
    const ds = drumsticks[i];
    if (
      ds.x < player.x + player.width &&
      ds.x + ds.width > player.x &&
      ds.y < player.y + player.height &&
      ds.y + ds.height > player.y
    ) {
      drumsticks.splice(i, 1);
      score += 300;
      playSound('coin');
      updateStats();
      continue;
    }
    if (ds.y > canvas.height) drumsticks.splice(i, 1);
  }

  for (let i = powerups.length - 1; i >= 0; i--) {
    powerups[i].y += 2;
    const pw = powerups[i];
    if (
      pw.x < player.x + player.width &&
      pw.x + pw.width > player.x &&
      pw.y < player.y + player.height &&
      pw.y + pw.height > player.y
    ) {
      powerups.splice(i, 1);
      playSound('powerup');
      if (pw.type === 'double') player.doubleShotTimer = 450;
      else if (pw.type === 'shield') player.hasShield = true;
      updateStats();
      continue;
    }
    if (pw.y > canvas.height) powerups.splice(i, 1);
  }

  for (let b = bullets.length - 1; b >= 0; b--) {
    for (let c = chickens.length - 1; c >= 0; c--) {
      const ch = chickens[c];
      if (!ch.alive) continue;
      const bl = bullets[b];
      if (
        bl.x < ch.x + ch.width &&
        bl.x + bl.width > ch.x &&
        bl.y < ch.y + ch.height &&
        bl.y + bl.height > ch.y
      ) {
        bullets.splice(b, 1);
        ch.hp = (ch.hp || 1) - 1;

        if (ch.hp <= 0) {
          ch.alive = false;
          score += ch.type === 'miniboss' ? 1500 : (ch.type === 'armored' ? 300 : 100);
          spawnParticles(ch.x + ch.width / 2, ch.y + ch.height / 2, ch.type === 'miniboss' ? '#ef4444' : '#facc15');
          playSound('hit');

          const dropChance = Math.random();
          if (dropChance < 0.25) {
            drumsticks.push({ x: ch.x + ch.width / 2 - 10, y: ch.y, width: 20, height: 20 });
          } else if (dropChance < 0.35) {
            powerups.push({
              x: ch.x + ch.width / 2 - 12,
              y: ch.y,
              width: 24,
              height: 24,
              type: Math.random() < 0.5 ? 'double' : 'shield'
            });
          }
        }
        updateStats();
        break;
      }
    }
  }

  if (chickens.every(ch => !ch.alive)) {
    if (wavePhase < 5) {
      wavePhase++;
      updateStats();
      player.isTransitioning = true;
      player.transitionTimer = 40;
    } else {
      gameRunning = false;
      const reward = getWaveReward();
      updateBalance(reward);
      waveRewardAmount.textContent = `$${reward.toFixed(2)}`;
      waveRewardMsg.textContent = `Congratulations! You conquered all 5 phases of Wave ${wave}!`;
      waveCompleteModal.classList.remove('hidden');
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 45; i++) {
    let sx = (i * 137) % canvas.width;
    let sy = (i * 93 + Date.now() * 0.03) % canvas.height;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  const bobOffset = Math.sin(Date.now() * 0.01) * 2;

  if (player.hasShield) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, player.y + player.height / 2 + bobOffset, player.width * 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = player.doubleShotTimer > 0 ? '#facc15' : '#38bdf8';
  ctx.beginPath();
  ctx.moveTo(player.x + player.width / 2, player.y + bobOffset);
  ctx.lineTo(player.x, player.y + player.height + bobOffset);
  ctx.lineTo(player.x + player.width, player.y + player.height + bobOffset);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(player.x + 10, player.y + player.height + bobOffset);
  ctx.lineTo(player.x + player.width / 2, player.y + player.height + bobOffset + (Math.random() * 8 + 6));
  ctx.lineTo(player.x + player.width - 10, player.y + player.height + bobOffset);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(player.x + player.width / 2 - 4, player.y + 10 + bobOffset, 8, 10);

  ctx.fillStyle = player.doubleShotTimer > 0 ? '#facc15' : '#38bdf8';
  bullets.forEach(bl => ctx.fillRect(bl.x, bl.y, bl.width, bl.height));

  chickens.forEach(ch => {
    if (!ch.alive) return;
    if (ch.type === 'miniboss') {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.ellipse(ch.x + ch.width / 2, ch.y + ch.height / 2, ch.width / 2, ch.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#333';
      ctx.fillRect(ch.x, ch.y - 10, ch.width, 5);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(ch.x, ch.y - 10, ch.width * (ch.hp / ch.maxHp), 5);
    } else {
      ctx.fillStyle = ch.type === 'armored' ? '#94a3b8' : '#fb923c';
      ctx.beginPath();
      ctx.arc(ch.x + ch.width / 2, ch.y + ch.height / 2, ch.width / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(ch.x + ch.width / 2 - 5, ch.y + ch.height / 2);
      ctx.lineTo(ch.x + ch.width / 2 + 5, ch.y + ch.height / 2);
      ctx.lineTo(ch.x + ch.width / 2, ch.y + ch.height / 2 + 7);
      ctx.closePath();
      ctx.fill();
    }
  });

  ctx.fillStyle = '#fef08a';
  eggs.forEach(eg => {
    ctx.beginPath();
    ctx.ellipse(eg.x + eg.width / 2, eg.y + eg.height / 2, eg.width / 2, eg.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  drumsticks.forEach(ds => {
    ctx.font = '20px sans-serif';
    ctx.fillText('🍗', ds.x, ds.y + 18);
  });

  powerups.forEach(pw => {
    ctx.font = '22px sans-serif';
    ctx.fillText(pw.type === 'double' ? '⚡' : '🛡️', pw.x, pw.y + 20);
  });

  particles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function gameLoop() {
  if (!gameRunning) return;
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

function gameOver() {
  gameRunning = false;
  playSound('gameover');
  gameOverlay.querySelector('h2').textContent = 'GAME OVER';
  gameOverlay.querySelector('p').innerHTML = `Final Score: <strong>${score}</strong> | Wave Reached: <strong>${wave} (Phase ${wavePhase}/5)</strong><br>Keep playing to complete all 5 phases and reach withdrawal limit!`;
  startGameBtn.textContent = 'PLAY AGAIN';
  gameOverlay.classList.remove('hidden');
}

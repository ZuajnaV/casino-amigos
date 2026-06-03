import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════
const CW = 600, CH = 580;
const PY   = CH - 50;
const PH   = 15;
const PW0  = 96;
const BR   = 9;
const BW   = 45, BH = 30, BGAP = 5;
const COLS = 10;
const GX0  = (CW - (COLS * BW + (COLS - 1) * BGAP)) / 2;
const GY0  = 98;
const SPD0 = 5.4;
const SPD_MAX = 10.5;
const ITEM_V  = 2.4;
const LASER_V = 9;
const PAY_LVL = 35000;
const EFF_DUR = 480;

const ITEM_TYPES = ["expand","shrink","multi","laser","slow","fast","life"];
const ITEM_COLOR = {
  expand:"#22c55e", shrink:"#ef4444", multi:"#60a5fa",
  laser:"#fb923c",  slow:"#22d3ee",  fast:"#fbbf24", life:"#f472b6",
};
const ITEM_LABEL = {
  expand:"＋W", shrink:"－W", multi:"×3",
  laser:"⚡L",  slow:"▼SPD",  fast:"▲SPD", life:"❤+1",
};
const ROW_CLR = [
  "#ef4444","#f97316","#f59e0b","#84cc16",
  "#22d3ee","#818cf8","#e879f9","#f43f5e",
];

// ═══════════════════════════════════════════════════════════════
//  LEVEL GENERATION
// ═══════════════════════════════════════════════════════════════
function genBlocks(lvl) {
  const rows = Math.min(3 + Math.ceil(lvl * 0.7), 10);
  const blocks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      if (lvl >= 3 && (r + c) % 5 === 0) continue;
      if (lvl >= 5 && r % 3 === 1 && c % 4 === 2) continue;
      if (lvl >= 8 && Math.sin(r * 1.2 + c * 0.8) > 0.6) continue;

      const p = Math.random();
      const metalP = Math.min(0.02 * lvl, 0.18);
      const rforcP = Math.min(0.05 + 0.04 * lvl, 0.4);
      const exploP = Math.min(0.06 + lvl * 0.01, 0.14);
      let type = "simple", hp = 1;

      if (lvl >= 4 && p < metalP) {
        type = "metal"; hp = 999;
      } else if (lvl >= 2 && p < metalP + rforcP) {
        type = "reinforced"; hp = Math.min(2 + Math.floor(lvl / 2), 7);
      } else if (lvl >= 2 && p < metalP + rforcP + exploP) {
        type = "explosive"; hp = 1;
      }

      const hasItem = type !== "metal" && Math.random() < Math.min(0.10 + lvl * 0.025, 0.35);
      blocks.push({
        x: GX0 + c * (BW + BGAP),
        y: GY0 + r * (BH + BGAP),
        hp, maxHp: hp, type,
        col: type === "simple"     ? ROW_CLR[r % ROW_CLR.length]
           : type === "reinforced" ? "#475569"
           : type === "metal"      ? "#6b7280"
           :                         "#fb923c",
        itemType: hasItem ? ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)] : null,
        dead: false, flash: 0,
      });
    }
  }
  return blocks;
}

// ═══════════════════════════════════════════════════════════════
//  PHYSICS HELPERS
// ═══════════════════════════════════════════════════════════════
function ballSpd(vx, vy) { return Math.sqrt(vx * vx + vy * vy); }
function setSpd(vx, vy, s) {
  const m = ballSpd(vx, vy);
  return m > 0 ? [vx / m * s, vy / m * s] : [0, -s];
}
function paddleBounce(ball, paddle) {
  const rel   = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
  const angle = rel * (Math.PI * 5 / 12);
  const s     = ballSpd(ball.vx, ball.vy);
  return [Math.sin(angle) * s, -Math.abs(Math.cos(angle) * s)];
}
function circleAABB(bx, by, rx, ry, rw, rh) {
  const cx = Math.max(rx, Math.min(bx, rx + rw));
  const cy = Math.max(ry, Math.min(by, ry + rh));
  return (bx - cx) ** 2 + (by - cy) ** 2 < BR * BR;
}
function resolveAABB(ball, rx, ry, rw, rh) {
  const overL = (ball.x + BR) - rx;
  const overR = (rx + rw) - (ball.x - BR);
  const overT = (ball.y + BR) - ry;
  const overB = (ry + rh) - (ball.y - BR);
  if (Math.min(overL, overR) < Math.min(overT, overB)) {
    ball.vx = overL < overR ? -Math.abs(ball.vx) : Math.abs(ball.vx);
    ball.x  = overL < overR ? rx - BR - 0.5 : rx + rw + BR + 0.5;
  } else {
    ball.vy = overT < overB ? -Math.abs(ball.vy) : Math.abs(ball.vy);
    ball.y  = overT < overB ? ry - BR - 0.5 : ry + rh + BR + 0.5;
  }
}

// ═══════════════════════════════════════════════════════════════
//  INITIAL STATE
// ═══════════════════════════════════════════════════════════════
function mkState(lvl = 1, lives = 3) {
  const paddleW = Math.max(10, PW0 - (lvl - 1) * 20); // -6px por nivel, mínimo 44px     //NUEVO PARA AUMENTAR DIFICULTAD   44, *6

  return {
    gphase: "ready",
    level: lvl, lives,
    score: 0, earned: 0,
    //paddle: { x: CW / 2 - PW0 / 2, w: PW0 },

    paddle: { x: CW / 2 - paddleW / 2, w: paddleW },      //NUEVO PARA AUMENTAR DIFICULTAD

    balls: [{ x: CW / 2, y: PY - BR - 1, vx: 0, vy: 0, attached: true, dead: false }],
    blocks: genBlocks(lvl),
    items: [], lasers: [],
    laserActive: false, laserAmmo: 0,
    expandT: 0, shrinkT: 0, slowT: 0, fastT: 0,
    flashes: [], deathFlash: 0,
    lvlClearT: 0, lastLevelPay: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
//  EXPLOSION
// ═══════════════════════════════════════════════════════════════
function explode(s, src) {
  s.blocks.forEach(nb => {
    if (nb.dead || nb === src || nb.type === "metal") return;
    const dx = Math.abs(nb.x - src.x), dy = Math.abs(nb.y - src.y);
    if (dx <= BW + BGAP + 2 && dy <= BH + BGAP + 2) {
      nb.hp--; nb.flash = 6;
      s.flashes.push({ x: nb.x + BW/2, y: nb.y + BH/2, r: 4, a: 1, col: "#fbbf24" });
      if (nb.hp <= 0) {
        nb.dead = true;
        if (nb.itemType) s.items.push({ x: nb.x + BW/2, y: nb.y, type: nb.itemType, dead: false });
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  ITEM APPLICATION
// ═══════════════════════════════════════════════════════════════
function applyItem(s, type) {
  switch (type) {
    case "expand":  s.expandT = EFF_DUR; s.shrinkT = 0; break;
    case "shrink":  s.shrinkT = EFF_DUR; s.expandT = 0; break;
    case "slow":    s.slowT   = EFF_DUR; s.fastT   = 0; break;
    case "fast":    s.fastT   = EFF_DUR; s.slowT   = 0; break;
    case "life":    s.lives   = Math.min(s.lives + 1, 5); break;
    case "laser":   s.laserActive = true; s.laserAmmo = Math.min(s.laserAmmo + 20, 40); break;
    case "multi": {
      const newBalls = [];
      s.balls.filter(b => !b.dead && !b.attached).forEach(b => {
        const sv = ballSpd(b.vx, b.vy);
        [-0.5, 0.5].forEach(a => newBalls.push({
          x: b.x, y: b.y,
          vx: Math.sin(a) * sv, vy: -Math.abs(Math.cos(a) * sv),
          attached: false, dead: false,
        }));
      });
      s.balls.push(...newBalls);
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  UPDATE
// ═══════════════════════════════════════════════════════════════
function update(s, paddleX, fireRef) {
  if (s.gphase === "gameover" || s.gphase === "levelend") return;

  let pw = PW0;
  if (s.expandT > 0) pw = Math.round(PW0 * 1.65);
  if (s.shrinkT > 0) pw = Math.round(PW0 * 0.60);
  s.paddle.w = pw;
  const targetX = Math.max(0, Math.min(CW - pw, paddleX - pw / 2));
  s.paddle.x += (targetX - s.paddle.x) * 0.28;

  s.expandT    = Math.max(0, s.expandT - 1);
  s.shrinkT    = Math.max(0, s.shrinkT - 1);
  s.slowT      = Math.max(0, s.slowT   - 1);
  s.fastT      = Math.max(0, s.fastT   - 1);
  s.deathFlash = Math.max(0, s.deathFlash - 0.04);
  s.blocks.forEach(b => { if (b.flash > 0) b.flash--; });

  s.balls.forEach(b => {
    if (b.attached) { b.x = s.paddle.x + pw / 2; b.y = PY - BR - 1; }
  });

  // READY
  if (s.gphase === "ready") {
    if (fireRef.current) {
      fireRef.current = false;
      s.balls.forEach(b => {
        if (!b.attached) return;
        b.attached = false;
        const dir = Math.random() < 0.5 ? -1 : 1;
        b.vx = dir * SPD0 * Math.SQRT1_2;
        b.vy = -SPD0 * Math.SQRT1_2;
      });
      s.gphase = "playing";
    }
    return;
  }

  // LEVEL CLEAR countdown
  if (s.gphase === "levelclear") {
    if (--s.lvlClearT <= 0) s.gphase = "levelend";
    return;
  }

  // PLAYING
  if (fireRef.current) {
    fireRef.current = false;
    if (s.laserActive && s.laserAmmo > 0) {
      s.lasers.push(
        { x: s.paddle.x + 8,              y: PY - 4, dead: false },
        { x: s.paddle.x + s.paddle.w - 8, y: PY - 4, dead: false }
      );
      s.laserAmmo -= 2;
      if (s.laserAmmo <= 0) s.laserActive = false;
    }
  }

  const curSpd = Math.min(SPD0 + s.level * 0.22, SPD_MAX)
    * (s.slowT > 0 ? 0.65 : s.fastT > 0 ? 1.5 : 1.0);

  s.balls.forEach(ball => {
    if (ball.dead || ball.attached) return;
    [ball.vx, ball.vy] = setSpd(ball.vx, ball.vy, curSpd);
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x - BR < 0)  { ball.x = BR;       ball.vx =  Math.abs(ball.vx); }
    if (ball.x + BR > CW) { ball.x = CW - BR;  ball.vx = -Math.abs(ball.vx); }
    if (ball.y - BR < 0)  { ball.y = BR;        ball.vy =  Math.abs(ball.vy); }
    if (ball.y > CH + 20) { ball.dead = true; return; }

    if (ball.vy > 0 &&
        ball.y + BR >= PY && ball.y - BR <= PY + PH &&
        ball.x + BR >= s.paddle.x && ball.x - BR <= s.paddle.x + s.paddle.w) {
      [ball.vx, ball.vy] = paddleBounce(ball, s.paddle);
      ball.y = PY - BR - 0.5;
    }

    let resolved = false;
    for (const blk of s.blocks) {
      if (blk.dead) continue;
      if (!circleAABB(ball.x, ball.y, blk.x, blk.y, BW, BH)) continue;
      if (blk.type === "metal") {
        if (!resolved) { resolveAABB(ball, blk.x, blk.y, BW, BH); resolved = true; }
        blk.flash = 3;
        s.flashes.push({ x: blk.x+BW/2, y: blk.y+BH/2, r: 3, a: 0.5, col: "#9ca3af" });
        continue;
      }
      if (!resolved) { resolveAABB(ball, blk.x, blk.y, BW, BH); resolved = true; }
      blk.hp--; blk.flash = 4;
      s.score += 10;
      s.flashes.push({ x: blk.x+BW/2, y: blk.y+BH/2, r: 2, a: 0.9, col: blk.col });
      if (blk.hp <= 0) {
        blk.dead = true; s.score += 20;
        if (blk.type === "explosive") explode(s, blk);
        if (blk.itemType) s.items.push({ x: blk.x+BW/2, y: blk.y+BH/2, type: blk.itemType, dead: false });
      }
    }
  });

  const activeBalls   = s.balls.filter(b => !b.dead && !b.attached);
  const attachedBalls = s.balls.filter(b => b.attached && !b.dead);
  if (activeBalls.length === 0 && attachedBalls.length === 0) {
    s.lives--;
    s.deathFlash = 1.0;
    if (s.lives <= 0) {
      s.gphase = "gameover";
    } else {
      s.balls = [{ x: CW/2, y: PY-BR-1, vx: 0, vy: 0, attached: true, dead: false }];
      s.laserActive = false; s.laserAmmo = 0;
      s.gphase = "ready";
    }
  }

  s.items.forEach(item => {
    if (item.dead) return;
    item.y += ITEM_V;
    if (item.y > CH + 20) { item.dead = true; return; }
    if (item.y + 12 >= PY && item.y - 12 <= PY + PH &&
        item.x + 16 >= s.paddle.x && item.x - 16 <= s.paddle.x + s.paddle.w) {
      applyItem(s, item.type); item.dead = true;
    }
  });
  s.items = s.items.filter(i => !i.dead);

  s.lasers.forEach(l => {
    if (l.dead) return;
    l.y -= LASER_V;
    if (l.y < -10) { l.dead = true; return; }
    for (const blk of s.blocks) {
      if (blk.dead || blk.type === "metal" || l.dead) continue;
      if (l.x >= blk.x && l.x <= blk.x + BW && l.y >= blk.y && l.y <= blk.y + BH) {
        blk.hp--; blk.flash = 4;
        if (blk.hp <= 0) {
          blk.dead = true;
          if (blk.type === "explosive") explode(s, blk);
          if (blk.itemType) s.items.push({ x: blk.x+BW/2, y: blk.y, type: blk.itemType, dead: false });
        }
        l.dead = true;
      }
    }
  });
  s.lasers = s.lasers.filter(l => !l.dead);

  s.flashes.forEach(f => { f.r += 1.8; f.a -= 0.07; });
  s.flashes = s.flashes.filter(f => f.a > 0);

  if (s.gphase === "playing") {
    const destroyable = s.blocks.filter(b => !b.dead && b.type !== "metal");
    if (destroyable.length === 0) {
      const payment  = PAY_LVL + s.level*10000;     //*s.level;   // PAY_LVL;
      s.earned      += payment;
      s.lastLevelPay = payment;
      s.gphase       = "levelclear";
      s.lvlClearT    = 120;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  DRAWING
// ═══════════════════════════════════════════════════════════════
function draw(ctx, s) {
  ctx.fillStyle = "#0d0d18";
  ctx.fillRect(0, 0, CW, CH);

  ctx.strokeStyle = "#11111c";
  ctx.lineWidth = 1;
  for (let x = 0; x < CW; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke();
  }
  for (let y = 0; y < CH; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
  }

  if (s.deathFlash > 0) {
    ctx.fillStyle = `rgba(255,50,50,${s.deathFlash * 0.32})`;
    ctx.fillRect(0, 0, CW, CH);
  }

  s.blocks.forEach(b => {
    if (b.dead) return;
    ctx.globalAlpha = 1;
    if (b.flash > 0) {
      ctx.fillStyle = "#ffffff";
    } else if (b.type === "reinforced" && b.maxHp > 1) {
      const dmg = 1 - (b.hp - 1) / (b.maxHp - 1);
      ctx.fillStyle = `hsl(215,20%,${20 + dmg * 22}%)`;
    } else {
      ctx.fillStyle = b.col;
    }
    ctx.fillRect(b.x, b.y, BW, BH);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(b.x, b.y, BW, 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(b.x, b.y + BH - 2, BW, 2);

    if (b.type === "metal") {
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + BH);
      g.addColorStop(0, "rgba(255,255,255,0.28)");
      g.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y, BW, BH);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.save();
      ctx.rect(b.x, b.y, BW, BH);
      ctx.clip();
      for (let i = -BH; i < BW + BH; i += 7) {
        ctx.beginPath(); ctx.moveTo(b.x + i, b.y); ctx.lineTo(b.x + i + BH, b.y + BH); ctx.stroke();
      }
      ctx.restore();
    }

    if (b.type === "explosive" && b.flash === 0) {
      ctx.globalAlpha = 0.45 + 0.3 * Math.sin(Date.now() / 180);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, BW - 2, BH - 2);
      ctx.globalAlpha = 1;
    }

    if (b.type === "reinforced" && b.maxHp > 1 && !b.dead) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(b.hp, b.x + BW / 2, b.y + BH - 3);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }

    if (b.itemType && b.flash === 0) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = ITEM_COLOR[b.itemType];
      ctx.beginPath();
      ctx.arc(b.x + BW - 5, b.y + 5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  });

  s.flashes.forEach(f => {
    ctx.globalAlpha = f.a;
    ctx.fillStyle = f.col;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;

  s.items.forEach(item => {
    if (item.dead) return;
    const ic = ITEM_COLOR[item.type];
    ctx.fillStyle = ic + "bb";
    ctx.fillRect(item.x - 18, item.y - 11, 36, 22);
    ctx.strokeStyle = ic; ctx.lineWidth = 1.5;
    ctx.strokeRect(item.x - 18, item.y - 11, 36, 22);
    ctx.fillStyle = "#000";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(ITEM_LABEL[item.type], item.x, item.y + 3);
    ctx.textAlign = "left";
  });

  s.lasers.forEach(l => {
    if (l.dead) return;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#fb923c";
    ctx.fillRect(l.x - 2, l.y, 4, 16);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(l.x - 5, l.y, 10, 16);
    ctx.globalAlpha = 1;
  });

  const px = s.paddle.x, pw = s.paddle.w;
  const pGrad = ctx.createLinearGradient(px, PY, px, PY + PH);
  if (s.laserActive) {
    pGrad.addColorStop(0, "#fb923c"); pGrad.addColorStop(1, "#dc2626");
  } else if (s.expandT > 0) {
    pGrad.addColorStop(0, "#4ade80"); pGrad.addColorStop(1, "#15803d");
  } else if (s.shrinkT > 0) {
    pGrad.addColorStop(0, "#f87171"); pGrad.addColorStop(1, "#b91c1c");
  } else {
    pGrad.addColorStop(0, "#fbbf24"); pGrad.addColorStop(1, "#d97706");
  }
  ctx.fillStyle = pGrad;
  const r6 = 6;
  ctx.beginPath();
  ctx.moveTo(px + r6, PY);
  ctx.lineTo(px + pw - r6, PY);
  ctx.quadraticCurveTo(px + pw, PY, px + pw, PY + r6);
  ctx.lineTo(px + pw, PY + PH - r6);
  ctx.quadraticCurveTo(px + pw, PY + PH, px + pw - r6, PY + PH);
  ctx.lineTo(px + r6, PY + PH);
  ctx.quadraticCurveTo(px, PY + PH, px, PY + PH - r6);
  ctx.lineTo(px, PY + r6);
  ctx.quadraticCurveTo(px, PY, px + r6, PY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(px + 4, PY + 1, pw - 8, 3);

  s.balls.forEach(ball => {
    if (ball.dead) return;
    const grd = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, BR * 3.5);
    grd.addColorStop(0, "rgba(255,255,210,0.3)");
    grd.addColorStop(1, "rgba(255,255,210,0)");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BR * 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fffde7";
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath(); ctx.arc(ball.x - 2, ball.y - 2, 2.5, 0, Math.PI * 2); ctx.fill();
  });

  // HUD
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, CW, 58);
  ctx.fillStyle = "#555";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`NIV ${s.level}`, 10, 20);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ddd";
  ctx.font = "bold 14px monospace";
  ctx.fillText(String(s.score).padStart(6, "0"), CW / 2, 20);
  ctx.fillStyle = "#00d4aa";
  ctx.font = "11px monospace";
  ctx.fillText(`+$${s.earned.toLocaleString()}`, CW / 2, 38);
  for (let i = 0; i < Math.min(s.lives, 5); i++) {
    ctx.fillStyle = "#f472b6";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("❤", CW - 10 - i * 20, 20);
  }
  ctx.textAlign = "left";

  let efx = 8;
  const efY = 50;
  const efBar = (label, col, t) => {
    if (t <= 0) return;
    ctx.fillStyle = col + "25";
    ctx.fillRect(efx, efY - 9, 60, 11);
    ctx.fillStyle = col;
    ctx.fillRect(efx, efY - 9, Math.round(60 * t / EFF_DUR), 11);
    ctx.fillStyle = "#000";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "left";
    ctx.fillText(label, efx + 3, efY);
    efx += 64;
  };
  efBar("＋W",   "#22c55e", s.expandT);
  efBar("－W",   "#ef4444", s.shrinkT);
  efBar("▼SPD", "#22d3ee", s.slowT);
  efBar("▲SPD", "#fbbf24", s.fastT);
  if (s.laserActive) {
    ctx.fillStyle = "#fb923c";
    ctx.font = "bold 9px monospace";
    ctx.fillText(`⚡ ×${s.laserAmmo}`, efx, efY);
  }
  ctx.textAlign = "left";

  if (s.gphase === "ready") {
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Click / Espacio — Lanzar", CW / 2, CH - 18);
    ctx.textAlign = "left";
  }

  // Overlay nivel superado (solo animación breve antes de levelend)
  if (s.gphase === "levelclear") {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.fillText("¡NIVEL SUPERADO!", CW / 2, CH / 2 - 16);
    ctx.fillStyle = "#00d4aa";
    ctx.font = "bold 22px monospace";
    ctx.fillText(`+$${s.lastLevelPay.toLocaleString()}`, CW / 2, CH / 2 + 20);
    ctx.textAlign = "left";
  }
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function BlockBreaker({ balance, setBalance, onBack }) {
  const cvs     = useRef(null);
  const game    = useRef(null);
  const raf     = useRef(null);
  const balRef  = useRef(balance);
  const padXRef = useRef(CW / 2);
  const fireRef = useRef(false);
  const keysRef = useRef({ left: false, right: false });

  // UI state
  const [rphase,       setRPhase]       = useState("idle"); // "idle"|"ingame"|"gameover"
  const [earned,       setEarned]       = useState(0);
  const [lvlDisplay,   setLvlDisplay]   = useState(1);
  const [levelEndData, setLevelEndData] = useState(null);   // { level, payment, earned }
  const [didCashOut,   setDidCashOut]   = useState(false);

  const levelEndFiredRef = useRef(false);

  useEffect(() => { balRef.current = balance; }, [balance]);

  // Idle preview
  useEffect(() => {
    if (rphase !== "idle") return;
    const ctx = cvs.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0d0d18";
    ctx.fillRect(0, 0, CW, CH);
    ROW_CLR.slice(0, 5).forEach((col, r) => {
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = col;
        ctx.fillRect(GX0 + c * (BW + BGAP), 100 + r * (BH + BGAP), BW, BH);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(GX0 + c * (BW + BGAP), 100 + r * (BH + BGAP), BW, 2);
      }
    });
  }, [rphase]);

  // ── Start ──
  function startGame() {
    cancelAnimationFrame(raf.current);
    fireRef.current          = false;
    keysRef.current          = { left: false, right: false };
    padXRef.current          = CW / 2;
    levelEndFiredRef.current = false;
    setLevelEndData(null);
    setDidCashOut(false);
    game.current = mkState(1, 3);
    setRPhase("ingame");
    setEarned(0);
    setLvlDisplay(1);
  }

  // ── Fire ──
  function signalFire() {
    const s = game.current;
    if (!s) return;
    if (s.gphase === "ready" || (s.laserActive && s.gphase === "playing")) {
      fireRef.current = true;
    }
  }

  // ── Continue to next level (called from JSX button) ──
  function continueToNextLevel() {
    const s = game.current;
    if (!s || s.gphase !== "levelend") return;
    const nl = s.level + 1;


    const newPaddleW = Math.max(10, PW0 - (nl - 1) * 20);   // 44, *6


    Object.assign(s, {
      level: nl,

      paddle: { x: CW / 2 - newPaddleW / 2, w: newPaddleW },


      blocks: genBlocks(nl),
      items: [], lasers: [],
      laserActive: false, laserAmmo: 0,
      balls: [{ x: CW/2, y: PY-BR-1, vx: 0, vy: 0, attached: true, dead: false }],
      expandT: 0, shrinkT: 0, slowT: 0, fastT: 0,
      gphase: "ready",
      lastLevelPay: 0,
    });
    //s.paddle.x = CW / 2 - s.paddle.w / 2;
    
    levelEndFiredRef.current = false;
    setLevelEndData(null);
  }

  // ── Cash out (called from JSX button) ──
  function cashOut() {
    cancelAnimationFrame(raf.current);
    const s = game.current;
    const finalEarned = s?.earned || 0;
    const finalLevel  = s?.level  || 1;
    if (finalEarned > 0) {
      setBalance(balRef.current + finalEarned);
      balRef.current += finalEarned;
    }
    setEarned(finalEarned);
    setLvlDisplay(finalLevel);
    levelEndFiredRef.current = false;
    setLevelEndData(null);
    setDidCashOut(true);
    setRPhase("gameover");
  }

  // ── Game loop ──
  useEffect(() => {
    if (rphase !== "ingame") return;
    const ctx = cvs.current?.getContext("2d");
    if (!ctx) return;

    let lastEarned = 0, lastLvl = 1;

    function loop() {
      const s = game.current;
      if (!s) return;

      const kspd = 7;
      if (keysRef.current.left)  padXRef.current = Math.max(0,   padXRef.current - kspd);
      if (keysRef.current.right) padXRef.current = Math.min(CW,  padXRef.current + kspd);

      update(s, padXRef.current, fireRef);
      draw(ctx, s);

      if (s.earned  !== lastEarned) { lastEarned = s.earned;  setEarned(s.earned); }
      if (s.level   !== lastLvl)    { lastLvl    = s.level;   setLvlDisplay(s.level); }

      // Detectar levelend → mostrar botones
      if (s.gphase === "levelend" && !levelEndFiredRef.current) {
        levelEndFiredRef.current = true;
        setLevelEndData({ level: s.level, payment: s.lastLevelPay, earned: s.earned });
      }

      // Game over automático (vidas = 0)
      if (s.gphase === "gameover") {
        draw(ctx, s);
        const finalEarned = s.earned;
        if (finalEarned > 0) {
          setBalance(balRef.current + finalEarned);
          balRef.current += finalEarned;
        }
        setEarned(finalEarned);
        setLvlDisplay(s.level);
        setDidCashOut(false);
        setRPhase("gameover");
        return;
      }

      raf.current = requestAnimationFrame(loop);
    }

    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [rphase]);

  // Keyboard
  useEffect(() => {
    const kd = e => {
      if (e.code === "Space" || e.code === "ArrowUp")    { e.preventDefault(); signalFire(); }
      if (e.code === "ArrowLeft")  { e.preventDefault(); keysRef.current.left  = true; }
      if (e.code === "ArrowRight") { e.preventDefault(); keysRef.current.right = true; }
    };
    const ku = e => {
      if (e.code === "ArrowLeft")  keysRef.current.left  = false;
      if (e.code === "ArrowRight") keysRef.current.right = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup",   ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup",   ku);
    };
  }, []);

  function onMouseMove(e) {
    const rect = cvs.current?.getBoundingClientRect();
    if (!rect) return;
    padXRef.current = (e.clientX - rect.left) * (CW / rect.width);
  }
  function onTouch(e) {
    e.preventDefault();
    const rect = cvs.current?.getBoundingClientRect();
    if (!rect) return;
    padXRef.current = (e.touches[0].clientX - rect.left) * (CW / rect.width);
  }

  function handleExit() {
    cancelAnimationFrame(raf.current);
    const s = game.current;
    if (s && s.earned > 0) {
      setBalance(balRef.current + s.earned);
    }
    onBack();
  }

  const legend = [
    { col: "#22c55e", label: "＋W  Paleta grande" },
    { col: "#ef4444", label: "－W  Paleta pequeña" },
    { col: "#60a5fa", label: "×3   Multiball" },
    { col: "#fb923c", label: "⚡   Laser (×20)" },
    { col: "#22d3ee", label: "▼   Pelota lenta" },
    { col: "#fbbf24", label: "▲   Pelota rápida" },
    { col: "#f472b6", label: "❤   +1 vida" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080810",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      fontFamily: "'Georgia', serif",
      paddingBottom: 40,
      width: "100%",
      boxSizing: "border-box",
    }}>

      {/* Header */}
      <div style={{
        width: "100%", maxWidth: CW + 100,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 16px", boxSizing: "border-box",
      }}>
        <button onClick={handleExit} style={{
          background: "rgba(10,10,18,0.75)", border: "1px solid #2a2a3a",
          borderRadius: 8, color: "#aaa", fontSize: 13, padding: "6px 14px", cursor: "pointer",
        }}>← Volver</button>

        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#8b5cf6", fontWeight: 800, fontSize: 20 }}>🧱 Block Breaker</div>
          <div style={{ color: "#555", fontSize: 12 }}>Cada Nivel $45.000 </div>
        </div>

        <div style={{
          background: "rgba(0,212,170,0.1)", border: "1px solid #00d4aa44",
          borderRadius: 10, padding: "6px 14px", textAlign: "right",
        }}>
          <div style={{ color: "#555", fontSize: 11 }}>Ganado</div>
          <div style={{ color: "#00d4aa", fontWeight: 700, fontSize: 16 }}>+{earned.toLocaleString()}</div>
        </div>
      </div>

      {/* Canvas container */}
      <div style={{
        width: "100%", maxWidth: CW + 100,
        padding: "0 50px", boxSizing: "border-box",
        position: "relative",
      }}>
        <canvas
          ref={cvs}
          width={CW} height={CH}
          onMouseMove={onMouseMove}
          onTouchMove={onTouch}
          onTouchStart={e => { onTouch(e); signalFire(); }}
          onClick={signalFire}
          style={{
            width: "100%",
            border: "1px solid #1e1e2e",
            borderRadius: 12,
            cursor: "none",
            display: "block",
          }}
        />

        {/* ── Idle overlay ── */}
        {rphase === "idle" && (
          <div style={{
            position: "absolute", inset: "0 50px",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.72)", borderRadius: 12,
          }}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>🧱</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 24, marginBottom: 6 }}>Block Breaker</div>
            <div style={{ color: "#aaa", fontSize: 13, marginBottom: 4, textAlign: "center", lineHeight: 1.7 }}>
              Destruye todos los bloques para superar cada nivel.<br/>
              Recoge power-ups… y evita las trampas.
            </div>
            <div style={{ color: "#00d4aa", fontSize: 15, fontWeight: 700, marginBottom: 22 }}>
              $45.000 por cada nivel
            </div>
            <button onClick={startGame} style={{
              background: "#8b5cf6", border: "none", borderRadius: 10,
              padding: "12px 36px", fontSize: 16, fontWeight: 800,
              cursor: "pointer", color: "#fff",
            }}>▶ Jugar</button>
          </div>
        )}

        {/* ── Game Over overlay ── */}
        {rphase === "gameover" && (
          <div style={{
            position: "absolute", inset: "0 50px",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.78)", borderRadius: 12,
          }}>
            <div style={{ fontSize: 50, marginBottom: 8 }}>
              {didCashOut ? "💰" : "💀"}
            </div>
            <div style={{
              fontWeight: 800, fontSize: 26, marginBottom: 10,
              color: didCashOut ? "#00d4aa" : "#ff5555",
            }}>
              {didCashOut ? "¡COBRADO!" : "GAME OVER"}
            </div>
            <div style={{ color: "#aaa", fontSize: 13, marginBottom: 4 }}>
              Niveles superados:{" "}
              <span style={{ color: "#fff", fontWeight: 700 }}>{lvlDisplay - 1}</span>
            </div>
            <div style={{ color: "#00d4aa", fontSize: 20, fontWeight: 800, marginBottom: 28 }}>
              +{earned.toLocaleString()} fichas 🎉
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={startGame} style={{
                background: "#8b5cf6", border: "none", borderRadius: 10,
                padding: "11px 28px", fontSize: 15, fontWeight: 800,
                cursor: "pointer", color: "#fff",
              }}>🔄 Reintentar</button>
              <button onClick={handleExit} style={{
                background: "transparent", border: "1px solid #444",
                borderRadius: 10, padding: "11px 20px",
                fontSize: 14, color: "#aaa", cursor: "pointer",
              }}>← Salir</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Botones de decisión entre niveles ── */}
      {levelEndData && rphase === "ingame" && (
        <div style={{
          marginTop: 18,
          display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap",
        }}>
          <div style={{ textAlign: "center", marginBottom: 6, width: "100%", color: "#aaa", fontSize: 13 }}>
            Nivel {levelEndData.level} completado · Ganaste{" "}
            <span style={{ color: "#00d4aa", fontWeight: 700 }}>${levelEndData.payment.toLocaleString()}</span>
            {" "}· Total:{" "}
            <span style={{ color: "#fbbf24", fontWeight: 700 }}>${levelEndData.earned.toLocaleString()}</span>
          </div>
          <button
            onClick={continueToNextLevel}
            style={{
              background: "#8b5cf6", border: "none", borderRadius: 10,
              padding: "13px 32px", fontSize: 15, fontWeight: 800,
              cursor: "pointer", color: "#fff",
            }}
          >
            ▶ Nivel {levelEndData.level + 1}
          </button>
          <button
            onClick={cashOut}
            style={{
              background: "linear-gradient(135deg, #00d4aa, #059669)",
              border: "none", borderRadius: 10,
              padding: "13px 32px", fontSize: 15, fontWeight: 800,
              cursor: "pointer", color: "#000",
            }}
          >
            💰 Cobrar ${levelEndData.earned.toLocaleString()}
          </button>
        </div>
      )}

      {/* Controls */}
      <div style={{
        display: "flex", gap: 18, marginTop: 14,
        color: "#444", fontSize: 12, flexWrap: "wrap", justifyContent: "center",
      }}>
        <span>🖱 Ratón / toca — mover paleta</span>
        <span>Click / Espacio — lanzar / laser</span>
        <span>⬅ ➡ — teclado</span>
      </div>

      {/* Power-up legend */}
      <div style={{
        marginTop: 14,
        background: "rgba(10,10,18,0.8)", border: "1px solid #1e1e2e",
        borderRadius: 10, padding: "10px 16px",
        display: "flex", flexWrap: "wrap", gap: "4px 18px",
        maxWidth: 480, justifyContent: "center",
      }}>
        {legend.map(l => (
          <span key={l.label} style={{ color: l.col, fontSize: 11, fontFamily: "monospace" }}>
            {l.label}
          </span>
        ))}
      </div>

      {/* Balance */}
      <div style={{
        marginTop: 14,
        background: "rgba(10,10,18,0.8)", border: "1px solid #fbbf2433",
        borderRadius: 10, padding: "8px 24px",
        color: "#fbbf24", fontWeight: 700, fontSize: 14,
      }}>
        💰 {balance.toLocaleString()} fichas
      </div>
    </div>
  );
}
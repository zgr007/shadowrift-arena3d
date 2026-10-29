'use strict';

function oppositeTeam(team) { return team === 'blue' ? 'red' : 'blue'; }

class Game3D {
  constructor(view, playerHeroId, difficulty) {
    this.view = view;
    this.playerHeroId = playerHeroId;
    this.difficulty = difficulty || 'normal';
    this.playerTeam = 'blue';
    this.enemyTeam = 'red';
    this.time = 0;
    this.state = 'playing';
    this.result = null;
    this.endTimer = null;

    this.units = [];
    this.heroes = [];
    this.structures = { blue: [], red: [] };
    this.projectiles = [];
    this.telegraphs = [];
    this.camps = [];
    this.lanePaths = {};
    this.waveTimer = MINION_WAVE.firstDelay;
    this.waveCount = 0;
    this.aimX = 1800;
    this.aimY = 1800;
    this.hoveredEnemy = null;
    this.joystick = { x: 0, y: 0 };
    this.skillAiming = false;
    this.aimSkillIndex = -1;
    this.toasts = [];
    this.feedEvents = [];
    this.feedSeq = 0;
    this.bannerData = null;
    this.bannerSeq = 0;
    this.toastSeq = 0;
    this.teamKills = { blue: 0, red: 0 };
    this.firstBlood = false;
    this.lastAceAt = -99;
    this.stats = null;
    this.epicSpawned = false;

    this.buildStructures();
    this.buildHeroes();
    this.buildCamps();
    this.bindInput();
    this.view.pointer.set(0, 0);
    this.view.camFocus.set(this.player.x, 0, this.player.y);
    this.view.updateCamera(0.2, this.player.x, this.player.y, this.player.x, this.player.y);
    this.updateAim();
  }

  laneWaypoints(lane, team) {
    const key = lane + '_' + team;
    if (!this.lanePaths[key]) {
      const pts = (LANE_PATHS[lane] || LANE_PATHS.mid).map(p => [p[0], p[1]]);
      if (team === 'red') pts.reverse();
      this.lanePaths[key] = pts;
    }
    return this.lanePaths[key];
  }

  structuresOf(team) { return this.structures[team]; }
  baseOf(team) { return this.structures[team].find(s => s.kind === 'base'); }
  spawnWaypointFor(hero) { return 1; }

  /* ---------------- 创建战场 ---------------- */
  buildStructures() {
    for (const team of ['blue', 'red']) {
      const towers = { top: {}, mid: {}, bot: {} };
      for (const lane of ['top', 'mid', 'bot']) {
        const outerPos = samplePolyline(LANE_PATHS[lane], TOWER_FRACTIONS[team].outer);
        const innerPos = samplePolyline(LANE_PATHS[lane], TOWER_FRACTIONS[team].inner);
        const outer = new Structure3D(this, team, {
          kind: 'tower', role: 'outer', lane, x: outerPos.x, y: outerPos.y, requires: null
        });
        const inner = new Structure3D(this, team, {
          kind: 'tower', role: 'inner', lane, x: innerPos.x, y: innerPos.y, requires: outer
        });
        towers[lane].outer = outer;
        towers[lane].inner = inner;
        this.structures[team].push(outer, inner);
        this.units.push(outer, inner);
      }
      const bp = team === 'blue' ? MAP3.baseBlue : MAP3.baseRed;
      const base = new Structure3D(this, team, { kind: 'base', role: 'base', lane: null, x: bp.x, y: bp.y });
      this.structures[team].push(base);
      this.units.push(base);
      this['towers_' + team] = towers;
    }
  }

  spawnSpot(team, index) {
    const base = team === 'blue' ? MAP3.baseBlue : MAP3.baseRed;
    const a = (index / TEAM_SIZE) * TAU - Math.PI / 2;
    return { x: base.x + Math.cos(a) * 150, y: base.y + Math.sin(a) * 150 };
  }

  buildHeroes() {
    const blueRoster = buildBlueRoster(this.playerHeroId);
    blueRoster.forEach((slot, i) => {
      const isPlayer = slot.id === this.playerHeroId;
      const spawn = this.spawnSpot('blue', i);
      const pathLane = slot.role === 'jungle' ? 'mid' : (slot.role === 'support' ? 'bot' : slot.lane);
      const hero = new Hero3D(this, HERO_BY_ID[slot.id], 'blue', isPlayer, pathLane, spawn);
      hero.role = slot.role;
      this.units.push(hero);
      this.heroes.push(hero);
      if (isPlayer) this.player = hero;
      else HeroAI3.init(hero);
    });

    const redRoster = buildRedRoster(this.playerHeroId);
    redRoster.forEach((slot, i) => {
      const spawn = this.spawnSpot('red', i);
      const pathLane = slot.role === 'jungle' ? 'mid' : (slot.role === 'support' ? 'bot' : slot.lane);
      const hero = new Hero3D(this, HERO_BY_ID[slot.id], 'red', false, pathLane, spawn);
      hero.role = slot.role;
      this.applyDifficulty(hero);
      this.units.push(hero);
      this.heroes.push(hero);
      HeroAI3.init(hero);
    });
    this.playerRole = blueRoster.find(s => s.id === this.playerHeroId).role;
  }

  buildCamps() {
    for (const cfg of JUNGLE_CAMPS) {
      const camp = { ...cfg, monster: null, respawnAt: 0 };
      this.camps.push(camp);
      this.spawnCampMonster(camp);
    }
    const epic = {
      id: 'epic', team: 'neutral', type: 'epic', buff: null,
      x: EPIC_DEF.x, y: EPIC_DEF.y, monster: null, respawnAt: EPIC_DEF.firstSpawn
    };
    this.camps.push(epic);
    this.epicCamp = epic;
  }

  applyDifficulty(hero) {
    if (this.difficulty === 'easy') {
      hero.outgoingDamageMult = 0.78;
      hero.hpMult = 0.9;
      hero.aiThinkMult = 1.25;
      hero.aiSkillMult = 1.4;
      hero.aiAimJitter = 85;
    } else if (this.difficulty === 'hard') {
      hero.outgoingDamageMult = 1.12;
      hero.hpMult = 1.1;
      hero.aiThinkMult = 0.82;
      hero.aiSkillMult = 0.8;
      hero.aiAimJitter = 24;
    }
    hero.recalcStats();
    hero.hp = hero.maxHp;
    hero.mana = hero.maxMana;
  }

  spawnCampMonster(camp) {
    const m = new Monster3D(this, camp);
    camp.monster = m;
    camp.respawnAt = 0;
    this.units.push(m);
    if (camp.type === 'epic') {
      this.banner('暗影暴君即将苏醒', false);
      this.addFeed(`<span class="g">暗影暴君</span> 已出现`);
    }
  }

  resetCampMonster(monster) {
    if (!monster || !monster.alive) return;
    monster.x = monster.home.x;
    monster.y = monster.home.y;
    monster.hp = monster.maxHp;
    monster.target = null;
    monster.visual.position.set(monster.x, 0, monster.y);
  }

  /* ---------------- 输入 / 镜头 ---------------- */
  bindInput() {
    const canvas = this.view.renderer.domElement;
    this.onMove = (e) => {
      this.view.setPointer(e.clientX, e.clientY);
      this.updateAim();
    };
    this.onDown = (e) => {
      if (e.button !== 0) return;
      if (this.state !== 'playing') return;
      this.view.setPointer(e.clientX, e.clientY);
      this.updateAim();
      this.handleClick();
    };
    this.onTouch = (e) => {
      if (this.state !== 'playing') return;
      const t = e.changedTouches[0];
      if (!t) return;
      this.view.setPointer(t.clientX, t.clientY);
      this.updateAim();
      const useJoystick = !(typeof Settings !== 'undefined') || Settings.data.moveMode !== 'tap';
      if (useJoystick) {
        const hover = this.hoveredEnemy;
        if (hover && hover.alive) {
          if (hover.isInvulnerable && hover.isInvulnerable()) {
            this.toast('需要先摧毁前置防御塔');
          } else {
            this.player.attackTarget = hover;
            this.player.moveTarget = null;
            this.view.showClick(hover.x, hover.y, true);
            this.sfx('click');
          }
        }
      } else {
        this.handleClick();
      }
      if (e.cancelable) e.preventDefault();
    };
    this.onWheel = (e) => {
      e.preventDefault();
      this.view.zoomBy(e.deltaY > 0 ? 0.06 : -0.06);
    };
    this.onContext = (e) => e.preventDefault();
    this.onKey = (e) => {
      if (typeof UI !== 'undefined' && UI.settingsOpen) {
        if (e.code === 'Escape') UI.closeSettings();
        return;
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        if (this.state === 'playing') UI.showScoreboard();
        return;
      }
      if (e.code === 'Escape') {
        if (this.skillAiming) {
          if (typeof TouchUI !== 'undefined' && TouchUI.cancelSkillAim) TouchUI.cancelSkillAim();
          else this.endSkillAim();
          return;
        }
        if (this.state === 'playing' || this.state === 'paused') UI.togglePause();
        return;
      }
      if (this.state !== 'playing') return;
      if (e.repeat) return;
      if (e.code === 'KeyQ') this.player.tryCast(0);
      else if (e.code === 'KeyW') this.player.tryCast(1);
      else if (e.code === 'KeyE') this.player.tryCast(2);
      else if (e.code === 'KeyB') UI.toggleShop();
      else if (e.code === 'KeyM') UI.toggleMute();
    };
    this.onKeyUp = (e) => {
      if (e.code === 'Tab') UI.hideScoreboard();
    };
    canvas.addEventListener('mousemove', this.onMove);
    canvas.addEventListener('mousedown', this.onDown);
    canvas.addEventListener('touchstart', this.onTouch, { passive: false });
    canvas.addEventListener('touchmove', this.onTouch, { passive: false });
    canvas.addEventListener('contextmenu', this.onContext);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
  }

  handleClick() {
    if (!this.player || this.player.dead) return;
    const hover = this.hoveredEnemy;
    if (hover && hover.alive) {
      if (hover.isInvulnerable && hover.isInvulnerable()) {
        this.toast('需要先摧毁前置防御塔');
        this.sfx('deny');
        return;
      }
      this.player.attackTarget = hover;
      this.player.moveTarget = null;
      this.view.showClick(hover.x, hover.y, true);
      this.sfx('click');
      return;
    }
    let p = this.view.raycastGround();
    if (!p) return;
    const mt = {
      x: clamp(p.x, MAP3.playMin, MAP3.playMax),
      y: clamp(p.y, MAP3.playMin, MAP3.playMax)
    };
    this.player.attackTarget = null;
    this.player.moveTarget = mt;
    this.view.showClick(mt.x, mt.y, false);
    this.sfx('click');
  }

  setJoystick(x, y) {
    this.joystick.x = x;
    this.joystick.y = y;
  }

  playerAttackNearest() {
    if (!this.player || this.player.dead || this.state !== 'playing') return false;
    const p = this.player;
    let best = null, bd = 680;
    let heroBest = null, heroDist = Infinity;
    for (const u of this.units) {
      if (!u.alive || u.team === p.team) continue;
      if (u.type !== 'hero' && u.type !== 'minion' && u.type !== 'monster' && u.type !== 'tower' && u.type !== 'base') continue;
      if (u.isInvulnerable && u.isInvulnerable()) continue;
      const d = dist(p.x, p.y, u.x, u.y) - u.radius;
      if (u.type === 'hero' && d < heroDist) { heroDist = d; heroBest = u; }
      if (d < bd) { bd = d; best = u; }
    }
    if (heroBest && heroDist <= 680) best = heroBest;
    if (!best) return false;
    p.attackTarget = best;
    p.moveTarget = null;
    this.view.showClick(best.x, best.y, true);
    this.sfx('click');
    return true;
  }

  beginSkillAim(index) {
    if (this.state !== 'playing' || !this.player || this.player.dead) return false;
    const p = this.player;
    const s = p.def.skills[index];
    if (!s || p.skillCd[index] > 0 || p.mana < s.mana) return false;
    this.skillAiming = true;
    this.aimSkillIndex = index;
    if (s.range > 0) {
      const ax = p.x + Math.sin(p.facing) * s.range * 0.55;
      const ay = p.y + Math.cos(p.facing) * s.range * 0.55;
      this.setSkillAim(ax, ay, index);
      this.view.showSkillRange(s.range, cssColor(p.def.color), p);
      this.view.showSkillAimLine(p, this.aimX, this.aimY, cssColor(p.def.color));
    } else {
      this.aimX = p.x;
      this.aimY = p.y;
      this.view.showSkillRange(100, cssColor(p.def.color), p);
    }
    return true;
  }

  setSkillAim(x, y, index) {
    const p = this.player;
    const s = p && p.def.skills[index];
    if (!p || !s) return;
    const maxRange = s.range || 0;
    if (maxRange > 0) {
      const dx = x - p.x, dy = y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > maxRange) { x = p.x + (dx / d) * maxRange; y = p.y + (dy / d) * maxRange; }
      p.faceToward(x, y);
    }
    this.aimX = clamp(x, MAP3.playMin, MAP3.playMax);
    this.aimY = clamp(y, MAP3.playMin, MAP3.playMax);
    this.view.setAim({ x: this.aimX, y: this.aimY }, null);
    this.view.updateSkillRangeOwner(p);
    if (this.skillAiming) this.view.showSkillAimLine(p, this.aimX, this.aimY, cssColor(p.def.color));
  }

  endSkillAim() {
    this.skillAiming = false;
    this.aimSkillIndex = -1;
    this.view.hideSkillRange();
    this.view.hideSkillAimLine();
    this.view.setAim(null, null);
  }

  quickAim(index) {
    const p = this.player;
    const s = p && p.def.skills[index];
    if (!p || !s) return { x: p ? p.x : 0, y: p ? p.y : 0 };
    if (s.range <= 0) return { x: p.x, y: p.y };
    let best = null, bd = s.range + 80;
    let heroBest = null, heroDist = Infinity;
    for (const u of this.units) {
      if (!u.alive || u.team === p.team) continue;
      if (u.type !== 'hero' && u.type !== 'minion' && u.type !== 'monster') continue;
      const d = dist(p.x, p.y, u.x, u.y);
      if (u.type === 'hero' && d < heroDist) { heroDist = d; heroBest = u; }
      if (d < bd) { bd = d; best = u; }
    }
    if (heroBest && heroDist <= s.range + 80) best = heroBest;
    if (best) return { x: best.x, y: best.y };
    return {
      x: p.x + Math.sin(p.facing) * s.range * 0.65,
      y: p.y + Math.cos(p.facing) * s.range * 0.65
    };
  }

  updateAim() {
    if (!this.player) return;
    if (this.skillAiming) {
      if (this.state === 'playing' && !this.player.dead) {
        this.view.setAim({ x: this.aimX, y: this.aimY }, null);
        this.view.updateSkillRangeOwner(this.player);
      }
      return;
    }
    let aim = this.view.raycastGround();
    const mouseX = (this.view.pointer.x * 0.5 + 0.5) * this.view.width;
    const mouseY = (-this.view.pointer.y * 0.5 + 0.5) * this.view.height;
    let hovered = null, best = 70;
    for (const u of this.units) {
      if (!u.alive || u.team === this.player.team) continue;
      if (u.type !== 'hero' && u.type !== 'minion' && u.type !== 'tower' && u.type !== 'base' && u.type !== 'monster') continue;
      const p = this.view.project(u.x, (u.height || 100) * 0.5, u.y);
      if (!p.visible) continue;
      const d = Math.hypot(p.x - mouseX, p.y - mouseY);
      const lim = u.type === 'minion' ? 34 : 64;
      if (d < lim && d < best) { best = d; hovered = u; }
    }
    this.hoveredEnemy = hovered;
    if (hovered) aim = { x: hovered.x, y: hovered.y };
    if (!aim) aim = { x: 1800, y: 1800 };
    this.aimX = aim.x;
    this.aimY = aim.y;
    if (this.state === 'playing' && !this.player.dead) this.view.setAim(aim, hovered);
    else { this.view.setAim(null, null); }
  }

  /* ---------------- 主更新 ---------------- */
  update(dt) {
    if (this.state !== 'playing') return;
    this.time += dt;

    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveTimer += MINION_WAVE.interval;
      this.waveCount++;
      this.spawnWave();
    }

    const snapshot = this.units.slice();
    for (const u of snapshot) {
      if (u.removed) continue;
      if (u.type === 'hero') {
        if (u.isAI && !u.dead) HeroAI3.update(u, dt);
        u.update(dt);
      } else if (u.type === 'minion' || u.type === 'monster') {
        u.update(dt);
      } else {
        u.update(dt);
      }
    }

    this.updateProjectiles(dt);
    this.updateTelegraphs(dt);
    this.separateUnits();
    this.updateCamps();
    this.cleanupRemoved();
    this.updateAim();
    if (this.player) this.view.updateCamera(dt, this.player.x, this.player.y, this.aimX, this.aimY);
    this.toasts = this.toasts.filter(t => t.until > this.time);
    this.feedEvents = this.feedEvents.filter(f => f.until > this.time);
  }

  spawnWave() {
    for (const lane of ['top', 'mid', 'bot']) {
      for (const team of ['blue', 'red']) {
        for (let i = 0; i < MINION_WAVE.melee; i++) {
          this.units.push(new Minion3D(this, team, lane, 'melee', i));
        }
        this.units.push(new Minion3D(this, team, lane, 'ranged', 3));
      }
    }
  }

  updateCamps() {
    for (const camp of this.camps) {
      if (camp.monster && !camp.monster.dead) continue;
      if (camp.respawnAt > 0 && this.time >= camp.respawnAt) {
        if (camp.type === 'epic' && !this.epicSpawned) this.epicSpawned = true;
        this.spawnCampMonster(camp);
      }
    }
  }

  updateTelegraphs(dt) {
    const done = [];
    for (const t of this.telegraphs) {
      t.elapsed += dt;
      if (t.elapsed >= t.delay) done.push(t);
    }
    if (done.length) {
      this.telegraphs = this.telegraphs.filter(t => !done.includes(t));
      for (const t of done) t.onDone();
    }
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.trailTimer = (p.trailTimer || 0) - dt;
      if (p.trailTimer <= 0 && p.color) {
        p.trailTimer = p.arrow ? 0.055 : 0.042;
        this.view.trailPuff(p.x, p.y, p.color, p.big ? 15 : 9);
      }
      if (p.kind === 'homing') {
        p.life -= dt;
        if (p.life <= 0 || !p.target || !p.target.alive) { this.killProjectile(p); continue; }
        const tx = p.target.x;
        const ty = p.target.y;
        const d = Math.hypot(tx - p.x, ty - p.y);
        if (d <= 20) {
          p.target.takeDamage(p.damage, { source: p.source, game: this });
          this.view.burst(tx, ty, p.color, p.big ? 12 : 5, p.big ? 200 : 100);
          this.killProjectile(p);
          continue;
        }
        const step = Math.min(d, p.speed * dt);
        p.x += ((tx - p.x) / d) * step;
        p.y += ((ty - p.y) / d) * step;
        p.angle = Math.atan2(ty - p.y, tx - p.x);
        p.visual.setPos(p.x, p.height || 80, p.y);
        if (p.arrow) p.visual.setAngle(p.angle);
      } else {
        const step = p.speed * dt;
        p.traveled += step;
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.life -= dt;
        p.visual.setPos(p.x, p.height || 65, p.y);
        if (p.arrow) p.visual.setAngle(p.angle);

        for (const u of this.units) {
          if (!u.alive || u.team === p.team) continue;
          if (u.type !== 'hero' && u.type !== 'minion' && u.type !== 'monster') continue;
          if (p.hitIds.has(u.id)) continue;
          if (dist(p.x, p.y, u.x, u.y) <= p.radius + u.radius) {
            p.hitIds.add(u.id);
            u.takeDamage(p.damage, { source: p.source, game: this });
            if (p.onHit) p.onHit(u);
            this.view.burst(u.x, u.y, p.color, 7, 150);
            if (!p.pierce) { this.killProjectile(p); break; }
          }
        }
        if (p.dead) continue;
        if (p.traveled >= p.range || p.life <= 0) {
          this.view.burst(p.x, p.y, p.color, 4, 80);
          this.killProjectile(p);
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }

  killProjectile(p) {
    if (p.dead) return;
    p.dead = true;
    if (p.visual) p.visual.dispose();
  }

  separateUnits() {
    const movers = this.units.filter(u => u.alive && (u.type === 'hero' || u.type === 'minion' || u.type === 'monster'));
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i], b = movers[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = (a.radius + b.radius) * 0.92;
        if (d > 0 && d < minD) {
          const push = (minD - d) / 2;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
    for (const u of movers) {
      for (const s of [...this.structures.blue, ...this.structures.red]) {
        const d = dist(u.x, u.y, s.x, s.y);
        const minD = u.radius + s.radius * 0.85;
        if (d > 0 && d < minD) {
          u.x = s.x + ((u.x - s.x) / d) * minD;
          u.y = s.y + ((u.y - s.y) / d) * minD;
        }
      }
      u.x = clamp(u.x, MAP3.playMin, MAP3.playMax);
      u.y = clamp(u.y, MAP3.playMin, MAP3.playMax);
    }
  }

  cleanupRemoved() {
    if (!this.units.some(u => u.removed)) return;
    for (const u of this.units) {
      if (u.removed && u.dispose && !u._disposed) {
        u._disposed = true;
        u.dispose();
      }
    }
    this.units = this.units.filter(u => !u.removed);
  }

  moveEntity(unit, dx, dy) {
    unit.x = clamp(unit.x + dx, MAP3.playMin, MAP3.playMax);
    unit.y = clamp(unit.y + dy, MAP3.playMin, MAP3.playMax);
  }

  placeHero(hero, x, y) {
    let nx = clamp(x, MAP3.playMin, MAP3.playMax);
    let ny = clamp(y, MAP3.playMin, MAP3.playMax);
    for (const s of [...this.structures.blue, ...this.structures.red]) {
      const d = Math.hypot(nx - s.x, ny - s.y);
      const minD = hero.radius + s.radius * 0.85;
      if (d > 0 && d < minD) {
        nx = s.x + ((nx - s.x) / d) * minD;
        ny = s.y + ((ny - s.y) / d) * minD;
      }
    }
    hero.x = nx;
    hero.y = ny;
    if (hero.rig) hero.rig.setPosition(nx, ny);
  }

  /* ---------------- 查询 / 技能接口 ---------------- */
  enemiesInCircle(x, y, r, team) {
    const out = [];
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      if (u.type !== 'hero' && u.type !== 'minion' && u.type !== 'monster') continue;
      if (dist(x, y, u.x, u.y) <= r + u.radius) out.push(u);
    }
    return out;
  }

  enemiesInSector(x, y, angle, radius, half, team) {
    const out = [];
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      if (u.type !== 'hero' && u.type !== 'minion' && u.type !== 'monster') continue;
      const d = dist(x, y, u.x, u.y);
      if (d > radius + u.radius) continue;
      const a = Math.atan2(u.y - y, u.x - x);
      if (Math.abs(angleDiff(a, angle)) <= half) out.push(u);
    }
    return out;
  }

  enemiesAlongSegment(x1, y1, x2, y2, width, team) {
    const out = [];
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      if (u.type !== 'hero' && u.type !== 'minion' && u.type !== 'monster') continue;
      if (segPointDist(u.x, u.y, x1, y1, x2, y2) <= width + u.radius) out.push(u);
    }
    return out;
  }

  nearestEnemyHero(x, y, r, team) {
    let best = null, bd = Infinity;
    for (const u of this.heroes) {
      if (!u.alive || u.team === team) continue;
      const d = dist(x, y, u.x, u.y);
      if (d <= r + u.radius && d < bd) { bd = d; best = u; }
    }
    return best;
  }

  spawnHoming(o) {
    const visual = this.view.createProjectileVisual(o.color, false, !!o.big);
    visual.setPos(o.x, o.height || 80, o.y);
    this.projectiles.push({
      kind: 'homing', x: o.x, y: o.y, height: o.height || 80,
      target: o.target, speed: o.speed || 1000,
      damage: o.damage, source: o.source, color: o.color,
      big: !!o.big, small: !!o.small, heroShot: !!o.heroShot,
      life: 4, angle: 0, visual, arrow: false, trailTimer: 0
    });
  }

  spawnLinearProjectile(o) {
    const ang = Math.atan2(o.ty - o.y, o.tx - o.x);
    const visual = this.view.createProjectileVisual(o.color, !!o.arrow, !!o.big);
    visual.setPos(o.x, 70, o.y);
    visual.setAngle(ang);
    this.projectiles.push({
      kind: 'linear', x: o.x, y: o.y,
      vx: Math.cos(ang), vy: Math.sin(ang),
      speed: o.speed || 900, range: o.range || 600, traveled: 0,
      radius: o.radius || 16, damage: o.damage, source: o.source, team: o.team,
      color: o.color, pierce: !!o.pierce, onHit: o.onHit || null,
      arrow: !!o.arrow, big: !!o.big, hitIds: new Set(),
      angle: ang, life: 3, visual, trailTimer: 0
    });
    this.sfx(o.arrow ? 'arrow' : 'bolt');
  }

  telegraph(o) {
    this.telegraphs.push({
      x: o.x, y: o.y, radius: o.radius, delay: o.delay,
      elapsed: 0, onDone: o.onDone
    });
    this.view.telegraphFx(o.x, o.y, o.radius, cssColor(o.color, 0xff5c5c), o.delay);
    this.sfx('cast');
  }

  fxRing(x, y, r, color, life, width) { this.view.ring(x, y, r, cssColor(color), life || 0.5, width || 8); }
  fxSector(x, y, angle, radius, half, color) { this.view.sector(x, y, angle, radius, half, cssColor(color)); }
  fxBurst(x, y, color, count, speed) { this.view.burst(x, y, cssColor(color), count, speed); }
  fxDash(x1, y1, x2, y2, color) { this.view.dashFx(x1, y1, x2, y2, cssColor(color)); }
  fxSlash(hero, target) { this.view.slash(target.x, target.y, Math.atan2(target.y - hero.y, target.x - hero.x)); }
  floatText(x, y, text, color, size) {
    this.view.damageText(x, size && size >= 18 ? 160 : 130, y, text, size && size >= 18 ? 'big' : '');
  }

  toast(text) {
    this.toasts.push({ text, until: this.time + 2.8, id: ++this.toastSeq });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  banner(text, bad) {
    this.bannerData = { id: ++this.bannerSeq, text, bad: !!bad };
  }

  addFeed(html) {
    this.feedEvents.push({ id: ++this.feedSeq, html, until: this.time + 8 });
    if (this.feedEvents.length > 6) this.feedEvents.shift();
  }

  sfx(name) { Sfx.play(name); }

  buyItem(hero, index) {
    const item = SHOP_ITEMS[index];
    if (!item) return { ok: false, reason: 'none' };
    const count = hero.shopCounts[item.id];
    if (count >= 5) return { ok: false, reason: 'max' };
    if (hero.gold < item.costs[count]) return { ok: false, reason: 'gold' };
    hero.gold -= item.costs[count];
    hero.shopCounts[item.id] = count + 1;
    if (item.id === 'blade') hero.bonusAD += 15;
    else if (item.id === 'armor') { hero.bonusArmor += 9; hero.extraHp += 90; hero.recalcStats(); hero.hp += 90; }
    else if (item.id === 'arcane') hero.skillPowerMult += 0.1;
    if (hero.isPlayer) { this.sfx('buy'); this.toast(`已购买：${item.name}`); }
    return { ok: true };
  }

  /* ---------------- 死亡与奖励 ---------------- */
  onUnitDeath(unit, source) {
    if (unit.type === 'minion') {
      const killer = source && source.type === 'hero' ? source : null;
      if (killer) {
        killer.gainGold(MINION_WAVE.gold);
        killer.minionKills++;
      }
      const winningTeam = oppositeTeam(unit.team);
      for (const h of this.heroes) {
        if (h.alive && h.team === winningTeam && dist(h.x, h.y, unit.x, unit.y) < 1350) h.gainXp(MINION_WAVE.xp);
      }
      this.view.burst(unit.x, unit.y, TEAM_COLORS[unit.team].hex, 7, 100);
      return;
    }

    if (unit.type === 'monster') {
      const camp = unit.camp;
      const killer = source && source.type === 'hero' ? source : null;
      const winningTeam = killer ? killer.team : null;
      if (camp) {
        camp.monster = null;
        camp.respawnAt = this.time + (camp.type === 'epic' ? EPIC_DEF.respawn : 75);
      }
      if (killer) {
        const gold = camp ? (camp.type === 'epic' ? EPIC_DEF.gold : camp.type === 'buff' ? 120 : 90) : 80;
        const xp = camp ? (camp.type === 'epic' ? EPIC_DEF.xp : camp.type === 'buff' ? 120 : 90) : 80;
        killer.gainGold(gold);
        killer.gainXp(xp);
        if (camp && camp.buff === 'red') killer.addBuff({ kind: 'redBuff', until: this.time + 60, adMult: 1.2 });
        if (camp && camp.buff === 'blue') killer.addBuff({ kind: 'blueBuff', until: this.time + 60, speedMult: 1.08, manaRegenMult: 1.4 });
        if (killer.isPlayer) this.floatText(killer.x, killer.y, '+' + gold, '#ffd166', 16);
      }
      if (camp && camp.type === 'epic' && killer) {
        for (const h of this.heroes) {
          if (h.team === killer.team && h.alive) {
            h.addBuff({ kind: 'epicBuff', until: this.time + 90, adMult: 1.15, speedMult: 1.1 });
            h.gainGold(100);
          }
        }
        this.banner('暗影暴君已被击败', false);
        this.addFeed(`<span class="${killer.team === 'blue' ? 'b' : 'r'}">${killer.def.name}</span> 击败了 <span class="g">暗影暴君</span>，全队强化`);
        if (killer.isPlayer) this.sfx('victory');
      }
      this.view.burst(unit.x, unit.y, 0xffd166, 18, 200);
      this.view.ring(unit.x, unit.y, 90, 0xffd166, 0.6, 10);
      this.sfx('boom');
      return;
    }

    if (unit.type === 'tower' || unit.type === 'base') {
      const killer = source && source.type === 'hero' ? source : null;
      if (killer) {
        killer.gainGold(unit.kind === 'tower' ? STRUCTURE_STATS.tower.gold : STRUCTURE_STATS.base.gold);
        killer.gainXp(unit.kind === 'tower' ? STRUCTURE_STATS.tower.xp : STRUCTURE_STATS.base.xp);
      }
      for (const h of this.heroes) {
        if (h.team !== unit.team) h.gainGold(unit.kind === 'tower' ? 70 : 120);
      }
      const owner = unit.team;
      const label = unit.kind === 'base' ? '水晶' : (unit.role === 'inner' ? '内塔' : '外塔');
      const who = owner === 'blue' ? '我方' : '敌方';
      this.addFeed(`<span class="${owner === 'blue' ? 'b' : 'r'}">${who}${label}</span> 被摧毁`);
      this.banner(owner === 'blue' ? `${label}被摧毁` : `摧毁${who}${label}`, owner === 'blue');
      this.view.burst(unit.x, unit.y, TEAM_COLORS[owner].hex, 34, 320);
      this.view.ring(unit.x, unit.y, unit.kind === 'base' ? 260 : 160, 0xffb347, 0.9, 12);
      this.view.shake = unit.kind === 'base' ? 18 : 9;
      this.sfx('boomBig');
      if (unit.kind === 'tower' && unit.role === 'inner') {
        const base = this.baseOf(owner);
        if (base && !base.isInvulnerable()) {
          this.banner(owner === 'blue' ? '水晶护盾消失' : '敌方水晶护盾消失', owner === 'blue');
        }
      }
      if (unit.kind === 'base') {
        this.endMatch(unit.team === 'blue' ? 'lose' : 'win');
      }
      return;
    }

    if (unit.type === 'hero') {
      const killer = source && source.type === 'hero' ? source : null;
      const winnerTeam = oppositeTeam(unit.team);
      this.teamKills[winnerTeam]++;
      unit.deaths++;
      if (killer) {
        killer.kills++;
        killer.gainGold(260);
        killer.gainXp(220);
        killer.recentKills = (killer.recentKills || []).filter(t => this.time - t < 10);
        killer.recentKills.push(this.time);
        const n = killer.recentKills.length;
        const streakName = n >= 5 ? '五杀' : n === 4 ? '四杀' : n === 3 ? '三杀' : n === 2 ? '双杀' : '';
        if (streakName) this.banner(`${killer.def.name} · ${streakName}`, killer.team === 'red');
      }
      for (const h of this.heroes) {
        if (h.team === winnerTeam && h.alive) {
          h.gainXp(100);
          if (!killer) h.gainGold(100);
        }
      }
      if (!this.firstBlood) {
        this.firstBlood = true;
        this.banner('第一滴血', false);
      }
      const killerName = killer ? killer.def.name : '防御塔';
      this.addFeed(`<span class="${killer && killer.team === 'blue' ? 'b' : 'r'}">${killerName}</span> 击败 <span class="${unit.team === 'blue' ? 'b' : 'r'}">${unit.def.name}</span>`);
      if (unit.isPlayer) {
        this.toast('你被击败了 · 等待重生');
        this.view.shake = 10;
      } else if (killer && killer.isPlayer) {
        this.toast(`击败 ${unit.def.name}`);
      }
      this.view.burst(unit.x, unit.y, '#ffdfae', 26, 260);
      this.view.ring(unit.x, unit.y, 80, 0xffe9a3, 0.6, 8);
      this.sfx('death');
      const allDead = this.heroes.filter(h => h.team === unit.team).every(h => h.dead);
      if (allDead && this.time - this.lastAceAt > 8) {
        this.lastAceAt = this.time;
        const ourAce = unit.team === 'red';
        this.banner(ourAce ? '团灭敌方！' : '我方团灭', !ourAce);
        this.addFeed(ourAce ? '蓝方 <span class="g">团灭</span> 红方' : '红方 <span class="g">团灭</span> 蓝方');
      }
    }
  }

  checkEnd() { /* 由水晶死亡直接触发 */ }

  endMatch(result) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.result = result;
    this.view.setAim(null, null);
    const blue = this.heroes.filter(h => h.team === 'blue');
    const teamDamage = blue.reduce((sum, h) => sum + h.damageDealt, 0);
    const scoreOf = (h) => h.kills * 3 - h.deaths * 1.5 + h.minionKills * 0.05 + h.damageDealt / 1000 + h.level * 0.15;
    const mvp = blue.reduce((best, h) => (scoreOf(h) > scoreOf(best) ? h : best), blue[0] || this.player);
    this.stats = {
      result,
      heroName: this.player.def.name,
      heroTitle: this.player.def.title,
      duration: this.time,
      level: this.player.level,
      kills: this.player.kills,
      deaths: this.player.deaths,
      minions: this.player.minionKills,
      gold: Math.floor(this.player.totalGold),
      teamKills: this.teamKills.blue,
      enemyKills: this.teamKills.red,
      damage: Math.floor(this.player.damageDealt),
      damageShare: teamDamage > 0 ? Math.round((this.player.damageDealt / teamDamage) * 100) : 0,
      mvp: mvp === this.player
    };
    this.sfx(result === 'win' ? 'victory' : 'defeat');
    const self = this;
    this.endTimer = setTimeout(() => {
      if (App.game === self) UI.showResult(result, self.stats);
    }, 1700);
  }

  dispose() {
    if (this.endTimer) clearTimeout(this.endTimer);
    for (const u of this.units.slice()) {
      try { if (u.dispose) u.dispose(); } catch (e) { /* ignore */ }
    }
    for (const p of this.projectiles) { if (p.visual) p.visual.dispose(); }
    this.projectiles = [];
    this.telegraphs = [];
    this.units = [];
    this.heroes = [];
    this.structures = { blue: [], red: [] };
    this.view.resetBattle();
    const canvas = this.view.renderer.domElement;
    canvas.removeEventListener('mousemove', this.onMove);
    canvas.removeEventListener('mousedown', this.onDown);
    canvas.removeEventListener('touchstart', this.onTouch);
    canvas.removeEventListener('touchmove', this.onTouch);
    canvas.removeEventListener('contextmenu', this.onContext);
    canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}


'use strict';

function cssColor(c, fallback) {
  if (typeof c === 'number') return c;
  if (typeof c === 'string' && c[0] === '#') return parseInt(c.slice(1), 16);
  return fallback === undefined ? 0xffffff : fallback;
}

const VisualMats = {
  cache: {},
  mat(key, color, extra) {
    const k = key + '_' + color;
    if (!this.cache[k]) {
      this.cache[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02, ...(extra || {}) });
    }
    return this.cache[k];
  }
};

class Unit3 {
  constructor(game, o) {
    this.game = game;
    this.team = o.team;
    this.type = o.type;
    this.kind = o.kind || 'unit';
    this.x = o.x;
    this.y = o.y;
    this.radius = o.radius || 16;
    this.maxHp = o.hp || 100;
    this.hp = this.maxHp;
    this.armor = o.armor || 0;
    this.speed = o.speed || 0;
    this.attackRange = o.range || 0;
    this.range = this.attackRange;
    this.baseDamage = o.damage || 0;
    this.damage = this.baseDamage;
    this.attackInterval = o.interval || 1;
    this.attackTimer = rand(0, 0.3);
    this.dead = false;
    this.removed = false;
    this.stunUntil = 0;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.shield = 0;
    this.shieldUntil = 0;
    this.spawnGuardUntil = 0;
    this.lastCombatAt = -99;
    this.buffs = [];
    this.facing = o.team === 'blue' ? 0 : Math.PI;
    this.height = 100;
    this.visual = null;
  }

  get alive() { return !this.dead && !this.removed && this.hp > 0; }

  getArmor() { return this.armor + this.getBuffSum('armorBonus'); }

  getBuffSum(field) {
    let v = 0;
    for (const b of this.buffs) if (this.game.time < b.until) v += b[field] || 0;
    return v;
  }

  getBuffMult(field) {
    let m = 1;
    for (const b of this.buffs) if (this.game.time < b.until) m *= (b[field] || 1);
    return m;
  }

  hasBuff() {
    return this.buffs.some(b => this.game.time < b.until);
  }

  isStunned() { return this.game.time < this.stunUntil; }
  isSlowed() { return this.game.time < this.slowUntil; }

  getSpeed() {
    return this.speed * (this.isSlowed() ? this.slowFactor : 1);
  }

  applySlow(factor, duration) {
    this.slowFactor = Math.min(this.isSlowed() ? this.slowFactor : 1, factor);
    this.slowUntil = Math.max(this.slowUntil, this.game.time + duration);
  }

  applyStun(duration) {
    this.stunUntil = Math.max(this.stunUntil, this.game.time + duration);
  }

  addShield(amount, duration) {
    this.shield = Math.max(0, this.shield) + amount;
    this.shieldUntil = this.game.time + duration;
  }

  addBuff(buff) {
    this.buffs.push({ ...buff });
    this.buffs = this.buffs.filter(b => this.game.time < b.until || b.persistent);
  }

  faceToward(tx, ty) {
    const ang = Math.atan2(tx - this.x, ty - this.y);
    this.facing = ang;
    if (this.rig) this.rig.setFacing(ang);
    else if (this.visual) this.visual.rotation.y = ang;
  }

  heal(amount) {
    if (!this.alive) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const gained = this.hp - before;
    if (gained >= 12) {
      this.game.view.damageText(this.x, (this.height || 100) * 0.8, this.y, '+' + Math.round(gained), 'heal');
      if (this.rig) this.rig.flash('heal');
    }
    return gained;
  }

  takeDamage(amount, opts = {}) {
    const game = this.game;
    if (!this.alive) return 0;
    if (typeof amount !== 'number' || !isFinite(amount)) return 0;
    if (this.isInvulnerable && this.isInvulnerable()) {
      if (opts.source && opts.source.isPlayer && Math.random() < 0.15) {
        game.view.damageText(this.x, this.height || 100, this.y, '无敌', 'player');
      }
      return 0;
    }
    if (game.time < this.spawnGuardUntil) return 0;

    let dmg = amount * ((opts.source && opts.source.outgoingDamageMult) || 1) * (100 / (100 + this.getArmor()));
    if (opts.source && opts.source.def && opts.source.def.id === 'frost' && game.time < this.slowUntil) dmg *= 1.12;
    if (this.shield > 0) {
      if (this.shieldUntil > 0 && game.time > this.shieldUntil) this.shield = 0;
      else {
        const absorbed = Math.min(this.shield, dmg);
        this.shield -= absorbed;
        dmg -= absorbed;
        if (absorbed > 1) game.view.damageText(this.x, (this.height || 100) * 0.9, this.y, '-' + Math.round(absorbed), 'big');
      }
    }
    this.hp -= dmg;
    this.lastCombatAt = game.time;
    if (opts.source && opts.source.type === 'hero') opts.source.lastCombatAt = game.time;
    if (dmg > 0.5) {
      const cls = (opts.source && opts.source.isPlayer) ? 'player' : (this.type === 'hero' ? '' : '');
      game.view.damageText(this.x, (this.height || 100) * (this.type === 'hero' ? 1.05 : 0.85), this.y, String(Math.round(dmg)), cls);
      game.view.burst(this.x, this.y, '#ffd9a0', this.type === 'hero' ? 6 : 3, 120);
      if (this.rig) { this.rig.flash(); this.rig.playHit(); }
      if (this.type === 'hero' || this.type === 'tower' || this.type === 'base') game.sfx('hit');
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(opts.source);
    }
    return dmg;
  }

  die(source) {
    if (this.dead) return;
    this.dead = true;
    this.game.onUnitDeath(this, source);
  }

  stepToward(tx, ty, dt) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return false;
    const sp = this.getSpeed();
    this.faceToward(tx, ty);
    this.game.moveEntity(this, (dx / d) * sp * dt, (dy / d) * sp * dt);
    return true;
  }

  updateCommon(dt) {
    if (this.shieldUntil > 0 && this.game.time > this.shieldUntil) this.shield = 0;
    this.buffs = this.buffs.filter(b => b.persistent || this.game.time < b.until);
  }

  disposeVisual() {
    if (this.visual && this.visual.parent) this.visual.parent.remove(this.visual);
    this.visual = null;
  }
}

/* ================= 英雄 ================= */
class Hero3D extends Unit3 {
  constructor(game, def, team, isPlayer, lane, spawn) {
    super(game, {
      team, type: 'hero', kind: 'hero',
      x: spawn.x, y: spawn.y, radius: 24,
      hp: def.hp, speed: def.speed, range: def.range, damage: def.ad, interval: def.atkInterval
    });
    this.def = def;
    this.isPlayer = isPlayer;
    this.isAI = !isPlayer;
    this.lane = lane;
    this.level = 1;
    this.xp = 0;
    this.gold = 140;
    this.totalGold = 140;
    this.mana = def.mana;
    this.maxMana = def.mana;
    this.bonusAD = 0;
    this.bonusArmor = 0;
    this.extraHp = 0;
    this.skillPowerMult = 1;
    this.shopCounts = { blade: 0, armor: 0, arcane: 0 };
    this.skillCd = [0, 0, 0];
    this.moveTarget = null;
    this.attackTarget = null;
    this.deathTimer = 0;
    this.kills = 0;
    this.deaths = 0;
    this.minionKills = 0;
    this.damageDealt = 0;
    this.displayName = def.name + (isPlayer ? '（你）' : '');
    this.spawn = { x: spawn.x, y: spawn.y };
    this.outgoingDamageMult = 1;
    this.hpMult = 1;
    this.aiThinkMult = 1;
    this.aiSkillMult = 1;
    this.aiAimJitter = 45;
    this.recentKills = [];
    this.stormHits = 0;

    this.recalcStats();
    this.hp = this.maxHp;
    this.mana = this.maxMana;

    this.rig = new ModelRig(def, team, isPlayer);
    this.visual = this.rig.root;
    this.height = MODEL_TARGET_HEIGHT;
    game.view.scene.add(this.visual);
    this.rig.setPosition(this.x, this.y);
    this.rig.setFacing(this.facing);
    this.bar = game.view.addUnitBar(this, {
      width: isPlayer ? 116 : 96, height: 8, y: MODEL_TARGET_HEIGHT + 62,
      ally: team === game.playerTeam, player: isPlayer
    });
    game.view.addNameplate(this);

    this.aiTimer = rand(0.3, 0.8);
    this.aiSkillTimer = rand(0.5, 1.1);
    this.aiState = 'lane';
    this.wp = 1;
    this.jungleGoal = null;
    this.jungleTimer = 0;
  }

  recalcStats() {
    const d = this.def;
    const oldMax = this.maxHp;
    this.maxHp = (d.hp + d.hpGrow * (this.level - 1) + this.extraHp) * this.hpMult;
    this.maxMana = d.mana + d.manaGrow * (this.level - 1);
    if (oldMax) {
      const keep = this.hp / oldMax;
      if (this.hp > 0) this.hp = Math.min(this.maxHp, this.maxHp * keep);
    }
  }

  getAD() {
    return (this.def.ad + this.def.adGrow * (this.level - 1) + this.bonusAD) * this.getBuffMult('adMult');
  }

  getArmor() {
    let a = this.def.armor + this.def.armorGrow * (this.level - 1) + this.bonusArmor + this.getBuffSum('armorBonus');
    if (this.def.id === 'ryan' && this.hp / this.maxHp < 0.4) a += 20;
    return a;
  }

  getSpeed() {
    let s = super.getSpeed() * this.getBuffMult('speedMult');
    if (this.def.id === 'yeren' && this.game.time - this.lastCombatAt > 4) s *= 1.15;
    return s;
  }

  getAtkInterval() {
    let v = this.def.atkInterval / this.getBuffMult('atkSpeedMult');
    if (this.def.id === 'hill') v *= 0.92;
    return Math.max(0.3, v);
  }

  get manaRegen() {
    const base = 6 + this.maxMana * 0.012;
    return (this.def.id === 'vera' ? base * 1.5 : base) * this.getBuffMult('manaRegenMult');
  }

  skillDamage(base, ratio) {
    return (base + ratio * this.getAD()) * this.skillPowerMult;
  }

  gainXp(amount) {
    if (this.level >= MAX_LEVEL) return;
    this.xp += amount;
    while (this.level < MAX_LEVEL && this.xp >= XP_TABLE[this.level]) {
      this.xp -= XP_TABLE[this.level];
      this.level += 1;
      const oldMax = this.maxHp;
      this.recalcStats();
      this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - oldMax) + this.maxHp * 0.1);
      this.mana = Math.min(this.maxMana, this.mana + this.maxMana * 0.18);
      this.game.view.ring(this.x, this.y, 80, 0xffd166, 0.6, 10);
      this.game.view.burst(this.x, this.y, '#ffd166', 16, 220);
      if (this.isPlayer) { this.game.sfx('levelup'); this.game.floatText(this.x, this.y, '升级！', '#ffd166', 20); }
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
  }

  gainGold(amount) {
    this.gold += amount;
    this.totalGold += amount;
  }

  update(dt) {
    const g = this.game;
    for (let i = 0; i < 3; i++) if (this.skillCd[i] > 0) this.skillCd[i] = Math.max(0, this.skillCd[i] - dt);
    this.updateCommon(dt);

    if (this.dead) {
      this.deathTimer -= dt;
      this.rig.update(dt, false, false, false);
      if (this.deathTimer <= 0) this.respawn();
      return;
    }

    let regen = 0;
    if (this.def.id === 'panshi') regen += this.maxHp * 0.005;
    if (this.def.id === 'lucy') regen += this.maxHp * 0.004;
    if (regen) this.hp = Math.min(this.maxHp, this.hp + regen * dt);
    const base = g.baseOf(this.team);
    if (base && !base.dead && dist(this.x, this.y, base.x, base.y) < MAP3.fountainRadius) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.06 * dt);
      this.mana = Math.min(this.maxMana, this.mana + this.maxMana * 0.09 * dt);
    }
    this.gainGold(2.6 * dt);
    this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * dt);

    this.rig.setPosition(this.x, this.y);
    const stunned = this.isStunned();
    if (stunned) {
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      this.rig.setLocomotion(false, this.getSpeed());
      this.rig.update(dt, true, this.shield > 0, this.hasBuff());
      return;
    }

    if (this.attackTarget && !this.attackTarget.alive) this.attackTarget = null;

    const joy = this.isPlayer ? g.joystick : null;
    const joyMag = joy ? Math.hypot(joy.x, joy.y) : 0;
    let moving = false;
    if (joyMag > 0.06) {
      this.moveTarget = null;
      this.faceToward(this.x + joy.x, this.y + joy.y);
      const sp = this.getSpeed() * Math.min(1, joyMag);
      g.moveEntity(this, joy.x * sp * dt, joy.y * sp * dt);
      moving = true;
    } else if (this.attackTarget) {
      const d = dist(this.x, this.y, this.attackTarget.x, this.attackTarget.y) - this.attackTarget.radius;
      this.faceToward(this.attackTarget.x, this.attackTarget.y);
      if (d > this.attackRange) moving = this.stepToward(this.attackTarget.x, this.attackTarget.y, dt);
    } else if (this.moveTarget) {
      const d = dist(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
      if (d < 14) this.moveTarget = null;
      else moving = this.stepToward(this.moveTarget.x, this.moveTarget.y, dt);
    }

    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      let target = null;
      if (this.attackTarget && this.inAttackRange(this.attackTarget) && !(this.attackTarget.isInvulnerable && this.attackTarget.isInvulnerable())) {
        target = this.attackTarget;
      }
      if (!target) {
        const autoAttack = !this.isPlayer || (typeof Settings === 'undefined') || Settings.data.autoAttack;
        if (autoAttack) target = this.acquireAutoTarget();
      }
      if (target) this.performAttack(target);
    }

    this.rig.setLocomotion(moving, this.getSpeed());
    this.rig.update(dt, false, this.shield > 0, this.hasBuff());
    this.rig.setPosition(this.x, this.y);
  }

  inAttackRange(target) {
    return dist(this.x, this.y, target.x, target.y) - target.radius <= this.attackRange + 10;
  }

  acquireAutoTarget() {
    let best = null, bd = Infinity;
    for (const u of this.game.units) {
      if (!u.alive || u.team === this.team) continue;
      if (u.team === 'neutral') continue;
      if (u.isInvulnerable && u.isInvulnerable()) continue;
      if (u.type !== 'hero' && u.type !== 'minion' && u.type !== 'tower' && u.type !== 'base') continue;
      const d = dist(this.x, this.y, u.x, u.y) - u.radius;
      if (d <= this.attackRange && d < bd) { bd = d; best = u; }
    }
    return best;
  }

  performAttack(target) {
    this.attackTimer = this.getAtkInterval();
    this.faceToward(target.x, target.y);
    this.lastCombatAt = this.game.time;
    this.rig.playAttack();

    let dmg = this.getAD();
    const nextHit = this.buffs.find(b => b.kind === 'nextHit' && this.game.time < b.until);
    if (nextHit) {
      dmg += nextHit.nextHitFlat || 0;
      this.buffs = this.buffs.filter(b => b !== nextHit);
      this.game.view.burst(target.x, target.y, '#ff6b90', 12, 240);
    }

    if (this.def.range > 150) {
      this.game.spawnHoming({
        x: this.x, y: this.y, height: 78, target, speed: 1100,
        damage: dmg, source: this, color: cssColor(this.def.color), heroShot: true
      });
      this.game.sfx('attack');
    } else {
      target.takeDamage(dmg, { source: this, game: this.game });
      this.game.view.slash(target.x, target.y, Math.atan2(target.y - this.y, target.x - this.x), 0xffe6c2);
      this.game.view.burst(target.x, target.y, '#ffe6c2', 5, 130);
      this.game.sfx('attack');
    }
    if (this.def.id === 'storm') this.stormStrike(target);
  }

  stormStrike(target) {
    this.stormHits = (this.stormHits || 0) + 1;
    if (this.stormHits % 3 !== 0 || !target || !target.alive) return;
    const g = this.game;
    const extra = 30 + this.getAD() * 0.25;
    target.takeDamage(extra, { source: this, game: g });
    if (g.view.lightningBolt) g.view.lightningBolt(this.x, this.y, target.x, target.y, 0xc9a6ff, { height: 58, width: 2.2, life: 0.22 });
    g.view.burst(target.x, target.y, '#c9a6ff', 8, 170);
    g.sfx('thunder');
  }

  tryCast(index, aimX, aimY) {
    const g = this.game;
    const s = this.def.skills[index];
    if (!s) return false;
    if (this.dead || this.isStunned()) return false;
    if (this.skillCd[index] > 0) return false;
    if (this.mana < s.mana) {
      if (this.isPlayer) { g.toast('法力不足'); g.sfx('deny'); }
      return false;
    }
    let ax = aimX === undefined ? g.aimX : aimX;
    let ay = aimY === undefined ? g.aimY : aimY;
    if (s.range > 0) {
      const dx = ax - this.x, dy = ay - this.y;
      const d = Math.hypot(dx, dy);
      if (d > s.range) { ax = this.x + (dx / d) * s.range; ay = this.y + (dy / d) * s.range; }
      if (d > 4) this.faceToward(ax, ay);
    } else {
      ax = this.x + Math.sin(this.facing) * 100;
      ay = this.y + Math.cos(this.facing) * 100;
    }
    const result = s.exec(this, g, ax, ay);
    if (result === false) {
      if (this.isPlayer) { g.toast('没有可施放的目标'); g.sfx('deny'); }
      return false;
    }
    this.mana -= s.mana;
    this.skillCd[index] = s.cd;
    this.attackTimer = Math.max(this.attackTimer, 0.15);
    this.lastCombatAt = g.time;
    this.rig.playCast();
    g.view.ring(this.x, this.y, s.range || 120, cssColor(this.def.color), 0.5, 6);
    g.sfx('skill');
    return true;
  }

  die(source) {
    if (this.dead) return;
    this.dead = true;
    this.deathTimer = 6.5 + this.level * 1.05;
    this.attackTarget = null;
    this.moveTarget = null;
    this.buffs = [];
    this.shield = 0;
    this.rig.playDeath();
    this.game.onUnitDeath(this, source);
  }

  respawn() {
    const g = this.game;
    const base = g.baseOf(this.team);
    this.dead = false;
    this.hp = this.maxHp;
    this.mana = this.maxMana;
    const a = rand(0, TAU);
    this.x = base.x + Math.cos(a) * 120;
    this.y = base.y + Math.sin(a) * 120;
    this.spawnGuardUntil = g.time + 3;
    this.attackTarget = null;
    this.moveTarget = null;
    this.aiState = 'lane';
    this.wp = g.spawnWaypointFor(this);
    this.jungleGoal = null;
    this.rig.reviveAt(this.x, this.y);
    if (this.bar) this.bar.group.visible = true;
    if (g.view.spawnPillar) g.view.spawnPillar(this.x, this.y, cssColor(this.def.color));
    g.view.ring(this.x, this.y, 100, 0xffe9a3, 0.6, 10);
    g.view.burst(this.x, this.y, '#ffe9a3', 20, 180);
    if (this.isPlayer) { g.toast('已重生'); g.sfx('buff'); }
  }

  dispose() {
    this.game.view.removeBar(this);
    this.game.view.removeNameplate(this);
    if (this.rig) this.rig.dispose();
    this.removed = true;
  }
}

/* ================= 小兵 ================= */
const MinionGeo = {
  torso: null, head: null, shield: null, sword: null, robe: null, staff: null,
  init() {
    if (this.torso) return;
    this.torso = new THREE.BoxGeometry(28, 34, 20);
    this.head = new THREE.SphereGeometry(11, 10, 8);
    this.shield = new THREE.BoxGeometry(6, 26, 24);
    this.sword = new THREE.BoxGeometry(4, 26, 4);
    this.robe = new THREE.ConeGeometry(18, 40, 7);
    this.staff = new THREE.CylinderGeometry(2.5, 2.5, 46, 5);
    this.orb = new THREE.SphereGeometry(6, 8, 6);
    this.leg = new THREE.BoxGeometry(7, 16, 8);
  }
};

function createMinionVisual(kind, team) {
  MinionGeo.init();
  const g = new THREE.Group();
  const teamHex = TEAM_COLORS[team].hex;
  const clothColor = new THREE.Color(teamHex).multiplyScalar(0.72).getHex();
  const cloth = VisualMats.mat('cloth', clothColor, { roughness: 1 });
  const dark = VisualMats.mat('dark', 0x2a2620);
  const skin = VisualMats.mat('skin', 0xd9b48b);
  const parts = {};
  if (kind === 'melee') {
    const torso = new THREE.Mesh(MinionGeo.torso, VisualMats.mat('minionMelee', teamHex));
    torso.position.y = 38; torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(MinionGeo.head, skin);
    head.position.y = 64; head.castShadow = true;
    g.add(head);
    const helmet = new THREE.Mesh(new THREE.ConeGeometry(13, 12, 6), VisualMats.mat('helmet', TEAM_COLORS[team].darkHex));
    helmet.position.y = 74;
    g.add(helmet);
    const shield = new THREE.Mesh(MinionGeo.shield, VisualMats.mat('shield', 0x8a7d62));
    shield.position.set(-13, 38, 12); shield.rotation.y = 0.15; shield.castShadow = true;
    g.add(shield);
    const sword = new THREE.Mesh(MinionGeo.sword, VisualMats.mat('steel', 0xb9c2c8, { metalness: 0.5, roughness: 0.4 }));
    sword.position.set(14, 40, 8); sword.rotation.z = -0.28; sword.castShadow = true;
    g.add(sword);
    parts.sword = sword;
    const legL = new THREE.Mesh(MinionGeo.leg, dark); legL.position.set(-7, 14, 0); g.add(legL);
    const legR = new THREE.Mesh(MinionGeo.leg, dark); legR.position.set(7, 14, 0); g.add(legR);
    parts.legL = legL; parts.legR = legR;
    parts.body = torso;
  } else {
    const robe = new THREE.Mesh(MinionGeo.robe, cloth);
    robe.position.y = 26; robe.castShadow = true;
    g.add(robe);
    const head = new THREE.Mesh(MinionGeo.head, skin);
    head.position.y = 54; head.castShadow = true;
    g.add(head);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(14, 20, 7), VisualMats.mat('hood', TEAM_COLORS[team].darkHex));
    hood.position.y = 60;
    g.add(hood);
    const staff = new THREE.Mesh(MinionGeo.staff, VisualMats.mat('wood', 0x5b4630));
    staff.position.set(14, 34, 6); staff.rotation.z = -0.12;
    g.add(staff);
    const orb = new THREE.Mesh(MinionGeo.orb, new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team].hex }));
    orb.position.set(15, 60, 6);
    g.add(orb);
    parts.orb = orb;
    parts.body = robe;
  }
  g.userData.parts = parts;
  g.traverse(o => {
    if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; }
  });
  g.scale.setScalar(1.15);
  return g;
}

class Minion3D extends Unit3 {
  constructor(game, team, lane, kind, offset) {
    const path = game.laneWaypoints(lane, team);
    const p0 = path[0];
    const melee = kind === 'melee';
    const scale = 1 + Math.floor(game.time / 60) * 0.025;
    super(game, {
      team, type: 'minion', kind,
      x: p0[0] + rand(-40, 40), y: p0[1] + rand(-40, 40),
      radius: melee ? 16 : 14,
      hp: Math.round((melee ? MINION_WAVE.meleeHp : MINION_WAVE.rangedHp) * scale),
      speed: MINION_WAVE.speed + rand(-5, 5),
      range: melee ? MINION_WAVE.meleeRange : MINION_WAVE.rangedRange,
      damage: (melee ? MINION_WAVE.meleeDmg : MINION_WAVE.rangedDmg) * scale,
      interval: melee ? MINION_WAVE.meleeInterval : MINION_WAVE.rangedInterval
    });
    this.lane = lane;
    this.path = path;
    this.wp = 1;
    this.laneOffset = offset;
    this.hitTarget = null;
    this.think = rand(0, 0.25);
    this.height = melee ? 96 : 87;
    this.visual = createMinionVisual(kind, team);
    this.visual.position.set(this.x, 0, this.y);
    game.view.scene.add(this.visual);
    this.bar = game.view.addUnitBar(this, {
      width: 40, height: 4.5, y: this.height + 18,
      ally: team === game.playerTeam
    });
    this.bobPhase = rand(0, TAU);
  }

  update(dt) {
    if (!this.alive) {
      this.fade = (this.fade === undefined ? 1 : this.fade) - dt * 1.8;
      if (this.visual) {
        this.visual.position.y -= dt * 40;
        this.visual.scale.setScalar(Math.max(0.01, this.fade));
      }
      if (this.fade <= 0) this.removed = true;
      return;
    }
    this.updateCommon(dt);
    this.attackTimer -= dt;
    if (this.attackTimer < -3) this.attackTimer = 0;
    if (this.isStunned()) { this.updateVisual(dt, 0); return; }

    this.think -= dt;
    if (this.think <= 0) { this.think = rand(0.22, 0.35); this.acquire(); }
    if (this.hitTarget && !this.hitTarget.alive) this.hitTarget = null;

    let moving = false;
    if (this.hitTarget) {
      const reach = dist(this.x, this.y, this.hitTarget.x, this.hitTarget.y) - this.hitTarget.radius;
      if (reach <= this.attackRange) {
        this.faceToward(this.hitTarget.x, this.hitTarget.y);
        if (this.attackTimer <= 0) {
          this.attackTimer = this.attackInterval;
          this.lastCombatAt = this.game.time;
          if (this.kind === 'ranged') {
            this.game.spawnHoming({
              x: this.x, y: this.y, height: 55, target: this.hitTarget, speed: 760,
              damage: this.baseDamage, source: this, color: TEAM_COLORS[this.team].hex, small: true
            });
          } else {
            this.hitTarget.takeDamage(this.baseDamage, { source: this, game: this.game });
            this.game.view.slash(this.hitTarget.x, this.hitTarget.y, Math.atan2(this.hitTarget.y - this.y, this.hitTarget.x - this.x), TEAM_COLORS[this.team].hex);
          }
          this.attackAnim = 0.2;
        }
      } else {
        moving = this.stepToward(this.hitTarget.x, this.hitTarget.y, dt);
      }
    } else {
      const wp = this.path[Math.min(this.wp, this.path.length - 1)];
      const tx = wp[0] + Math.sin(this.wp * 1.7) * 0;
      const ty = wp[1];
      if (dist(this.x, this.y, tx, ty) < 70 && this.wp < this.path.length - 1) this.wp++;
      moving = this.stepToward(tx, ty, dt);
    }
    this.updateVisual(dt, moving ? 1 : 0);
  }

  acquire() {
    const g = this.game;
    const enemyTeam = this.team === 'blue' ? 'red' : 'blue';
    let best = null, bd = Infinity;
    for (const u of g.units) {
      if (!u.alive || u.team !== enemyTeam) continue;
      if (u.type !== 'hero' && u.type !== 'minion') continue;
      const d = dist(this.x, this.y, u.x, u.y);
      if (d <= 330 + u.radius && d < bd) { bd = d; best = u; }
    }
    if (!best) {
      for (const s of g.structuresOf(enemyTeam)) {
        if (!s.alive || s.isInvulnerable()) continue;
        const reach = dist(this.x, this.y, s.x, s.y) - s.radius;
        if (reach <= this.attackRange + 80 && reach < bd) { bd = reach; best = s; }
      }
    }
    this.hitTarget = best;
  }

  updateVisual(dt, moving) {
    this.rig = null;
    if (!this.visual) return;
    this.visual.position.x = this.x;
    this.visual.position.z = this.y;
    this.visual.rotation.y = this.facing;
    this.bobPhase += dt * (moving ? 9 : 2);
    const parts = this.visual.userData.parts;
    if (parts) {
      const bob = Math.sin(this.bobPhase) * (moving ? 3 : 1);
      if (parts.body) parts.body.position.y = (this.kind === 'melee' ? 38 : 26) + bob;
      if (parts.legL) {
        parts.legL.position.z = Math.sin(this.bobPhase) * 6;
        parts.legR.position.z = -Math.sin(this.bobPhase) * 6;
      }
      if (this.attackAnim > 0) {
        this.attackAnim -= dt;
        if (parts.sword) parts.sword.rotation.x = -Math.sin((1 - this.attackAnim / 0.2) * Math.PI) * 1.2;
      } else if (parts.sword) {
        parts.sword.rotation.x = 0;
      }
      if (parts.orb) parts.orb.position.y = 60 + Math.sin(this.bobPhase * 0.7) * 3;
    }
  }

  dispose() {
    this.game.view.removeBar(this);
    this.disposeVisual();
    this.removed = true;
  }
}

/* ================= 防御塔 / 水晶 ================= */
function createTowerVisual(team, role) {
  const g = new THREE.Group();
  const hex = TEAM_COLORS[team].hex;
  const stone = VisualMats.mat('towerStone', 0x5b5344, { roughness: 0.95 });
  const dark = VisualMats.mat('towerDark', 0x322d26);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(78, 92, 44, 8), dark);
  base.position.y = 22; base.castShadow = true; base.receiveShadow = true;
  g.add(base);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(42, 54, 250, 8), stone);
  column.position.y = 165; column.castShadow = true; column.receiveShadow = true;
  g.add(column);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(60, 48, 36, 8), stone);
  crown.position.y = 300; crown.castShadow = true;
  g.add(crown);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(45, 46, 14, 8),
    new THREE.MeshBasicMaterial({ color: hex, toneMapped: false })
  );
  band.position.y = 238;
  g.add(band);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const spike = new THREE.Mesh(new THREE.BoxGeometry(12, 40, 12), dark);
    spike.position.set(Math.cos(a) * 46, 335, Math.sin(a) * 46);
    g.add(spike);
  }
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(34, 0),
    new THREE.MeshBasicMaterial({ color: hex, toneMapped: false })
  );
  crystal.position.y = 368;
  g.add(crystal);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(58, 12, 10),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  glow.position.y = 368;
  g.add(glow);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(90, 100, 40),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 3;
  g.add(ring);
  g.userData = { crystal, glow, column, crown, base, ring };
  return g;
}

function createBaseVisual(team) {
  const g = new THREE.Group();
  const hex = TEAM_COLORS[team].hex;
  const stone = VisualMats.mat('baseStone', 0x4d473c, { roughness: 0.95 });
  const steps = new THREE.Mesh(new THREE.CylinderGeometry(190, 220, 30, 8), stone);
  steps.position.y = 15; steps.castShadow = true; steps.receiveShadow = true;
  g.add(steps);
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(80, 0),
    new THREE.MeshStandardMaterial({ color: 0x101822, emissive: hex, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.2, toneMapped: false })
  );
  core.position.y = 190;
  core.scale.set(1, 1.35, 1);
  core.castShadow = true;
  g.add(core);
  const shards = new THREE.Group();
  const shardMat = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
  for (let i = 0; i < 4; i++) {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(20, 0), shardMat);
    const a = i * Math.PI / 2;
    shard.position.set(Math.cos(a) * 150, 120 + (i % 2) * 50, Math.sin(a) * 150);
    shards.add(shard);
  }
  g.add(shards);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(170, 16, 12),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  glow.position.y = 170;
  g.add(glow);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(210, 226, 48),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 34;
  g.add(ring);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(260, 24, 14, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  dome.position.y = 20;
  g.add(dome);
  g.userData = { core, shards, glow, ring, dome, steps };
  return g;
}

class Structure3D extends Unit3 {
  constructor(game, team, cfg) {
    const stats = STRUCTURE_STATS[cfg.kind];
    super(game, {
      team, type: cfg.kind, kind: cfg.kind,
      x: cfg.x, y: cfg.y,
      radius: stats.radius,
      hp: stats.hp, armor: stats.armor,
      range: stats.range, damage: stats.damage, interval: stats.interval
    });
    this.lane = cfg.lane || null;
    this.role = cfg.role;
    this.requires = cfg.requires || null;
    this.target = null;
    this.think = 0;
    this.cannonFlash = 0;
    this.height = cfg.kind === 'base' ? 420 : 420;
    this.visual = cfg.kind === 'base' ? createBaseVisual(team) : createTowerVisual(team, cfg.role);
    this.visual.position.set(this.x, 0, this.y);
    game.view.scene.add(this.visual);
    this.bar = game.view.addUnitBar(this, {
      width: cfg.kind === 'base' ? 240 : 170,
      height: 10,
      y: cfg.kind === 'base' ? 520 : 455,
      ally: team === game.playerTeam
    });
    if (this.attackRange > 0) {
      const rmat = new THREE.MeshBasicMaterial({
        color: TEAM_COLORS[team].hex, transparent: true, opacity: 0.08,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
      });
      const rmesh = new THREE.Mesh(new THREE.RingGeometry(this.attackRange - 6, this.attackRange, 80), rmat);
      rmesh.rotation.x = -Math.PI / 2;
      rmesh.position.set(this.x, 3.8, this.y);
      rmesh.visible = false;
      game.view.scene.add(rmesh);
      this.rangeRing = rmesh;
    }
  }

  isInvulnerable() {
    if (this.kind === 'tower') return !!(this.requires && this.requires.alive);
    if (this.kind === 'base') {
      const inners = this.game.structuresOf(this.team).filter(s => s.kind === 'tower' && s.role === 'inner');
      return inners.length > 0 && inners.every(s => s.alive);
    }
    return false;
  }

  update(dt) {
    if (!this.alive) return;
    this.updateCommon(dt);
    this.cannonFlash = Math.max(0, this.cannonFlash - dt);
    if (this.visual) {
      const ud = this.visual.userData;
      if (ud.crystal) ud.crystal.rotation.y += dt * 0.6;
      if (ud.glow) ud.glow.material.opacity = 0.11 + Math.sin(this.game.time * 2 + this.x) * 0.04;
      if (ud.shards) ud.shards.rotation.y += dt * 0.25;
      if (ud.dome) ud.dome.visible = this.isInvulnerable();
      if (ud.ring) ud.ring.rotation.z += dt * 0.1;
      if (ud.core) {
        ud.core.rotation.y += dt * 0.2;
        ud.core.position.y = 190 + Math.sin(this.game.time * 1.5) * 6;
      }
    }
    this.think -= dt;
    this.attackTimer -= dt;
    if (this.rangeRing) {
      const p = this.game.player;
      const show = !!p && !p.dead && p.team !== this.team && dist(p.x, p.y, this.x, this.y) < this.attackRange + 380;
      this.rangeRing.visible = show;
      if (show) this.rangeRing.material.opacity = 0.06 + Math.sin(this.game.time * 2.5) * 0.025;
    }
    if (this.think <= 0) {
      this.think = 0.18;
      this.target = this.pickTarget();
    }
    if (this.target && !this.target.alive) this.target = this.pickTarget();
    if (this.target && this.attackTimer <= 0) {
      if (dist(this.x, this.y, this.target.x, this.target.y) <= this.range + this.target.radius) {
        this.attackTimer = this.interval;
        this.cannonFlash = 0.18;
        this.game.spawnHoming({
          x: this.x, y: this.y, height: this.kind === 'base' ? 260 : 360, target: this.target, speed: 900,
          damage: this.damage, source: this, color: TEAM_COLORS[this.team].hex, big: true
        });
        this.game.sfx('tower');
      } else {
        this.target = null;
      }
    }
  }

  pickTarget() {
    const enemyTeam = this.team === 'blue' ? 'red' : 'blue';
    let bestMinion = null, bdM = Infinity;
    let bestHero = null, bdH = Infinity;
    for (const u of this.game.units) {
      if (!u.alive || u.team !== enemyTeam) continue;
      if (u.type !== 'hero' && u.type !== 'minion') continue;
      if (this.game.time < u.spawnGuardUntil) continue;
      const d = dist(this.x, this.y, u.x, u.y);
      if (d > this.range + u.radius) continue;
      if (u.type === 'minion' && d < bdM) { bdM = d; bestMinion = u; }
      if (u.type === 'hero' && d < bdH) { bdH = d; bestHero = u; }
    }
    return bestMinion || bestHero;
  }

  die(source) {
    if (this.dead) return;
    this.dead = true;
    if (this.rangeRing) this.rangeRing.visible = false;
    const ud = this.visual.userData;
    if (this.kind === 'base') {
      if (ud.core) { ud.core.visible = false; }
      if (ud.shards) ud.shards.visible = false;
      if (ud.glow) ud.glow.visible = false;
      if (ud.ring) ud.ring.visible = false;
      if (ud.dome) ud.dome.visible = false;
    } else {
      if (ud.crystal) ud.crystal.visible = false;
      if (ud.glow) ud.glow.visible = false;
      if (ud.ring) ud.ring.material.opacity = 0.05;
      if (ud.crown) ud.crown.rotation.z = 0.25;
    }
    this.game.onUnitDeath(this, source);
  }

  dispose() {
    this.game.view.removeBar(this);
    this.disposeVisual();
    if (this.rangeRing) {
      this.rangeRing.parent && this.rangeRing.parent.remove(this.rangeRing);
      this.rangeRing.geometry.dispose();
      this.rangeRing.material.dispose();
      this.rangeRing = null;
    }
  }
}

/* ================= 野怪 ================= */
function createMonsterVisual(camp) {
  const g = new THREE.Group();
  if (camp.type === 'epic') {
    const stone = VisualMats.mat('epicStone', 0x3e4a4a, { roughness: 0.9, flatShading: true });
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(95, 0), stone);
    body.position.y = 140; body.scale.set(1.3, 1.1, 1.1); body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(58, 0), stone);
    head.position.set(0, 250, 42); head.castShadow = true;
    g.add(head);
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(16, 90, 5), VisualMats.mat('horn', 0xcdbfa0));
      horn.position.set(s * 42, 300, 46); horn.rotation.z = s * -0.4;
      g.add(horn);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(34, 120, 40), stone);
      arm.position.set(s * 116, 120, 10); arm.rotation.z = s * 0.15;
      arm.castShadow = true;
      g.add(arm);
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(26, 0), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    core.position.set(0, 170, 96);
    g.add(core);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(60, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 170, 96);
    g.add(glow);
    g.userData = { core };
    return g;
  }
  const buff = camp.type === 'buff';
  const bodyColor = buff ? (camp.buff === 'red' ? 0x7b3a2c : 0x2c527b) : 0x5a4a32;
  const body = new THREE.Mesh(
    new THREE.DodecahedronGeometry(buff ? 52 : 38, 0),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.9, flatShading: true })
  );
  body.position.y = buff ? 56 : 42; body.scale.set(1.25, 1, 1.15); body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(buff ? 28 : 20, 8, 6), VisualMats.mat('monsterHead', 0x8a7a60));
  head.position.set(0, buff ? 100 : 78, buff ? 36 : 26);
  head.castShadow = true;
  g.add(head);
  if (buff) {
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(20, 0),
      new THREE.MeshBasicMaterial({ color: camp.buff === 'red' ? 0xff5c5c : 0x4aa8ff })
    );
    crystal.position.set(0, 132, 0);
    g.add(crystal);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(34, 10, 8), new THREE.MeshBasicMaterial({ color: camp.buff === 'red' ? 0xff5c5c : 0x4aa8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 132, 0);
    g.add(glow);
    g.userData = { crystal };
  }
  return g;
}

class Monster3D extends Unit3 {
  constructor(game, camp) {
    const epic = camp.type === 'epic';
    const buff = camp.type === 'buff';
    super(game, {
      team: 'neutral', type: 'monster', kind: camp.type,
      x: camp.x, y: camp.y,
      radius: epic ? 110 : buff ? 55 : 45,
      hp: epic ? EPIC_DEF.hp : buff ? 1400 : 900,
      armor: epic ? EPIC_DEF.armor : 18,
      speed: epic ? 110 : 150,
      range: epic ? EPIC_DEF.range : 95,
      damage: epic ? EPIC_DEF.damage : buff ? 70 : 50,
      interval: epic ? EPIC_DEF.interval : 1.25
    });
    this.camp = camp;
    this.height = epic ? 340 : buff ? 170 : 130;
    this.visual = createMonsterVisual(camp);
    this.visual.position.set(this.x, 0, this.y);
    this.visual.rotation.y = rand(0, TAU);
    game.view.scene.add(this.visual);
    this.bar = game.view.addUnitBar(this, {
      width: epic ? 260 : 100, height: 8, y: this.height + 30,
      ally: false, color: epic ? 0xffb347 : 0xbfa76a
    });
    this.think = 0;
    this.target = null;
    this.bob = rand(0, TAU);
    this.home = { x: camp.x, y: camp.y };
  }

  update(dt) {
    if (!this.alive) {
      this.fade = (this.fade === undefined ? 1 : this.fade) - dt * 1.4;
      if (this.visual) this.visual.scale.setScalar(Math.max(0.01, this.fade));
      if (this.fade <= 0) this.removed = true;
      return;
    }
    this.updateCommon(dt);
    this.attackTimer -= dt;
    const ud = this.visual && this.visual.userData;
    if (ud && ud.crystal) ud.crystal.rotation.y += dt;
    if (ud && ud.core) ud.core.rotation.y += dt * 0.8;
    this.bob += dt;
    if (this.visual) this.visual.position.y = Math.sin(this.bob * 1.6) * 3;

    if (this.isStunned()) return;
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.25;
      this.target = this.pickTarget();
    }
    if (this.target && !this.target.alive) this.target = null;
    if (this.target) {
      const d = dist(this.x, this.y, this.target.x, this.target.y);
      if (d > this.attackRange) {
        this.faceToward(this.target.x, this.target.y);
        this.stepToward(this.target.x, this.target.y, dt);
      } else if (this.attackTimer <= 0) {
        this.attackTimer = this.attackInterval;
        this.faceToward(this.target.x, this.target.y);
        this.target.takeDamage(this.baseDamage, { source: this, game: this.game });
        this.game.view.slash(this.target.x, this.target.y, Math.atan2(this.target.y - this.y, this.target.x - this.x), 0xffd166);
        this.game.sfx('hit');
      }
      if (dist(this.x, this.y, this.home.x, this.home.y) > 560) {
        this.game.resetCampMonster(this);
        return;
      }
    } else if (dist(this.x, this.y, this.home.x, this.home.y) > 30) {
      this.stepToward(this.home.x, this.home.y, dt);
    }
    if (this.visual) {
      this.visual.position.x = this.x;
      this.visual.position.z = this.y;
      this.visual.rotation.y = this.facing;
    }
    if (this.target && dist(this.x, this.y, this.home.x, this.home.y) < 330) {
      this.lastCombatAt = this.game.time;
    }
  }

  pickTarget() {
    let best = null, bd = Infinity;
    for (const u of this.game.units) {
      if (!u.alive || u.type !== 'hero') continue;
      if (u.team !== 'blue' && u.team !== 'red') continue;
      if (this.game.time < u.spawnGuardUntil) continue;
      const d = dist(this.x, this.y, u.x, u.y);
      if (d < 300 + u.radius && d < bd) { bd = d; best = u; }
    }
    return best;
  }

  die(source) {
    if (this.dead) return;
    this.dead = true;
    this.game.onUnitDeath(this, source);
  }

  dispose() {
    this.game.view.removeBar(this);
    this.disposeVisual();
    this.removed = true;
  }
}

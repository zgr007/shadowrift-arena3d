/* 孤影峡谷 3D - 数据定义（全部原创玩法，美术 CC0） */
'use strict';

const MAP3 = {
  size: 3600,
  baseBlue: { x: 600, y: 3000 },
  baseRed: { x: 3000, y: 600 },
  laneWidth: 440,
  fountainRadius: 430,
  playMin: 140,
  playMax: 3460
};

const TEAM_COLORS = {
  blue: { main: '#4aa8ff', hex: 0x4aa8ff, dark: '#1d4f8c', darkHex: 0x1d4f8c, glow: 'rgba(74,168,255,0.55)' },
  red: { main: '#ff5c5c', hex: 0xff5c5c, dark: '#8c2626', darkHex: 0x8c2626, glow: 'rgba(255,92,92,0.55)' }
};

const LANE_PATHS = {
  top: [
    [600, 3000], [430, 2450], [370, 1550], [480, 680], [1150, 400],
    [2050, 360], [2800, 470], [3000, 600]
  ],
  mid: [
    [600, 3000], [1200, 2400], [1800, 1800], [2400, 1200], [3000, 600]
  ],
  bot: [
    [600, 3000], [1250, 3140], [2200, 3160], [2940, 2930], [3180, 2200],
    [3160, 1250], [3000, 600]
  ]
};

const TOWER_FRACTIONS = {
  blue: { inner: 0.20, outer: 0.36 },
  red: { outer: 0.64, inner: 0.80 }
};

const STRUCTURE_STATS = {
  tower: { hp: 2600, armor: 32, damage: 110, range: 470, interval: 1.05, radius: 70, xp: 130, gold: 160 },
  base: { hp: 6200, armor: 36, damage: 255, range: 520, interval: 0.7, radius: 230, xp: 300, gold: 500 }
};

const JUNGLE_CAMPS = [
  { id: 'br', team: 'blue', type: 'buff', buff: 'red', x: 900, y: 2150 },
  { id: 'bb', team: 'blue', type: 'buff', buff: 'blue', x: 1520, y: 2750 },
  { id: 'bs', team: 'blue', type: 'small', x: 2300, y: 2680 },
  { id: 'rr', team: 'red', type: 'buff', buff: 'red', x: 2700, y: 1450 },
  { id: 'rb', team: 'red', type: 'buff', buff: 'blue', x: 2080, y: 850 },
  { id: 'rs', team: 'red', type: 'small', x: 1300, y: 920 }
];

const EPIC_DEF = {
  x: 2200, y: 2200, hp: 6200, armor: 40, damage: 240, range: 220,
  interval: 1.2, radius: 110, firstSpawn: 120, respawn: 240,
  xp: 260, gold: 200
};

const MINION_WAVE = {
  firstDelay: 6,
  interval: 25,
  melee: 2,
  ranged: 1,
  radius: 16,
  speed: 125,
  meleeHp: 320,
  meleeDmg: 24,
  meleeRange: 60,
  meleeInterval: 1.0,
  rangedHp: 220,
  rangedDmg: 32,
  rangedRange: 265,
  rangedInterval: 1.35,
  xp: 42,
  gold: 28
};

const TEAM_SIZE = 5;

const XP_TABLE = [0, 100, 220, 360, 520, 700, 900, 1120, 1360, 1620, 1900, 2200, 2520, 2880, 3280];
const MAX_LEVEL = 15;

const SHOP_ITEMS = [
  {
    id: 'blade', name: '力量之刃', icon: '刃',
    desc: '+15 攻击力',
    costs: [200, 320, 440, 560, 680]
  },
  {
    id: 'armor', name: '守护铠甲', icon: '铠',
    desc: '+9 护甲、+90 最大生命',
    costs: [200, 320, 440, 560, 680]
  },
  {
    id: 'arcane', name: '奥术核心', icon: '奥',
    desc: '技能伤害 +10%',
    costs: [200, 320, 440, 560, 680]
  }
];

const HEROES = [
  {
    id: 'ryan',
    name: '雷恩',
    title: '破晓剑士',
    role: '战士',
    color: '#ff9d3d',
    emblem: '雷',
    lore: '废墟中走出的剑客，相信破晓终会到来。',
    meta: { survive: 4, damage: 3, difficulty: 2 },
    hp: 840, hpGrow: 112, mana: 300, manaGrow: 26,
    ad: 64, adGrow: 7.5, armor: 30, armorGrow: 4.5,
    speed: 315, range: 82, atkInterval: 1.0,
    passive: { name: '铁血', desc: '生命值低于 40% 时，护甲提升 20。' },
    skills: [
      {
        name: '裂地斩', cd: 6, mana: 30, range: 340, aiRange: 320,
        desc: '挥出裂地剑气，对前方扇形敌人造成 80(+60%攻击) 伤害并减速 35%，持续 1.5 秒。',
        exec(h, g, ax, ay) {
          const ang = Math.atan2(ay - h.y, ax - h.x);
          g.fxSector(h.x, h.y, ang, 340, 0.58, '#ffb347');
          const dmg = h.skillDamage(80, 0.6);
          for (const u of g.enemiesInSector(h.x, h.y, ang, 350, 0.58, h.team)) {
            u.takeDamage(dmg, { source: h, game: g });
            u.applySlow(0.65, 1.5);
            g.fxBurst(u.x, u.y, '#ffb347', 6, 130);
          }
          g.sfx('sweep');
          return true;
        }
      },
      {
        name: '战意冲锋', cd: 9, mana: 40, range: 360, aiRange: 350,
        desc: '向前冲锋，对沿途敌人造成 70(+40%攻击) 伤害并眩晕 0.7 秒。',
        exec(h, g, ax, ay) {
          const ang = Math.atan2(ay - h.y, ax - h.x);
          const d = Math.min(360, Math.hypot(ax - h.x, ay - h.y) || 360);
          const tx = h.x + Math.cos(ang) * d;
          const ty = h.y + Math.sin(ang) * d;
          g.fxDash(h.x, h.y, tx, ty, '#ffcf7a');
          const dmg = h.skillDamage(70, 0.4);
          for (const u of g.enemiesAlongSegment(h.x, h.y, tx, ty, 82, h.team)) {
            u.takeDamage(dmg, { source: h, game: g });
            u.applyStun(0.7);
            g.fxBurst(u.x, u.y, '#ffcf7a', 8, 150);
          }
          g.placeHero(h, tx, ty);
          g.sfx('dash');
          return true;
        }
      },
      {
        name: '破晓之怒', cd: 26, mana: 70, range: 0, aiRange: 0,
        desc: '6 秒内攻击力提升 35%，移动速度提升 25%。',
        exec(h, g) {
          h.addBuff({ kind: 'ryanUlt', until: g.time + 6, adMult: 1.35, speedMult: 1.25 });
          g.view.spawnPillar(h.x, h.y, 0xffd166);
          g.fxRing(h.x, h.y, 100, '#ffd166', 0.6);
          g.fxBurst(h.x, h.y, '#ffd166', 16, 200);
          g.sfx('buff');
          return true;
        }
      }
    ]
  },
  {
    id: 'vera',
    name: '薇拉',
    title: '烈焰法师',
    role: '法师',
    color: '#b06bff',
    emblem: '薇',
    lore: '痴迷星火之术的研究者，火光是她的语言。',
    meta: { survive: 2, damage: 5, difficulty: 3 },
    hp: 700, hpGrow: 88, mana: 430, manaGrow: 40,
    ad: 52, adGrow: 5.5, armor: 20, armorGrow: 3,
    speed: 305, range: 300, atkInterval: 1.15,
    passive: { name: '法力涌动', desc: '法力回复速度提升 50%。' },
    skills: [
      {
        name: '炽焰弹', cd: 4, mana: 35, range: 640, aiRange: 600,
        desc: '发射炽焰弹，命中造成 70(+55%攻击) 魔法伤害。',
        exec(h, g, ax, ay) {
          g.spawnLinearProjectile({
            team: h.team, source: h, x: h.x, y: h.y, tx: ax, ty: ay,
            speed: 820, range: 640, radius: 17, color: '#c77dff',
            damage: h.skillDamage(70, 0.55)
          });
          g.sfx('bolt');
          return true;
        }
      },
      {
        name: '焰环', cd: 10, mana: 50, range: 560, aiRange: 520,
        desc: '在目标区域引爆焰环，造成 110(+55%攻击) 伤害并减速 30%，持续 2 秒。',
        exec(h, g, ax, ay) {
          g.telegraph({
            x: ax, y: ay, radius: 165, delay: 0.45, color: '#ff9f43', team: h.team,
            onDone: () => {
              for (const u of g.enemiesInCircle(ax, ay, 165, h.team)) {
                u.takeDamage(h.skillDamage(110, 0.55), { source: h, game: g });
                u.applySlow(0.7, 2);
              }
              g.fxBurst(ax, ay, '#ff9f43', 20, 260);
              g.fxRing(ax, ay, 165, '#ff9f43', 0.4);
              g.sfx('boom');
            }
          });
          return true;
        }
      },
      {
        name: '陨星天降', cd: 30, mana: 90, range: 620, aiRange: 560,
        desc: '召唤陨星，1.1 秒后对区域造成 240(+90%攻击) 伤害。',
        exec(h, g, ax, ay) {
          g.view.meteorFall(ax, ay, 1.1, 230, 0xff4d6d);
          g.telegraph({
            x: ax, y: ay, radius: 230, delay: 1.1, color: '#ff4d6d', team: h.team, big: true,
            onDone: () => {
              for (const u of g.enemiesInCircle(ax, ay, 230, h.team)) {
                u.takeDamage(h.skillDamage(240, 0.9), { source: h, game: g });
              }
              g.fxBurst(ax, ay, '#ff4d6d', 34, 320);
              g.fxRing(ax, ay, 230, '#ff4d6d', 0.6);
              g.view.scorch(ax, ay, 230, 0xff4d6d, 4.2);
              g.view.screenFlash(0xff4d6d, 0.16);
              g.view.shake = Math.max(g.view.shake, 12);
              g.sfx('boomBig');
            }
          });
          g.sfx('cast');
          return true;
        }
      }
    ]
  },
  {
    id: 'hill',
    name: '希尔',
    title: '疾风射手',
    role: '射手',
    color: '#5ad38a',
    emblem: '希',
    lore: '追逐风声的猎手，箭矢永远先于话语抵达。',
    meta: { survive: 2, damage: 4, difficulty: 3 },
    hp: 720, hpGrow: 90, mana: 320, manaGrow: 28,
    ad: 70, adGrow: 8, armor: 22, armorGrow: 3.2,
    speed: 320, range: 330, atkInterval: 0.95,
    passive: { name: '轻步', desc: '天生攻速高于常人（攻击间隔缩短 8%）。' },
    skills: [
      {
        name: '疾风箭', cd: 3.5, mana: 25, range: 560, aiRange: 540,
        desc: '射出疾风箭，命中造成 60(+70%攻击) 物理伤害。',
        exec(h, g, ax, ay) {
          g.spawnLinearProjectile({
            team: h.team, source: h, x: h.x, y: h.y, tx: ax, ty: ay,
            speed: 980, range: 560, radius: 14, color: '#7bf0a8',
            damage: h.skillDamage(60, 0.7), arrow: true
          });
          g.sfx('arrow');
          return true;
        }
      },
      {
        name: '风行', cd: 12, mana: 35, range: 0, aiRange: 0,
        desc: '4 秒内移动速度提升 30%，攻击速度提升 50%。',
        exec(h, g) {
          h.addBuff({ kind: 'hillWind', until: g.time + 4, speedMult: 1.3, atkSpeedMult: 1.5 });
          g.fxRing(h.x, h.y, 70, '#7bf0a8', 0.45);
          g.fxBurst(h.x, h.y, '#7bf0a8', 12, 180);
          g.sfx('buff');
          return true;
        }
      },
      {
        name: '穿云箭', cd: 26, mana: 65, range: 820, aiRange: 760,
        desc: '射出穿云箭，穿透敌人造成 200(+80%攻击) 伤害并减速 40%，持续 2 秒。',
        exec(h, g, ax, ay) {
          g.spawnLinearProjectile({
            team: h.team, source: h, x: h.x, y: h.y, tx: ax, ty: ay,
            speed: 1150, range: 820, radius: 22, color: '#b7ffcf',
            damage: h.skillDamage(200, 0.8), pierce: true, arrow: true, big: true,
            onHit: (u) => u.applySlow(0.6, 2)
          });
          g.sfx('arrowBig');
          return true;
        }
      }
    ]
  },
  {
    id: 'yeren',
    name: '夜刃',
    title: '暗影刺客',
    role: '刺客',
    color: '#e0435e',
    emblem: '夜',
    lore: '没人见过他的真面目，只见过刀光熄灭的瞬间。',
    meta: { survive: 2, damage: 5, difficulty: 4 },
    hp: 760, hpGrow: 94, mana: 300, manaGrow: 24,
    ad: 72, adGrow: 8.5, armor: 24, armorGrow: 3.4,
    speed: 335, range: 84, atkInterval: 0.9,
    passive: { name: '脱战', desc: '脱离战斗 4 秒后，移动速度提升 15%。' },
    skills: [
      {
        name: '影步', cd: 7, mana: 30, range: 280, aiRange: 280,
        desc: '瞬身至目标方向，使下一次普攻额外造成 60(+50%攻击) 伤害。',
        exec(h, g, ax, ay) {
          const ang = Math.atan2(ay - h.y, ax - h.x);
          const d = Math.min(280, Math.hypot(ax - h.x, ay - h.y) || 280);
          const tx = h.x + Math.cos(ang) * d;
          const ty = h.y + Math.sin(ang) * d;
          g.fxDash(h.x, h.y, tx, ty, '#ff7da0');
          h.addBuff({ kind: 'nextHit', until: g.time + 4, nextHitFlat: 60 + 0.5 * h.getAD() });
          g.placeHero(h, tx, ty);
          g.sfx('blink');
          return true;
        }
      },
      {
        name: '影袭', cd: 8, mana: 40, range: 260, aiRange: 240,
        desc: '挥出影袭，对周围敌人造成 90(+60%攻击) 伤害并回复 45 生命。',
        exec(h, g) {
          g.fxSector(h.x, h.y, Math.atan2(g.aimY - h.y, g.aimX - h.x), 260, Math.PI, 'rgba(255,90,130,0.55)');
          const dmg = h.skillDamage(90, 0.6);
          for (const u of g.enemiesInCircle(h.x, h.y, 260, h.team)) {
            u.takeDamage(dmg, { source: h, game: g });
            g.fxBurst(u.x, u.y, '#ff6b90', 7, 160);
          }
          h.heal(45);
          g.sfx('sweep');
          return true;
        }
      },
      {
        name: '处决', cd: 28, mana: 65, range: 300, aiRange: 300,
        desc: '处决 300 范围内的敌方英雄：160(+80%攻击) 外加其已损失生命 25% 的伤害。击杀则重置影步冷却。',
        exec(h, g) {
          const target = g.nearestEnemyHero(h.x, h.y, 300, h.team);
          if (!target) return false;
          const missing = target.maxHp - target.hp;
          const dmg = h.skillDamage(160, 0.8) + missing * 0.25;
          g.fxDash(h.x, h.y, target.x, target.y, '#ff3355');
          target.takeDamage(dmg, { source: h, game: g });
          g.fxBurst(target.x, target.y, '#ff3355', 22, 260);
          g.fxRing(target.x, target.y, 60, '#ff3355', 0.4);
          g.view.screenFlash(0xff3355, 0.1);
          g.view.shake = Math.max(g.view.shake, 7);
          if (target.dead) h.skillCd[0] = 0;
          g.sfx('execute');
          return true;
        }
      }
    ]
  },
  {
    id: 'panshi',
    name: '磐石',
    title: '山岳守卫',
    role: '坦克',
    color: '#9aa7b8',
    emblem: '磐',
    lore: '山不会退，他也不会。',
    meta: { survive: 5, damage: 2, difficulty: 1 },
    hp: 1020, hpGrow: 148, mana: 280, manaGrow: 22,
    ad: 58, adGrow: 6, armor: 38, armorGrow: 5,
    speed: 300, range: 86, atkInterval: 1.1,
    passive: { name: '山心', desc: '每 5 秒回复 2.5% 最大生命。' },
    skills: [
      {
        name: '震地', cd: 7, mana: 30, range: 210, aiRange: 200,
        desc: '重击地面，对周围敌人造成 70(+50%攻击) 伤害并减速 40%，持续 1.8 秒。',
        exec(h, g) {
          g.fxRing(h.x, h.y, 210, '#c9b47a', 0.45, 14);
          for (const u of g.enemiesInCircle(h.x, h.y, 210, h.team)) {
            u.takeDamage(h.skillDamage(70, 0.5), { source: h, game: g });
            u.applySlow(0.6, 1.8);
          }
          g.fxBurst(h.x, h.y, '#c9b47a', 16, 220);
          g.sfx('slam');
          return true;
        }
      },
      {
        name: '岩盾', cd: 13, mana: 45, range: 0, aiRange: 0,
        desc: '获得 140(+8%最大生命) 护盾，护甲提升 20，持续 5 秒。',
        exec(h, g) {
          const amt = 140 + h.maxHp * 0.08;
          h.addShield(amt, 5);
          h.addBuff({ kind: 'stoneSkin', until: g.time + 5, armorBonus: 20 });
          g.fxRing(h.x, h.y, 85, '#d8d2c0', 0.5);
          g.sfx('shield');
          return true;
        }
      },
      {
        name: '山崩', cd: 27, mana: 70, range: 360, aiRange: 350,
        desc: '向前崩击，对沿途敌人造成 80(+40%攻击) 伤害并眩晕 1 秒。',
        exec(h, g, ax, ay) {
          const ang = Math.atan2(ay - h.y, ax - h.x);
          const d = Math.min(360, Math.hypot(ax - h.x, ay - h.y) || 360);
          const tx = h.x + Math.cos(ang) * d;
          const ty = h.y + Math.sin(ang) * d;
          g.fxDash(h.x, h.y, tx, ty, '#c9b47a');
          g.view.groundCracks(h.x, h.y, ang, d, 95, 0xc9b47a);
          for (const u of g.enemiesAlongSegment(h.x, h.y, tx, ty, 95, h.team)) {
            u.takeDamage(h.skillDamage(80, 0.4), { source: h, game: g });
            u.applyStun(1);
            g.fxBurst(u.x, u.y, '#c9b47a', 9, 150);
          }
          g.placeHero(h, tx, ty);
          g.view.shake = Math.max(g.view.shake, 7);
          g.sfx('dash');
          return true;
        }
      }
    ]
  },
  {
    id: 'lucy',
    name: '露西',
    title: '圣光辅祭',
    role: '辅助',
    color: '#ffe08a',
    emblem: '露',
    lore: '提灯穿过长夜的少女，她的光从不只为照亮自己。',
    meta: { survive: 3, damage: 2, difficulty: 2 },
    hp: 760, hpGrow: 98, mana: 430, manaGrow: 42,
    ad: 50, adGrow: 5.5, armor: 21, armorGrow: 3,
    speed: 310, range: 280, atkInterval: 1.05,
    passive: { name: '圣恩', desc: '每秒回复 0.4% 最大生命。' },
    skills: [
      {
        name: '圣光弹', cd: 3.5, mana: 30, range: 560, aiRange: 540,
        desc: '发射圣光弹，造成 55(+50%攻击) 伤害并回复自身 22 生命。',
        exec(h, g, ax, ay) {
          g.spawnLinearProjectile({
            team: h.team, source: h, x: h.x, y: h.y, tx: ax, ty: ay,
            speed: 860, range: 560, radius: 16, color: '#ffe9a3',
            damage: h.skillDamage(55, 0.5),
            onHit: () => h.heal(22)
          });
          g.sfx('holy');
          return true;
        }
      },
      {
        name: '守护之环', cd: 11, mana: 45, range: 0, aiRange: 0,
        desc: '回复 90(+6%最大生命) 生命，移动速度提升 25%，持续 3 秒。',
        exec(h, g) {
          h.heal(90 + h.maxHp * 0.06);
          h.addBuff({ kind: 'lucyHeal', until: g.time + 3, speedMult: 1.25 });
          g.fxRing(h.x, h.y, 90, '#ffe9a3', 0.5);
          g.fxBurst(h.x, h.y, '#ffe9a3', 14, 160);
          g.sfx('heal');
          return true;
        }
      },
      {
        name: '圣光新星', cd: 28, mana: 75, range: 230, aiRange: 220,
        desc: '对周围敌人造成 130(+60%攻击) 伤害并眩晕 0.8 秒。',
        exec(h, g) {
          g.fxRing(h.x, h.y, 230, '#fff2c0', 0.55, 16);
          g.view.skyBeam(h.x, h.y, 0xfff2c0, 0.6, 92);
          for (const u of g.enemiesInCircle(h.x, h.y, 230, h.team)) {
            u.takeDamage(h.skillDamage(130, 0.6), { source: h, game: g });
            u.applyStun(0.8);
          }
          g.fxBurst(h.x, h.y, '#fff2c0', 24, 280);
          g.view.screenFlash(0xfff2c0, 0.13);
          g.sfx('nova');
          return true;
        }
      }
    ]
  },
  {
    id: 'frost',
    name: '霜翎',
    title: '凛冬猎手',
    role: '射手',
    color: '#7fdcff',
    emblem: '霜',
    lore: '她走过的地方，风会停下，湖面会结出细密的霜花。',
    meta: { survive: 2, damage: 4, difficulty: 3 },
    hp: 700, hpGrow: 88, mana: 380, manaGrow: 34,
    ad: 66, adGrow: 7.6, armor: 21, armorGrow: 3,
    speed: 318, range: 330, atkInterval: 1.0,
    passive: { name: '霜痕', desc: '对减速中的敌人造成的伤害提升 12%。' },
    skills: [
      {
        name: '霜棱箭', cd: 4.5, mana: 30, range: 620, aiRange: 580,
        desc: '射出霜棱箭，命中造成 65(+60%攻击) 伤害并减速 35%，持续 2 秒。',
        exec(h, g, ax, ay) {
          g.spawnLinearProjectile({
            team: h.team, source: h, x: h.x, y: h.y, tx: ax, ty: ay,
            speed: 900, range: 620, radius: 15, color: '#9fe8ff',
            damage: h.skillDamage(65, 0.6),
            onHit: (u) => {
              u.applySlow(0.65, 2);
              g.view.iceCrown(u.x, u.y, 58, 0x9fe8ff, 0.65, { count: 5, field: true });
            }
          });
          g.sfx('frost');
          return true;
        }
      },
      {
        name: '冰晶禁域', cd: 11, mana: 50, range: 500, aiRange: 480,
        desc: '在目标区域召出冰晶囚笼，0.55 秒后造成 85(+45%攻击) 伤害，减速 45% 并短暂定身。',
        exec(h, g, ax, ay) {
          g.telegraph({
            x: ax, y: ay, radius: 160, delay: 0.55, color: '#9fe8ff', team: h.team,
            onDone: () => {
              for (const u of g.enemiesInCircle(ax, ay, 160, h.team)) {
                u.takeDamage(h.skillDamage(85, 0.45), { source: h, game: g });
                u.applySlow(0.55, 2.2);
                u.applyStun(0.35);
              }
              g.view.iceCrown(ax, ay, 160, 0x7fdcff, 1.5, { count: 20, ring: true });
              g.view.ring(ax, ay, 160, 0x9fe8ff, 0.5, 10);
              g.view.scorch(ax, ay, 160, 0x6fd8ff, 3.2);
              g.sfx('iceBoom');
            }
          });
          g.view.iceCrown(ax, ay, 160, 0x9fe8ff, 0.55, { count: 8, ring: true });
          return true;
        }
      },
      {
        name: '永冻风暴', cd: 30, mana: 90, range: 540, aiRange: 500,
        desc: '召唤永冻风暴，0.95 秒后对区域造成 190(+80%攻击) 伤害并冰冻 0.6 秒。',
        exec(h, g, ax, ay) {
          g.telegraph({
            x: ax, y: ay, radius: 220, delay: 0.95, color: '#bfefff', team: h.team, big: true,
            onDone: () => {
              for (const u of g.enemiesInCircle(ax, ay, 220, h.team)) {
                u.takeDamage(h.skillDamage(190, 0.8), { source: h, game: g });
                u.applySlow(0.5, 2.5);
                u.applyStun(0.6);
              }
              g.view.iceCrown(ax, ay, 220, 0x7fdcff, 2.1, { count: 36, field: true, big: true });
              g.view.ring(ax, ay, 220, 0xbfefff, 0.7, 16);
              g.view.scorch(ax, ay, 220, 0x6fd8ff, 4);
              g.view.screenFlash(0xbfefff, 0.2);
              g.view.shake = Math.max(g.view.shake, 10);
              g.sfx('frostNova');
            }
          });
          g.view.iceCrown(ax, ay, 220, 0x7fdcff, 0.95, { count: 12, field: true });
          return true;
        }
      }
    ]
  },
  {
    id: 'storm',
    name: '霆羽',
    title: '惊雷之刃',
    role: '刺客',
    color: '#b58bff',
    emblem: '霆',
    lore: '雷声尚未落下，刀锋已经越过雨幕。',
    meta: { survive: 2, damage: 5, difficulty: 4 },
    hp: 780, hpGrow: 96, mana: 360, manaGrow: 30,
    ad: 70, adGrow: 8.2, armor: 25, armorGrow: 3.6,
    speed: 332, range: 84, atkInterval: 0.92,
    passive: { name: '静电', desc: '每第三次普攻引落一道闪电，额外造成 30(+25%攻击) 魔法伤害。' },
    skills: [
      {
        name: '雷闪', cd: 5, mana: 35, range: 500, aiRange: 480,
        desc: '向目标方向斩出雷光，对沿途敌人造成 85(+55%攻击) 伤害并减速 15%。',
        exec(h, g, ax, ay) {
          const ang = Math.atan2(ay - h.y, ax - h.x);
          const d = Math.min(500, Math.hypot(ax - h.x, ay - h.y) || 500);
          const tx = h.x + Math.cos(ang) * d;
          const ty = h.y + Math.sin(ang) * d;
          g.view.lightningBolt(h.x, h.y, tx, ty, 0xc9a6ff, { height: 64, width: 3.8, life: 0.46 });
          const dmg = h.skillDamage(85, 0.55);
          for (const u of g.enemiesAlongSegment(h.x, h.y, tx, ty, 36, h.team)) {
            u.takeDamage(dmg, { source: h, game: g });
            u.applySlow(0.85, 1.2);
            g.fxBurst(u.x, u.y, '#c9a6ff', 6, 150);
          }
          g.view.screenFlash(0xb58bff, 0.06);
          g.sfx('thunder');
          return true;
        }
      },
      {
        name: '雷牢', cd: 12, mana: 45, range: 480, aiRange: 460,
        desc: '在目标区域降下雷牢，0.6 秒后造成 75(+35%攻击) 伤害并眩晕 0.8 秒。',
        exec(h, g, ax, ay) {
          g.telegraph({
            x: ax, y: ay, radius: 140, delay: 0.6, color: '#b58bff', team: h.team,
            onDone: () => {
              for (const u of g.enemiesInCircle(ax, ay, 140, h.team)) {
                u.takeDamage(h.skillDamage(75, 0.35), { source: h, game: g });
                u.applyStun(0.8);
              }
              g.view.skyStrike(ax, ay, 0xc9a6ff, 140);
              g.view.ring(ax, ay, 140, 0xb58bff, 0.55, 12);
              g.view.scorch(ax, ay, 140, 0x7d5cff, 2.8);
              g.sfx('static');
            }
          });
          return true;
        }
      },
      {
        name: '万雷天罚', cd: 30, mana: 85, range: 520, aiRange: 500,
        desc: '引落万雷，0.9 秒后对区域造成 210(+85%攻击) 伤害并眩晕 0.75 秒。',
        exec(h, g, ax, ay) {
          g.telegraph({
            x: ax, y: ay, radius: 210, delay: 0.9, color: '#c9a6ff', team: h.team, big: true,
            onDone: () => {
              for (const u of g.enemiesInCircle(ax, ay, 210, h.team)) {
                u.takeDamage(h.skillDamage(210, 0.85), { source: h, game: g });
                u.applyStun(0.75);
              }
              g.view.skyBeam(ax, ay, 0xc9a6ff, 1.2, 74);
              for (let i = 0; i < 4; i++) {
                const a = rand(0, TAU);
                const r = rand(30, 160);
                g.view.skyStrike(ax + Math.cos(a) * r, ay + Math.sin(a) * r, 0xb58bff, 40);
              }
              g.view.scorch(ax, ay, 220, 0x7d5cff, 4.5);
              g.view.screenFlash(0xd9c6ff, 0.24);
              g.view.shake = Math.max(g.view.shake, 14);
              g.sfx('thunderBig');
            }
          });
          return true;
        }
      }
    ]
  }
];

const HERO_VISUALS = {
  ryan: {
    file: 'Barbarian', lane: 'top', laneLabel: '上路',
    keep: ['2H_Axe'], hide: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', 'Mug'],
    anim: { attack: '2H_Melee_Attack_Chop', cast: '2H_Melee_Attack_Spin' }
  },
  vera: {
    file: 'Mage', lane: 'mid', laneLabel: '中路',
    keep: ['2H_Staff'], hide: ['Spellbook', 'Spellbook_open', '1H_Wand'],
    anim: { attack: 'Spellcast_Shoot', cast: 'Spellcast_Raise' }
  },
  hill: {
    file: 'Rogue', lane: 'bot', laneLabel: '下路',
    keep: ['1H_Crossbow'], hide: ['Knife_Offhand', '2H_Crossbow', 'Knife', 'Throwable'],
    anim: { attack: '1H_Ranged_Shoot', cast: '1H_Ranged_Shooting' }
  },
  yeren: {
    file: 'Rogue_Hooded', lane: 'jungle', laneLabel: '打野',
    keep: ['Knife', 'Knife_Offhand'], hide: ['1H_Crossbow', '2H_Crossbow', 'Throwable'],
    anim: { attack: 'Dualwield_Melee_Attack_Slice', cast: 'Dualwield_Melee_Attack_Stab' }
  },
  panshi: {
    file: 'Knight', lane: 'top', laneLabel: '上路',
    keep: ['1H_Sword', 'Round_Shield'], hide: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'],
    anim: { attack: '1H_Melee_Attack_Slice_Diagonal', cast: '2H_Melee_Attack_Chop' }
  },
  lucy: {
    file: 'Mage', lane: 'support', laneLabel: '下路辅助', tint: 0xffd77a,
    keep: ['1H_Wand'], hide: ['2H_Staff', 'Spellbook', 'Spellbook_open'],
    anim: { attack: 'Spellcast_Shoot', cast: 'Spellcast_Raise' }
  },
  frost: {
    file: 'Rogue', lane: 'bot', laneLabel: '下路', tint: 0xbfeaff, glowTint: 0x6fd8ff, glowIntensity: 0.32,
    keep: ['1H_Crossbow'], hide: ['Knife_Offhand', '2H_Crossbow', 'Knife', 'Throwable'],
    anim: { attack: '1H_Ranged_Shoot', cast: 'Spellcast_Raise' }
  },
  storm: {
    file: 'Rogue_Hooded', lane: 'jungle', laneLabel: '打野', tint: 0xd3c2ff, glowTint: 0x9a6bff, glowIntensity: 0.34,
    keep: ['Knife', 'Knife_Offhand'], hide: ['1H_Crossbow', '2H_Crossbow', 'Throwable'],
    anim: { attack: 'Dualwield_Melee_Attack_Slice', cast: 'Spellcast_Raise' }
  }
};

for (const h of HEROES) Object.assign(h, HERO_VISUALS[h.id] || {});

const LANE_LABELS = { top: '上路', mid: '中路', bot: '下路', jungle: '打野', support: '辅助' };

const HERO_BY_ID = {};
for (const h of HEROES) HERO_BY_ID[h.id] = h;

const TUTORIAL_TIPS = [
  '左键点地面移动，点敌人发起攻击',
  '靠近敌方单位会自动普攻',
  'Q / W / E 施放技能，Tab 查看记分板',
  'B 商店 · Esc 暂停 · M 静音 · 滚轮缩放'
];

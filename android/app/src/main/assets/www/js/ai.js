'use strict';

/* 5v5 三路 AI：对线 / 防守 / 打野 / 撤退 / 团战 / 自动出装 */
const HeroAI3 = {
  init(hero) {
    hero.aiTimer = rand(0.3, 0.8) * hero.aiThinkMult;
    hero.aiSkillTimer = rand(0.5, 1.0) * hero.aiSkillMult;
    hero.aiState = 'lane';
    hero.wp = 1;
    hero.jungleGoal = null;
    hero.jungleGankTimer = 0;
    hero.lanePath = hero.game.laneWaypoints(hero.lane, hero.team);
  },

  update(hero, dt) {
    const g = hero.game;
    if (hero.dead) return;
    hero.aiTimer -= dt;
    hero.aiSkillTimer -= dt;
    hero.jungleGankTimer = Math.max(0, hero.jungleGankTimer - dt);

    if (hero.aiTimer <= 0) {
      hero.aiTimer = rand(0.4, 0.75) * hero.aiThinkMult;
      this.buy(hero);
      this.decide(hero);
    }
    this.useSkills(hero);
  },

  buy(hero) {
    for (let i = 0; i < SHOP_ITEMS.length; i++) {
      const item = SHOP_ITEMS[i];
      const count = hero.shopCounts[item.id];
      if (count >= 5) continue;
      if (hero.gold >= item.costs[count]) { hero.game.buyItem(hero, i); break; }
    }
  },

  nearestEnemyHero(hero, range) {
    let best = null, bd = range;
    for (const u of hero.game.heroes) {
      if (!u.alive || u.team === hero.team) continue;
      const d = dist(hero.x, hero.y, u.x, u.y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },

  nearestEnemyUnit(hero, range) {
    let best = null, bd = range;
    for (const u of hero.game.units) {
      if (!u.alive || u.team === hero.team) continue;
      if (u.type !== 'hero' && u.type !== 'minion') continue;
      const d = dist(hero.x, hero.y, u.x, u.y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },

  dangerousTower(hero, x, y) {
    const enemyTeam = hero.team === 'blue' ? 'red' : 'blue';
    for (const s of hero.game.structuresOf(enemyTeam)) {
      if (!s.alive || s.kind !== 'tower') continue;
      if (dist(x, y, s.x, s.y) < s.range + 80) {
        const tanked = hero.game.units.some(u => u.alive && u.type === 'minion' && u.team === hero.team &&
          dist(u.x, u.y, s.x, s.y) < s.range + 120);
        if (!tanked) return s;
      }
    }
    return null;
  },

  retreat(hero, base) {
    hero.aiState = 'retreat';
    hero.attackTarget = null;
    hero.moveTarget = { x: base.x + rand(-90, 90), y: base.y + rand(-90, 90) };
  },

  decide(hero) {
    const g = hero.game;
    const base = g.baseOf(hero.team);
    const hpFrac = hero.hp / hero.maxHp;
    const enemyHero = this.nearestEnemyHero(hero, 680);
    const enemyUnit = this.nearestEnemyUnit(hero, 430);

    if (hero.aiState === 'retreat') {
      if (hpFrac > 0.68 && dist(hero.x, hero.y, base.x, base.y) < 700) {
        hero.aiState = 'lane';
        hero.wp = g.spawnWaypointFor(hero);
        hero.lanePath = g.laneWaypoints(hero.lane, hero.team);
      } else {
        hero.attackTarget = null;
        hero.moveTarget = { x: base.x + rand(-80, 80), y: base.y + rand(-80, 80) };
        return;
      }
    }
    if (hpFrac < (hero.role === 'support' ? 0.25 : 0.28) && dist(hero.x, hero.y, base.x, base.y) > 350) {
      this.retreat(hero, base);
      return;
    }

    // 危险塔下不硬追
    if (enemyHero) {
      const tower = this.dangerousTower(hero, enemyHero.x, enemyHero.y);
      if (tower && hpFrac < 0.72) {
        hero.attackTarget = null;
        const a = Math.atan2(hero.y - tower.y, hero.x - tower.x);
        hero.moveTarget = {
          x: clamp(tower.x + Math.cos(a) * (tower.range + 130), 180, 3420),
          y: clamp(tower.y + Math.sin(a) * (tower.range + 130), 180, 3420)
        };
        if (enemyUnit && enemyUnit.type === 'minion' && dist(hero.x, hero.y, enemyUnit.x, enemyUnit.y) < hero.attackRange + 80) {
          hero.attackTarget = enemyUnit;
        }
        return;
      }
    }

    // 打野
    if (hero.role === 'jungle' && !enemyHero) {
      this.jungle(hero);
      return;
    }

    // 交战
    if (enemyHero && dist(hero.x, hero.y, enemyHero.x, enemyHero.y) < 680) {
      hero.aiState = 'fight';
      hero.attackTarget = enemyHero;
      if (dist(hero.x, hero.y, enemyHero.x, enemyHero.y) > hero.attackRange * 0.85) {
        hero.moveTarget = { x: enemyHero.x, y: enemyHero.y };
      } else {
        hero.moveTarget = null;
      }
      return;
    }
    if (enemyUnit && dist(hero.x, hero.y, enemyUnit.x, enemyUnit.y) < 430) {
      hero.aiState = 'fight';
      hero.attackTarget = enemyUnit;
      if (dist(hero.x, hero.y, enemyUnit.x, enemyUnit.y) > hero.attackRange * 0.85) {
        hero.moveTarget = { x: enemyUnit.x, y: enemyUnit.y };
      } else {
        hero.moveTarget = null;
      }
      return;
    }

    // 防守己方塔
    const enemyTeam = hero.team === 'blue' ? 'red' : 'blue';
    let defend = null, defendDist = 1700;
    for (const s of g.structuresOf(hero.team)) {
      if (!s.alive || s.kind !== 'tower') continue;
      const threat = g.units.some(u => u.alive && u.type === 'minion' && u.team === enemyTeam && dist(u.x, u.y, s.x, s.y) < 420);
      if (!threat) continue;
      const d = dist(hero.x, hero.y, s.x, s.y);
      if (d < defendDist) { defendDist = d; defend = s; }
    }
    if (defend) {
      hero.aiState = 'defend';
      hero.attackTarget = null;
      hero.moveTarget = { x: defend.x + rand(-60, 60), y: defend.y + rand(-60, 60) };
      return;
    }

    // 有兵线抗塔时主动拆塔
    let blockTower = null, bd = 560;
    for (const s of g.structuresOf(enemyTeam)) {
      if (!s.alive || s.kind !== 'tower' || s.isInvulnerable()) continue;
      const d = dist(hero.x, hero.y, s.x, s.y);
      if (d < bd) { bd = d; blockTower = s; }
    }
    if (blockTower) {
      const tanked = g.units.some(u => u.alive && u.type === 'minion' && u.team === hero.team &&
        dist(u.x, u.y, blockTower.x, blockTower.y) < blockTower.range + 140);
      if (tanked) {
        hero.aiState = 'push';
        hero.attackTarget = blockTower;
        hero.moveTarget = null;
        return;
      }
    }

    // 暴君团：中单/辅助靠近时支援
    const epic = g.epicCamp && g.epicCamp.monster;
    if (epic && epic.alive && (hero.role === 'mid' || hero.role === 'support')) {
      const allyAt = g.heroes.some(h => h.team === hero.team && h !== hero && h.alive && dist(h.x, h.y, epic.x, epic.y) < 800);
      const enemyAt = g.heroes.some(h => h.team !== hero.team && h.alive && dist(h.x, h.y, epic.x, epic.y) < 800);
      if ((allyAt || enemyAt) && dist(hero.x, hero.y, epic.x, epic.y) < 2600 && hpFrac > 0.45) {
        hero.aiState = 'objective';
        const nearEnemy = this.nearestEnemyUnit(hero, 500);
        hero.attackTarget = nearEnemy || epic;
        hero.moveTarget = { x: epic.x + rand(-90, 90), y: epic.y + rand(-90, 90) };
        return;
      }
    }

    // 对线推进
    hero.aiState = 'lane';
    hero.attackTarget = null;
    const path = hero.lanePath || g.laneWaypoints(hero.lane, hero.team);
    hero.lanePath = path;
    let wp = path[Math.min(hero.wp, path.length - 1)];
    if (dist(hero.x, hero.y, wp[0], wp[1]) < 130 && hero.wp < path.length - 1) {
      hero.wp++;
      wp = path[Math.min(hero.wp, path.length - 1)];
    }
    let tx = wp[0], ty = wp[1];

    // 无兵线时不越塔
    for (const s of g.structuresOf(enemyTeam)) {
      if (!s.alive || s.kind !== 'tower') continue;
      const tanked = g.units.some(u => u.alive && u.type === 'minion' && u.team === hero.team && dist(u.x, u.y, s.x, s.y) < s.range + 120);
      if (tanked) continue;
      if (dist(tx, ty, s.x, s.y) < s.range + 120) {
        const a = Math.atan2(hero.y - s.y, hero.x - s.x);
        tx = s.x + Math.cos(a) * (s.range + 150);
        ty = s.y + Math.sin(a) * (s.range + 150);
      }
    }
    // 辅助跟随射手
    if (hero.role === 'support') {
      const carry = g.heroes.find(h => h.team === hero.team && h.def.id === 'hill' && h.alive && h !== hero);
      if (carry && dist(hero.x, hero.y, carry.x, carry.y) < 1500) {
        tx = carry.x + rand(-60, 60);
        ty = carry.y + rand(-60, 60);
      }
    }
    hero.moveTarget = { x: clamp(tx, 160, 3440), y: clamp(ty, 160, 3440) };
  },

  jungle(hero) {
    const g = hero.game;
    // 防守己方外塔
    let defendTower = null;
    for (const s of g.structuresOf(hero.team)) {
      if (!s.alive || s.kind !== 'tower') continue;
      const threat = g.units.some(u => u.alive && u.type === 'minion' && u.team !== hero.team && dist(u.x, u.y, s.x, s.y) < 380);
      if (threat && dist(hero.x, hero.y, s.x, s.y) < 1800) { defendTower = s; break; }
    }
    if (defendTower) {
      hero.aiState = 'defend';
      hero.attackTarget = null;
      hero.moveTarget = { x: defendTower.x + rand(-60, 60), y: defendTower.y + rand(-60, 60) };
      return;
    }

    // 暴君争夺：打野优先，中单/辅助在交战时支援
    const epic = g.epicCamp && g.epicCamp.monster;
    if (epic && epic.alive) {
      const hpFrac = hero.hp / hero.maxHp;
      const contested = epic.lastCombatAt > g.time - 6;
      const enemyNear = g.heroes.some(h => h.team !== hero.team && h.alive && dist(h.x, h.y, epic.x, epic.y) < 950);
      if (hpFrac > 0.55 && (contested || enemyNear || g.time >= 190)) {
        hero.aiState = 'objective';
        hero.jungleGoal = g.epicCamp;
        hero.attackTarget = epic;
        const d = dist(hero.x, hero.y, epic.x, epic.y);
        hero.moveTarget = d > hero.attackRange + epic.radius + 20
          ? { x: epic.x + rand(-70, 70), y: epic.y + rand(-70, 70) }
          : null;
        return;
      }
    }

    if (hero.jungleGankTimer > 0) {
      const target = this.nearestEnemyHero(hero, 620) || this.nearestEnemyUnit(hero, 460);
      if (target) {
        hero.attackTarget = target;
        if (dist(hero.x, hero.y, target.x, target.y) > hero.attackRange * 0.85) {
          hero.moveTarget = { x: target.x, y: target.y };
        } else hero.moveTarget = null;
        return;
      }
      // 去中路附近找机会
      const p = samplePolyline(LANE_PATHS.mid, hero.team === 'blue' ? 0.55 : 0.45);
      hero.attackTarget = null;
      hero.moveTarget = { x: p.x, y: p.y };
      return;
    }

    let goal = hero.jungleGoal;
    if (!goal || !goal.monster || !goal.monster.alive) {
      const camps = g.camps.filter(c => {
        if (!c.monster || !c.monster.alive) return false;
        if (c.type === 'epic') return g.time >= EPIC_DEF.firstSpawn + 45;
        return c.team === hero.team;
      });
      if (!camps.length) {
        hero.jungleGoal = null;
        hero.jungleGankTimer = 16;
        hero.aiState = 'gank';
        return;
      }
      camps.sort((a, b) => dist(hero.x, hero.y, a.x, a.y) - dist(hero.x, hero.y, b.x, b.y));
      goal = camps[0];
      hero.jungleGoal = goal;
    }
    const monster = goal.monster;
    if (!monster || !monster.alive) {
      hero.jungleGoal = null;
      hero.jungleGankTimer = 8;
      return;
    }
    hero.aiState = 'jungle';
    const d = dist(hero.x, hero.y, monster.x, monster.y);
    hero.attackTarget = monster;
    if (d > hero.attackRange * 0.8 + monster.radius) {
      hero.moveTarget = { x: monster.x, y: monster.y };
    } else {
      hero.moveTarget = null;
    }
  },

  useSkills(hero) {
    if (hero.aiSkillTimer > 0) return;
    const g = hero.game;
    let target = hero.attackTarget && hero.attackTarget.alive ? hero.attackTarget : null;
    if (!target) {
      target = this.nearestEnemyHero(hero, 640) || this.nearestEnemyUnit(hero, 420);
    }
    if (!target) return;
    const isMonster = target.type === 'monster';
    const isStructure = target.type === 'tower' || target.type === 'base';
    if (isStructure) return;
    const d = dist(hero.x, hero.y, target.x, target.y);
    hero.aiSkillTimer = rand(0.62, 1.05) * hero.aiSkillMult;

    const ax = target.x + rand(-hero.aiAimJitter, hero.aiAimJitter);
    const ay = target.y + rand(-hero.aiAimJitter, hero.aiAimJitter);
    const order = [2, 1, 0];
    for (const i of order) {
      const s = hero.def.skills[i];
      if (hero.skillCd[i] > 0 || hero.mana < s.mana) continue;
      if (hero.def.id === 'yeren' && i === 2 && target.type !== 'hero') continue;
      if (hero.def.id === 'yeren' && i === 2 && target.hp / target.maxHp > 0.6) continue;
      if (hero.def.id === 'panshi' && i === 1 && hero.hp / hero.maxHp > 0.85) continue;
      if (hero.def.id === 'lucy' && i === 1 && hero.hp / hero.maxHp > 0.78) continue;
      if (hero.def.id === 'ryan' && i === 2 && d > 400) continue;
      if (hero.def.id === 'hill' && i === 2 && d > 700) continue;
      if (isMonster && i === 2 && hero.mana < hero.maxMana * 0.5) continue;
      const need = s.range === 0 ? 320 : (s.aiRange || s.range);
      if (d > need + 50) continue;
      if (hero.tryCast(i, ax, ay)) break;
    }
  }
};

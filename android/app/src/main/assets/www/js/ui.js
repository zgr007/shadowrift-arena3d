'use strict';

const UI = {
  els: {},
  screen: 'menu',
  selectedHeroId: HEROES[0].id,
  difficulty: 'normal',
  shopOpen: false,
  scoreboardOpen: false,
  lastToastId: null,
  seenFeedIds: new Set(),
  seenBannerId: null,
  bannerTimer: null,
  toastTimer: null,
  lastShopGold: -1,
  skillEls: [],
  allyRows: [],
  scoreboardLastTick: 0,

  $(id) { return document.getElementById(id); },

  heroPortrait(def) {
    return (typeof Assets !== 'undefined' && Assets.portraits && Assets.portraits[def.id]) || null;
  },

  heroFaceHTML(def) {
    const src = this.heroPortrait(def);
    return src ? `<img src="${src}" alt="${def.name}">` : def.emblem;
  },

  init() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      loading: $('loading'),
      loadFill: $('load-fill'),
      loadText: $('load-text'),
      menu: $('screen-menu'),
      select: $('screen-select'),
      game: $('screen-game'),
      heroDetail: $('hero-detail'),
      heroGrid: $('hero-grid'),
      lineupPreview: $('lineup-preview'),
      heroPreview: $('hero-preview'),
      difficultyGroup: $('difficulty-group'),
      timer: $('hud-timer'),
      scoreBlue: document.querySelector('.score-blue'),
      scoreRed: document.querySelector('.score-red'),
      gold: $('hud-gold'),
      minimap: $('minimap'),
      allyPanel: $('ally-panel'),
      killfeed: $('killfeed'),
      killBanner: $('kill-banner'),
      heroAvatar: $('hero-avatar'),
      heroEmblem: $('hero-emblem'),
      heroLevel: $('hero-level'),
      heroName: $('hero-name'),
      heroRole: $('hero-role'),
      hpFill: $('hp-fill'),
      hpText: $('hp-text'),
      manaFill: $('mana-fill'),
      manaText: $('mana-text'),
      xpFill: $('xp-fill'),
      passiveBadge: $('passive-badge'),
      respawnBanner: $('respawn-banner'),
      toast: $('toast'),
      shopPanel: $('shop-panel'),
      shopItems: $('shop-items'),
      shopGold: $('shop-gold'),
      pauseOverlay: $('pause-overlay'),
      resultOverlay: $('result-overlay'),
      resultTitle: $('result-title'),
      resultSub: $('result-sub'),
      resultStats: $('result-stats'),
      resultCard: document.querySelector('.result-card'),
      scoreboard: $('scoreboard'),
      scoreboardBody: $('scoreboard-body'),
      btnSound: $('btn-sound'),
      btnMute: $('btn-mute'),
      btnQuality: $('btn-quality'),
      btnScoreboard: $('btn-scoreboard'),
      minimapWrap: document.querySelector('.minimap-wrap'),
      btnStart: $('btn-start')
    };

    this.skillEls = Array.from(document.querySelectorAll('.skill')).map(btn => ({
      btn,
      name: btn.querySelector('.sname'),
      mana: btn.querySelector('.mana-cost'),
      cdText: btn.querySelector('.cd-text')
    }));

    this.mmBase = this.buildMinimapBase();
    Sfx.enabled = safeStorageGet('shadowrift3d_muted', '0') !== '1';

    this.buildHeroGrid();
    const saved = safeStorageGet('shadowrift3d_hero', '');
    this.selectedHeroId = HERO_BY_ID[saved] ? saved : HEROES[0].id;
    const savedDiff = safeStorageGet('shadowrift3d_difficulty', 'normal');
    this.difficulty = ['easy', 'normal', 'hard'].includes(savedDiff) ? savedDiff : 'normal';
    this.refreshSelect();
    this.refreshDifficulty();
    for (const btn of this.els.difficultyGroup.querySelectorAll('button[data-diff]')) {
      btn.addEventListener('click', () => {
        this.difficulty = btn.dataset.diff;
        safeStorageSet('shadowrift3d_difficulty', this.difficulty);
        this.refreshDifficulty();
        Sfx.play('click');
      });
    }

    $('btn-start').addEventListener('click', () => {
      if (!App.view) return;
      Sfx.init(); Sfx.play('click');
      this.showScreen('select');
    });
    $('btn-back-menu').addEventListener('click', () => { Sfx.play('click'); this.showScreen('menu'); });
    $('btn-random').addEventListener('click', () => {
      this.selectHero(choice(HEROES).id);
      Sfx.play('click');
    });
    $('btn-enter').addEventListener('click', () => {
      if (!App.view) return;
      Sfx.init(); Sfx.play('click');
      App.startGame(this.selectedHeroId, this.difficulty);
    });

    $('btn-shop').addEventListener('click', () => this.toggleShop());
    $('btn-shop-bottom').addEventListener('click', () => this.toggleShop());
    $('btn-shop-close').addEventListener('click', () => this.toggleShop(false));
    $('btn-pause').addEventListener('click', () => this.togglePause());
    $('btn-mute').addEventListener('click', () => this.toggleMute());
    $('btn-resume').addEventListener('click', () => this.togglePause());
    $('btn-restart').addEventListener('click', () => App.restart());
    $('btn-quit').addEventListener('click', () => App.quitToSelect());
    $('btn-again').addEventListener('click', () => App.restart());
    $('btn-result-select').addEventListener('click', () => App.quitToSelect());
    $('btn-sound').addEventListener('click', () => this.toggleMute());
    if (this.els.btnQuality) this.els.btnQuality.addEventListener('click', () => this.toggleQuality());
    if (this.els.btnScoreboard) this.els.btnScoreboard.addEventListener('click', () => this.toggleScoreboard());
    if (this.els.minimapWrap) this.els.minimapWrap.addEventListener('click', () => this.toggleScoreboard());

    this.refreshMute();
    this.refreshQuality();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && App.game && App.game.state === 'playing') this.togglePause();
    });

    if (typeof TouchUI !== 'undefined') TouchUI.init();
  },

  /* ---------------- 加载 ---------------- */
  setLoading(p, name) {
    const el = this.els.loadFill;
    if (el) el.style.width = Math.round(clamp(p, 0, 1) * 100) + '%';
    if (this.els.loadText && name) this.els.loadText.textContent = `载入 ${name} 模型…`;
  },
  finishLoading() {
    if (this.els.loadText) this.els.loadText.textContent = '准备完成';
    if (this.els.btnStart) this.els.btnStart.disabled = false;
    this.els.loading.classList.add('done');
    setTimeout(() => this.els.loading.classList.add('hidden'), 600);
  },
  showLoadError(msg) {
    this.els.loading.classList.remove('done');
    this.els.loadText.textContent = msg;
    const hint = document.getElementById('load-hint');
    if (hint) hint.textContent = '请双击“启动游戏3D.cmd”运行（需要本地资源服务器）';
  },

  showScreen(name) {
    this.screen = name;
    for (const s of [this.els.menu, this.els.select, this.els.game]) {
      s.classList.toggle('active', s.id === 'screen-' + name);
    }
    if (name === 'select') this.enterPreview();
    else this.leavePreview();
    if (name !== 'game') {
      this.closeShop();
      this.hideScoreboard();
      this.els.pauseOverlay.classList.add('hidden');
      this.els.resultOverlay.classList.add('hidden');
    }
  },

  enterPreview() {
    if (!this.els.heroPreview) return;
    const panel = this.els.heroPreview.parentElement;
    if (!panel || panel.offsetParent === null) { this.leavePreview(); return; }
    HeroPreview.enter(this.selectedHeroId, this.els.heroPreview);
  },
  leavePreview() {
    if (typeof HeroPreview !== 'undefined') HeroPreview.leave();
  },

  refreshDifficulty() {
    if (!this.els.difficultyGroup) return;
    for (const btn of this.els.difficultyGroup.querySelectorAll('button[data-diff]')) {
      btn.classList.toggle('active', btn.dataset.diff === this.difficulty);
    }
  },

  /* ---------------- 选人 ---------------- */
  buildHeroGrid() {
    this.els.heroGrid.innerHTML = '';
    for (const h of HEROES) {
      const card = document.createElement('button');
      card.className = 'hero-card';
      card.dataset.id = h.id;
      card.style.setProperty('--c', h.color);
      card.innerHTML = `
        <div class="card-top">
          <div class="card-emblem">${this.heroFaceHTML(h)}</div>
          <div>
            <div class="card-name">${h.name}<em>${h.title}</em>${(h.id === 'frost' || h.id === 'storm') ? '<span class="new-chip">新</span>' : ''}</div>
            <span class="role-chip">${h.role}</span>
            <span class="lane-tag">${h.laneLabel}</span>
          </div>
        </div>
        <div class="card-stats">
          ${this.metaLine('生存', h.meta.survive)}
          ${this.metaLine('输出', h.meta.damage)}
          ${this.metaLine('操作', h.meta.difficulty)}
        </div>
        <p class="card-lore">${h.lore}</p>
        <div class="card-kit">${h.skills.map((s, i) => `<span><i>${['Q','W','E'][i]}</i>${s.name}</span>`).join('')}</div>
      `;
      card.addEventListener('click', () => { this.selectHero(h.id); Sfx.play('click'); });
      this.els.heroGrid.appendChild(card);
    }
  },

  metaLine(label, value) {
    let pips = '';
    for (let i = 1; i <= 5; i++) pips += `<i class="${i <= value ? 'on' : ''}"></i>`;
    return `<div class="card-stat-line"><span>${label}</span><div class="pips">${pips}</div></div>`;
  },

  selectHero(id) {
    this.selectedHeroId = id;
    safeStorageSet('shadowrift3d_hero', id);
    this.refreshSelect();
    if (this.screen === 'select') HeroPreview.show(id);
  },

  refreshSelect() {
    for (const card of this.els.heroGrid.querySelectorAll('.hero-card')) {
      card.classList.toggle('selected', card.dataset.id === this.selectedHeroId);
    }
    const h = HERO_BY_ID[this.selectedHeroId];
    const pips = (v) => {
      let out = '';
      for (let i = 1; i <= 5; i++) out += `<i class="${i <= v ? 'on' : ''}"></i>`;
      return `<div class="pips">${out}</div>`;
    };
    this.els.heroDetail.innerHTML = `
      <div class="detail-head">
        <div class="detail-emblem" style="--c:${h.color}">${this.heroFaceHTML(h)}</div>
        <div>
          <h2>${h.name}</h2>
          <p>${h.title} · ${h.role}<span class="lane-tag">${h.laneLabel}</span></p>
        </div>
      </div>
      <p class="lore">${h.lore}</p>
      <div class="detail-meta">
        <div class="meta-line"><span>生存</span>${pips(h.meta.survive)}</div>
        <div class="meta-line"><span>输出</span>${pips(h.meta.damage)}</div>
        <div class="meta-line"><span>操作</span>${pips(h.meta.difficulty)}</div>
      </div>
      <div class="detail-nums">
        <div><b>${h.hp}</b><span>生命</span></div>
        <div><b>${h.ad}</b><span>攻击</span></div>
        <div><b>${h.armor}</b><span>护甲</span></div>
        <div><b>${h.range}</b><span>射程</span></div>
      </div>
      <div class="passive-block">
        <b>被动 · ${h.passive.name}</b>
        <p>${h.passive.desc}</p>
      </div>
      ${h.skills.map((s, i) => `
        <div class="skill-row">
          <div class="skill-key">${['Q', 'W', 'E'][i]}</div>
          <div class="skill-body">
            <b>${s.name}</b>
            <p>${s.desc}</p>
            <span class="cd-info">冷却 ${s.cd}s · 法力 ${s.mana}</span>
          </div>
        </div>
      `).join('')}
      <p class="detail-note">5v5 三路 · 全部英雄与技能默认解锁</p>
    `;
    const roster = buildBlueRoster(h.id);
    const slots = roster.map(s => {
      const hero = HERO_BY_ID[s.id];
      const isPlayer = s.id === h.id;
      const laneName = s.role === 'support' ? '下路辅助' : (LANE_LABELS[s.lane] || s.lane);
      return `<span class="lineup-slot ${isPlayer ? 'player' : ''}" style="--c:${hero.color}"><i></i>${laneName} · ${hero.name}${isPlayer ? '（你）' : ''}</span>`;
    }).join('');
    this.els.lineupPreview.innerHTML = `<b>我方阵容</b>${slots}<span style="margin-left:auto;color:rgba(151,160,170,.6)">其余位置由 AI 补位 · 敌方由 AI 阵容出战</span>`;
  },

  /* ---------------- 对局开始 ---------------- */
  applyPortraits() {
    this.buildHeroGrid();
    this.refreshSelect();
    if (App.game) {
      const h = App.game.player.def;
      this.els.heroEmblem.innerHTML = this.heroFaceHTML(h);
      for (const r of this.allyRows) r.row.querySelector('.ally-face').innerHTML = this.heroFaceHTML(r.hero.def);
    }
  },

  prepareGame() {
    this.closeShop();
    this.hideScoreboard();
    document.body.classList.remove('low-hp');
    this.els.pauseOverlay.classList.add('hidden');
    this.els.resultOverlay.classList.add('hidden');
    this.els.respawnBanner.classList.add('hidden');
    this.els.toast.classList.add('hidden');
    this.els.killfeed.innerHTML = '';
    this.els.killBanner.classList.remove('show', 'bad');
    this.els.allyPanel.innerHTML = '';
    this.allyRows = [];
    this.seenFeedIds.clear();
    this.seenBannerId = null;
    this.lastToastId = null;
    this.lastShopGold = -1;
    this.scoreboardOpen = false;
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
  },

  onGameStart(game) {
    const p = game.player, h = p.def;
    this.els.heroEmblem.innerHTML = this.heroFaceHTML(h);
    this.els.heroName.textContent = h.name;
    this.els.heroRole.textContent = `${h.laneLabel} · ${h.role}`;
    this.els.heroAvatar.style.setProperty('--hero-color', h.color);
    this.els.passiveBadge.title = `被动 · ${h.passive.name}：${h.passive.desc}`;
    for (let i = 0; i < 3; i++) {
      const s = h.skills[i];
      const el = this.skillEls[i];
      el.name.textContent = s.name;
      el.mana.textContent = s.mana;
      el.cdText.textContent = '';
      el.btn.title = `${s.name}（${['Q', 'W', 'E'][i]}）\n${s.desc}\n冷却 ${s.cd}s · 法力 ${s.mana}`;
      el.btn.classList.remove('cooling', 'no-mana');
    }

    this.els.allyPanel.innerHTML = '';
    this.allyRows = [];
    const allies = game.heroes.filter(x => x.team === 'blue' && !x.isPlayer);
    for (const a of allies) {
      const row = document.createElement('div');
      row.className = 'ally-row';
      row.innerHTML = `
        <div class="ally-face" style="--c:${a.def.color}">${this.heroFaceHTML(a.def)}</div>
        <div class="ally-info">
          <div class="ally-line"><span>${a.def.name}</span><span class="ally-meta">Lv.1</span></div>
          <div class="ally-hp"><i></i></div>
        </div>`;
      this.els.allyPanel.appendChild(row);
      this.allyRows.push({ hero: a, row, meta: row.querySelector('.ally-meta'), hp: row.querySelector('.ally-hp i') });
    }

    this.els.respawnBanner.classList.add('hidden');
    this.updateGame(game);
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (touch) setTimeout(() => this.showToast(Settings.data.moveMode === 'joystick' ? '拖动摇杆移动 · 拖动技能瞄准 · 拖入取消区可中断' : '点地面移动 / 攻击 · 点技能施放 · 拖入取消区可中断'), 600);
  },

  updateGame(g) {
    const p = g.player;
    this.els.timer.textContent = fmtTime(g.time);
    this.els.scoreBlue.textContent = g.teamKills.blue;
    this.els.scoreRed.textContent = g.teamKills.red;
    this.els.gold.textContent = Math.floor(p.gold);

    this.els.hpFill.style.width = `${clamp(p.hp / p.maxHp, 0, 1) * 100}%`;
    this.els.hpText.textContent = `${Math.ceil(p.hp)} / ${Math.ceil(p.maxHp)}`;
    document.body.classList.toggle('low-hp', !p.dead && p.hp / p.maxHp < 0.3);
    this.els.manaFill.style.width = `${clamp(p.mana / p.maxMana, 0, 1) * 100}%`;
    this.els.manaText.textContent = `${Math.floor(p.mana)} / ${Math.ceil(p.maxMana)}`;
    const xpNeed = p.level >= MAX_LEVEL ? 1 : XP_TABLE[p.level];
    this.els.xpFill.style.width = `${clamp(p.xp / xpNeed, 0, 1) * 100}%`;
    this.els.heroLevel.textContent = p.level;

    for (let i = 0; i < 3; i++) {
      const s = p.def.skills[i];
      const el = this.skillEls[i];
      const cd = p.skillCd[i];
      el.btn.classList.toggle('cooling', cd > 0.05);
      el.btn.style.setProperty('--cd', cd > 0.05 ? clamp(cd / s.cd, 0, 1).toFixed(3) : '0');
      if (cd > 0.05) el.cdText.textContent = cd >= 1 ? Math.ceil(cd) : cd.toFixed(1);
      el.btn.classList.toggle('no-mana', p.mana < s.mana && cd <= 0.05);
    }

    if (p.dead) {
      this.els.respawnBanner.classList.remove('hidden');
      this.els.respawnBanner.textContent = `阵亡 · ${Math.ceil(p.deathTimer)} 秒后重生`;
    } else {
      this.els.respawnBanner.classList.add('hidden');
    }

    for (const r of this.allyRows) {
      const h = r.hero;
      r.meta.textContent = h.dead ? `${Math.ceil(h.deathTimer)}s` : `Lv.${h.level}`;
      r.row.classList.toggle('dead', h.dead);
      r.hp.style.width = `${clamp(h.hp / h.maxHp, 0, 1) * 100}%`;
    }

    const now = performance.now();
    if (!this.lastMinimapAt || now - this.lastMinimapAt > 90) {
      this.drawMinimap(g);
      this.lastMinimapAt = now;
    }

    const lastToast = g.toasts[g.toasts.length - 1];
    if (lastToast && lastToast.id !== this.lastToastId) {
      this.lastToastId = lastToast.id;
      this.showToast(lastToast.text);
    }

    for (const ev of g.feedEvents) {
      if (this.seenFeedIds.has(ev.id)) continue;
      this.seenFeedIds.add(ev.id);
      const div = document.createElement('div');
      div.className = 'feed-item';
      div.innerHTML = ev.html;
      this.els.killfeed.appendChild(div);
      while (this.els.killfeed.children.length > 6) this.els.killfeed.removeChild(this.els.killfeed.firstChild);
      setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 8000);
    }

    if (g.bannerData && g.bannerData.id !== this.seenBannerId) {
      this.seenBannerId = g.bannerData.id;
      this.showBanner(g.bannerData.text, g.bannerData.bad);
    }

    if (this.shopOpen) {
      const gi = Math.floor(p.gold);
      if (gi !== this.lastShopGold) { this.lastShopGold = gi; this.refreshShop(); }
    }

    if (this.scoreboardOpen) {
      const now = performance.now();
      if (now - this.scoreboardLastTick > 400) {
        this.scoreboardLastTick = now;
        this.renderScoreboard(g);
      }
    }
  },

  /* ---------------- 小地图 ---------------- */
  buildMinimapBase() {
    const c = document.createElement('canvas');
    c.width = c.height = 220;
    const x = c.getContext('2d');
    x.fillStyle = '#0a1310';
    x.fillRect(0, 0, 220, 220);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = `rgba(40,80,60,${0.04 + Math.random() * 0.05})`;
      x.fillRect(Math.random() * 220, Math.random() * 220, 2, 2);
    }

    const scale = 220 / 3600;
    const river = x.createLinearGradient(0, 0, 220, 220);
    river.addColorStop(0, 'rgba(30,110,135,0.25)');
    river.addColorStop(1, 'rgba(30,110,135,0.1)');
    x.save();
    x.rotate(-Math.PI / 4);
    x.fillStyle = river;
    x.fillRect(-160, 220 * Math.SQRT1_2 - 18, 620, 36);
    x.restore();

    for (const lane of ['top', 'mid', 'bot']) {
      const pts = LANE_PATHS[lane];
      x.strokeStyle = 'rgba(90,78,55,0.9)';
      x.lineWidth = 16;
      x.lineJoin = 'round';
      x.beginPath();
      pts.forEach((p, i) => {
        const px = p[0] * scale, py = p[1] * scale;
        if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
      });
      x.stroke();
      x.strokeStyle = 'rgba(190,165,115,0.18)';
      x.lineWidth = 1.5;
      x.stroke();
    }

    const drawBase = (p, color) => {
      x.save();
      x.translate(p.x * scale, p.y * scale);
      x.rotate(Math.PI / 4);
      x.fillStyle = color;
      x.fillRect(-7, -7, 14, 14);
      x.strokeStyle = 'rgba(255,255,255,0.5)';
      x.lineWidth = 1;
      x.strokeRect(-7, -7, 14, 14);
      x.restore();
    };
    drawBase(MAP3.baseBlue, 'rgba(74,168,255,0.85)');
    drawBase(MAP3.baseRed, 'rgba(255,92,92,0.85)');
    return c;
  },

  drawMinimap(g) {
    const cv = this.els.minimap;
    if (!cv || !this.mmBase) return;
    const x = cv.getContext('2d');
    x.clearRect(0, 0, 220, 220);
    x.drawImage(this.mmBase, 0, 0);
    const scale = 220 / 3600;
    const dot = (px, py, r, color) => {
      x.fillStyle = color;
      x.beginPath();
      x.arc(px * scale, py * scale, r, 0, TAU);
      x.fill();
    };

    for (const team of ['blue', 'red']) {
      for (const s of g.structuresOf(team)) {
        if (s.kind === 'tower') {
          x.fillStyle = s.alive ? (team === 'blue' ? '#6fb8ff' : '#ff7a7a') : 'rgba(90,90,90,0.5)';
          x.fillRect(s.x * scale - 2.5, s.y * scale - 2.5, 5, 5);
          if (!s.alive) {
            x.strokeStyle = 'rgba(0,0,0,0.6)';
            x.beginPath(); x.moveTo(s.x * scale - 2, s.y * scale - 2); x.lineTo(s.x * scale + 2, s.y * scale + 2); x.stroke();
          }
        }
      }
    }

    x.strokeStyle = 'rgba(255,180,90,0.7)';
    x.lineWidth = 1.5;
    const ep = g.epicCamp;
    x.beginPath();
    x.arc(ep.x * scale, ep.y * scale, 5, 0, TAU);
    x.stroke();

    for (const u of g.units) {
      if (u.type === 'minion' && u.alive) {
        dot(u.x, u.y, 1.3, u.team === 'blue' ? 'rgba(90,170,255,0.75)' : 'rgba(255,110,110,0.75)');
      } else if (u.type === 'monster' && u.alive) {
        dot(u.x, u.y, u.kind === 'epic' ? 4 : 2.2, 'rgba(255,190,100,0.8)');
      }
    }
    for (const h of g.heroes) {
      if (h.dead) continue;
      const isP = h.isPlayer;
      if (h.team === 'blue') dot(h.x, h.y, isP ? 4.8 : 3.8, isP ? '#ffe066' : '#6fb8ff');
      else dot(h.x, h.y, 3.8, '#ff7070');
      if (isP) {
        x.strokeStyle = 'rgba(255,224,102,0.9)';
        x.lineWidth = 1.5;
        x.beginPath();
        x.arc(h.x * scale, h.y * scale, 6.5, 0, TAU);
        x.stroke();
      }
    }

    const v = App.view;
    if (v && g.player && !g.player.dead) {
      x.strokeStyle = 'rgba(255,255,255,0.18)';
      x.lineWidth = 1;
      const cw = 60, ch = 40;
      x.strokeRect(110 - cw / 2, 110 - ch / 2, cw, ch);
    }
  },

  /* ---------------- 商店 / 暂停 / 声音 ---------------- */
  toggleShop(force) {
    const g = App.game;
    if (!g) return;
    if (g.state !== 'playing') { this.closeShop(); return; }
    const open = typeof force === 'boolean' ? force : !this.shopOpen;
    this.shopOpen = open;
    if (open) {
      this.buildShopItems();
      this.refreshShop();
      this.lastShopGold = Math.floor(g.player.gold);
      this.els.shopPanel.classList.remove('hidden');
      Sfx.play('click');
    } else {
      this.els.shopPanel.classList.add('hidden');
    }
  },
  closeShop() {
    this.shopOpen = false;
    this.els.shopPanel.classList.add('hidden');
  },
  buildShopItems() {
    this.els.shopItems.innerHTML = '';
    this.shopEls = [];
    SHOP_ITEMS.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'shop-item';
      row.innerHTML = `
        <div class="icon">${item.icon}</div>
        <div class="info">
          <b>${item.name}</b>
          <p>${item.desc}</p>
          <div class="own">已持有 0 / 5</div>
        </div>
        <button class="buy">-</button>`;
      const buyBtn = row.querySelector('.buy');
      buyBtn.addEventListener('click', () => {
        const g = App.game;
        if (!g) return;
        const res = g.buyItem(g.player, idx);
        if (!res.ok) {
          if (res.reason === 'gold') g.toast('金币不足');
          else if (res.reason === 'max') g.toast('该升级已满级');
        }
        this.refreshShop();
      });
      this.els.shopItems.appendChild(row);
      this.shopEls.push({ own: row.querySelector('.own'), buy: buyBtn });
    });
  },
  refreshShop() {
    const g = App.game;
    if (!g) return;
    const p = g.player;
    this.els.shopGold.textContent = `金币 ${Math.floor(p.gold)}`;
    SHOP_ITEMS.forEach((item, i) => {
      const count = p.shopCounts[item.id];
      const el = this.shopEls[i];
      if (!el) return;
      el.own.textContent = `已持有 ${count} / 5`;
      if (count >= 5) { el.buy.textContent = '已满级'; el.buy.disabled = true; }
      else {
        const cost = item.costs[count];
        el.buy.textContent = `${cost} 金币`;
        el.buy.disabled = p.gold < cost;
      }
    });
  },

  togglePause() {
    const g = App.game;
    if (!g) return;
    if (g.state === 'playing') {
      g.state = 'paused';
      this.closeShop();
      this.hideScoreboard();
      this.els.pauseOverlay.classList.remove('hidden');
      Sfx.play('click');
    } else if (g.state === 'paused') {
      g.state = 'playing';
      this.els.pauseOverlay.classList.add('hidden');
      Sfx.play('click');
    }
  },

  toggleMute() {
    Sfx.enabled = !Sfx.enabled;
    safeStorageSet('shadowrift3d_muted', Sfx.enabled ? '0' : '1');
    if (Sfx.enabled) { Sfx.init(); Sfx.play('click'); }
    this.refreshMute();
  },
  refreshMute() {
    this.els.btnMute.textContent = Sfx.enabled ? '音效' : '静音';
    this.els.btnSound.textContent = `音效：${Sfx.enabled ? '开' : '关'}`;
  },

  toggleQuality() {
    const v = App.view;
    if (!v) return;
    const low = !v.lowQuality;
    v.lowQuality = low;
    v.renderer.shadowMap.enabled = !low;
    v.moon.castShadow = !low;
    v.renderer.setPixelRatio(low ? Math.min(1.0, window.devicePixelRatio || 1) : Math.min(1.6, window.devicePixelRatio || 1));
    v.scene.traverse(o => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { m.needsUpdate = true; });
      }
    });
    v.resize();
    this.refreshQuality();
    this.showToast(low ? '已切换到流畅画质' : '已切换到高清画质');
    Sfx.play('click');
  },

  refreshQuality() {
    if (!this.els.btnQuality) return;
    this.els.btnQuality.textContent = `画质：${App.view && App.view.lowQuality ? '流畅' : '高清'}`;
  },

  /* ---------------- 记分板 / 播报 ---------------- */
  showScoreboard() {
    if (!App.game) return;
    this.scoreboardOpen = true;
    this.scoreboardLastTick = 0;
    this.renderScoreboard(App.game);
    this.els.scoreboard.classList.remove('hidden');
    if (this.sbAutoTimer) clearTimeout(this.sbAutoTimer);
    this.sbAutoTimer = setTimeout(() => { if (this.scoreboardOpen) this.hideScoreboard(); }, 7000);
  },
  hideScoreboard() {
    this.scoreboardOpen = false;
    if (this.sbAutoTimer) clearTimeout(this.sbAutoTimer);
    this.els.scoreboard.classList.add('hidden');
  },
  toggleScoreboard() {
    if (!App.game) return;
    if (this.scoreboardOpen) this.hideScoreboard();
    else { this.showScoreboard(); Sfx.play('click'); }
  },
  renderScoreboard(g) {
    const row = (h) => {
      const dead = h.dead ? ' dead' : '';
      const you = h.isPlayer ? ' you' : '';
      const lane = h.role === 'jungle' ? '打野' : (h.role === 'support' ? '辅助' : (LANE_LABELS[h.lane] || h.lane));
      return `<tr class="${dead}${you}">
        <td><span class="sb-hero"><i style="--c:${h.def.color}${this.heroPortrait(h.def) ? `;background-image:url('${this.heroPortrait(h.def)}')` : ''}"></i>${h.def.name}<em>${lane}</em></span></td>
        <td>${h.level}</td>
        <td>${h.kills}/${h.deaths}</td>
        <td>${h.minionKills}</td>
        <td>${Math.floor(h.gold)}</td>
        <td>${h.isPlayer ? '你' : (h.isAI ? 'AI' : '')}</td>
      </tr>`;
    };
    const table = (team) => `<table class="sb-table">
      <thead><tr><th>英雄</th><th>等级</th><th>K/D</th><th>补兵</th><th>金币</th><th></th></tr></thead>
      <tbody>${g.heroes.filter(h => h.team === team).map(row).join('')}</tbody>
    </table>`;
    this.els.scoreboardBody.innerHTML = `
      <div class="sb-team blue"><h4>蓝方 · ${g.teamKills.blue} 击杀</h4>${table('blue')}</div>
      <div class="sb-team red"><h4>红方 · ${g.teamKills.red} 击杀</h4>${table('red')}</div>
    `;
  },

  showToast(text) {
    const el = this.els.toast;
    el.textContent = text;
    el.classList.remove('hidden');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
  },
  showBanner(text, bad) {
    const el = this.els.killBanner;
    el.textContent = text;
    el.classList.toggle('bad', !!bad);
    el.classList.add('show');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => el.classList.remove('show'), 2000);
  },

  /* ---------------- 结算 ---------------- */
  showResult(result, stats) {
    this.closeShop();
    this.hideScoreboard();
    document.body.classList.remove('low-hp');
    this.els.pauseOverlay.classList.add('hidden');
    this.els.resultCard.classList.toggle('lose', result === 'lose');
    this.els.resultTitle.textContent = result === 'win' ? '胜利' : '失败';
    this.els.resultSub.textContent = `${stats.heroName} · ${stats.heroTitle} · 对局 ${fmtTime(stats.duration)} · 团队击杀 ${stats.teamKills} : ${stats.enemyKills}${stats.mvp ? ' · 全场 MVP' : ''}`;
    const cells = [
      [`Lv.${stats.level}`, '等级'],
      [String(stats.kills), '击杀'],
      [String(stats.deaths), '阵亡'],
      [String(stats.minions), '补兵'],
      [String(stats.gold), '总金币'],
      [String(stats.damage), '输出伤害'],
      [`${stats.damageShare}%`, '团队占比'],
      [fmtTime(stats.duration), '对局时长']
    ];
    this.els.resultStats.innerHTML = cells.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    this.els.resultOverlay.classList.remove('hidden');
  },

  resetGameUI() {
    this.closeShop();
    this.hideScoreboard();
    document.body.classList.remove('low-hp');
    this.els.pauseOverlay.classList.add('hidden');
    this.els.resultOverlay.classList.add('hidden');
    this.els.respawnBanner.classList.add('hidden');
    this.els.toast.classList.add('hidden');
    this.els.killfeed.innerHTML = '';
    this.els.killBanner.classList.remove('show');
    this.els.allyPanel.innerHTML = '';
    this.allyRows = [];
  }
};

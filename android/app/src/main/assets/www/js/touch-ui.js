'use strict';

const TouchUI = {
  els: {},
  isTouch: false,
  joystickPointer: null,
  skillDrag: null,
  settingsOpen: false,
  fpsFrames: 0,
  fpsLastAt: 0,

  init() {
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || /Android/i.test(navigator.userAgent);
    UI.isTouch = this.isTouch;
    this.els = {
      joystick: document.getElementById('joystick'),
      knob: document.getElementById('joystick-knob'),
      attack: document.getElementById('btn-attack'),
      fps: document.getElementById('fps-meter'),
      settingsOverlay: document.getElementById('settings-overlay'),
      settingsBody: document.getElementById('settings-body'),
      btnSettingsMenu: document.getElementById('btn-settings-menu'),
      btnSettingsSelect: document.getElementById('btn-settings-select'),
      btnSettingsPause: document.getElementById('btn-settings-pause'),
      btnSettingsClose: document.getElementById('btn-settings-close'),
      btnSettingsDone: document.getElementById('btn-settings-done'),
      btnSettingsReset: document.getElementById('btn-settings-reset'),
      skillCancel: document.getElementById('skill-cancel'),
      skillCancelLabel: document.querySelector('#skill-cancel .skill-cancel-label'),
      layoutEditor: document.getElementById('layout-editor'),
      btnLayoutDone: document.getElementById('btn-layout-done'),
      btnLayoutReset: document.getElementById('btn-layout-reset')
    };
    this.patchUI();
    this.bindSettingsButtons();
    this.bindLayoutEditor();
    this.bindJoystick();
    this.bindAttack();
    this.bindSkills();
    this.bindKeyboard();
    UI.settingsOpen = false;
    Settings.apply();
    this.refreshMute();
    this.refreshQuality();
  },

  patchUI() {
    if (this.patched) return;
    this.patched = true;
    const bind = (fn) => fn.bind(UI);
    const origPrepare = bind(UI.prepareGame);
    UI.prepareGame = () => { this.cancelControls(); origPrepare(); };
    const origResult = bind(UI.showResult);
    UI.showResult = (result, stats) => { this.cancelControls(); this.closeSettings(); origResult(result, stats); };
    const origShow = bind(UI.showScreen);
    UI.showScreen = (name) => { if (name !== 'select' || !this.settingsOpen) this.closeSettings(); origShow(name); };
    const origPause = bind(UI.togglePause);
    UI.togglePause = () => { this.cancelControls(); origPause(); };
    const origStart = bind(UI.onGameStart);
    UI.onGameStart = (game) => { this.cancelControls(); origStart(game); Settings.apply(); };
    const origUpdate = bind(UI.updateGame);
    UI.updateGame = (game) => { origUpdate(game); this.tickFps(); };
    UI.toggleMute = () => this.toggleMute();
    UI.refreshMute = () => this.refreshMute();
    UI.toggleQuality = () => this.toggleQuality();
    UI.refreshQuality = () => this.refreshQuality();
    UI.openSettings = () => this.openSettings();
    UI.closeSettings = () => this.closeSettings();
  },

  toggleMute() {
    const next = !Settings.data.soundOn;
    Settings.set('soundOn', next);
    if (next) { Sfx.init(); Sfx.play('click'); }
    this.refreshMute();
  },
  refreshMute() {
    const on = !!Settings.data.soundOn;
    if (UI.els.btnMute) UI.els.btnMute.textContent = on ? '音效' : '静音';
    if (UI.els.btnSound) UI.els.btnSound.textContent = `音效：${on ? '开' : '关'}`;
  },
  toggleQuality() {
    const next = Settings.data.graphics === 'hd' ? 'smooth' : 'hd';
    Settings.set('graphics', next);
    UI.showToast(next === 'hd' ? '已切换到高清画质' : '已切换到流畅画质');
    Sfx.play('click');
    this.refreshQuality();
  },
  refreshQuality() {
    if (UI.els.btnQuality) UI.els.btnQuality.textContent = `画质：${Settings.data.graphics === 'hd' ? '高清' : '流畅'}`;
  },

  /* ---------------- 设置 ---------------- */
  bindSettingsButtons() {
    const open = (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } this.openSettings(); };
    [this.els.btnSettingsMenu, this.els.btnSettingsSelect, this.els.btnSettingsPause].forEach(b => {
      if (b) b.addEventListener('click', open);
    });
    if (this.els.btnSettingsClose) this.els.btnSettingsClose.addEventListener('click', () => this.closeSettings());
    if (this.els.btnSettingsDone) this.els.btnSettingsDone.addEventListener('click', () => this.closeSettings());
    if (this.els.btnSettingsReset) this.els.btnSettingsReset.addEventListener('click', () => {
      Settings.reset();
      this.buildSettings();
      UI.showToast('设置已恢复默认');
      Sfx.play('click');
    });
    if (this.els.btnLayoutDone) this.els.btnLayoutDone.addEventListener('click', () => this.closeLayoutEditor());
    if (this.els.btnLayoutReset) this.els.btnLayoutReset.addEventListener('click', () => {
      Settings.resetLayout();
      UI.showToast('按键位置已重置');
      Sfx.play('click');
    });
  },

  openSettings() {
    if (!this.els.settingsOverlay) return;
    this.cancelControls();
    this.closeLayoutEditor(false);
    const g = App.game;
    if (g && g.state === 'playing') UI.togglePause();
    this.settingsOpen = true;
    UI.settingsOpen = true;
    this.buildSettings();
    this.els.settingsOverlay.classList.remove('hidden');
  },

  closeSettings() {
    this.closeLayoutEditor(false);
    this.settingsOpen = false;
    UI.settingsOpen = false;
    if (this.els.settingsOverlay) this.els.settingsOverlay.classList.add('hidden');
  },

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (this.layoutEditing && e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.closeLayoutEditor();
        return;
      }
      if (this.settingsOpen && e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.closeSettings();
      }
    }, true);
  },

  buildSettings() {
    const body = this.els.settingsBody;
    if (!body) return;
    body.innerHTML = '';
    const sections = [
      {
        title: '操作', items: [
          { key: 'moveMode', label: '移动方式', type: 'seg', options: [['joystick', '虚拟摇杆'], ['tap', '点触移动']] },
          { key: 'joySize', label: '摇杆大小', type: 'range', min: 100, max: 190, step: 2, unit: 'px' },
          { key: 'joyOpacity', label: '摇杆透明度', type: 'range', min: 30, max: 100, step: 5, unit: '%' },
          { key: 'skillSize', label: '技能键大小', type: 'range', min: 46, max: 80, step: 2, unit: 'px' },
          { key: 'skillOpacity', label: '技能键透明度', type: 'range', min: 40, max: 100, step: 5, unit: '%' },
          { key: 'attackSize', label: '普攻键大小', type: 'range', min: 72, max: 120, step: 2, unit: 'px' },
          { key: 'customLayout', label: '自定义按键位置', type: 'action', hint: '进入对局后可拖动调整摇杆 / 技能区 / 普攻键' },
          { key: 'leftHand', label: '左手模式', type: 'toggle', hint: '摇杆与技能区左右互换' },
          { key: 'quickCast', label: '快速施法', type: 'toggle', hint: '关闭后需要拖动技能键瞄准' },
          { key: 'autoAttack', label: '自动普攻', type: 'toggle' },
          { key: 'showAttackButton', label: '显示普攻键', type: 'toggle' },
          { key: 'cameraZoom', label: '镜头缩放', type: 'range', min: 75, max: 125, step: 5, unit: '%' }
        ]
      },
      {
        title: '画面', items: [
          { key: 'graphics', label: '画质', type: 'seg', options: [['smooth', '流畅'], ['hd', '高清']] },
          { key: 'renderScale', label: '渲染分辨率', type: 'range', min: 70, max: 100, step: 5, unit: '%' },
          { key: 'fpsLimit', label: '帧率上限', type: 'seg', options: [[30, '30'], [60, '60'], [0, '不限']] },
          { key: 'showFps', label: '显示 FPS', type: 'toggle' },
          { key: 'heroRim', label: '角色轮廓光', type: 'toggle' },
          { key: 'damageNumbers', label: '伤害飘字', type: 'toggle' },
          { key: 'screenShake', label: '屏幕震动', type: 'toggle' },
          { key: 'minimapScale', label: '小地图缩放', type: 'range', min: 80, max: 120, step: 5, unit: '%' }
        ]
      },
      {
        title: '界面', items: [
          { key: 'showAllyPanel', label: '显示队友面板', type: 'toggle' },
          { key: 'forceTouch', label: '强制触屏控件', type: 'toggle', hint: 'PC/模拟器也显示摇杆与轮盘' }
        ]
      },
      {
        title: '音效', items: [
          { key: 'soundOn', label: '音效开关', type: 'toggle' },
          { key: 'volume', label: '音量', type: 'range', min: 0, max: 100, step: 5, unit: '%' }
        ]
      }
    ];

    for (const section of sections) {
      const sec = document.createElement('div');
      sec.className = 'settings-section';
      const h = document.createElement('h3');
      h.textContent = section.title;
      sec.appendChild(h);
      for (const item of section.items) sec.appendChild(this.buildSettingRow(item));
      body.appendChild(sec);
    }
  },

  buildSettingRow(item) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const left = document.createElement('div');
    left.innerHTML = `<span class="setting-label">${item.label}</span>${item.hint ? `<span class="setting-hint">${item.hint}</span>` : ''}`;
    row.appendChild(left);
    const control = document.createElement('div');
    control.className = 'setting-control';
    const value = Settings.data[item.key];

    if (item.type === 'toggle') {
      const sw = document.createElement('button');
      sw.className = 'switch' + (value ? ' on' : '');
      sw.setAttribute('aria-pressed', value ? 'true' : 'false');
      sw.addEventListener('click', () => {
        Settings.set(item.key, !Settings.data[item.key]);
        const on = !!Settings.data[item.key];
        sw.classList.toggle('on', on);
        sw.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (item.key === 'forceTouch' && !Settings.touchLayout) this.cancelControls();
      });
      control.appendChild(sw);
    } else if (item.type === 'range') {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = item.min;
      input.max = item.max;
      input.step = item.step;
      input.value = value;
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = `${value}${item.unit || ''}`;
      input.addEventListener('input', () => {
        const v = Number(input.value);
        val.textContent = `${v}${item.unit || ''}`;
        Settings.set(item.key, v);
      });
      control.appendChild(input);
      control.appendChild(val);
    } else if (item.type === 'seg') {
      const wrap = document.createElement('div');
      wrap.className = 'segmented';
      for (const [v, label] of item.options) {
        const b = document.createElement('button');
        b.textContent = label;
        b.classList.toggle('active', String(Settings.data[item.key]) === String(v));
        b.addEventListener('click', () => {
          Settings.set(item.key, v);
          for (const sib of wrap.children) sib.classList.toggle('active', sib === b);
        });
        wrap.appendChild(b);
      }
      control.appendChild(wrap);
    } else if (item.type === 'action') {
      const b = document.createElement('button');
      b.className = 'setting-action';
      b.textContent = '调整';
      b.addEventListener('click', () => {
        if (typeof App === 'undefined' || !App.game) {
          UI.showToast('进入对局后可调整按键位置');
          return;
        }
        this.openLayoutEditor();
      });
      control.appendChild(b);
    }
    row.appendChild(control);
    return row;
  },

  /* ---------------- 自定义按键位置 ---------------- */
  bindLayoutEditor() {
    const down = (e) => this.layoutPointerDown(e);
    const move = (e) => this.layoutPointerMove(e);
    const up = (e) => this.layoutPointerUp(e);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    document.addEventListener('click', (e) => {
      if (!this.layoutEditing) return;
      if (e.target && e.target.closest && e.target.closest('.layout-bar')) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  },

  openLayoutEditor() {
    if (!this.els.layoutEditor) return;
    if (!Settings.touchLayout) { UI.showToast('请先开启强制触屏控件'); return; }
    if (!App.game) { UI.showToast('进入对局后可调整按键位置'); return; }
    this.cancelControls();
    if (App.game.state === 'playing') UI.togglePause();
    this.layoutEditing = true;
    this.layoutDrag = null;
    this.settingsOpen = true;
    UI.settingsOpen = true;
    if (this.els.settingsOverlay) this.els.settingsOverlay.classList.add('hidden');
    this.els.layoutEditor.classList.remove('hidden');
    document.body.classList.add('layout-editing');
  },

  closeLayoutEditor(backToSettings = true) {
    this.layoutEditing = false;
    this.layoutDrag = null;
    document.body.classList.remove('layout-editing');
    if (this.els.layoutEditor) this.els.layoutEditor.classList.add('hidden');
    if (backToSettings && this.settingsOpen && this.els.settingsOverlay) {
      this.els.settingsOverlay.classList.remove('hidden');
    }
  },

  layoutPointerDown(e) {
    if (!this.layoutEditing) return;
    const target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('.layout-bar')) return;
    const attack = target.closest('#btn-attack');
    const joy = attack ? null : target.closest('#joystick');
    const dock = attack || joy ? null : target.closest('.skill-dock');
    if (!attack && !joy && !dock) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const part = attack ? 'attack' : joy ? 'joy' : 'skills';
    const el = attack || joy || dock;
    const r = el.getBoundingClientRect();
    const offsets = part === 'joy'
      ? [Settings.data.joyOffsetX, Settings.data.joyOffsetY]
      : part === 'skills'
        ? [Settings.data.skillOffsetX, Settings.data.skillOffsetY]
        : [Settings.data.attackOffsetX, Settings.data.attackOffsetY];
    this.layoutDrag = {
      part, el, pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      offsetX: offsets[0], offsetY: offsets[1],
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
    e.stopPropagation();
  },

  layoutPointerMove(e) {
    const d = this.layoutDrag;
    if (!d || d.pointerId !== e.pointerId) return;
    const margin = 2;
    let dx = e.clientX - d.startX;
    let dy = e.clientY - d.startY;
    dx = clamp(dx, margin - d.rect.left, innerWidth - margin - d.rect.right);
    dy = clamp(dy, margin - d.rect.top, innerHeight - margin - d.rect.bottom);
    Settings.setLayoutOffsets(d.part, d.offsetX + dx, d.offsetY + dy);
    e.preventDefault();
    e.stopPropagation();
  },

  layoutPointerUp(e) {
    const d = this.layoutDrag;
    if (!d || d.pointerId !== e.pointerId) return;
    this.layoutDrag = null;
    Settings.save();
    try { d.el.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
    e.stopPropagation();
  },

  /* ---------------- 摇杆 ---------------- */
  bindJoystick() {
    const joy = this.els.joystick;
    const knob = this.els.knob;
    if (!joy || !knob) return;
    let pointerId = null;
    const update = (e) => {
      const r = joy.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      const max = r.width * 0.34;
      const k = len > 0 ? Math.min(1, len / max) : 0;
      if (len > 0) { dx /= len; dy /= len; }
      knob.style.transform = `translate(${dx * max * k}px, ${dy * max * k}px)`;
      const g = App.game;
      if (g) g.setJoystick(dx * k, dy * k);
    };
    const end = () => {
      pointerId = null;
      knob.style.transform = '';
      if (App.game) App.game.setJoystick(0, 0);
    };
    joy.addEventListener('pointerdown', (e) => {
      if (!Settings.touchLayout || Settings.data.moveMode !== 'joystick') return;
      const g = App.game;
      if (!g || g.state !== 'playing' || !g.player || g.player.dead) return;
      pointerId = e.pointerId;
      try { joy.setPointerCapture(pointerId); } catch (err) { /* ignore */ }
      update(e);
      e.preventDefault();
      e.stopPropagation();
    });
    joy.addEventListener('pointermove', (e) => {
      if (pointerId !== e.pointerId) return;
      update(e);
      e.preventDefault();
      e.stopPropagation();
    });
    joy.addEventListener('pointerup', (e) => {
      if (pointerId !== e.pointerId) return;
      end();
      e.preventDefault();
      e.stopPropagation();
    });
    joy.addEventListener('pointercancel', end);
    joy.addEventListener('lostpointercapture', end);
  },

  /* ---------------- 普攻 ---------------- */
  bindAttack() {
    const btn = this.els.attack;
    if (!btn) return;
    const act = (e) => {
      const g = App.game;
      if (!g || g.state !== 'playing' || !g.player || g.player.dead) return;
      g.playerAttackNearest();
      e.preventDefault();
      e.stopPropagation();
    };
    btn.addEventListener('pointerdown', act);
  },

  /* ---------------- 技能拖动/快速施法 ---------------- */
  bindSkills() {
    for (const s of UI.skillEls) {
      const btn = s.btn;
      const index = Number(btn.dataset.skill);
      btn.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const g = App.game;
        if (!g || g.state !== 'playing' || !g.player || g.player.dead) return;
        const p = g.player;
        const skill = p.def.skills[index];
        if (!skill) return;
        if (p.skillCd[index] > 0) return;
        if (p.mana < skill.mana) { g.toast('法力不足'); g.sfx('deny'); return; }
        if (!g.beginSkillAim(index)) return;
        this.skillDrag = { index, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, cancel: false, btn };
        this.hideSkillCancel();
        btn.classList.add('dragging');
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener('pointermove', (e) => {
        const d = this.skillDrag;
        if (!d || d.pointerId !== e.pointerId) return;
        const g = App.game;
        if (!g) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        const len = Math.hypot(dx, dy);
        if (len > 7) d.moved = true;
        if (d.moved) {
          if (!this.els.skillCancel.classList.contains('show')) this.showSkillCancel();
          const cancel = this.isInsideSkillCancel(e.clientX, e.clientY);
          if (cancel !== d.cancel) {
            d.cancel = cancel;
            this.setSkillCancelArmed(cancel);
          }
        }
        const p = g.player;
        const skill = p.def.skills[d.index];
        if (d.moved && skill.range > 0) {
          const nx = dx / len;
          const ny = dy / len;
          const distance = Math.min(skill.range, Math.max(skill.range * 0.12, len * 2.1));
          g.setSkillAim(p.x + nx * distance, p.y + ny * distance, d.index);
        }
        e.preventDefault();
        e.stopPropagation();
      });
      const finish = (e, cast) => {
        const d = this.skillDrag;
        if (!d || d.pointerId !== e.pointerId) return;
        this.skillDrag = null;
        d.btn.classList.remove('dragging');
        this.hideSkillCancel();
        const g = App.game;
        if (g && cast && d.cancel) {
          g.endSkillAim();
          g.toast('已取消施法');
          g.sfx('cancel');
        } else if (g && cast && g.state === 'playing' && g.player && !g.player.dead) {
          const p = g.player;
          const skill = p.def.skills[d.index];
          if (skill.range > 0) {
            let aim = null;
            if (d.moved) aim = { x: g.aimX, y: g.aimY };
            else if (Settings.data.quickCast) aim = g.quickAim(d.index);
            g.endSkillAim();
            if (aim) p.tryCast(d.index, aim.x, aim.y);
            else g.toast('拖动技能键瞄准');
          } else {
            g.endSkillAim();
            p.tryCast(d.index);
          }
        } else if (g) {
          g.endSkillAim();
        }
        try { d.btn.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
        e.stopPropagation();
      };
      btn.addEventListener('pointerup', (e) => finish(e, true));
      btn.addEventListener('pointercancel', (e) => finish(e, false));
      btn.addEventListener('lostpointercapture', (e) => {
        const d = this.skillDrag;
        if (d && d.pointerId === e.pointerId) {
          this.skillDrag = null;
          d.btn.classList.remove('dragging');
          this.hideSkillCancel();
          if (App.game) App.game.endSkillAim();
        }
      });
    }
  },

  showSkillCancel() {
    if (!this.els.skillCancel) return;
    this.els.skillCancel.classList.add('show');
    this.els.skillCancel.setAttribute('aria-hidden', 'false');
  },

  hideSkillCancel() {
    if (!this.els.skillCancel) return;
    this.els.skillCancel.classList.remove('show', 'armed');
    this.els.skillCancel.setAttribute('aria-hidden', 'true');
    if (this.els.skillCancelLabel) this.els.skillCancelLabel.textContent = '拖到此处取消';
  },

  setSkillCancelArmed(on) {
    if (!this.els.skillCancel) return;
    this.els.skillCancel.classList.toggle('armed', !!on);
    if (this.els.skillCancelLabel) this.els.skillCancelLabel.textContent = on ? '松开取消施法' : '拖到此处取消';
  },

  isInsideSkillCancel(x, y) {
    if (!this.els.skillCancel || !this.els.skillCancel.classList.contains('show')) return false;
    const r = this.els.skillCancel.getBoundingClientRect();
    const pad = 10;
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  },

  cancelSkillAim() {
    const g = App.game;
    if (!this.skillDrag && !(g && g.skillAiming)) return false;
    this.hideSkillCancel();
    const d = this.skillDrag;
    this.skillDrag = null;
    if (d) { d.btn.classList.remove('dragging'); try { d.btn.releasePointerCapture(d.pointerId); } catch (err) { /* ignore */ } }
    if (g) {
      g.endSkillAim();
      g.toast('已取消施法');
      g.sfx('cancel');
    }
    return true;
  },

  cancelControls() {
    this.hideSkillCancel();
    if (this.joystickPointer !== null) {
      this.joystickPointer = null;
    }
    if (this.els.knob) this.els.knob.style.transform = '';
    if (App.game) App.game.setJoystick(0, 0);
    if (this.skillDrag) {
      const d = this.skillDrag;
      this.skillDrag = null;
      d.btn.classList.remove('dragging');
      if (App.game) App.game.endSkillAim();
      try { d.btn.releasePointerCapture(d.pointerId); } catch (e) { /* ignore */ }
    } else if (App.game && App.game.skillAiming) {
      App.game.endSkillAim();
    }
  },

  tickFps() {
    this.fpsFrames++;
    const now = performance.now();
    if (!this.fpsLastAt) this.fpsLastAt = now;
    if (now - this.fpsLastAt >= 500) {
      const fps = Math.round(this.fpsFrames * 1000 / (now - this.fpsLastAt));
      if (this.els.fps) this.els.fps.textContent = `${fps} FPS`;
      this.fpsFrames = 0;
      this.fpsLastAt = now;
    }
  }
};

window.TouchUI = TouchUI;

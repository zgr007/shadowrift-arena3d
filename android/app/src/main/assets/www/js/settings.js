'use strict';

const Settings = {
  KEY: 'shadowrift3d_settings_v2',
  defaults: {
    moveMode: 'joystick',
    joySize: 140,
    joyOpacity: 80,
    skillSize: 58,
    skillOpacity: 95,
    attackSize: 94,
    leftHand: false,
    quickCast: true,
    autoAttack: true,
    showAttackButton: true,
    cameraZoom: 90,
    graphics: 'smooth',
    renderScale: 90,
    fpsLimit: 60,
    showFps: false,
    damageNumbers: true,
    screenShake: true,
    showAllyPanel: true,
    minimapScale: 100,
    soundOn: true,
    volume: 70,
    forceTouch: false,
    joyOffsetX: 0,
    joyOffsetY: 0,
    skillOffsetX: 0,
    skillOffsetY: 0,
    attackOffsetX: 0,
    attackOffsetY: 0
  },
  data: {},
  lastGraphics: null,

  load() {
    let stored = {};
    try { stored = JSON.parse(safeStorageGet(this.KEY, '{}')) || {}; } catch (e) { stored = {}; }
    this.data = { ...this.defaults, ...stored };
    for (const k of Object.keys(this.defaults)) {
      if (typeof this.defaults[k] === 'number' && typeof this.data[k] !== 'number') this.data[k] = this.defaults[k];
      if (typeof this.defaults[k] === 'boolean' && typeof this.data[k] !== 'boolean') this.data[k] = this.defaults[k];
    }
  },

  save() {
    safeStorageSet(this.KEY, JSON.stringify(this.data));
  },

  set(key, value) {
    if (key === 'leftHand' && !!value !== !!this.data.leftHand) {
      for (const k of ['joyOffsetX', 'skillOffsetX', 'attackOffsetX']) {
        this.data[k] = -(Number(this.data[k]) || 0);
      }
    }
    this.data[key] = value;
    this.save();
    this.apply();
  },

  reset() {
    this.data = { ...this.defaults };
    this.lastGraphics = null;
    this.lastRenderScale = null;
    this.save();
    this.apply();
  },

  get touchLayout() {
    return (typeof UI !== 'undefined' && UI.isTouch) || !!this.data.forceTouch;
  },

  applyLayout() {
    const d = this.data;
    const root = document.documentElement;
    root.style.setProperty('--joy-off-x', clamp(Number(d.joyOffsetX) || 0, -400, 400) + 'px');
    root.style.setProperty('--joy-off-y', clamp(Number(d.joyOffsetY) || 0, -400, 400) + 'px');
    root.style.setProperty('--skill-off-x', clamp(Number(d.skillOffsetX) || 0, -500, 500) + 'px');
    root.style.setProperty('--skill-off-y', clamp(Number(d.skillOffsetY) || 0, -400, 400) + 'px');
    root.style.setProperty('--attack-off-x', clamp(Number(d.attackOffsetX) || 0, -500, 500) + 'px');
    root.style.setProperty('--attack-off-y', clamp(Number(d.attackOffsetY) || 0, -400, 400) + 'px');
  },

  setLayoutOffsets(part, x, y, commit) {
    const map = {
      joy: ['joyOffsetX', 'joyOffsetY'],
      skills: ['skillOffsetX', 'skillOffsetY'],
      attack: ['attackOffsetX', 'attackOffsetY']
    };
    const keys = map[part];
    if (!keys) return;
    this.data[keys[0]] = Math.round(x);
    this.data[keys[1]] = Math.round(y);
    this.applyLayout();
    if (commit) this.save();
  },

  resetLayout() {
    this.data.joyOffsetX = 0;
    this.data.joyOffsetY = 0;
    this.data.skillOffsetX = 0;
    this.data.skillOffsetY = 0;
    this.data.attackOffsetX = 0;
    this.data.attackOffsetY = 0;
    this.save();
    this.applyLayout();
  },

  apply() {
    const d = this.data;
    const body = document.body;
    if (body) {
      body.classList.toggle('touch-ui', this.touchLayout);
      body.classList.toggle('left-hand', !!d.leftHand);
      body.classList.toggle('hide-ally', !d.showAllyPanel);
      body.classList.toggle('hide-attack', !d.showAttackButton);
      body.classList.toggle('show-fps', !!d.showFps);
      body.classList.toggle('tap-move', d.moveMode === 'tap');
    }
    const root = document.documentElement;
    root.style.setProperty('--joy-size', clamp(d.joySize, 90, 200) + 'px');
    root.style.setProperty('--joy-opacity', clamp(d.joyOpacity, 25, 100) / 100);
    root.style.setProperty('--skill-btn-size', clamp(d.skillSize, 44, 84) + 'px');
    root.style.setProperty('--skill-opacity', clamp(d.skillOpacity, 35, 100) / 100);
    root.style.setProperty('--attack-size', clamp(d.attackSize, 70, 124) + 'px');
    root.style.setProperty('--minimap-scale', clamp(d.minimapScale, 70, 130) / 100);
    this.applyLayout();

    if (typeof Sfx !== 'undefined') {
      Sfx.enabled = !!d.soundOn;
      Sfx.setVolume(clamp(d.volume, 0, 100) / 100);
    }

    const view = window.App && App.view;
    if (view) {
      view.showDamageText = !!d.damageNumbers;
      view.shakeEnabled = !!d.screenShake;
      view.zoom = clamp(d.cameraZoom / 100, 0.7, 1.45);
      if (this.lastGraphics !== d.graphics || this.lastRenderScale !== d.renderScale) {
        this.applyGraphics(view, d.graphics === 'hd');
        this.lastGraphics = d.graphics;
        this.lastRenderScale = d.renderScale;
      }
    }
    if (typeof UI !== 'undefined') {
      UI.refreshMute();
      UI.refreshQuality();
    }
  },

  applyGraphics(view, hd) {
    view.lowQuality = !hd;
    view.renderer.shadowMap.enabled = hd;
    view.moon.castShadow = hd;
    const baseRatio = hd ? Math.min(1.6, window.devicePixelRatio || 1) : Math.min(1.0, window.devicePixelRatio || 1);
    const scale = clamp(Number(this.data.renderScale) || 100, 60, 100) / 100;
    view.renderer.setPixelRatio(baseRatio * scale);
    view.scene.traverse(o => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { m.needsUpdate = true; });
      }
    });
    view.resize();
  }
};
Settings.load();

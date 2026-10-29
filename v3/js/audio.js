'use strict';

/* 全合成音效，无任何外部音频资源 */
const Sfx = {
  ctx: null,
  enabled: true,
  master: null,
  volume: 0.7,
  lastPlayed: {},

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = 0.55 * this.volume;
  },

  init() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55 * this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  tone(freq, dur, type = 'sine', vol = 0.12, slideTo = null, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  },

  noise(dur = 0.08, vol = 0.08, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t0);
  },

  play(name) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = performance.now();
    if (this.lastPlayed[name] && now - this.lastPlayed[name] < 45) return;
    this.lastPlayed[name] = now;

    switch (name) {
      case 'click': this.tone(660, 0.06, 'triangle', 0.08); break;
      case 'attack': this.noise(0.05, 0.045); this.tone(190, 0.05, 'square', 0.03, 140); break;
      case 'hit': this.tone(140, 0.07, 'triangle', 0.06, 90); break;
      case 'arrow': this.noise(0.06, 0.04); this.tone(880, 0.08, 'triangle', 0.045, 500); break;
      case 'arrowBig': this.tone(520, 0.22, 'sawtooth', 0.06, 1400); break;
      case 'bolt': this.tone(420, 0.16, 'sine', 0.07, 880); break;
      case 'holy': this.tone(740, 0.18, 'sine', 0.06, 1180); break;
      case 'sweep': this.noise(0.12, 0.06); this.tone(300, 0.12, 'sawtooth', 0.045, 140); break;
      case 'slam': this.tone(90, 0.22, 'square', 0.09, 45); this.noise(0.15, 0.07); break;
      case 'boom': this.tone(150, 0.25, 'sawtooth', 0.08, 60); this.noise(0.2, 0.06); break;
      case 'boomBig': this.tone(90, 0.45, 'sawtooth', 0.11, 40); this.noise(0.35, 0.09); break;
      case 'dash': this.noise(0.14, 0.06); this.tone(260, 0.12, 'sine', 0.05, 520); break;
      case 'blink': this.tone(900, 0.1, 'sine', 0.05, 300); break;
      case 'shield': this.tone(320, 0.25, 'triangle', 0.07, 520); break;
      case 'heal': this.tone(520, 0.3, 'sine', 0.07, 780); this.tone(780, 0.3, 'sine', 0.04, 1040, 0.08); break;
      case 'buff': this.tone(440, 0.3, 'triangle', 0.06, 660); this.tone(660, 0.3, 'triangle', 0.04, 880, 0.06); break;
      case 'nova': this.tone(660, 0.3, 'sine', 0.08, 200); this.noise(0.2, 0.05); break;
      case 'frost': this.tone(1180, 0.18, 'sine', 0.055, 760); this.noise(0.08, 0.022); break;
      case 'iceBoom': this.tone(180, 0.22, 'triangle', 0.07, 70); this.noise(0.16, 0.045); this.tone(920, 0.18, 'sine', 0.035, 1300, 0.03); break;
      case 'frostNova': this.tone(90, 0.42, 'sawtooth', 0.09, 40); this.noise(0.32, 0.075); this.tone(1400, 0.3, 'sine', 0.045, 420, 0.05); break;
      case 'thunder': this.noise(0.14, 0.07); this.tone(260, 0.12, 'sawtooth', 0.055, 80); break;
      case 'static': this.noise(0.1, 0.06); this.tone(640, 0.16, 'square', 0.04, 180); break;
      case 'thunderBig': this.tone(70, 0.5, 'sawtooth', 0.11, 32); this.noise(0.4, 0.1); this.tone(1200, 0.22, 'sine', 0.05, 240, 0.04); break;
      case 'cancel': this.tone(560, 0.1, 'sine', 0.045, 300); this.tone(300, 0.12, 'triangle', 0.025, 220, 0.06); break;
      case 'cast': this.tone(300, 0.2, 'sine', 0.05, 600); break;
      case 'execute': this.tone(200, 0.3, 'sawtooth', 0.09, 60); this.noise(0.2, 0.08); break;
      case 'levelup': this.tone(523, 0.14, 'triangle', 0.07); this.tone(659, 0.14, 'triangle', 0.07, null, 0.1); this.tone(784, 0.22, 'triangle', 0.08, null, 0.2); break;
      case 'death': this.tone(300, 0.5, 'sawtooth', 0.08, 80); break;
      case 'tower': this.tone(240, 0.16, 'square', 0.05, 120); break;
      case 'buy': this.tone(880, 0.1, 'triangle', 0.06); this.tone(1100, 0.12, 'triangle', 0.05, null, 0.08); break;
      case 'victory': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.08, null, i * 0.14)); break;
      case 'defeat': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.06, null, i * 0.16)); break;
      case 'deny': this.tone(160, 0.12, 'square', 0.05, 120); break;
      default: break;
    }
  }
};

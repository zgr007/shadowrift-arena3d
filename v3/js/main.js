'use strict';

const App = {
  view: null,
  game: null,
  lastTime: 0,

  init() {
    UI.init();
    window.App = this;
    if (location.protocol === 'file:') {
      UI.showLoadError('3D 版需要通过本地服务器载入模型');
      return;
    }
    UI.setLoading(0.01, '模型');
    Assets.load((p, name) => UI.setLoading(p, name))
      .then(() => {
        try {
          Portraits3D.generate();
          UI.applyPortraits();
          this.view = new View3D(document.getElementById('scene'));
        } catch (e) {
          UI.showLoadError('3D 初始化失败：' + e.message);
          console.error(e);
          return;
        }
        if (typeof Settings !== 'undefined') Settings.apply();
        UI.finishLoading();
        UI.refreshQuality();
        window.__shot = (name) => this.view ? this.view.capture(name || 'latest') : 'no-view';
        this.lastTime = 0;
        const params = new URLSearchParams(location.search);
        const auto = params.get('auto');
        if (auto && HERO_BY_ID[auto]) {
          setTimeout(() => {
            this.startGame(auto, UI.difficulty);
            if (params.has('demo')) {
              setTimeout(() => {
                if (this.game) this.game.placeHero(this.game.player, 1520, 2060);
              }, 700);
            }
          }, 150);
        }
        requestAnimationFrame((t) => this.loop(t));
      })
      .catch((err) => {
        console.error(err);
        UI.showLoadError('模型载入失败：' + (err && err.message ? err.message : err));
      });
  },

  startGame(heroId, difficulty) {
    if (!this.view) return;
    if (this.game) {
      if (this.game.endTimer) clearTimeout(this.game.endTimer);
      this.game.dispose();
      this.game = null;
    }
    UI.showScreen('game');
    UI.prepareGame();
    this.view.resize();
    this.game = new Game3D(this.view, heroId, difficulty || UI.difficulty);
    UI.onGameStart(this.game);
    if (typeof Settings !== 'undefined') Settings.apply();
    Sfx.init();
    this.lastTime = 0;
    this.view.camFocus.set(this.game.player.x, 0, this.game.player.y);
    this.view.updateCamera(0.5, this.game.player.x, this.game.player.y, this.game.aimX, this.game.aimY);
    this.view.render();
  },

  restart() {
    this.startGame(
      this.game ? this.game.playerHeroId : UI.selectedHeroId,
      this.game ? this.game.difficulty : UI.difficulty
    );
  },

  quitToSelect() {
    if (this.game) {
      if (this.game.endTimer) clearTimeout(this.game.endTimer);
      this.game.dispose();
      this.game = null;
    }
    UI.resetGameUI();
    UI.showScreen('select');
    UI.refreshSelect();
  },

  loop(t) {
    if (typeof Settings !== 'undefined' && Settings.data.fpsLimit > 0) {
      const interval = 1000 / Settings.data.fpsLimit;
      if (this.lastTime && (t - this.lastTime) < interval - 4) {
        requestAnimationFrame((nt) => this.loop(nt));
        return;
      }
    }
    const dt = this.lastTime ? Math.min(0.05, (t - this.lastTime) / 1000) : 0;
    this.lastTime = t;
    const g = this.game;
    if (g) {
      if (g.state === 'playing') g.update(dt);
      if (g.state === 'playing' || g.state === 'over') this.view.update(dt, g);
      this.view.render();
      UI.updateGame(g);
    } else if (UI.screen === 'select') {
      HeroPreview.tick(dt);
    }
    requestAnimationFrame((nt) => this.loop(nt));
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());

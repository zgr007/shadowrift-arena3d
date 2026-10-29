'use strict';

const HeroPreview = {
  canvas: null,
  renderer: null,
  scene: null,
  camera: null,
  holder: null,
  rig: null,
  active: false,
  angle: 0,
  attackTimer: 3.2,
  currentId: null,

  enter(heroId, canvas) {
    if (!canvas) return;
    this.canvas = canvas;
    if (!this.renderer) this.init();
    if (!this.renderer) return;
    this.active = true;
    this.resize();
    if (this.currentId !== heroId) this.show(heroId);
  },

  init() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      console.warn('英雄预览不可用', e);
      this.renderer = null;
      return;
    }
    this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
    this.camera.position.set(0, 118, 340);
    this.camera.lookAt(0, 82, 0);

    this.scene.add(new THREE.HemisphereLight(0xc4dcf2, 0x1b1712, 1.15));
    const key = new THREE.DirectionalLight(0xffe3b5, 1.9);
    key.position.set(220, 380, 320);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x4aa8ff, 2.4, 900, 2);
    rim.position.set(-230, 220, -160);
    this.scene.add(rim);
    const rim2 = new THREE.PointLight(0xff8a6a, 1.2, 700, 2);
    rim2.position.set(220, 100, -120);
    this.scene.add(rim2);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(128, 148, 14, 48),
      new THREE.MeshStandardMaterial({ color: 0x1c211f, roughness: 0.85 })
    );
    pedestal.position.y = -7;
    this.scene.add(pedestal);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(96, 124, 56),
      new THREE.MeshBasicMaterial({ color: 0xe8c37a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.6;
    this.scene.add(ring);
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(130, 48),
      new THREE.MeshBasicMaterial({ color: 0x2f7cbf, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.4;
    this.scene.add(glow);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);

    if (window.ResizeObserver) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.canvas.parentElement);
    }
    this.resize();
  },

  resize() {
    if (!this.renderer || !this.canvas) return;
    const el = this.canvas.parentElement;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  show(heroId) {
    this.currentId = heroId;
    if (!this.renderer || !Assets.ready) return;
    if (this.rig) {
      this.holder.remove(this.rig.root);
      this.rig.dispose();
      this.rig = null;
    }
    const def = HERO_BY_ID[heroId];
    if (!def) return;
    const rig = new ModelRig(def, 'blue', false);
    rig.flagGroup.visible = false;
    rig.ring.visible = false;
    rig.ringDisc.visible = false;
    rig.groundGlow.visible = false;
    rig.root.rotation.y = 0.4;
    this.holder.add(rig.root);
    this.rig = rig;
    this.angle = 0;
    this.attackTimer = 3.2;
    rig.setLocomotion(false);
    rig.update(0, false, false, false);
  },

  tick(dt) {
    if (!this.active || !this.renderer) return;
    this.angle += dt * 0.22;
    this.holder.rotation.y = this.angle;
    if (this.rig) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = rand(3.8, 5.6);
        const def = HERO_BY_ID[this.currentId];
        if (def && def.range > 150) this.rig.playCast();
        else this.rig.playAttack();
      }
      this.rig.update(dt, false, false, false);
    }
    this.renderer.render(this.scene, this.camera);
  },

  leave() {
    this.active = false;
  }
};

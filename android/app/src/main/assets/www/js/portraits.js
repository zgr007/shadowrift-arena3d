'use strict';

/* 用 CC0 角色模型实时渲染半身立绘，避免引入风格不一致的网络素材 */
const Portraits3D = {
  size: 320,

  generate() {
    if (!Assets.ready || (Assets.portraits && Object.keys(Assets.portraits).length > 0)) return;
    const portraits = {};
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(this.size, this.size, false);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
      camera.position.set(0, 104, 258);
      camera.lookAt(0, 88, 0);

      scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x1c1a16, 1.5));
      const key = new THREE.DirectionalLight(0xffe6c2, 2.2);
      key.position.set(160, 260, 240);
      scene.add(key);
      const rim = new THREE.PointLight(0x4aa8ff, 2.8, 800, 2);
      rim.position.set(-180, 220, 60);
      scene.add(rim);
      const rim2 = new THREE.PointLight(0xff8a6a, 1.2, 600, 2);
      rim2.position.set(200, 100, 80);
      scene.add(rim2);

      const holder = new THREE.Group();
      scene.add(holder);

      for (const def of HEROES) {
        const rig = new ModelRig(def, 'blue', false);
        rig.flagGroup.visible = false;
        rig.ring.visible = false;
        rig.ringDisc.visible = false;
        rig.groundGlow.visible = false;
        rig.root.rotation.y = 0.22;
        holder.add(rig.root);
        rig.setLocomotion(false);
        rig.update(0.016, false, false, false);
        renderer.render(scene, camera);

        const c = document.createElement('canvas');
        c.width = c.height = this.size;
        const ctx = c.getContext('2d');
        const bg = ctx.createRadialGradient(this.size * 0.5, this.size * 0.3, 10, this.size * 0.5, this.size * 0.56, this.size * 0.76);
        bg.addColorStop(0, '#263b4d');
        bg.addColorStop(0.45, '#101b23');
        bg.addColorStop(1, '#05090d');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.size, this.size);

        const halo = ctx.createRadialGradient(this.size * 0.5, this.size * 0.36, 4, this.size * 0.5, this.size * 0.36, this.size * 0.34);
        halo.addColorStop(0, 'rgba(74,168,255,0.28)');
        halo.addColorStop(1, 'rgba(74,168,255,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, this.size, this.size);

        ctx.drawImage(renderer.domElement, 0, 0);

        const vg = ctx.createRadialGradient(this.size / 2, this.size / 2, this.size * 0.3, this.size / 2, this.size / 2, this.size * 0.72);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.48)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, this.size, this.size);

        portraits[def.id] = c.toDataURL('image/png');
        holder.remove(rig.root);
        rig.dispose();
      }
      renderer.dispose();
      Assets.portraits = portraits;
    } catch (e) {
      console.warn('英雄立绘生成失败', e);
      Assets.portraits = Assets.portraits || {};
    }
  }
};

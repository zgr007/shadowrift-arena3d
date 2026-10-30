'use strict';

/* CC0 角色模型：KayKit Adventurers（www.kaylousberg.com） */
const MODEL_FILES = ['Barbarian', 'Knight', 'Mage', 'Rogue', 'Rogue_Hooded'];
const MODEL_TARGET_HEIGHT = 140;
const MODEL_YAW_OFFSET = 0;

const BLOB_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 3, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.3)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
})();
const BLOB_GEO = new THREE.CircleGeometry(44, 28);
const BLOB_MAT = new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, opacity: 0.34, depthWrite: false, toneMapped: false });

const Assets = {
  gltfs: {},
  portraits: {},
  loadedCount: 0,
  ready: false,
  error: null,

  load(onProgress) {
    const loader = new THREE.GLTFLoader();
    let done = 0;
    const total = MODEL_FILES.length;
    const tasks = MODEL_FILES.map((name) => new Promise((resolve, reject) => {
      loader.load(
        `assets/models/${name}.glb`,
        (gltf) => {
          this.gltfs[name] = gltf;
          done++;
          onProgress && onProgress(done / total, name);
          resolve();
        },
        (xhr) => {
          if (onProgress && xhr.total) {
            onProgress((done + Math.min(0.95, xhr.loaded / xhr.total)) / total, name);
          }
        },
        (err) => { this.error = err; reject(err); }
      );
    }));
    return Promise.all(tasks).then(() => {
      // 所有角色共用同一套骨骼命名 / 动画库
      this.ready = true;
      return this.gltfs;
    });
  }
};

class ModelRig {
  constructor(def, team, isPlayer) {
    this.def = def;
    this.team = team;
    this.isPlayer = isPlayer;
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.root.add(this.model);
    this.materials = [];
    this.flashTime = 0;
    this.isDead = false;
    this.oneShot = null;
    this.locoName = null;
    this.moving = false;
    this.moveSpeed = 300;
    this.facing = 0;

    const gltf = Assets.gltfs[def.file];
    if (!gltf) throw new Error('模型未加载: ' + def.file);
    const clone = THREE.SkeletonUtils.clone(gltf.scene);

    clone.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        if (Array.isArray(o.material)) {
          o.material = o.material.map((m) => this._prepareMaterial(m));
        } else {
          o.material = this._prepareMaterial(o.material);
        }
        if (def.tint) o.material.color.setHex(def.tint);
        const teamC = new THREE.Color(TEAM_COLORS[team].hex);
        if (/cape/i.test(o.name) && o.material && o.material.color) {
          o.material.color.setHex(TEAM_COLORS[team].hex);
          if (o.material.emissive) {
            o.material.emissive.setHex(TEAM_COLORS[team].hex);
            o.material.emissiveIntensity = 0.12;
            o.material.userData.baseEmissive = TEAM_COLORS[team].hex;
            o.material.userData.baseEmissiveIntensity = 0.12;
          }
        }
        if (/hat|helmet|hood/i.test(o.name) && o.material && o.material.color) {
          o.material.color.copy(teamC.clone().lerp(new THREE.Color(0xffffff), 0.25));
          if (o.material.emissive) {
            o.material.emissive.copy(teamC);
            o.material.emissiveIntensity = 0.18;
            o.material.userData.baseEmissive = teamC.getHex();
            o.material.userData.baseEmissiveIntensity = 0.18;
          }
        }
        if (def.glowTint && o.material && o.material.emissive) {
          const amount = def.glowIntensity === undefined ? 0.32 : def.glowIntensity;
          o.material.emissive.setHex(def.glowTint);
          o.material.emissiveIntensity = amount;
          o.material.userData.baseEmissive = def.glowTint;
          o.material.userData.baseEmissiveIntensity = amount;
        }
      }
      if (def.hide && def.hide.includes(o.name)) o.visible = false;
    });

    // 缩放到统一身高，脚底贴地
    this.model.add(clone);
    const box = new THREE.Box3().setFromObject(clone);
    const h = Math.max(0.01, box.max.y - box.min.y);
    const scale = MODEL_TARGET_HEIGHT / h;
    this.scale = scale;
    clone.scale.setScalar(scale);
    clone.position.y = -box.min.y * scale;
    this.height = MODEL_TARGET_HEIGHT;

    this.mixer = new THREE.AnimationMixer(clone);
    this.actions = {};
    this.gltf = gltf;
    this.mixer.addEventListener('finished', (e) => {
      if (!this.oneShot || e.action !== this.oneShot.action) return;
      const wasDeath = this.isDead;
      this.oneShot = null;
      if (!wasDeath) {
        this.locoName = null;
        this._applyLocomotion(true);
      }
    });

    // 队伍光环
    const ringColor = isPlayer ? 0xffd166 : TEAM_COLORS[team].hex;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(50, 40),
      new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 3.2;
    this.root.add(disc);
    this.ringDisc = disc;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(34, 48, 48),
      new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: isPlayer ? 0.95 : 0.85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 3.5;
    this.root.add(ring);
    this.ring = ring;

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(52, 40),
      new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 3.1;
    this.root.add(glow);
    this.groundGlow = glow;
    const blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 2.55;
    blob.renderOrder = -1;
    this.root.add(blob);
    this.blobShadow = blob;

    // 眩晕 / 护盾 / 增益
    this.stunGroup = new THREE.Group();
    this.stunGroup.position.y = MODEL_TARGET_HEIGHT + 34;
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(5, 0),
        new THREE.MeshBasicMaterial({ color: 0xffe066 })
      );
      this.stunGroup.add(star);
    }
    this.stunGroup.visible = false;
    this.root.add(this.stunGroup);

    this.shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(46, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.shieldBubble.position.y = 60;
    this.shieldBubble.visible = false;
    this.root.add(this.shieldBubble);

    this.buffRing = new THREE.Mesh(
      new THREE.RingGeometry(44, 50, 36),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.buffRing.rotation.x = -Math.PI / 2;
    this.buffRing.position.y = 3.6;
    this.buffRing.visible = false;
    this.root.add(this.buffRing);

    // 队伍旗标
    const flagGroup = new THREE.Group();
    const poleMat = new THREE.MeshBasicMaterial({ color: 0x231c14 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 92, 4), poleMat);
    pole.position.set(26, 100, -16);
    flagGroup.add(pole);
    const flagMat = new THREE.MeshBasicMaterial({
      color: isPlayer ? 0xffd166 : TEAM_COLORS[team].hex,
      side: THREE.DoubleSide, toneMapped: false
    });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(36, 20), flagMat);
    flag.position.set(43, 132, -16);
    flagGroup.add(flag);
    this.flag = flag;
    this.root.add(flagGroup);
    this.flagGroup = flagGroup;

    this._applyLocomotion(false);
  }

  _prepareMaterial(m) {
    if (!m) return m;
    const mat = m.clone();
    const rimColor = new THREE.Color(this.isPlayer ? 0xffd166 : TEAM_COLORS[this.team].hex);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = { value: rimColor };
      shader.uniforms.uRimStrength = ModelRig.rimStrength;
      shader.fragmentShader = `uniform vec3 uRimColor;
uniform float uRimStrength;
` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
float vfxRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2);`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
gl_FragColor.rgb += uRimColor * vfxRim * uRimStrength;`
      );
    };
    mat.customProgramCacheKey = () => 'shadowrift-rim-v1';
    if (mat.emissive) {
      mat.userData.baseEmissive = mat.emissive.getHex();
      mat.userData.baseEmissiveIntensity = mat.emissiveIntensity === undefined ? 1 : mat.emissiveIntensity;
    }
    if ('roughness' in mat) mat.roughness = Math.min(1, (mat.roughness || 0.8) + 0.1);
    if ('metalness' in mat) mat.metalness = Math.min(0.2, mat.metalness || 0);
    if (this.def && this.def.tint) mat.color.setHex(this.def.tint);
    this.materials.push(mat);
    return mat;
  }

  action(name, once) {
    if (!name) return null;
    const key = name + (once ? '#once' : '');
    if (this.actions[key]) return this.actions[key];
    const clip = THREE.AnimationClip.findByName(this.gltf.animations, name);
    if (!clip) return null;
    const a = this.mixer.clipAction(clip);
    a.enabled = true;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = !!once;
    this.actions[key] = a;
    return a;
  }

  _fadeTo(action, dur) {
    if (!action) return;
    const prev = this.current;
    if (prev === action) return;
    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.play();
    if (prev) action.crossFadeFrom(prev, dur, false);
    this.current = action;
  }

  _applyLocomotion(force) {
    if (this.isDead || this.oneShot) return;
    const target = this.moving ? 'run' : 'idle';
    if (!force && this.locoName === target) return;
    this.locoName = target;
    let a;
    if (this.moving) {
      a = this.action('Running_A');
      if (!a) a = this.action('Walking_A');
      if (a) a.setEffectiveTimeScale(clamp(this.moveSpeed / 300, 0.8, 1.55));
    } else {
      a = this.action('Idle');
    }
    if (a) a.setLoop(THREE.LoopRepeat, Infinity);
    this._fadeTo(a, 0.18);
  }

  setLocomotion(moving, speed) {
    this.moving = moving;
    if (speed) this.moveSpeed = speed;
    if (this.isDead || this.oneShot) return;
    this._applyLocomotion(false);
    if (moving && this.current) this.current.setEffectiveTimeScale(clamp(speed / 300, 0.7, 1.6));
  }

  playOneShot(name, timeScale = 1, fade = 0.12) {
    if (this.isDead) return;
    const a = this.action(name || 'Idle', true);
    if (!a) return;
    this.oneShot = { action: a };
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.setEffectiveTimeScale(timeScale);
    const prev = this.current;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (prev && prev !== a) a.crossFadeFrom(prev, fade, false);
    this.current = a;
    this.locoName = null;
  }

  playAttack() { this.playOneShot(this.def.anim.attack, 1.35, 0.08); }
  playCast() { this.playOneShot(this.def.anim.cast, 1.15, 0.1); }
  playHit() {
    if (this.isDead || this.oneShot) return;
    this.playOneShot('Hit_A', 1.4, 0.06);
  }

  playDeath() {
    if (this.isDead) return;
    this.isDead = true;
    this.oneShot = null;
    const a = this.action('Death_A', true);
    if (a) {
      a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
      a.setEffectiveTimeScale(1); a.play();
      if (this.current) a.crossFadeFrom(this.current, 0.15, false);
      this.current = a;
    }
    this.stunGroup.visible = false;
    this.shieldBubble.visible = false;
    this.buffRing.visible = false;
    this.ring.visible = false;
    this.ringDisc.visible = false;
    this.groundGlow.visible = false;
    this.blobShadow.visible = false;
    this.flagGroup.visible = false;
  }

  revive() {
    this.isDead = false;
    this.oneShot = null;
    this.current = null;
    this.mixer.stopAllAction();
    this.actions = {};
    this.locoName = null;
    this.moving = false;
    this.ring.visible = true;
    this.ringDisc.visible = true;
    this.groundGlow.visible = true;
    this.blobShadow.visible = true;
    this.flagGroup.visible = true;
    this.root.position.y = 0;
    this._applyLocomotion(true);
  }

  reviveAt(x, y) {
    this.revive();
    this.setPosition(x, y);
  }

  setPosition(x, y) { this.root.position.set(x, 0, y); }
  setFacing(angle) { this.facing = angle; this.root.rotation.y = angle + MODEL_YAW_OFFSET; }

  flash(kind) {
    this.flashTime = 0.1;
    const color = kind === 'heal' ? 0x59ff9b : 0xffffff;
    for (const m of this.materials) {
      if (!m.emissive) continue;
      m.emissive.setHex(color);
      m.emissiveIntensity = 0.9;
    }
  }

  update(dt, stunned, shielded, buffed) {
    this.mixer.update(dt);
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) {
        for (const m of this.materials) {
          if (!m.emissive) continue;
          m.emissive.setHex(m.userData.baseEmissive || 0x000000);
          m.emissiveIntensity = m.userData.baseEmissiveIntensity === undefined ? 1 : m.userData.baseEmissiveIntensity;
        }
      }
    }
    if (this.stunGroup.visible !== !!stunned) this.stunGroup.visible = !!stunned;
    if (stunned) {
      const t = performance.now() * 0.003;
      this.stunGroup.children.forEach((s, i) => {
        const a = t + (i * Math.PI * 2) / 3;
        s.position.set(Math.cos(a) * 20, Math.sin(a * 1.7) * 3, Math.sin(a) * 20);
        s.rotation.y += dt * 4;
      });
    }
    if (this.shieldBubble.visible !== !!shielded) this.shieldBubble.visible = !!shielded;
    if (this.shieldBubble.visible) {
      const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.045;
      this.shieldBubble.scale.setScalar(pulse);
      this.shieldBubble.material.opacity = 0.13 + Math.sin(performance.now() * 0.005) * 0.04;
    }
    if (this.flag) this.flag.rotation.y = Math.sin(performance.now() * 0.0035 + this.facing) * 0.22;
    if (this.buffRing.visible !== !!buffed) this.buffRing.visible = !!buffed;
    if (buffed && this.buffRing.visible) {
      this.buffRing.material.opacity = 0.35 + Math.sin(performance.now() * 0.006) * 0.18;
      this.buffRing.rotation.z += dt * 0.8;
    }
  }

  dispose() {
    this.root.parent && this.root.parent.remove(this.root);
  }
}

ModelRig.rimStrength = { value: 0.7 };

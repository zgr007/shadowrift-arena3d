'use strict';

/* 原创程序化技能特效；视觉思路参考 MIT 许可的 LinearAbiltyCastingThreeJS。
   所有几何、材质与粒子均在本项目内即时生成，不包含该仓库的模型或贴图。 */

(function () {
  const Additive = THREE.AdditiveBlending;
  const flat = (color, opacity) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide,
    depthWrite: false, blending: Additive
  });
  const glow = (color, opacity, size) => new THREE.Mesh(
    new THREE.SphereGeometry(size, 10, 8),
    flat(color, opacity)
  );

  /* 分面冰晶几何：移植并适配自 MIT 许可的 LinearAbiltyCastingThreeJS
     （src/assets/ProceduralGeometry.js, createCrystalGeometry）。 */
  const hash11 = (n) => {
    const v = Math.sin(n * 127.1) * 43758.5453123;
    return v - Math.floor(v);
  };
  const RING_HEIGHTS = [0, 0.22, 0.5, 0.75, 0.92];
  const profileRadius = (t, taper) => taper + (1 - taper) * Math.pow(1 - t, 1.15);
  function createCrystalGeometry({ seed = 1, sides = 6, taper = 0.13, roughness = 0.28, bend = 0.22 } = {}) {
    const facets = Math.max(3, Math.round(sides));
    const tipRadius = Math.min(0.9, Math.max(0.01, taper));
    const bendAngle = hash11(seed * 1.77) * TAU;
    const bendX = Math.cos(bendAngle);
    const bendZ = Math.sin(bendAngle);
    const axisOffset = (t) => bend * 0.5 * Math.pow(t, 1.6);
    const angles = [];
    for (let i = 0; i < facets; i++) {
      const jitter = (hash11(seed * 3.13 + i * 7.7) - 0.5) * (TAU / facets) * 0.55 * roughness * 3;
      angles.push((i / facets) * TAU + jitter);
    }
    const rings = RING_HEIGHTS.map((t, ringIndex) => {
      const baseR = profileRadius(t, tipRadius) * 0.5;
      const drift = axisOffset(t);
      const y = t + (hash11(seed * 5.9 + ringIndex * 2.3) - 0.5) * 0.06 * roughness * (t > 0 ? 1 : 0);
      return angles.map((angle, i) => {
        const wobble = 1 + (hash11(seed * 11.1 + ringIndex * 13.7 + i * 3.9) - 0.5) * roughness * 1.3 * (0.35 + 0.65 * t);
        const r = Math.max(0.002, baseR * wobble);
        return [Math.cos(angle) * r + bendX * drift, y, Math.sin(angle) * r + bendZ * drift];
      });
    });
    const apexDrift = axisOffset(1);
    const apex = [
      bendX * apexDrift + (hash11(seed * 17.3) - 0.5) * 0.09 * roughness,
      1,
      bendZ * apexDrift + (hash11(seed * 19.7) - 0.5) * 0.09 * roughness
    ];
    const floorCentre = [0, 0, 0];
    const positions = [];
    const push = (p) => positions.push(p[0], p[1], p[2]);
    for (let ring = 0; ring < rings.length - 1; ring++) {
      const lower = rings[ring];
      const upper = rings[ring + 1];
      for (let i = 0; i < facets; i++) {
        const j = (i + 1) % facets;
        push(lower[i]); push(lower[j]); push(upper[i]);
        push(lower[j]); push(upper[j]); push(upper[i]);
      }
    }
    const top = rings[rings.length - 1];
    const base = rings[0];
    for (let i = 0; i < facets; i++) {
      const j = (i + 1) % facets;
      push(top[i]); push(top[j]); push(apex);
      push(floorCentre); push(base[j]); push(base[i]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  View3D.prototype.screenFlash = function (color, strength) {
    if (!this.flashEl) {
      this.flashEl = document.createElement('div');
      this.flashEl.className = 'skill-flash';
      document.body.appendChild(this.flashEl);
    }
    const el = this.flashEl;
    const hex = '#' + (color >>> 0).toString(16).padStart(6, '0');
    el.style.transition = 'none';
    el.style.background = hex;
    el.style.opacity = String(clamp(strength, 0, 0.45));
    void el.offsetWidth;
    el.style.transition = 'opacity 0.36s ease-out';
    el.style.opacity = '0';
  };

  View3D.prototype.trailPuff = function (x, y, color, size) {
    const geo = new THREE.CircleGeometry(1, 10);
    const mat = flat(color, 0.34);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 15, y);
    this.scene.add(mesh);
    const s = Math.max(5, size || 11);
    this.addEffect({
      group: mesh,
      update: (e, k) => {
        mesh.scale.setScalar(s * (1.2 + (1 - k) * 1.5));
        mat.opacity = k * 0.3;
      }
    }, 0.3);
  };

  View3D.prototype._makeBolt = function (points, color, width, life, branches) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
    const group = new THREE.Group();
    this.scene.add(group);
    const w = Math.max(1.5, width || 3);
    const coreColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.62).getHex();
    const coreMat = flat(coreColor, 0.92);
    const auraMat = flat(color, 0.3);
    const core = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 22, w, 5, false),
      coreMat
    );
    const aura = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 22, Math.max(4, w * 3.2), 6, false),
      auraMat
    );
    group.add(aura, core);
    const branchCount = branches === undefined ? 2 : branches;
    for (let b = 0; b < branchCount; b++) {
      const at = 2 + Math.floor(Math.random() * Math.max(1, points.length - 4));
      const start = points[at] ? points[at].clone() : points[points.length - 2].clone();
      const len = w * rand(13, 24);
      const end = start.clone().add(new THREE.Vector3(rand(-1, 1) * len, rand(0.1, 0.8) * len, rand(-1, 1) * len));
      end.y = Math.max(8, end.y);
      const mid1 = start.clone().lerp(end, 0.34).add(new THREE.Vector3(rand(-12, 12), rand(-8, 8), rand(-12, 12)));
      const mid2 = start.clone().lerp(end, 0.7).add(new THREE.Vector3(rand(-10, 10), rand(-8, 8), rand(-10, 10)));
      const branchCurve = new THREE.CatmullRomCurve3([start, mid1, mid2, end], false, 'catmullrom', 0.2);
      group.add(
        new THREE.Mesh(new THREE.TubeGeometry(branchCurve, 10, w * 1.25, 4, false), auraMat),
        new THREE.Mesh(new THREE.TubeGeometry(branchCurve, 10, Math.max(0.8, w * 0.42), 4, false), coreMat)
      );
    }
    const end = points[points.length - 1];
    const impact = glow(color, 0.5, Math.max(12, (width || 3) * 5));
    impact.position.copy(end);
    group.add(impact);
    const effect = {
      group,
      update: (e, k) => {
        const flicker = 0.55 + Math.random() * 0.45;
        core.material.opacity = k * flicker * 0.95;
        aura.material.opacity = k * flicker * 0.34;
        impact.material.opacity = k * 0.5;
        impact.scale.setScalar(1 + (1 - k) * 2.2);
      }
    };
    this.addEffect(effect, life || 0.28);
    return group;
  };

  View3D.prototype.lightningBolt = function (x1, y1, x2, y2, color, opts = {}) {
    const height = opts.height || 70;
    const n = 10;
    const jitter = opts.jitter === undefined ? Math.min(80, Math.hypot(x2 - x1, y2 - y1) * 0.16) : opts.jitter;
    const points = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const inner = i > 0 && i < n;
      points.push(new THREE.Vector3(
        x1 + (x2 - x1) * t + (inner ? rand(-jitter, jitter) : 0),
        height + (inner ? rand(-16, 18) : 0),
        y1 + (y2 - y1) * t + (inner ? rand(-jitter, jitter) : 0)
      ));
    }
    this._makeBolt(points, color, opts.width || 2.8, opts.life || 0.28, opts.branches === undefined ? 2 : opts.branches);
    this.burst(x2, y2, color, 6, 130);
  };

  View3D.prototype.skyStrike = function (x, y, color, radius) {
    const top = new THREE.Vector3(x + rand(-26, 26), 520, y + rand(-26, 26));
    const points = [top];
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      points.push(new THREE.Vector3(
        top.x + (x - top.x) * t + rand(-18, 18),
        top.y + (8 - top.y) * t,
        top.z + (y - top.z) * t + rand(-18, 18)
      ));
    }
    points.push(new THREE.Vector3(x, 8, y));
    this._makeBolt(points, color, 2.3, 0.34, radius >= 100 ? 1 : 0);
    this.ring(x, y, Math.max(40, radius || 100), color, 0.5, 8);
    this.burst(x, y, color, 14, 220);
    if (radius >= 100) this.screenFlash(color, 0.06);
  };

  View3D.prototype.skyBeam = function (x, y, color, life, radius) {
    const r = radius || 60;
    const group = new THREE.Group();
    group.position.set(x, 0, y);
    this.scene.add(group);
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.28, r, 520, 16, 1, true),
      flat(color, 0.2)
    );
    shell.position.y = 260;
    const beamCoreColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.7).getHex();
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.07, r * 0.16, 520, 10, 1, true),
      flat(beamCoreColor, 0.5)
    );
    core.position.y = 260;
    group.add(shell, core);
    const pulseRings = [0, 1, 2].map(() => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.4, r * 0.66, 36), flat(beamCoreColor, 0.32));
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);
      return ring;
    });
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(r * 1.4, 32),
      flat(color, 0.22)
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 4;
    group.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.8, r * 1.05, 48),
      flat(color, 0.5)
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 4.5;
    group.add(ring);
    this.addEffect({
      group,
      update: (e, k) => {
        const flicker = 0.65 + Math.random() * 0.35;
        shell.material.opacity = k * 0.2 * flicker;
        core.material.opacity = k * 0.46 * flicker;
        disc.material.opacity = k * 0.2;
        ring.scale.setScalar(0.9 + (1 - k) * 0.6);
        ring.material.opacity = k * 0.45;
        pulseRings.forEach((pr, i) => {
          const phase = (1 - k + i * 0.33) % 1;
          pr.position.y = 8 + phase * 330;
          pr.scale.setScalar(1 - phase * 0.45);
          pr.material.opacity = k * 0.32 * (1 - phase);
        });
      }
    }, life || 1);
    this.burst(x, y, color, 18, 240);
  };


  View3D.prototype.footDust = function (x, y, color) {
    const geo = new THREE.CircleGeometry(1, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8d7b61, transparent: true, opacity: 0.17,
      depthWrite: false, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + rand(-5, 5), 3.2, y + rand(-5, 5));
    this.scene.add(mesh);
    this.addEffect({
      group: mesh,
      update: (e, k) => {
        mesh.scale.setScalar(5 + (1 - k) * 12);
        mesh.position.y = 3.2 + (1 - k) * 5;
        mat.opacity = k * 0.16;
      }
    }, 0.42);
  };

  View3D.prototype.deathWisp = function (x, y, color) {
    const group = new THREE.Group();
    group.position.set(x, 0, y);
    this.scene.add(group);
    const orbs = [];
    for (let i = 0; i < 5; i++) {
      const orb = glow(color, 0.7, 5 + i * 2);
      orb.position.set(rand(-16, 16), rand(26, 70), rand(-16, 16));
      group.add(orb);
      orbs.push({ mesh: orb, x: orb.position.x, z: orb.position.z, h: orb.position.y, phase: rand(0, TAU), rise: rand(80, 150) });
    }
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(10, 30, 240, 10, 1, true),
      flat(color, 0.12)
    );
    beam.position.y = 120;
    group.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(26, 36, 40), flat(color, 0.4));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 4;
    group.add(ring);
    this.addEffect({
      group,
      update: (e, k) => {
        const age = 1 - k;
        orbs.forEach((o, i) => {
          o.mesh.position.y = o.h + age * o.rise;
          o.mesh.position.x = o.x + Math.sin(age * 5.2 + o.phase) * (5 + age * 6);
          o.mesh.position.z = o.z + Math.cos(age * 4.4 + o.phase) * (4 + age * 5);
          o.mesh.material.opacity = Math.min(1, k * 2.4) * (0.55 + Math.sin(age * 10 + i) * 0.15);
          o.mesh.scale.setScalar(1 + age * 0.8);
        });
        beam.material.opacity = k * 0.13;
        beam.scale.set(1 + age * 0.4, 1, 1 + age * 0.4);
        ring.scale.setScalar(0.8 + age * 1.1);
        ring.material.opacity = k * 0.4;
      }
    }, 1.55);
  };

  View3D.prototype.spawnPillar = function (x, y, color) {
    this.skyBeam(x, y, color, 0.65, 46);
    this.ring(x, y, 48, color, 0.7, 6);
  };

  View3D.prototype.iceCrown = function (x, y, radius, color, life, opts = {}) {
    const count = Math.max(4, Math.min(42, opts.count || 14));
    const ring = !!opts.ring;
    const big = !!opts.big;
    const group = new THREE.Group();
    group.position.set(x, 0, y);
    this.scene.add(group);
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: big ? 0.65 : 0.45,
      roughness: 0.14, metalness: 0.02,
      transparent: true, opacity: 0.95
    });
    const geos = [0, 1, 2].map((i) => createCrystalGeometry({
      seed: 4.2 + i * 17.3, sides: 5 + i,
      taper: 0.1 + i * 0.04, roughness: 0.3 + i * 0.05, bend: 0.16 + i * 0.06
    }));
    const meshes = geos.map((geo) => {
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, Math.ceil(count / 3)));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    });
    const slotCounts = [0, 0, 0];
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.94, 40), flat(color, 0.15));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 3.2;
    group.add(disc);
    const edge = new THREE.Mesh(new THREE.RingGeometry(radius * 0.86, radius, 52), flat(color, 0.4));
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 3.6;
    group.add(edge);
    const seeds = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const rr = ring ? radius * rand(0.82, 0.98) : Math.sqrt(Math.random()) * radius * 0.9;
      const px = Math.cos(a) * rr;
      const pz = Math.sin(a) * rr;
      const h = (big ? rand(62, 112) : rand(38, 76)) * (0.7 + (rr / Math.max(1, radius)) * 0.5);
      const variant = i % 3;
      seeds.push({
        px, pz, h, w: big ? rand(6, 13) : rand(5, 10),
        rot: rand(0, TAU), tilt: rand(-0.16, 0.16),
        variant, slot: slotCounts[variant]++,
        delay: ring ? (a / TAU) * 0.23 : rand(0, 0.16)
      });
    }
    meshes.forEach((m, vi) => { m.count = slotCounts[vi]; });
    const fadeOf = (k) => clamp(k * 3.2, 0, 1);
    const render = (age, k) => {
      const fade = fadeOf(k);
      for (let i = 0; i < count; i++) {
        const s = seeds[i];
        const grow = clamp((age - s.delay) / 0.18, 0, 1);
        const ease = grow * (2 - grow);
        const sc = Math.max(0.001, ease) * fade;
        dummy.position.set(s.px, 0, s.pz);
        dummy.rotation.set(s.tilt, s.rot, s.tilt * 0.7);
        dummy.scale.set(s.w * 2 * sc, Math.max(0.01, s.h * sc), s.w * 2 * sc);
        dummy.updateMatrix();
        meshes[s.variant].setMatrixAt(s.slot, dummy.matrix);
      }
      meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
      mat.opacity = 0.95 * fade;
      disc.material.opacity = 0.15 * fade;
      edge.material.opacity = 0.4 * fade;
      edge.scale.setScalar(0.9 + (1 - k) * 0.3);
    };
    render(0, 1);
    this.addEffect({
      group,
      update: (e, k, dt) => render(life * (1 - k), k)
    }, life || 1.4);
    this.burst(x, y, color, big ? 18 : 7, big ? 250 : 150);
  };

  View3D.prototype.scorch = function (x, y, radius, color, life) {
    const group = new THREE.Group();
    group.position.set(x, 2.4, y);
    this.scene.add(group);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 40),
      new THREE.MeshBasicMaterial({ color: 0x08090c, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide })
    );
    disc.rotation.x = -Math.PI / 2;
    group.add(disc);
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const a = rand(0, TAU);
      let px = 0, pz = 0;
      for (let j = 0; j < 5; j++) {
        const step = radius * rand(0.16, 0.3);
        px += Math.cos(a + rand(-0.5, 0.5)) * step;
        pz += Math.sin(a + rand(-0.5, 0.5)) * step;
        pts.push(px, 1.2, pz);
        if (j) pts.push(px, 1.2, pz);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const cracks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.75, blending: Additive, depthWrite: false
    }));
    group.add(cracks);
    this.addEffect({
      group,
      update: (e, k) => {
        disc.material.opacity = clamp(k * 1.5, 0, 1) * 0.28;
        cracks.material.opacity = Math.pow(k, 1.6) * 0.75;
      }
    }, life || 3.5);
  };

  View3D.prototype.groundCracks = function (x, y, angle, length, width, color) {
    const group = new THREE.Group();
    group.position.set(x, 3.2, y);
    group.rotation.y = -angle;
    this.scene.add(group);
    const mat = flat(color, 0.55);
    for (let i = 0; i < 5; i++) {
      const len = length * rand(0.45, 1);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, rand(3, width * 0.35)), mat);
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = rand(-0.12, 0.12);
      strip.position.set(len / 2 + rand(0, length * 0.1), 0, rand(-width, width));
      group.add(strip);
    }
    this.addEffect({
      group,
      update: (e, k) => { mat.opacity = k * 0.55; }
    }, 0.65);
  };

  View3D.prototype.meteorFall = function (x, y, delay, radius, color) {
    const group = new THREE.Group();
    const start = new THREE.Vector3(x + rand(-190, 190), 560, y + rand(-190, 190));
    const end = new THREE.Vector3(x, 12, y);
    const dir = start.clone().sub(end).normalize();
    const rockGeo = new THREE.IcosahedronGeometry(Math.max(16, radius * 0.16), 1);
    const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({
      color: 0x2a211f, emissive: color, emissiveIntensity: 0.32,
      roughness: 0.9, metalness: 0.02, flatShading: true
    }));
    group.add(rock);
    const halo = glow(color, 0.22, Math.max(26, radius * 0.24));
    group.add(halo);
    const tails = [];
    for (let i = 0; i < 5; i++) {
      const t = glow(color, 0.25 - i * 0.04, Math.max(6, radius * 0.08 - i * 2));
      t.position.copy(dir).multiplyScalar(i * 22 + 18);
      group.add(t);
      tails.push(t);
    }
    group.position.copy(start);
    this.scene.add(group);
    let puff = 0;
    this.addEffect({
      group,
      update: (e, k, dt) => {
        const age = delay * (1 - k);
        const p = clamp(age / Math.max(0.1, delay), 0, 1);
        const fall = p * p;
        group.position.lerpVectors(start, end, fall);
        group.rotation.x += dt * 1.8;
        group.rotation.y += dt * 1.2;
        halo.material.opacity = 0.2 + Math.sin(age * 26) * 0.06;
        rock.material.emissiveIntensity = 0.32 + p * 0.6;
        tails.forEach((t, i) => { t.material.opacity = (0.24 - i * 0.035) * (1 - p * 0.6); });
        puff -= dt;
        if (puff <= 0 && p < 0.92) {
          puff = 0.06;
          this.trailPuff(group.position.x, group.position.z, color, 13 + p * 8);
        }
      }
    }, delay || 1.1);
  };

  View3D.prototype.showSkillAimLine = function (owner, ax, ay, color) {
    if (!this.skillAimLine) {
      const group = new THREE.Group();
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      const mat = flat(0xffd166, 0.28);
      const beam = new THREE.Mesh(geo, mat);
      beam.position.x = 0.5;
      group.add(beam);
      const edge = new THREE.Mesh(geo.clone(), flat(0xffffff, 0.12));
      edge.position.x = 0.5;
      edge.scale.set(1, 1, 3.2);
      group.add(edge);
      group.visible = false;
      group.position.y = 5.4;
      this.scene.add(group);
      this.skillAimLine = { group, beam, edge, mat, edgeMat: edge.material };
    }
    const dx = ax - owner.x;
    const dy = ay - owner.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) { this.hideSkillAimLine(); return; }
    const line = this.skillAimLine;
    line.group.visible = true;
    line.group.position.x = owner.x;
    line.group.position.z = owner.y;
    line.group.rotation.y = -Math.atan2(dy, dx);
    line.beam.scale.set(len, 1, 7);
    line.edge.scale.set(len, 1, 20);
    line.mat.color.setHex(color);
    line.edgeMat.color.setHex(color);
  };

  View3D.prototype.hideSkillAimLine = function () {
    if (this.skillAimLine) this.skillAimLine.group.visible = false;
  };
})();

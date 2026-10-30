'use strict';

View3D.DEFAULT_ZOOM = 1;

function View3D(container) {
  View3D.current = this;
  this.container = container;
  this.width = 1280;
  this.height = 720;
  this.zoom = 0.9;
  this.camFocus = new THREE.Vector3(1800, 0, 1800);
  this.shake = 0;
  this.effects = [];
  this.bars = [];
  this.plates = new Map();
  this.floaters = [];
  this.floaterPool = [];
  this.pointer = new THREE.Vector2(0, 0);
  this.clockTime = 0;
  this.showDamageText = true;
  this.shakeEnabled = true;
  this.skillRangeOwner = null;
  this.lowQuality = new URLSearchParams(location.search).has('lowq');

  this.renderer = new THREE.WebGLRenderer({ antialias: !this.lowQuality, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  this.renderer.setPixelRatio(this.lowQuality ? Math.min(1.0, window.devicePixelRatio || 1) : Math.min(1.6, window.devicePixelRatio || 1));
  this.renderer.outputEncoding = THREE.sRGBEncoding;
  this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  this.renderer.toneMappingExposure = 1.05;
  this.renderer.shadowMap.enabled = !this.lowQuality;
  this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  this.renderer.domElement.id = 'game-canvas';
  container.appendChild(this.renderer.domElement);

  this.overlay = document.createElement('div');
  this.overlay.className = 'battle-overlay';
  this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden;';
  container.parentElement.appendChild(this.overlay);

  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(0x060b0e);
  this.scene.fog = new THREE.FogExp2(0x071014, 0.00042);

  this.camera = new THREE.PerspectiveCamera(42, 1, 20, 9000);
  this.camera.position.set(1800, 1500, 2800);
  this.camera.lookAt(1800, 0, 1800);
  this.hemi = new THREE.HemisphereLight(0xa8ccea, 0x1c2a1d, 0.72);
  this.scene.add(this.hemi);

  this.moon = new THREE.DirectionalLight(0xcfe4ff, 1.2);
  this.moon.castShadow = !this.lowQuality;
  this.moon.shadow.mapSize.set(1536, 1536);
  this.moon.shadow.camera.left = -900;
  this.moon.shadow.camera.right = 900;
  this.moon.shadow.camera.top = 900;
  this.moon.shadow.camera.bottom = -900;
  this.moon.shadow.camera.near = 100;
  this.moon.shadow.camera.far = 2800;
  this.moon.shadow.bias = -0.0005;
  this.moon.shadow.normalBias = 2;
  this.scene.add(this.moon);
  this.scene.add(this.moon.target);

  this.warm = new THREE.DirectionalLight(0xffb066, 0.34);
  this.warm.position.set(-800, 600, 900);
  this.scene.add(this.warm);

  this.baseLightBlue = new THREE.PointLight(0x3f9cff, this.lowQuality ? 1.2 : 2.2, 1100, 2);
  this.baseLightBlue.position.set(MAP3.baseBlue.x, 260, MAP3.baseBlue.y);
  this.scene.add(this.baseLightBlue);
  this.baseLightRed = new THREE.PointLight(0xff5544, this.lowQuality ? 1.2 : 2.2, 1100, 2);
  this.baseLightRed.position.set(MAP3.baseRed.x, 260, MAP3.baseRed.y);
  this.scene.add(this.baseLightRed);

  this.buildTextures();
  this.buildMap();
  this.buildMarkers();
  this.buildAmbient();

  this.onResize = () => this.resize();
  window.addEventListener('resize', this.onResize);
  if (window.ResizeObserver) {
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
  }
  this.resize();
}

View3D.prototype.buildTextures = function () {
  const mk = (size, draw, rx, ry) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    draw(x, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  };

  this.grassTex = mk(256, (x, s) => {
    x.fillStyle = '#15251b';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const g = 28 + Math.random() * 30;
      x.fillStyle = `rgba(${g * 0.5}, ${g + 18}, ${g * 0.75}, ${0.12 + Math.random() * 0.2})`;
      const bx = Math.random() * s, by = Math.random() * s;
      x.fillRect(bx, by, 1 + Math.random() * 2, 2 + Math.random() * 4);
    }
    for (let i = 0; i < 30; i++) {
      x.fillStyle = `rgba(80,120,80,0.05)`;
      x.beginPath();
      x.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 30, 0, TAU);
      x.fill();
    }
  }, 10, 10);

  this.laneTex = mk(256, (x, s) => {
    x.fillStyle = '#3f372a';
    x.fillRect(0, 0, s, s);
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 4; col++) {
        const w = s / 4;
        const shade = 52 + Math.random() * 26;
        x.fillStyle = `rgb(${shade + 14}, ${shade + 4}, ${shade - 12})`;
        roundRectPath(x, col * w + 3, row * (s / 6) + 3, w - 6, s / 6 - 6, 5);
        x.fill();
        x.strokeStyle = 'rgba(20,16,10,0.35)';
        x.lineWidth = 2;
        x.stroke();
      }
    }
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(220,200,150,${0.03 + Math.random() * 0.06})`;
      x.fillRect(Math.random() * s, Math.random() * s, 3 + Math.random() * 14, 1 + Math.random() * 2);
    }
  }, 1, 1);
  this.laneTex.anisotropy = 8;

  this.waterTex = mk(256, (x, s) => {
    const g = x.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, '#0d2f3d');
    g.addColorStop(0.5, '#1d647a');
    g.addColorStop(1, '#0d2f3d');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = `rgba(160,230,240,${0.05 + Math.random() * 0.1})`;
      x.lineWidth = 1 + Math.random() * 2;
      x.beginPath();
      const y = Math.random() * s;
      x.moveTo(0, y);
      x.bezierCurveTo(s * 0.3, y + 16, s * 0.6, y - 16, s, y + 4);
      x.stroke();
    }
  }, 8, 2);

  this.stoneTex = mk(256, (x, s) => {
    x.fillStyle = '#3c3830';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const g = 45 + Math.random() * 35;
      x.fillStyle = `rgba(${g},${g - 3},${g - 9},0.3)`;
      x.beginPath();
      x.arc(Math.random() * s, Math.random() * s, 6 + Math.random() * 24, 0, TAU);
      x.fill();
    }
  }, 7, 7);

  this.woodTex = mk(256, (x, s) => {
    x.fillStyle = '#3a2818';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 10; i++) {
      const y = i * (s / 10);
      x.fillStyle = i % 2 ? 'rgba(105,76,48,0.28)' : 'rgba(52,36,22,0.3)';
      x.fillRect(0, y, s, s / 10 - 2);
      x.fillStyle = 'rgba(20,12,7,0.5)';
      x.fillRect(0, y + s / 10 - 2, s, 2);
      for (let k = 0; k < 12; k++) {
        x.strokeStyle = `rgba(150,110,70,${0.05 + Math.random() * 0.08})`;
        x.lineWidth = 1;
        x.beginPath();
        const yy = y + Math.random() * (s / 10 - 3);
        x.moveTo(0, yy);
        x.bezierCurveTo(s * 0.3, yy + 3, s * 0.7, yy - 3, s, yy + 1);
        x.stroke();
      }
    }
  }, 2, 2);
};

View3D.prototype.buildMap = function () {
  const map = new THREE.Group();
  this.scene.add(map);
  this.mapGroup = map;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4400, 4400, 1, 1),
    new THREE.MeshStandardMaterial({ map: this.grassTex, color: 0xb8c7b0, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(1800, -2, 1800);
  ground.receiveShadow = true;
  map.add(ground);

  // 三路
  for (const lane of ['top', 'mid', 'bot']) {
    const pts = LANE_PATHS[lane];
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'catmullrom', 0.35);
    this['laneCurve_' + lane] = curve;
    const border = this.makeRibbon(curve, MAP3.laneWidth + 70, 1.4);
    border.material = new THREE.MeshStandardMaterial({ color: 0x1d1a14, roughness: 1, side: THREE.DoubleSide });
    map.add(border);
    const ribbon = this.makeRibbon(curve, MAP3.laneWidth, 2.2);
    ribbon.material = new THREE.MeshStandardMaterial({ map: this.laneTex, color: 0xd8c9ae, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
    ribbon.receiveShadow = true;
    map.add(ribbon);
    const rim = this.makeRibbon(curve, MAP3.laneWidth + 22, 2.12);
    rim.material = new THREE.MeshBasicMaterial({ color: 0xe8c37a, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    map.add(rim);

    // 路边灯柱与碎晶
    for (let i = 0; i < 14; i++) {
      const t = 0.08 + i * 0.062;
      const p = curve.getPointAt(Math.min(0.98, t));
      const tang = curve.getTangentAt(Math.min(0.98, t));
      const nx = -tang.z, nz = tang.x;
      const side = i % 2 === 0 ? 1 : -1;
      const lx = p.x + nx * (MAP3.laneWidth * 0.62) * side;
      const lz = p.z + nz * (MAP3.laneWidth * 0.62) * side;
      const lamp = this.makeLaneLamp();
      lamp.position.set(lx, 2, lz);
      map.add(lamp);
    }
  }

  // 河道（垂直穿过中路）
  const bed = new THREE.Mesh(
    new THREE.PlaneGeometry(5600, 760),
    new THREE.MeshStandardMaterial({ color: 0x10232a, roughness: 0.9, side: THREE.DoubleSide })
  );
  bed.rotation.x = -Math.PI / 2;
  bed.rotation.z = -Math.PI / 4;
  bed.position.set(1800, 0.5, 1800);
  map.add(bed);

  const waterMat = new THREE.MeshStandardMaterial({
    map: this.waterTex, color: 0x9fd8e8, transparent: true, opacity: 0.8,
    roughness: 0.25, metalness: 0.25, depthWrite: false, side: THREE.DoubleSide
  });
  this.waterMat = waterMat;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(5600, 560), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.rotation.z = -Math.PI / 4;
  water.position.set(1800, 1.3, 1800);
  map.add(water);

  // 河道边缘装饰
  for (let i = 0; i < 26; i++) {
    const d = -2400 + i * 190;
    const x = 1800 + Math.cos(-Math.PI / 4) * d - Math.sin(-Math.PI / 4) * 300;
    const z = 1800 + Math.sin(-Math.PI / 4) * d + Math.cos(-Math.PI / 4) * 300;
    const rock = this.makeRock(24 + Math.random() * 40, 20 + Math.random() * 24);
    rock.position.set(x, 4, z);
    map.add(rock);
    if (i % 2) {
      const r2 = this.makeRock(20 + Math.random() * 30, 16 + Math.random() * 20);
      r2.position.set(1800 + Math.cos(-Math.PI / 4) * d + Math.sin(-Math.PI / 4) * 300, 4, 1800 + Math.sin(-Math.PI / 4) * d - Math.cos(-Math.PI / 4) * 300);
      map.add(r2);
    }
  }

  // 中路桥面（覆盖水面）
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(760, 3, 620),
    new THREE.MeshStandardMaterial({ map: this.woodTex, color: 0xb08a5c, roughness: 0.92 })
  );
  bridge.rotation.y = Math.PI / 4;
  bridge.position.set(1800, 1.2, 1800);
  bridge.receiveShadow = true;
  map.add(bridge);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(780, 22, 14),
      new THREE.MeshStandardMaterial({ color: 0x4a301b, roughness: 0.9 })
    );
    rail.rotation.y = Math.PI / 4;
    rail.position.set(1800 + Math.cos(Math.PI / 4) * side * 300, 24, 1800 - Math.sin(Math.PI / 4) * side * 300);
    rail.castShadow = true;
    map.add(rail);
  }

  // 大龙坑
  const pit = new THREE.Mesh(
    new THREE.CylinderGeometry(250, 280, 4, 32),
    new THREE.MeshStandardMaterial({ color: 0x22211b, roughness: 1 })
  );
  pit.position.set(EPIC_DEF.x, 0.8, EPIC_DEF.y);
  pit.receiveShadow = true;
  map.add(pit);
  const pitInner = new THREE.Mesh(
    new THREE.CircleGeometry(220, 40),
    new THREE.MeshStandardMaterial({ color: 0x0d1514, roughness: 0.7, metalness: 0.2 })
  );
  pitInner.rotation.x = -Math.PI / 2;
  pitInner.position.set(EPIC_DEF.x, 3.0, EPIC_DEF.y);
  map.add(pitInner);
  const pitRing = new THREE.Mesh(
    new THREE.RingGeometry(210, 240, 48),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  );
  pitRing.rotation.x = -Math.PI / 2;
  pitRing.position.set(EPIC_DEF.x, 3.4, EPIC_DEF.y);
  map.add(pitRing);
  this.pitRing = pitRing;

  // 基地平台
  for (const team of ['blue', 'red']) {
    const base = team === 'blue' ? MAP3.baseBlue : MAP3.baseRed;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(350, 370, 4, 48),
      new THREE.MeshStandardMaterial({ map: this.stoneTex, color: 0x6d6557, roughness: 0.95 })
    );
    pad.position.set(base.x, 0.8, base.y);
    pad.receiveShadow = true;
    map.add(pad);
    const top = new THREE.Mesh(
      new THREE.CircleGeometry(344, 48),
      new THREE.MeshStandardMaterial({ color: 0x2b2b26, roughness: 0.9 })
    );
    top.rotation.x = -Math.PI / 2;
    top.position.set(base.x, 3.0, base.y);
    map.add(top);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(10, 26, 900, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team].hex, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    beam.position.set(base.x, 450, base.y);
    map.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(250, 275, 48),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team].hex, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(base.x, 3.2, base.y);
    map.add(ring);
    const rune = new THREE.Mesh(
      new THREE.RingGeometry(310, 320, 8),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team].hex, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
    );
    rune.rotation.x = -Math.PI / 2;
    rune.rotation.z = Math.PI / 8;
    rune.position.set(base.x, 3.1, base.y);
    map.add(rune);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      const pad2 = new THREE.Mesh(
        new THREE.CircleGeometry(38, 20),
        new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team].hex, transparent: true, opacity: 0.12, depthWrite: false })
      );
      pad2.rotation.x = -Math.PI / 2;
      pad2.position.set(base.x + Math.cos(a) * 160, 3.0, base.y + Math.sin(a) * 160);
      map.add(pad2);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const bx = base.x + Math.cos(a) * 286;
      const bz = base.y + Math.sin(a) * 286;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 3.2, 170, 5),
        new THREE.MeshStandardMaterial({ color: 0x2b2116, roughness: 0.9 })
      );
      pole.position.set(bx, 85, bz);
      pole.castShadow = true;
      map.add(pole);
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(58, 32),
        new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team].hex, side: THREE.DoubleSide, toneMapped: false })
      );
      flag.position.set(bx + Math.cos(a + Math.PI / 2) * 30, 140, bz + Math.sin(a + Math.PI / 2) * 30);
      flag.rotation.y = -a + Math.PI / 2;
      map.add(flag);
    }
  }

  // 野区装饰树/石/灌木
  const rng = mulberry32(777);
  const trees = [];
  const rocks = [];
  const bushes = [];
  for (let i = 0; i < 150; i++) {
    const x = 260 + rng() * 3100;
    const y = 260 + rng() * 3100;
    if (distToPolyline(x, y, LANE_PATHS.top) < 330) continue;
    if (distToPolyline(x, y, LANE_PATHS.mid) < 330) continue;
    if (distToPolyline(x, y, LANE_PATHS.bot) < 330) continue;
    if (dist(x, y, MAP3.baseBlue.x, MAP3.baseBlue.y) < 460) continue;
    if (dist(x, y, MAP3.baseRed.x, MAP3.baseRed.y) < 460) continue;
    if (JUNGLE_CAMPS.some(c => dist(x, y, c.x, c.y) < 170)) continue;
    if (dist(x, y, 1800, 1800) < 420) continue;
    const kind = rng();
    if (kind < 0.58) trees.push([x, y, 0.8 + rng() * 0.8, rng() * TAU]);
    else if (kind < 0.8) rocks.push([x, y, 0.7 + rng() * 1.2, rng() * TAU]);
    else bushes.push([x, y, 0.7 + rng() * 0.9, rng() * TAU]);
  }

  const trunkGeo = new THREE.CylinderGeometry(9, 14, 80, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 });
  const leafGeo = new THREE.ConeGeometry(52, 150, 7);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1c3d2a, roughness: 1, flatShading: true });
  const leafGeo2 = new THREE.ConeGeometry(38, 110, 7);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, trees.length);
  const leafMesh2 = new THREE.InstancedMesh(leafGeo2, leafMat, trees.length);
  const dummy = new THREE.Object3D();
  const leafColors = [new THREE.Color(0x1c3d2a), new THREE.Color(0x22462f), new THREE.Color(0x193426), new THREE.Color(0x2a4b33)];
  trees.forEach((t, i) => {
    const [x, y, s, rot] = t;
    dummy.position.set(x, 40 * s, y);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 130 * s, y);
    dummy.updateMatrix();
    leafMesh.setMatrixAt(i, dummy.matrix);
    leafMesh.setColorAt(i, leafColors[Math.floor(rng() * leafColors.length)]);
    dummy.position.set(x, 205 * s, y);
    dummy.scale.setScalar(s * 0.9);
    dummy.updateMatrix();
    leafMesh2.setMatrixAt(i, dummy.matrix);
    leafMesh2.setColorAt(i, leafColors[Math.floor(rng() * leafColors.length)]);
  });
  trunkMesh.castShadow = !this.lowQuality;
  leafMesh.castShadow = !this.lowQuality;
  leafMesh2.castShadow = !this.lowQuality;
  leafMesh.receiveShadow = true;
  trunkMesh.instanceMatrix.needsUpdate = true;
  leafMesh.instanceMatrix.needsUpdate = true;
  leafMesh2.instanceMatrix.needsUpdate = true;
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  if (leafMesh2.instanceColor) leafMesh2.instanceColor.needsUpdate = true;
  map.add(trunkMesh, leafMesh, leafMesh2);

  const rockGeo = new THREE.DodecahedronGeometry(34, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4a43, roughness: 0.95, flatShading: true });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length + 40);
  let ri = 0;
  for (const r of rocks) {
    const [x, y, s, rot] = r;
    dummy.position.set(x, 14 * s, y);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(s, s * 0.7, s);
    dummy.updateMatrix();
    rockMesh.setMatrixAt(ri++, dummy.matrix);
  }
  for (let i = 0; i < 40; i++) {
    const edge = i % 4;
    const along = 200 + rng() * 3200;
    let x, y;
    if (edge === 0) { x = along; y = 60; }
    else if (edge === 1) { x = along; y = 3540; }
    else if (edge === 2) { x = 60; y = along; }
    else { x = 3540; y = along; }
    const s = 1.8 + rng() * 2.4;
    dummy.position.set(x, 20 * s, y);
    dummy.rotation.set(0, rng() * TAU, 0);
    dummy.scale.set(s * 1.6, s, s * 1.4);
    dummy.updateMatrix();
    rockMesh.setMatrixAt(ri++, dummy.matrix);
  }
  rockMesh.castShadow = !this.lowQuality;
  rockMesh.instanceMatrix.needsUpdate = true;
  map.add(rockMesh);

  const bushGeo = new THREE.IcosahedronGeometry(30, 1);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x1b3524, roughness: 1, flatShading: true });
  const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, bushes.length);
  bushes.forEach((b, i) => {
    const [x, y, s, rot] = b;
    dummy.position.set(x, 16 * s, y);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(s * 1.4, s * 0.6, s * 1.2);
    dummy.updateMatrix();
    bushMesh.setMatrixAt(i, dummy.matrix);
  });
  bushMesh.instanceMatrix.needsUpdate = true;
  map.add(bushMesh);

  // 草丛与苔藓地衣
  const grassGeo = new THREE.ConeGeometry(5, 24, 3);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x2f5b35, flatShading: true, roughness: 1 });
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, 360);
  let gi = 0;
  for (let i = 0; i < 1400 && gi < 360; i++) {
    const x = 260 + rng() * 3080;
    const y = 260 + rng() * 3080;
    if (distToPolyline(x, y, LANE_PATHS.top) < 250) continue;
    if (distToPolyline(x, y, LANE_PATHS.mid) < 250) continue;
    if (distToPolyline(x, y, LANE_PATHS.bot) < 250) continue;
    if (dist(x, y, MAP3.baseBlue.x, MAP3.baseBlue.y) < 420) continue;
    if (dist(x, y, MAP3.baseRed.x, MAP3.baseRed.y) < 420) continue;
    if (JUNGLE_CAMPS.some(c => dist(x, y, c.x, c.y) < 110)) continue;
    if (dist(x, y, EPIC_DEF.x, EPIC_DEF.y) < 300) continue;
    const s = 0.7 + rng() * 1.5;
    dummy.position.set(x, 12 * s, y);
    dummy.rotation.set(rand(-0.25, 0.25), rng() * TAU, rand(-0.25, 0.25));
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(gi++, dummy.matrix);
  }
  grassMesh.count = gi;
  grassMesh.instanceMatrix.needsUpdate = true;
  map.add(grassMesh);

  const mossGeo = new THREE.CircleGeometry(1, 14);
  const mossMat = new THREE.MeshBasicMaterial({ color: 0x1a3a25, transparent: true, opacity: 0.32, depthWrite: false });
  const mossMesh = new THREE.InstancedMesh(mossGeo, mossMat, 90);
  let mi = 0;
  for (let i = 0; i < 500 && mi < 90; i++) {
    const x = 300 + rng() * 3000;
    const y = 300 + rng() * 3000;
    if (distToPolyline(x, y, LANE_PATHS.top) < 300) continue;
    if (distToPolyline(x, y, LANE_PATHS.mid) < 300) continue;
    if (distToPolyline(x, y, LANE_PATHS.bot) < 300) continue;
    if (dist(x, y, 1800, 1800) < 300) continue;
    const s = 18 + rng() * 48;
    dummy.position.set(x, 3.3, y);
    dummy.rotation.set(-Math.PI / 2, 0, rng() * TAU);
    dummy.scale.set(s, s * (0.55 + rng() * 0.4), 1);
    dummy.updateMatrix();
    mossMesh.setMatrixAt(mi++, dummy.matrix);
  }
  mossMesh.count = mi;
  mossMesh.instanceMatrix.needsUpdate = true;
  map.add(mossMesh);
};

View3D.prototype.makeRibbon = function (curve, width, y) {
  const segs = 160;
  const pos = [];
  const uv = [];
  const idx = [];
  const total = curve.getLength();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const nx = -tan.z, nz = tan.x;
    pos.push(p.x + nx * width / 2, y, p.z + nz * width / 2);
    pos.push(p.x - nx * width / 2, y, p.z - nz * width / 2);
    uv.push(0, t * total / 220, 1, t * total / 220);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
};

View3D.prototype.makeLaneLamp = function () {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 13, 42, 6), new THREE.MeshStandardMaterial({ color: 0x3b352a, roughness: 1 }));
  base.position.y = 21;
  base.castShadow = true;
  g.add(base);
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(10, 0),
    new THREE.MeshBasicMaterial({ color: 0xffcf7a })
  );
  crystal.position.y = 52;
  g.add(crystal);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(22, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.y = 52;
  g.add(glow);
  return g;
};

View3D.prototype.makeRock = function (r, h) {
  const mesh = new THREE.Mesh(
    new THREE.DodecahedronGeometry(r, 0),
    new THREE.MeshStandardMaterial({ color: 0x474842, roughness: 0.95, flatShading: true })
  );
  mesh.scale.set(1.2, h / r, 1);
  mesh.castShadow = true;
  return mesh;
};

View3D.prototype.buildMarkers = function () {
  this.aimMarker = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(18, 22, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  this.aimMarker.add(ring);
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(4, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })
  );
  dot.rotation.x = -Math.PI / 2;
  this.aimMarker.add(dot);
  this.aimMarker.position.y = 6;
  this.scene.add(this.aimMarker);

  this.hoverRing = new THREE.Mesh(
    new THREE.RingGeometry(40, 48, 40),
    new THREE.MeshBasicMaterial({ color: 0xff5c5c, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
  );
  this.hoverRing.rotation.x = -Math.PI / 2;
  this.hoverRing.visible = false;
  this.scene.add(this.hoverRing);

  this.clickRing = new THREE.Group();
  const cr = new THREE.Mesh(
    new THREE.RingGeometry(24, 30, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe6a3, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  cr.rotation.x = -Math.PI / 2;
  this.clickRing.add(cr);
  this.clickRing.position.y = 5;
  this.clickRing.visible = false;
  this.scene.add(this.clickRing);
  this.clickData = null;

  this.skillRangeRing = new THREE.Mesh(
    new THREE.RingGeometry(0.986, 1, 96),
    new THREE.MeshBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    })
  );
  this.skillRangeRing.rotation.x = -Math.PI / 2;
  this.skillRangeRing.position.y = 4.4;
  this.skillRangeRing.visible = false;
  this.scene.add(this.skillRangeRing);
};

View3D.prototype.showSkillRange = function (radius, color, owner) {
  if (!this.skillRangeRing) return;
  this.skillRangeOwner = owner || null;
  this.skillRangeRing.visible = true;
  this.skillRangeRing.scale.setScalar(Math.max(30, radius));
  this.skillRangeRing.material.color.setHex(color || 0xffd166);
  if (owner) this.skillRangeRing.position.set(owner.x, 4.4, owner.y);
};

View3D.prototype.updateSkillRangeOwner = function (owner) {
  this.skillRangeOwner = owner || null;
  if (this.skillRangeRing && this.skillRangeOwner) {
    this.skillRangeRing.position.set(this.skillRangeOwner.x, 4.4, this.skillRangeOwner.y);
  }
};

View3D.prototype.hideSkillRange = function () {
  this.skillRangeOwner = null;
  if (this.skillRangeRing) this.skillRangeRing.visible = false;
};

View3D.prototype.buildAmbient = function () {
  const rng = mulberry32(42);
  const count = 130;
  const pos = new Float32Array(count * 3);
  this.fireflyBase = [];
  for (let i = 0; i < count; i++) {
    const x = 300 + rng() * 3000;
    const y = 300 + rng() * 3000;
    const h = 20 + rng() * 80;
    pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = y;
    this.fireflyBase.push({ x, y, h, phase: rng() * TAU });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffd98a, size: 7, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  this.fireflies = new THREE.Points(geo, mat);
  this.scene.add(this.fireflies);
};

View3D.prototype.resize = function () {
  const w = this.container.clientWidth || 1280;
  const h = this.container.clientHeight || 720;
  this.width = w;
  this.height = h;
  this.renderer.setSize(w, h, false);
  this.camera.aspect = w / h;
  this.camera.updateProjectionMatrix();
};

View3D.prototype.setPointer = function (clientX, clientY) {
  const r = this.renderer.domElement.getBoundingClientRect();
  this.pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
  this.pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
};

View3D.prototype.raycastGround = function () {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(this.pointer, this.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const out = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, out)) return { x: out.x, y: out.z };
  return null;
};

View3D.prototype.project = function (x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(this.camera);
  return {
    x: (v.x * 0.5 + 0.5) * this.width,
    y: (-v.y * 0.5 + 0.5) * this.height,
    z: v.z,
    visible: v.z > -1 && v.z < 1
  };
};

View3D.prototype.updateCamera = function (dt, px, py, ax, ay) {
  const lead = 0.1;
  const tx = clamp(px + (ax - px) * lead, 500, 3100);
  const ty = clamp(py + (ay - py) * lead, 500, 3100);
  const k = 1 - Math.exp(-6.5 * dt);
  this.camFocus.x = lerp(this.camFocus.x, tx, k);
  this.camFocus.z = lerp(this.camFocus.z, ty, k);
  this.camFocus.y = 0;
  const look = this.camFocus;
  const z = this.zoom;
  const offY = 1150 * z;
  const offZ = 1320 * z;
  let sx = 0, sz = 0;
  if (this.shakeEnabled === false) this.shake = 0;
  if (this.shake > 0.1) {
    sx = rand(-this.shake, this.shake);
    sz = rand(-this.shake, this.shake);
    this.shake = Math.max(0, this.shake - dt * 30);
  }
  this.camera.position.set(look.x + sx, offY, look.z + offZ + sz);
  this.camera.lookAt(look.x, 26, look.z);
  this.moon.position.set(look.x + 600, 1300, look.z + 500);
  this.moon.target.position.set(look.x, 0, look.z);
  this.moon.target.updateMatrixWorld();
};

View3D.prototype.resetBattle = function () {
  for (const bar of this.bars) {
    try { bar.dispose(); } catch (e) { /* ignore */ }
  }
  this.bars = [];
  for (const [, el] of this.plates) el.remove();
  this.plates.clear();
  for (const e of this.effects) {
    try {
      if (e.dispose) e.dispose(); else this.destroyEffect(e);
    } catch (err) { /* ignore */ }
  }
  this.effects = [];
  for (const f of this.floaters) {
    f.el.style.display = 'none';
    this.floaterPool.push(f.el);
  }
  this.floaters = [];
  this.aimMarker.visible = false;
  this.hoverRing.visible = false;
  if (this.skillRangeRing) this.skillRangeRing.visible = false;
  if (this.hideSkillAimLine) this.hideSkillAimLine();
  this.clickRing.visible = false;
  this.clickData = null;
  this.shake = 0;
};

View3D.prototype.zoomBy = function (delta) {
  this.zoom = clamp(this.zoom + delta, 0.72, 1.55);
};

View3D.prototype.setAim = function (aim, hovered) {
  if (!aim) { this.aimMarker.visible = false; this.hoverRing.visible = false; return; }
  this.aimMarker.visible = true;
  this.aimMarker.position.x = aim.x;
  this.aimMarker.position.z = aim.y;
  const color = hovered ? 0xff6b6b : 0xf2e6c9;
  this.aimMarker.children.forEach(m => m.material.color.setHex(color));
  this.aimMarker.rotation.y += 0.02;
  if (hovered) {
    this.hoverRing.visible = true;
    this.hoverRing.position.set(hovered.x, 6, hovered.y);
    this.hoverRing.scale.setScalar(Math.max(0.6, hovered.radius / 45));
  } else {
    this.hoverRing.visible = false;
  }
};

View3D.prototype.showClick = function (x, y, attack) {
  this.clickData = { x, y, t: 0.5, dur: 0.5, attack };
  this.clickRing.visible = true;
  this.clickRing.position.x = x;
  this.clickRing.position.z = y;
  this.clickRing.children[0].material.color.setHex(attack ? 0xff7a7a : 0xffe6a3);
};

/* ---------------- 单位血条 ---------------- */
View3D.prototype.addUnitBar = function (unit, opts) {
  const width = opts.width || 80;
  const height = opts.height || 9;
  const group = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 8, height + 5),
    new THREE.MeshBasicMaterial({ color: 0x080b0e, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false })
  );
  bg.renderOrder = 40;
  group.add(bg);
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: opts.color !== undefined ? opts.color : (opts.ally ? 0x68e08d : 0xff5f6d), transparent: true, opacity: 1, depthTest: false, depthWrite: false })
  );
  fill.renderOrder = 41;
  group.add(fill);
  const shield = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 2.5),
    new THREE.MeshBasicMaterial({ color: 0xdcecff, transparent: true, opacity: 1, depthTest: false, depthWrite: false })
  );
  shield.renderOrder = 42;
  shield.position.y = height / 2 + 2;
  shield.visible = false;
  group.add(shield);
  if (opts.player) {
    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 12, height + 9),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.25, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    border.renderOrder = 39;
    group.add(border);
  }
  this.scene.add(group);
  const desiredPx = opts.desiredPx || (unit.type === 'base' ? 150 : unit.type === 'tower' ? 96 : unit.type === 'monster' ? 64 : 30);
  const rec = {
    unit, group, fill, shield, width, height, y: opts.y || 150, desiredPx,
    dispose: () => {
      this.scene.remove(group);
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
  };
  this.bars.push(rec);
  return rec;
};

View3D.prototype.updateBars = function () {
  for (const bar of this.bars) {
    const u = bar.unit;
    if (u.removed) { bar.group.visible = false; continue; }
    const p = this.project(u.x, bar.y, u.y);
    let show = !u.dead && u.hp > 0 && p.visible && p.x > -30 && p.x < this.width + 30 && p.y > -40 && p.y < this.height + 50;
    if (show && u.type === 'minion') {
      const player = u.game && u.game.player;
      const d = player ? dist(player.x, player.y, u.x, u.y) : 9999;
      if (u.hp >= u.maxHp - 0.5 && d > 420) show = false;
    }
    bar.group.visible = show;
    if (!show) continue;
    const pos = new THREE.Vector3(u.x, bar.y, u.y);
    const dist3 = Math.max(60, this.camera.position.distanceTo(pos));
    const worldH = 2 * Math.tan((this.camera.fov * Math.PI / 180) / 2) * dist3;
    const worldW = bar.desiredPx / this.width * worldH * this.camera.aspect;
    bar.group.scale.setScalar(clamp(worldW / bar.width, 0.06, 4));
    bar.group.position.set(u.x, bar.y, u.y);
    bar.group.quaternion.copy(this.camera.quaternion);
    const frac = clamp(u.hp / u.maxHp, 0, 1);
    bar.fill.scale.x = Math.max(0.001, frac);
    bar.fill.position.x = -bar.width / 2 + (bar.width * frac) / 2;
    if (u.shield > 0) {
      bar.shield.visible = true;
      const sf = clamp(u.shield / u.maxHp, 0, 1);
      bar.shield.scale.x = Math.max(0.001, sf);
      bar.shield.position.x = -bar.width / 2 + (bar.width * sf) / 2;
    } else {
      bar.shield.visible = false;
    }
  }
};

View3D.prototype.removeBar = function (unit) {
  const idx = this.bars.findIndex(b => b.unit === unit);
  if (idx >= 0) {
    this.bars[idx].dispose();
    this.bars.splice(idx, 1);
  }
};

/* ---------------- 名字牌 / 飘字 ---------------- */
View3D.prototype.addNameplate = function (unit) {
  const div = document.createElement('div');
  div.className = 'unit-nameplate' + (unit.isPlayer ? ' player' : (unit.team === 'blue' ? ' ally' : ' enemy'));
  this.overlay.appendChild(div);
  this.plates.set(unit, div);
  return div;
};

View3D.prototype.removeNameplate = function (unit) {
  const div = this.plates.get(unit);
  if (div) div.remove();
  this.plates.delete(unit);
};

View3D.prototype.updatePlates = function () {
  for (const [u, el] of this.plates) {
    if (u.removed) { el.style.display = 'none'; continue; }
    const p = this.project(u.x, u.height ? u.height + 44 : 160, u.y);
    if (!p.visible || p.x < -80 || p.x > this.width + 80 || p.y < -40 || p.y > this.height + 40) {
      el.style.display = 'none';
      continue;
    }
    el.style.display = 'block';
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    if (u.dead) {
      el.innerHTML = `<span>${u.displayName}</span><span class="st">${Math.ceil(u.deathTimer)}s 后重生</span>`;
    } else {
      el.innerHTML = `<span>${u.displayName}</span><span class="lv">Lv.${u.level}</span>`;
    }
  }
};

View3D.prototype.damageText = function (x, y, z, text, cls) {
  if (!this.showDamageText) return;
  let el = this.floaterPool.pop();
  if (!el) {
    el = document.createElement('div');
    el.className = 'dmg-number';
    this.overlay.appendChild(el);
  }
  el.className = 'dmg-number' + (cls ? ' ' + cls : '');
  el.textContent = text;
  el.style.opacity = '1';
  this.floaters.push({ el, x, y, z, life: 0.95, maxLife: 0.95, rise: 0 });
};

View3D.prototype.updateFloaters = function (dt) {
  for (const f of this.floaters) {
    f.life -= dt;
    f.rise += dt * 60;
    const p = this.project(f.x, f.y + f.rise, f.z);
    if (!p.visible || f.life <= 0) {
      f.el.style.opacity = '0';
      continue;
    }
    f.el.style.display = 'block';
    f.el.style.left = p.x + 'px';
    f.el.style.top = p.y + 'px';
    f.el.style.opacity = String(clamp(f.life / f.maxLife, 0, 1));
  }
  this.floaters = this.floaters.filter(f => {
    if (f.life > 0) return true;
    f.el.style.display = 'none';
    this.floaterPool.push(f.el);
    return false;
  });
};

/* ---------------- 特效 ---------------- */
View3D.prototype.addEffect = function (obj, life) {
  obj.life = life;
  obj.maxLife = life;
  this.effects.push(obj);
  if (this.effects.length > 160) {
    const old = this.effects.shift();
    this.destroyEffect(old);
  }
};

View3D.prototype.destroyEffect = function (e) {
  if (e.group) {
    this.scene.remove(e.group);
    e.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
};

View3D.prototype.ring = function (x, y, r, color, life, width) {
  const w = width || 8;
  const geo = new THREE.RingGeometry(Math.max(1, r - w * 1.4), r + w * 1.4, 56);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 5, y);
  this.scene.add(mesh);
  this.addEffect({
    group: mesh,
    update: (e, k) => {
      const s = 0.8 + (1 - k) * 0.55;
      mesh.scale.setScalar(s);
      mat.opacity = k * 0.85;
    }
  }, life || 0.5);
};

View3D.prototype.sector = function (x, y, angle, radius, half, color) {
  const thetaStart = -angle - half;
  const geo = new THREE.RingGeometry(radius * 0.25, radius, 48, 1, thetaStart, half * 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 4, y);
  this.scene.add(mesh);
  this.addEffect({
    group: mesh,
    update: (e, k) => {
      mat.opacity = k * 0.5;
      mesh.scale.setScalar(1 + (1 - k) * 0.18);
    }
  }, 0.32);
};

View3D.prototype.dashFx = function (x1, y1, x2, y2, color) {
  const len = Math.max(10, Math.hypot(x2 - x1, y2 - y1));
  const geo = new THREE.PlaneGeometry(len, 46);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -Math.atan2(y2 - y1, x2 - x1);
  mesh.position.set((x1 + x2) / 2, 8, (y1 + y2) / 2);
  this.scene.add(mesh);
  this.addEffect({
    group: mesh,
    update: (e, k) => { mat.opacity = k * 0.5; }
  }, 0.3);
  if (this.footDust) this.footDust(x2, y2, color);
  this.burst(x2, y2, color, 5, 90);
};

View3D.prototype.burst = function (x, y, color, count, speed) {
  const n = Math.max(4, count || 8);
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x + rand(-8, 8);
    pos[i * 3 + 1] = rand(15, 60);
    pos[i * 3 + 2] = y + rand(-8, 8);
    const a = Math.random() * TAU;
    const sp = rand(speed * 0.3, speed || 140) * 0.55;
    vel.push(new THREE.Vector3(Math.cos(a) * sp, rand(40, 180), Math.sin(a) * sp));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: 10, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  this.scene.add(points);
  this.addEffect({
    group: points,
    update: (e, k, dt) => {
      const attr = geo.attributes.position;
      for (let i = 0; i < n; i++) {
        vel[i].y -= 240 * dt;
        attr.array[i * 3] += vel[i].x * dt;
        attr.array[i * 3 + 1] += vel[i].y * dt;
        attr.array[i * 3 + 2] += vel[i].z * dt;
        if (attr.array[i * 3 + 1] < 4) attr.array[i * 3 + 1] = 4;
      }
      attr.needsUpdate = true;
      mat.opacity = k;
    }
  }, 0.75);
};

View3D.prototype.slash = function (x, y, angle, color) {
  this.sector(x, y, angle, 72, 1.1, color || 0xffe6c2);
};

View3D.prototype.telegraphFx = function (x, y, radius, color, delay) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  disc.rotation.x = -Math.PI / 2;
  group.add(disc);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 8, radius, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const inner = new THREE.Mesh(
    new THREE.RingGeometry(1, 4, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
  );
  inner.rotation.x = -Math.PI / 2;
  group.add(inner);
  group.position.set(x, 4.5, y);
  this.scene.add(group);
  const obj = {
    group,
    update: (e, k) => {
      const progress = 1 - k;
      const pulse = 0.5 + Math.sin(performance.now() * 0.012) * 0.2;
      disc.material.opacity = 0.08 + progress * 0.12;
      ring.material.opacity = 0.35 + pulse * 0.3;
      inner.scale.setScalar(0.15 + progress * 0.85);
      inner.material.opacity = 0.3 * (1 - progress * 0.6);
    },
    dispose: () => {
      this.scene.remove(group);
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
  };
  this.addEffect(obj, delay);
  return obj;
};

View3D.prototype.createProjectileVisual = function (color, arrow, big) {
  const g = new THREE.Group();
  if (arrow) {
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(big ? 54 : 36, 3, 3),
      new THREE.MeshBasicMaterial({ color })
    );
    g.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(big ? 10 : 6, big ? 18 : 12, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = big ? 34 : 24;
    g.add(tip);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(big ? 20 : 12, 10, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    g.add(glow);
  } else {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(big ? 13 : 9, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    g.add(core);
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(big ? 28 : 19, 12, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    g.add(aura);
  }
  this.scene.add(g);
  return {
    group: g,
    setPos: (x, h, y) => g.position.set(x, h, y),
    setAngle: (a) => { g.rotation.y = -a; },
    dispose: () => {
      this.scene.remove(g);
      g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
  };
};

View3D.prototype.updateEffects = function (dt) {
  const keep = [];
  for (const e of this.effects) {
    e.life -= dt;
    if (e.life <= 0) {
      if (e.dispose) e.dispose(); else this.destroyEffect(e);
      continue;
    }
    const k = clamp(e.life / e.maxLife, 0, 1);
    if (e.update) e.update(e, k, dt);
    keep.push(e);
  }
  this.effects = keep;
};

/* ---------------- 主循环 ---------------- */
View3D.prototype.update = function (dt, game) {
  this.clockTime += dt;
  if (this.waterMat) {
    this.waterTex.offset.x -= dt * 0.035;
    this.waterTex.offset.y += dt * 0.01;
  }
  this.pitRing.material.opacity = 0.15 + Math.sin(this.clockTime * 1.8) * 0.07;
  if (this.fireflies) {
    const attr = this.fireflies.geometry.attributes.position;
    for (let i = 0; i < this.fireflyBase.length; i++) {
      const b = this.fireflyBase[i];
      attr.array[i * 3 + 1] = b.h + Math.sin(this.clockTime * 1.2 + b.phase) * 12;
    }
    attr.needsUpdate = true;
    this.fireflies.material.opacity = 0.42 + Math.sin(this.clockTime * 2) * 0.12;
  }
  this.updateEffects(dt);
  this.updateBars();
  this.updatePlates();
  this.updateFloaters(dt);
  if (this.skillRangeRing && this.skillRangeRing.visible) {
    this.skillRangeRing.material.opacity = 0.3 + Math.sin(this.clockTime * 5) * 0.12;
    if (this.skillRangeOwner) this.skillRangeRing.position.set(this.skillRangeOwner.x, 4.4, this.skillRangeOwner.y);
  }
  if (this.clickData) {
    const m = this.clickData;
    m.t -= dt;
    const k = clamp(m.t / m.dur, 0, 1);
    this.clickRing.scale.setScalar(1.5 - k * 0.6);
    this.clickRing.children[0].material.opacity = k * 0.8;
    if (m.t <= 0) {
      this.clickData = null;
      this.clickRing.visible = false;
    }
  }
};

View3D.prototype.render = function () {
  this.renderer.render(this.scene, this.camera);
};

View3D.prototype.capture = function (name) {
  try {
    const oldW = this.width, oldH = this.height;
    const oldPR = this.renderer.getPixelRatio();
    const oldAspect = this.camera.aspect;
    const scale = Math.min(2, 1280 / Math.max(1, this.width));
    const w = Math.max(640, Math.round(this.width * scale));
    const h = Math.round(w * this.height / Math.max(1, this.width));
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    fetch('/__shot?name=' + encodeURIComponent(name || 'latest'), { method: 'POST', body: c.toDataURL('image/png') });
    this.renderer.setPixelRatio(oldPR);
    this.renderer.setSize(oldW, oldH, false);
    this.camera.aspect = oldAspect;
    this.camera.updateProjectionMatrix();
    return 'sent';
  } catch (e) {
    return 'error: ' + e.message;
  }
};

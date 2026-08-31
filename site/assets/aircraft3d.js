/* Scroll-driven aircraft build.
   Wireframe -> solid airframe, camera arcing from plan view to head-on, then the
   expo hall assembles around it. All geometry is generated here; no model files.
   three.js r160 is vendored at assets/vendor/three/. */

import * as THREE from "./vendor/three/three.module.min.js";

const section = document.getElementById("build3d");
const canvas  = document.getElementById("build3dCanvas");

let renderer = null;
if (section && canvas) {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: "high-performance"
    });
    if (!renderer.getContext()) renderer = null;
  } catch (e) { renderer = null; }
}
if (!renderer) {
  if (section) section.classList.add("no3d");   // CSS falls back to a static panel
} else {
  init(renderer);
}

function init(renderer) {
  const phaseEl = document.getElementById("build3dPhase");
  const barEl   = document.getElementById("build3dBar");
  const capEl   = document.getElementById("build3dCaption");
  const headEl  = document.getElementById("build3dHead");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clamp   = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg     = (p, a, b) => clamp((p - a) / (b - a));
  const ease    = t => t * t * (3 - 2 * t);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const lerp    = (a, b, t) => a + (b - a) * t;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const E = (x, y, z) => new THREE.Euler(x, y, z);

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 3000);
  const camTarget = new THREE.Vector3(0, 2, 0);

  scene.add(new THREE.AmbientLight(0xeef4ff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(70, 110, 80); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff6a45, 1.6);
  rim.position.set(-80, 34, -70); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x9fb6ff, 0x140a08, 0.55));

  /* ------------------------------------------------------------ materials */
  const fadeMats = [];
  const track = m => { fadeMats.push(m); return m; };

  const wireMat = track(new THREE.MeshBasicMaterial({
    color: 0xff5334, wireframe: true, transparent: true, opacity: 0, depthWrite: false
  }));
  const solidMat = (color, metal = 0.55, rough = 0.34) => track(new THREE.MeshStandardMaterial({
    color, metalness: metal, roughness: rough, transparent: true, opacity: 0, side: THREE.DoubleSide
  }));
  const skinMat  = solidMat(0xe9edf5);
  const trimMat  = solidMat(0x8a94a6, 0.7, 0.35);
  const darkMat  = solidMat(0x11151d, 0.2, 0.7);
  const brandMat = solidMat(0xd8241a, 0.35, 0.42);
  const cheatMat = solidMat(0xf79521, 0.3, 0.5);
  const glassMat = solidMat(0x0d1520, 0.9, 0.15);

  /* --------------------------------------------------------- geometry kit */
  function lathe(profile, phiStart, phiLength, segs = 44) {
    const g = new THREE.LatheGeometry(
      profile.map(p => new THREE.Vector2(p[0], p[1])), segs, phiStart, phiLength);
    g.rotateX(Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }
  function shapeOf(pts) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    return s;
  }
  /* horizontal surface: span along X, chord along Z, thickness along Y */
  function planform(pts, thick) {
    const g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: thick, bevelEnabled: false, curveSegments: 2 });
    g.rotateX(Math.PI / 2); g.translate(0, thick / 2, 0); g.computeVertexNormals();
    return g;
  }
  /* vertical surface: height along Y, chord along Z, thickness along X */
  function finPlate(pts, thick) {
    const g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: thick, bevelEnabled: false, curveSegments: 2 });
    g.rotateY(-Math.PI / 2); g.translate(thick / 2, 0, 0); g.computeVertexNormals();
    return g;
  }

  const NOSE_P = [[0.32, 51], [1.5, 49.4], [2.7, 47], [3.8, 43.4], [4.5, 39], [4.86, 33], [5.0, 24], [5.0, 14]];
  const MID_P  = [[5.0, 14], [5.0, -14]];
  const AFT_P  = [[5.0, -14], [4.97, -23], [4.72, -31], [4.1, -38], [3.1, -44], [1.8, -48.5], [0.7, -51]];
  const FULL_P = NOSE_P.concat(MID_P.slice(1), AFT_P.slice(1));

  /* ------------------------------------------------------- part registry */
  const aircraft = new THREE.Group();
  scene.add(aircraft);
  const parts = [];

  /** Wrap an object with a wireframe twin and give it an entry vector.
   *  The twin is a deep clone, so mirrored scale and child transforms carry over. */
  function addPart(obj, o) {
    const holder = new THREE.Group();
    const twin = obj.clone(true);
    twin.traverse(c => { if (c.isMesh) c.material = wireMat; });
    holder.add(obj, twin);
    holder.position.copy(o.pos);
    if (o.rot) holder.rotation.copy(o.rot);
    aircraft.add(holder);
    parts.push({
      g: holder,
      home: holder.position.clone(),
      homeRot: holder.rotation.clone(),
      from: o.from,
      fromRot: o.fromRot || new THREE.Euler(),
      t0: o.t0, t1: o.t1
    });
    return holder;
  }

  /* fuselage barrels */
  addPart(new THREE.Mesh(lathe(MID_P), skinMat),
    { pos: V(0, 0, 0), from: V(0, -48, 0), t0: 0.045, t1: 0.14 });
  addPart(new THREE.Mesh(lathe(NOSE_P), skinMat),
    { pos: V(0, 0, 0), from: V(0, 14, 66), fromRot: E(0.3, 0.25, 0), t0: 0.10, t1: 0.20 });
  addPart(new THREE.Mesh(lathe(AFT_P), skinMat),
    { pos: V(0, 0, 0), from: V(0, 12, -66), fromRot: E(-0.3, -0.25, 0), t0: 0.15, t1: 0.25 });

  /* wings */
  const wingGeo    = planform([[0, 16], [40, -6], [40, -14], [0, -14]], 1.5);
  const wingletGeo = finPlate([[-4, 0], [3, 0], [0.5, 8], [-2.5, 8]], 1.0);
  function wing() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(wingGeo, skinMat));
    const wl = new THREE.Mesh(wingletGeo, skinMat);
    wl.position.set(39.4, 0.5, -10);
    wl.rotation.z = -0.2;
    g.add(wl);
    return g;
  }
  addPart(wing(),
    { pos: V(4.2, -2.2, -3), rot: E(0, 0, 0.085), from: V(60, -16, 0), fromRot: E(0, 0, 0.55), t0: 0.20, t1: 0.30 });
  const wL = wing(); wL.scale.x = -1;
  addPart(wL,
    { pos: V(-4.2, -2.2, -3), rot: E(0, 0, -0.085), from: V(-60, -16, 0), fromRot: E(0, 0, -0.55), t0: 0.22, t1: 0.32 });

  /* empennage */
  addPart(new THREE.Mesh(finPlate([[-18, 0], [6, 0], [-8, 24], [-16, 24]], 1.3), skinMat),
    { pos: V(0, 4.4, -30), from: V(0, 56, -18), t0: 0.28, t1: 0.38 });
  const hstGeo = planform([[0, 8], [17, -2], [17, -7], [0, -8]], 1.1);
  addPart(new THREE.Mesh(hstGeo, skinMat),
    { pos: V(2.4, 1.2, -40), rot: E(0, 0, 0.06), from: V(42, 8, -24), t0: 0.31, t1: 0.40 });
  const hL = new THREE.Mesh(hstGeo, skinMat); hL.scale.x = -1;
  addPart(hL,
    { pos: V(-2.4, 1.2, -40), rot: E(0, 0, -0.06), from: V(-42, 8, -24), t0: 0.33, t1: 0.42 });

  /* engines */
  function engine() {
    const g = new THREE.Group();
    const nacGeo = new THREE.CylinderGeometry(3.5, 3.2, 11, 26, 1, true);
    nacGeo.rotateX(Math.PI / 2);
    g.add(new THREE.Mesh(nacGeo, skinMat));
    const lip = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.45, 10, 26), brandMat);
    lip.position.z = 5.5; g.add(lip);
    const face = new THREE.Mesh(new THREE.CircleGeometry(3.1, 24), darkMat);
    face.position.z = 4.4; g.add(face);
    const coneGeo = new THREE.ConeGeometry(2.6, 4.5, 22); coneGeo.rotateX(-Math.PI / 2);
    const cone = new THREE.Mesh(coneGeo, trimMat); cone.position.z = -7.2; g.add(cone);
    const pyl = new THREE.Mesh(new THREE.BoxGeometry(1.3, 5, 7), trimMat);
    pyl.position.set(0, 4, -1); g.add(pyl);
    return g;
  }
  addPart(engine(), { pos: V(15, -5.6, 6), from: V(15, -48, 6), t0: 0.36, t1: 0.46 });
  addPart(engine(), { pos: V(-15, -5.6, 6), from: V(-15, -48, 6), t0: 0.38, t1: 0.48 });

  /* landing gear — wheel contact solved to sit exactly on the floor */
  const FLOOR_Y = -13, WHEEL_R = 1.9;
  function gear(strutH) {
    const g = new THREE.Group();
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, strutH, 10), trimMat);
    st.position.y = -strutH / 2; g.add(st);
    const wg = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 1.1, 16); wg.rotateZ(Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const w = new THREE.Mesh(wg, darkMat);
      w.position.set((i - 0.5) * 1.5, -strutH - 1.2, 0);
      g.add(w);
    }
    return g;
  }
  const gy = h => FLOOR_Y + WHEEL_R + h + 1.2;   // group y so wheels touch the floor
  addPart(gear(6.2), { pos: V(0, gy(6.2), 30), from: V(0, 18, 30), t0: 0.42, t1: 0.51 });
  addPart(gear(6.6), { pos: V(6.2, gy(6.6), -4), from: V(6.2, 18, -4), t0: 0.44, t1: 0.53 });
  addPart(gear(6.6), { pos: V(-6.2, gy(6.6), -4), from: V(-6.2, 18, -4), t0: 0.46, t1: 0.55 });

  /* ------------------------------------------------- livery / windows / mark */
  const livery = new THREE.Group();
  aircraft.add(livery);
  const liveryMats = [brandMat, cheatMat, glassMat];

  const belly = lathe(FULL_P, -Math.PI * 0.30, Math.PI * 0.60, 40);
  belly.scale(1.012, 1.012, 1.0);
  livery.add(new THREE.Mesh(belly, brandMat));
  for (const start of [-Math.PI * 0.42, Math.PI * 0.32]) {
    const c = lathe(FULL_P, start, Math.PI * 0.10, 40);
    c.scale(1.022, 1.022, 1.0);
    livery.add(new THREE.Mesh(c, cheatMat));
  }

  const winMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.9, 1.5), glassMat, 60);
  const dummy = new THREE.Object3D();
  let wi = 0;
  for (let side = -1; side <= 1; side += 2) {
    for (let z = 24; z > -22 && wi < 60; z -= 3.4) {
      const a = side * 1.02;
      dummy.position.set(Math.sin(a) * 5.02, 1.6, z);
      dummy.rotation.set(0, 0, -a);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      winMesh.setMatrixAt(wi++, dummy.matrix);
    }
  }
  winMesh.count = wi;
  livery.add(winMesh);

  const ck = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.9, 4.0), glassMat);
  ck.position.set(0, 2.7, 41.5);
  livery.add(ck);

  new THREE.TextureLoader().load("assets/brand/geefit-mark-ondark.svg", tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide });
    fadeMats.push(m); liveryMats.push(m);
    for (const s of [1, -1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(10, 8.1), m);
      pl.position.set(s * 0.95, 15.5, -38);
      pl.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      livery.add(pl);
    }
    needsRender = true;
  });

  /* ------------------------------------------------------------ expo hall */
  const expo = new THREE.Group();
  expo.visible = false;
  scene.add(expo);

  const floorMat  = solidMat(0x0a0c12, 0.1, 0.9);
  const carpetMat = solidMat(0x3a0d08, 0.05, 0.9);
  const trussMat  = solidMat(0x565f70, 0.8, 0.4);
  const lampMat   = track(new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 }));
  /* Fake volumetric beam. A flat additive cone stacks with every other cone and
     saturates to white, so the falloff is baked into a gradient: bright at the
     lamp, gone by the floor. */
  const gc = document.createElement("canvas");
  gc.width = 4; gc.height = 64;
  const gg = gc.getContext("2d").createLinearGradient(0, 0, 0, 64);
  gg.addColorStop(0.00, "rgba(255,214,160,0.85)");
  gg.addColorStop(0.35, "rgba(255,201,138,0.30)");
  gg.addColorStop(1.00, "rgba(255,201,138,0)");
  gc.getContext("2d").fillStyle = gg;
  gc.getContext("2d").fillRect(0, 0, 4, 64);
  const beamTex = new THREE.CanvasTexture(gc);
  beamTex.colorSpace = THREE.SRGBColorSpace;
  const beamMat   = track(new THREE.MeshBasicMaterial({
    map: beamTex, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide
  }));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y - 0.1;
  expo.add(floor);

  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(136, 124), carpetMat);
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, FLOOR_Y, -4);
  expo.add(carpet);

  const grid = new THREE.GridHelper(700, 70, 0x2a3346, 0x161c28);
  grid.position.y = FLOOR_Y - 0.05;
  grid.material.transparent = true; grid.material.opacity = 0;
  track(grid.material);
  expo.add(grid);

  for (const tz of [-74, -30]) {
    for (const ty of [56, 62]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(230, 1.4, 1.4), trussMat);
      b.position.set(0, ty, tz); expo.add(b);
    }
    for (let x = -102; x <= 102; x += 12) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(1, 6.8, 1), trussMat);
      d.position.set(x, 59, tz);
      d.rotation.z = ((x / 12) | 0) % 2 ? 0.52 : -0.52;
      expo.add(d);
    }
    for (const lx of [-60, 0, 60]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), lampMat);
      l.position.set(lx, 53, tz); expo.add(l);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(13, 66, 20, 1, true), beamMat);
      cone.position.set(lx, 19, tz); expo.add(cone);
    }
  }

  /* backdrop banner drawn to a canvas texture */
  const bc = document.createElement("canvas");
  bc.width = 2048; bc.height = 384;
  const bx = bc.getContext("2d");
  bx.fillStyle = "#0e0e16"; bx.fillRect(0, 0, 2048, 384);
  bx.strokeStyle = "#d8241a"; bx.lineWidth = 8; bx.strokeRect(4, 4, 2040, 376);
  bx.textAlign = "center"; bx.textBaseline = "middle";
  bx.fillStyle = "#f3f5f9";
  bx.font = "bold 148px Sora, Inter, Helvetica, Arial, sans-serif";
  bx.fillText("GLOBAL EXPO EVENTS", 1024, 166);
  bx.fillStyle = "#f79521";
  bx.font = "500 50px Inter, Helvetica, Arial, sans-serif";
  bx.fillText("AIRCRAFT MANUFACTURING · SEVEN CITIES · TWENTY-ONE DAYS", 1024, 280);
  const bannerTex = new THREE.CanvasTexture(bc);
  bannerTex.colorSpace = THREE.SRGBColorSpace;
  const bannerMat = track(new THREE.MeshBasicMaterial({ map: bannerTex, transparent: true, opacity: 0 }));
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(170, 26), bannerMat);
  banner.position.set(0, 40, -100);
  expo.add(banner);

  const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 7, 8);
  const ropeGeo = new THREE.BoxGeometry(11, 0.35, 0.35);
  for (let x = -84; x <= 84; x += 12) {
    for (const z of [64, -70]) {
      const p = new THREE.Mesh(postGeo, trussMat);
      p.position.set(x, FLOOR_Y + 3.5, z); expo.add(p);
      if (x < 84) {
        const r = new THREE.Mesh(ropeGeo, brandMat);
        r.position.set(x + 6, FLOOR_Y + 5.5, z); expo.add(r);
      }
    }
  }

  /* ---------------------------------------------------------------- crowd */
  const PEOPLE = 58;
  const personMat = solidMat(0x090c14, 0.0, 0.95);
  const bodyGeo = new THREE.CapsuleGeometry(0.62, 2.0, 4, 10); bodyGeo.translate(0, 1.62, 0);
  const headGeo = new THREE.SphereGeometry(0.5, 12, 10);       headGeo.translate(0, 3.55, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, personMat, PEOPLE);
  const heads  = new THREE.InstancedMesh(headGeo, personMat, PEOPLE);
  expo.add(bodies, heads);

  let rs = 20260831;
  const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  const crowd = [];
  for (let i = 0; i < PEOPLE; i++) {
    let x, z, n = 0;
    do {                                    // keep bodies out of the airframe footprint
      x = (rnd() - 0.5) * 168;
      z = (rnd() - 0.5) * 144 - 4;
      n++;
    } while (n < 40 && Math.abs(x) < 47 && z > -48 && z < 48);
    crowd.push({ x, z, rot: rnd() * Math.PI * 2, h: 0.9 + rnd() * 0.3, d: rnd() });
  }

  const jig = new THREE.GridHelper(150, 15, 0xe23a25, 0x39435e);
  jig.position.y = FLOOR_Y + 0.4;
  jig.material.transparent = true; jig.material.opacity = 0;
  track(jig.material);
  scene.add(jig);

  /* ------------------------------------------------------------------ HUD */
  const PHASES = [
    [0.00, "Datum & jig",           "Reference geometry. Nothing built yet."],
    [0.05, "01 · Fuselage barrels", "Three barrel sections mate along their frames."],
    [0.20, "02 · Wings",            "Main planes on, dihedral set."],
    [0.28, "03 · Empennage",        "Fin and tailplane close out the airframe."],
    [0.36, "04 · Powerplant",       "Two turbofans hung on their pylons."],
    [0.42, "05 · Landing gear",     "Gear down. It carries its own weight now."],
    [0.55, "06 · Skin",             "Wireframe resolves into finished surface."],
    [0.68, "07 · Livery",           "Cheatline, cabin windows, mark on the fin."],
    [0.76, "08 · Stand build",      "Truss, lighting and backdrop go up around it."],
    [0.88, "09 · Doors open",       "Seven cities. Twenty-one days. This is the floor."]
  ];
  let lastPhase = -1;
  function hud(p) {
    let i = 0;
    for (let k = 0; k < PHASES.length; k++) if (p >= PHASES[k][0]) i = k;
    if (i !== lastPhase) {
      lastPhase = i;
      if (phaseEl) phaseEl.textContent = PHASES[i][1];
      if (capEl)   capEl.textContent   = PHASES[i][2];
    }
    if (barEl) barEl.style.transform = "scaleX(" + p.toFixed(4) + ")";
  }

  /* --------------------------------------------------------------- camera */
  const D2R = Math.PI / 180;
  /* Camera distances are solved from the frustum rather than tuned by hand, so the
     airframe stays fully framed at any viewport shape. HALF_* are the half-extents
     that must fit: the yawed silhouette at the end, the plan view at the start. */
  let   halfWEnd   = 63;
  const HALF_H_END = 28;
  let   yawEnd     = 0.42;
  const HALF_W_TOP = 47, HALF_H_TOP = 54;
  let endDist = 130, startDist = 190;
  function fitDistance(halfW, halfH, aspect) {
    const t = Math.tan((camera.fov * D2R) / 2);
    return Math.max(halfH / t, halfW / (t * aspect)) * 1.06;
  }
  function placeCamera(p) {
    const k = ease(clamp(p / 0.92));
    const polar = lerp(3 * D2R, 79 * D2R, k);     // plan view -> head-on
    const azim  = lerp(34 * D2R, 4 * D2R, k);
    const rad   = lerp(startDist, endDist, k) + Math.sin(p * Math.PI) * endDist * 0.09;
    camTarget.set(0, lerp(2, 12, k), 0);
    camera.position.set(
      rad * Math.sin(polar) * Math.sin(azim),
      rad * Math.cos(polar) + lerp(0, 10, k),
      rad * Math.sin(polar) * Math.cos(azim)
    );
    camera.lookAt(camTarget);
  }

  /* --------------------------------------------------------------- update */
  const tmp = new THREE.Vector3();
  function update(p) {
    jig.material.opacity = seg(p, 0, 0.05) * (1 - seg(p, 0.62, 0.75)) * 0.8;

    for (const part of parts) {
      const t = easeOut(seg(p, part.t0, part.t1));
      part.g.visible = t > 0.001;
      part.g.position.copy(tmp.copy(part.from).lerp(part.home, t));
      part.g.rotation.set(
        lerp(part.fromRot.x, part.homeRot.x, t),
        lerp(part.fromRot.y, part.homeRot.y, t),
        lerp(part.fromRot.z, part.homeRot.z, t)
      );
    }

    const solid = ease(seg(p, 0.50, 0.66));
    wireMat.opacity = seg(p, 0.02, 0.10) * (1 - solid) * 0.9;
    skinMat.opacity = solid;
    trimMat.opacity = solid;
    darkMat.opacity = solid;

    aircraft.rotation.y = lerp(0, yawEnd, ease(seg(p, 0.62, 0.86)));

    const liv = ease(seg(p, 0.66, 0.77));
    livery.visible = liv > 0.001;
    for (const m of liveryMats) m.opacity = liv;

    const hall = ease(seg(p, 0.74, 0.88));
    expo.visible = hall > 0.001;
    floorMat.opacity  = hall;
    carpetMat.opacity = hall * 0.98;
    trussMat.opacity  = Math.max(solid, hall);
    lampMat.opacity   = hall * 0.8;
    bannerMat.opacity = hall;
    beamMat.opacity   = hall * 0.11;
    grid.material.opacity = hall * 0.22;

    const crowdT = seg(p, 0.86, 1.0);
    personMat.opacity = ease(seg(p, 0.86, 0.94));
    for (let i = 0; i < PEOPLE; i++) {
      const c = crowd[i];
      const local = clamp((crowdT - c.d * 0.55) / 0.45);
      const s = local <= 0 ? 0 : easeOut(local) * (1 + 0.16 * Math.sin(local * Math.PI)) * c.h;
      dummy.position.set(c.x, FLOOR_Y, c.z);
      dummy.rotation.set(0, c.rot, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      heads.setMatrixAt(i, dummy.matrix);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;

    /* The in-scene banner takes over the messaging once the hall is up, so the
       overlay headline steps aside rather than colliding with it. */
    if (headEl) {
      const out = seg(p, 0.64, 0.78);
      headEl.style.opacity = String(1 - out);
      headEl.style.transform = "translateY(" + (-14 * out).toFixed(1) + "px)";
    }

    placeCamera(p);
    hud(p);
  }

  /* --------------------------------------------------------------- sizing */
  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width | 0), h = Math.max(1, r.height | 0);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    camera.fov = aspect < 1 ? 54 : 40;
    /* A narrow viewport can't afford a wide silhouette, so square the aircraft up
       a little there and let it sit closer. */
    yawEnd    = aspect < 1 ? 0.26 : 0.42;
    halfWEnd  = aspect < 1 ? 57 : 63;
    endDist   = Math.min(340, fitDistance(halfWEnd, HALF_H_END, aspect));
    startDist = Math.min(430, fitDistance(HALF_W_TOP, HALF_H_TOP, aspect));
    /* Size the backdrop to the frustum at its own depth so the wordmark never runs
       off the edge. */
    const visW = 2 * (endDist + 100) * Math.tan((camera.fov * D2R) / 2) * aspect;
    banner.scale.setScalar(Math.min(1, (visW * 0.86) / 170));
    camera.updateProjectionMatrix();
    needsRender = true;
  }
  addEventListener("resize", resize, { passive: true });

  /* --------------------------------------------------------------- scroll */
  let progress = 0, needsRender = true, onScreen = true;

  const trackEl = section.querySelector(".build3d-track") || section;
  function readScroll() {
    /* Measure against the track, not the section: the track is exactly the
       distance over which the sticky pane stays pinned. */
    const r = trackEl.getBoundingClientRect();
    const span = r.height - innerHeight;
    const p = span <= 0 ? 0 : clamp(-r.top / span);
    if (Math.abs(p - progress) > 0.0002) { progress = p; needsRender = true; }
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      es => es.forEach(e => { onScreen = e.isIntersecting; if (onScreen) needsRender = true; }),
      { rootMargin: "150px" }
    ).observe(section);
  }

  function frame() {
    if (needsRender && onScreen) {
      update(progress);
      renderer.render(scene, camera);
      needsRender = false;
    }
    requestAnimationFrame(frame);
  }

  resize();
  if (reduced) {
    section.classList.add("static3d");    // CSS collapses the scroll track
    update(1);
    renderer.render(scene, camera);
  } else {
    addEventListener("scroll", readScroll, { passive: true });
    readScroll();
    frame();
  }
  section.classList.add("ready3d");
}

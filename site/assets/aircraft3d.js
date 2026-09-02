/* Scroll-driven aircraft build.
   Wireframe -> solid airframe, camera arcing from plan view to head-on, then the
   expo hall assembles around it. All geometry is generated here; no model files.
   three.js r160 is vendored at assets/vendor/three/. */

import * as THREE from "./vendor/three/three.module.min.js";
import { GLTFLoader } from "./vendor/three/GLTFLoader.js";

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
  const solidMat = (color, metal, rough) => track(new THREE.MeshStandardMaterial({
    color, metalness: metal, roughness: rough, transparent: true, opacity: 0,
    side: THREE.DoubleSide, envMapIntensity: 1.15
  }));
  /* Painted airframe reads as gloss over metal; bare parts get real metalness.
     Both need something to reflect — see the generated environment below. */
  const skinMat  = solidMat(0xeef1f7, 0.22, 0.20);
  const trimMat  = solidMat(0x9aa3b4, 0.88, 0.30);
  const darkMat  = solidMat(0x0f131a, 0.35, 0.55);
  const brandMat = solidMat(0xd8241a, 0.18, 0.26);
  const cheatMat = solidMat(0xf79521, 0.18, 0.30);
  const glassMat = solidMat(0x0a121c, 0.55, 0.08);

  /* An environment map, without which metalness renders as flat chalk. Generated
     here rather than loaded, so nothing extra ships: a vertical sky/floor gradient
     plus two soft lamps to give the panels a specular highlight to catch. */
  (function buildEnvironment() {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 256;
    const x = c.getContext("2d");
    const grad = x.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, "#0b101c");
    grad.addColorStop(0.38, "#7d93b6");
    grad.addColorStop(0.50, "#cdd8ea");
    grad.addColorStop(0.58, "#40485c");
    grad.addColorStop(1.00, "#06070b");
    x.fillStyle = grad; x.fillRect(0, 0, 512, 256);
    for (const [cx, cy, r, col] of [[132, 74, 66, "rgba(255,255,255,0.95)"],
                                    [372, 96, 52, "rgba(255,158,96,0.75)"]]) {
      const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, col); rg.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = rg; x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose(); tex.dispose();
  })();

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
  /* Flying surfaces are lofted airfoil sections, not flat extrusions: a constant
     -thickness plate with square edges is what makes a model read as foam. */
  const NACA = t => x =>
    5 * t * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x
             + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
  function airfoilSection(n) {
    const half = NACA(1), pts = [];
    for (let i = 0; i <= n; i++) {                 // upper surface, LE -> TE
      const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
      pts.push([u, half(u)]);
    }
    for (let i = n - 1; i >= 1; i--) {             // lower surface, TE -> LE
      const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
      pts.push([u, -half(u)]);
    }
    return pts;
  }
  const SECTION = airfoilSection(12);

  /** Loft an airfoil along a run of stations.
   *  station: { at, le, chord, thick }  — `at` is span (horizontal) or height (vertical). */
  function loft(stations, vertical) {
    const m = SECTION.length, n = stations.length;
    const pos = [], idx = [];
    const put = (st, u, t) => {
      const th = t * st.chord * st.thick;
      const z = st.le - u * st.chord;
      if (vertical) pos.push(th, st.at, z);
      else          pos.push(st.at, th, z);
    };
    for (const st of stations) for (const [u, t] of SECTION) put(st, u, t);
    for (let sIdx = 0; sIdx < n - 1; sIdx++) {
      for (let k = 0; k < m; k++) {
        const a = sIdx * m + k, b = sIdx * m + ((k + 1) % m);
        const c = (sIdx + 1) * m + k, d = (sIdx + 1) * m + ((k + 1) % m);
        idx.push(a, c, b, b, c, d);
      }
    }
    /* close the root and the tip so the surface is a solid, not a shell */
    for (const [sIdx, flip] of [[0, false], [n - 1, true]]) {
      const st = stations[sIdx];
      const centre = pos.length / 3;
      if (vertical) pos.push(0, st.at, st.le - 0.5 * st.chord);
      else          pos.push(st.at, 0, st.le - 0.5 * st.chord);
      for (let k = 0; k < m; k++) {
        const a = sIdx * m + k, b = sIdx * m + ((k + 1) % m);
        idx.push(centre, flip ? b : a, flip ? a : b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  /** Straight-tapered surface between a root and a tip station. */
  function surface(root, tip, steps = 8, vertical = false) {
    const st = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      st.push({
        at:    lerp(root.at, tip.at, f),
        le:    lerp(root.le, tip.le, f),
        chord: lerp(root.chord, tip.chord, f),
        thick: lerp(root.thick, tip.thick, f)
      });
    }
    return loft(st, vertical);
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
  const midBarrel = new THREE.Group();
  midBarrel.add(new THREE.Mesh(lathe(MID_P), skinMat));
  /* belly fairing: without it the wing just intersects the tube */
  const fairing = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 18), skinMat);
  fairing.scale.set(7.4, 3.4, 21);
  fairing.position.set(0, -3.4, -3);
  midBarrel.add(fairing);
  addPart(midBarrel,
    { pos: V(0, 0, 0), from: V(0, -48, 0), t0: 0.045, t1: 0.14 });
  addPart(new THREE.Mesh(lathe(NOSE_P), skinMat),
    { pos: V(0, 0, 0), from: V(0, 14, 66), fromRot: E(0.3, 0.25, 0), t0: 0.10, t1: 0.20 });
  addPart(new THREE.Mesh(lathe(AFT_P), skinMat),
    { pos: V(0, 0, 0), from: V(0, 12, -66), fromRot: E(-0.3, -0.25, 0), t0: 0.15, t1: 0.25 });

  /* wings */
  const wingGeo = surface(
    { at: 0,  le: 16, chord: 30, thick: 0.135 },
    { at: 40, le: -6, chord: 8,  thick: 0.095 }, 10);
  const wingletGeo = surface(
    { at: 0, le: -6.5, chord: 7, thick: 0.11 },
    { at: 8, le: -9.5, chord: 3, thick: 0.09 }, 5, true);
  function wing() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(wingGeo, skinMat));
    const wl = new THREE.Mesh(wingletGeo, skinMat);
    wl.position.set(39.6, 0, 0);
    wl.rotation.z = -0.16;
    g.add(wl);
    return g;
  }
  addPart(wing(),
    { pos: V(4.2, -2.2, -3), rot: E(0, 0, 0.085), from: V(60, -16, 0), fromRot: E(0, 0, 0.55), t0: 0.20, t1: 0.30 });
  const wL = wing(); wL.scale.x = -1;
  addPart(wL,
    { pos: V(-4.2, -2.2, -3), rot: E(0, 0, -0.085), from: V(-60, -16, 0), fromRot: E(0, 0, -0.55), t0: 0.22, t1: 0.32 });

  /* empennage */
  const finGeo = surface(
    { at: 0,  le: 6,  chord: 24, thick: 0.12 },
    { at: 24, le: -8, chord: 8,  thick: 0.09 }, 8, true);
  addPart(new THREE.Mesh(finGeo, skinMat),
    { pos: V(0, 4.4, -30), from: V(0, 56, -18), t0: 0.28, t1: 0.38 });
  const hstGeo = surface(
    { at: 0,  le: 8,  chord: 16, thick: 0.11 },
    { at: 17, le: -2, chord: 5,  thick: 0.09 }, 6);
  addPart(new THREE.Mesh(hstGeo, skinMat),
    { pos: V(2.4, 1.2, -40), rot: E(0, 0, 0.06), from: V(42, 8, -24), t0: 0.31, t1: 0.40 });
  const hL = new THREE.Mesh(hstGeo, skinMat); hL.scale.x = -1;
  addPart(hL,
    { pos: V(-2.4, 1.2, -40), rot: E(0, 0, -0.06), from: V(-42, 8, -24), t0: 0.33, t1: 0.42 });

  /* engines */
  function engine() {
    const g = new THREE.Group();
    /* cowl lathed as a curved body rather than a plain tube */
    const cowl = lathe([[3.05, 5.6], [3.45, 4.6], [3.6, 2.6], [3.55, -0.6],
                        [3.3, -3.4], [3.0, -5.2], [2.8, -5.6]], 0, Math.PI * 2, 30);
    g.add(new THREE.Mesh(cowl, skinMat));
    /* inlet lip rolls inward, so the intake reads as a duct not a sticker */
    const lipGeo = new THREE.TorusGeometry(3.2, 0.42, 12, 30);
    const lip = new THREE.Mesh(lipGeo, brandMat);
    lip.position.z = 5.6; g.add(lip);
    const duct = lathe([[2.85, 5.6], [2.5, 4.0], [2.45, 2.4]], 0, Math.PI * 2, 26);
    g.add(new THREE.Mesh(duct, darkMat));
    /* fan face: spinner plus blades, catching the key light */
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.8, 16), trimMat);
    spinner.geometry.rotateX(Math.PI / 2);
    spinner.position.z = 3.5; g.add(spinner);
    const bladeGeo = new THREE.BoxGeometry(0.34, 2.0, 0.1);
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(bladeGeo, trimMat);
      const a = (i / 18) * Math.PI * 2;
      b.position.set(Math.sin(a) * 1.45, Math.cos(a) * 1.45, 2.5);
      b.rotation.z = -a; b.rotation.y = 0.5;
      g.add(b);
    }
    const nozzle = lathe([[2.7, -5.6], [2.35, -7.4], [1.9, -8.6]], 0, Math.PI * 2, 24);
    g.add(new THREE.Mesh(nozzle, trimMat));
    const plug = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.6, 20), darkMat);
    plug.geometry.rotateX(-Math.PI / 2);
    plug.position.z = -9.2; g.add(plug);
    /* pylon tapers into the wing instead of being a slab */
    const pyl = new THREE.Mesh(surface(
      { at: 0,   le: 3.5, chord: 9, thick: 0.20 },
      { at: 5.4, le: 1.5, chord: 7, thick: 0.16 }, 4, true), trimMat);
    pyl.position.set(0, 0.6, -1);
    g.add(pyl);
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

  /* Cheatlines. A partial lathe over the fuselage profile follows the body contour
     exactly, so the stripe stays the same width as the section tapers — which is how
     a real one is painted. phi 0 is the belly, 90deg the right flank, 270deg the left,
     so a band is drawn once per side. Radius is nudged out to sit on the skin. */
  const D = Math.PI / 180;
  function cheatline(centreDeg, widthDeg, mat, lift) {
    for (const c of [centreDeg, 360 - centreDeg]) {
      const g = lathe(FULL_P, (c - widthDeg / 2) * D, widthDeg * D, 40);
      g.scale(lift, lift, 1.0);
      livery.add(new THREE.Mesh(g, mat));
    }
  }
  cheatline(96, 13, brandMat, 1.013);   // broad red stripe under the window line
  cheatline(80, 4.5, cheatMat, 1.020);  // thin orange pinstripe below it
  /* keep a dark belly so the underside doesn't read as bare white */
  const belly = lathe(FULL_P, -Math.PI * 0.16, Math.PI * 0.32, 40);
  belly.scale(1.010, 1.010, 1.0);
  livery.add(new THREE.Mesh(belly, brandMat));

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
      /* Box solved to stay inside the swept fin outline at every height it spans —
         sized any larger and the leading edge of the mark hangs off into open air. */
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 11), m);
      pl.position.set(s * 1.39, 13, -39.5);
      pl.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      livery.add(pl);
    }
    needsRender = true;
  });

  /* ----------------------------------------------------- C919 airframe -----
     The generated aircraft above stays in the scene as a fallback and is hidden
     the moment the real model arrives, so a failed or slow fetch still renders
     something. Model: C919 by iucc92 (CGTrader), FBX converted to glB. */
  let usingModel = false;
  const modelDecals = [];
  const modelParts = [];
  const modelGroup = new THREE.Group();
  modelGroup.visible = false;
  aircraft.add(modelGroup);

  const hullMat = track(new THREE.MeshStandardMaterial({
    color: 0xeef1f7, metalness: 0.22, roughness: 0.20,
    transparent: true, opacity: 0, envMapIntensity: 1.15
  }));
  const hullDark = track(new THREE.MeshStandardMaterial({
    color: 0x121821, metalness: 0.5, roughness: 0.35,
    transparent: true, opacity: 0, envMapIntensity: 1.0
  }));
  /* Full triangle wireframe, same as the generated aircraft used — drawing only
     the panel outlines (EdgesGeometry) left it looking too sparse. This reuses the
     baked geometry rather than building a second one, so it costs no extra memory. */
  const edgeMat = track(new THREE.MeshBasicMaterial({
    color: 0xff5334, wireframe: true, transparent: true, opacity: 0, depthWrite: false
  }));

  /* Cheatlines are painted by height in the shader rather than with a texture:
     the model's UVs are unknown, and a band in object space follows the real hull
     exactly. Geometry is pre-baked into aircraft space so position.y is usable. */
  const STRIPE = { value: 0 };
  hullMat.onBeforeCompile = sh => {
    sh.uniforms.uStripe = STRIPE;
    sh.vertexShader = "varying vec3 vLocal;\n" + sh.vertexShader.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\n  vLocal = position;");
    sh.fragmentShader = "varying vec3 vLocal;\nuniform float uStripe;\n" + sh.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
       float onBody = 1.0 - smoothstep(6.5, 9.0, abs(vLocal.x));   // fuselage only
       float red    = (1.0 - smoothstep(0.9, 1.3, abs(vLocal.y - 1.4))) * onBody;
       float orange = (1.0 - smoothstep(0.3, 0.5, abs(vLocal.y + 0.4))) * onBody;
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.847, 0.141, 0.102), red * uStripe);
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.969, 0.584, 0.129), orange * uStripe);`);
  };

  new GLTFLoader().load("assets/models/c919.glb", gltf => {
    const root = gltf.scene;
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const ctr  = box.getCenter(new THREE.Vector3());
    const k = 102 / size.z;                       // match the scene's fuselage length
    const norm = new THREE.Matrix4()
      .makeScale(k, k, k)
      .multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -ctr.y, -ctr.z));

    /* Every mesh in this model is a component spanning both sides — the wings are a
       single 99-unit mesh, the tailplanes a single 33-unit one. Anything that wide is
       cut down the centreline so left and right can fly in separately. */
    function splitByX(g) {
      const src = g.index ? g.toNonIndexed() : g;
      const pos = src.attributes.position, nrm = src.attributes.normal;
      const keep = [[], []];
      for (let t = 0; t < pos.count; t += 3) {
        const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
        keep[cx < 0 ? 0 : 1].push(t);
      }
      return keep.map(tris => {
        if (!tris.length) return null;
        const P = new Float32Array(tris.length * 9), N = nrm ? new Float32Array(tris.length * 9) : null;
        tris.forEach((t, i) => {
          for (let k = 0; k < 3; k++) {
            P[i * 9 + k * 3]     = pos.getX(t + k);
            P[i * 9 + k * 3 + 1] = pos.getY(t + k);
            P[i * 9 + k * 3 + 2] = pos.getZ(t + k);
            if (N) {
              N[i * 9 + k * 3]     = nrm.getX(t + k);
              N[i * 9 + k * 3 + 1] = nrm.getY(t + k);
              N[i * 9 + k * 3 + 2] = nrm.getZ(t + k);
            }
          }
        });
        const out = new THREE.BufferGeometry();
        out.setAttribute("position", new THREE.BufferAttribute(P, 3));
        if (N) out.setAttribute("normal", new THREE.BufferAttribute(N, 3));
        else out.computeVertexNormals();
        return out;
      });
    }

    /* Sort each piece into an assembly by where it sits and how big it is. */
    function classify(b) {
      const c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
      const side = c.x < 0 ? "L" : "R";
      if (c.y > 8 && c.z < -25) return "fin";
      if (c.z < -28) return "tail" + side;
      if (Math.abs(c.x) > 10 && c.z > 3 && c.z < 26 && c.y < 1) return "engine" + side;
      if (c.y < -4.2 && Math.abs(c.x) < 8) return "gear";
      if (Math.abs(c.x) > 9 && sz.z < 40) return "wing" + side;
      return "fuselage";
    }

    const groups = {};
    function bin(name) {
      if (!groups[name]) { groups[name] = new THREE.Group(); modelGroup.add(groups[name]); }
      return groups[name];
    }

    const meshes = [];
    root.updateWorldMatrix(true, true);
    root.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) {
      const g0 = m.geometry.clone();
      g0.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, m.matrixWorld));
      g0.deleteAttribute("uv");
      g0.computeBoundingBox();
      const src = Array.isArray(m.material) ? m.material[0] : m.material;
      const dark = src && src.color && src.color.getHSL({}).l < 0.42;
      /* 22, not 34: the engine fan faces span both nacelles in one 32-unit mesh,
         and above that threshold they stayed whole and rode in with the fuselage. */
      const wide = g0.boundingBox.max.x - g0.boundingBox.min.x > 22;
      for (const g of (wide ? splitByX(g0) : [g0])) {
        if (!g) continue;
        g.computeBoundingBox();
        const holder = bin(classify(g.boundingBox));
        holder.add(new THREE.Mesh(g, dark ? hullDark : hullMat));
        holder.add(new THREE.Mesh(g, edgeMat));
      }
    }

    /* Entry vector and timing per assembly, mirroring the old build order. */
    const CHOREO = {
      fuselage: [V(0, -52, 0),   0.05, 0.15],
      wingL:    [V(-64, -14, 0), 0.15, 0.25],
      wingR:    [V(64, -14, 0),  0.17, 0.27],
      fin:      [V(0, 56, -20),  0.25, 0.34],
      tailL:    [V(-44, 8, -26), 0.27, 0.36],
      tailR:    [V(44, 8, -26),  0.29, 0.38],
      engineL:  [V(-18, -48, 6), 0.36, 0.45],
      engineR:  [V(18, -48, 6),  0.38, 0.47],
      gear:     [V(0, 20, 10),   0.45, 0.53]
    };
    for (const [name, grp] of Object.entries(groups)) {
      const c = CHOREO[name] || [V(0, -40, 0), 0.05, 0.15];
      modelParts.push({ g: grp, from: c[0], t0: c[1], t1: c[2] });
    }
    /* sit it on the floor */
    const nb = new THREE.Box3().setFromObject(modelGroup);
    modelGroup.position.y = FLOOR_Y - nb.min.y;

    /* Find the fin by bounding what sits high and aft, then put the mark on its
       flanks — measured rather than hand-placed, so it cannot float off the edge. */
    const fin = new THREE.Box3();
    modelGroup.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      if (b.max.y > 14 && b.max.z < -18 && Math.abs(b.min.x + b.max.x) / 2 < 4) fin.union(b);
    });
    if (!fin.isEmpty()) {
      const c = fin.getCenter(new THREE.Vector3()), fs = fin.getSize(new THREE.Vector3());
      const h = Math.min(fs.y * 0.42, 11), w = h * 1.228;   // mark is 1000x814
      new THREE.TextureLoader().load("assets/brand/geefit-mark-ondark.svg", tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const dm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0,
          depthWrite: false, side: THREE.DoubleSide });
        fadeMats.push(dm); modelDecals.push(dm);
        for (const sgn of [1, -1]) {
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dm);
          pl.position.set(c.x + sgn * (fs.x / 2 + 0.25), c.y + fs.y * 0.06, c.z + fs.z * 0.04);
          pl.rotation.y = sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
          (groups.fin || modelGroup).add(pl);   // ride with the fin as it flies in
        }
        needsRender = true;
      });
    }

    /* Capture the world corners with the aircraft square-on; the solver spins them. */
    const keepYaw = aircraft.rotation.y;
    aircraft.rotation.y = 0;
    aircraft.updateWorldMatrix(true, true);
    const wb = new THREE.Box3().setFromObject(modelGroup);
    modelCorners = [];
    for (const x of [wb.min.x, wb.max.x])
      for (const y of [wb.min.y, wb.max.y])
        for (const z of [wb.min.z, wb.max.z]) modelCorners.push(new THREE.Vector3(x, y, z));
    modelCentreY = wb.getCenter(new THREE.Vector3()).y;
    aircraft.rotation.y = keepYaw;
    aircraft.updateWorldMatrix(true, true);
    for (const part of parts) part.g.visible = false;
    livery.visible = false;
    usingModel = true;
    modelGroup.visible = true;
    resize();            // re-solve the framing now that the real bounds are known
    needsRender = true;
  }, undefined, () => { /* keep the generated fallback */ });

  /* ------------------------------------------------------------ expo hall */
  const expo = new THREE.Group();
  expo.visible = false;
  scene.add(expo);

  /* The built furniture — truss, lamps, banner, rope — sized as one structure in
     resize(). Ground (floor, carpet, grid) and the crowd stay out of it: the ground
     should always run past the frame, and horizontally scaling instanced people
     would squash them. See the sizing block for why this group exists. */
  const stand = new THREE.Group();
  expo.add(stand);

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

  /* Runs well forward of the aircraft so there is stand to stand on in the
     foreground, rather than the carpet stopping at the nose. */
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(158, 210), carpetMat);
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, FLOOR_Y, 18);
  expo.add(carpet);

  const grid = new THREE.GridHelper(700, 70, 0x2a3346, 0x161c28);
  grid.position.y = FLOOR_Y - 0.05;
  grid.material.transparent = true; grid.material.opacity = 0;
  track(grid.material);
  expo.add(grid);

  const TRUSS_W = 230;   // widest thing in the stand; resize() fits the group to it
  for (const tz of [-74, -30]) {
    for (const ty of [56, 62]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(TRUSS_W, 1.4, 1.4), trussMat);
      b.position.set(0, ty, tz); stand.add(b);
    }
    for (let x = -102; x <= 102; x += 12) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(1, 6.8, 1), trussMat);
      d.position.set(x, 59, tz);
      d.rotation.z = ((x / 12) | 0) % 2 ? 0.52 : -0.52;
      stand.add(d);
    }
    for (const lx of [-60, 0, 60]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), lampMat);
      l.position.set(lx, 53, tz); stand.add(l);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(13, 66, 20, 1, true), beamMat);
      cone.position.set(lx, 19, tz); stand.add(cone);
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
  const BANNER_W = 170, BANNER_H = 26, BANNER_TOP = 53;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(BANNER_W, BANNER_H), bannerMat);
  banner.position.set(0, BANNER_TOP - BANNER_H / 2, -100);
  expo.add(banner);

  const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 7, 8);
  const ropeGeo = new THREE.BoxGeometry(11, 0.35, 0.35);
  for (let x = -84; x <= 84; x += 12) {
    for (const z of [68, -70]) {   // front rope sits between the aircraft and the public
      const p = new THREE.Mesh(postGeo, trussMat);
      p.position.set(x, FLOOR_Y + 3.5, z); stand.add(p);
      if (x < 84) {
        const r = new THREE.Mesh(ropeGeo, brandMat);
        r.position.set(x + 6, FLOOR_Y + 5.5, z); stand.add(r);
      }
    }
  }

  /* ---------------------------------------------------------------- crowd */
  const PEOPLE = 58, FOREGROUND = 11;
  const personMat = solidMat(0x090c14, 0.0, 0.95);
  const bodyGeo = new THREE.CapsuleGeometry(0.62, 2.0, 4, 10); bodyGeo.translate(0, 1.62, 0);
  const headGeo = new THREE.SphereGeometry(0.5, 12, 10);       headGeo.translate(0, 3.55, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, personMat, PEOPLE + FOREGROUND);
  const heads  = new THREE.InstancedMesh(headGeo, personMat, PEOPLE + FOREGROUND);
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
  /* Visitors on the near carpet, in front of the aircraft and facing it. They read
     larger because they are closer, which gives the hall some depth. */
  for (let i = 0; i < FOREGROUND; i++) {
    const x = (i / (FOREGROUND - 1) - 0.5) * 150 + (rnd() - 0.5) * 12;
    const z = 74 + rnd() * 38;
    crowd.push({ x, z, rot: Math.PI + (rnd() - 0.5) * 0.9, h: 0.95 + rnd() * 0.3, d: 0.55 + rnd() * 0.45 });
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

  /* Hand-tuned half-extents only ever fit the aircraft they were measured against.
     Once a model is loaded the end distance is solved numerically instead: push the
     camera back until every corner of its bounding box projects inside the frame. */
  let modelCorners = null, modelCentreY = 12;
  /** Smallest camera distance at which every corner of the model still projects
   *  inside the frame, for a given point on the camera path. Solved rather than
   *  tuned, because hand-set half-extents only ever fit one particular aircraft. */
  function solveDistance(aspect, k, yaw) {
    if (!modelCorners) return null;
    const probe = new THREE.PerspectiveCamera(camera.fov, aspect, camera.near, camera.far);
    /* The aircraft group only ever yaws about the origin, so a pose is just the
       captured corners spun by yaw — no matrix round-tripping to get wrong. */
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const posed = modelCorners.map(c =>
      new THREE.Vector3(c.x * cy + c.z * sy, c.y, -c.x * sy + c.z * cy));
    const v = new THREE.Vector3();
    const fits = d => {
      placeCameraAt(probe, k, d);
      probe.updateMatrixWorld(true);
      probe.updateProjectionMatrix();
      /* Portrait has width to spare only by moving far away, which shrinks the
         aircraft to a speck. Better to let the wingtips run past the edges. */
      const limX = aspect < 1 ? 1.16 : 0.92;
      for (const c of posed) {
        v.copy(c).project(probe);
        if (Math.abs(v.x) > limX || Math.abs(v.y) > 0.92) return false;
      }
      return true;
    };
    let lo = 60, hi = 1200;
    if (!fits(hi)) return hi;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid; else lo = mid;
    }
    return hi;
  }
  /* Shared pose maths so the fit solver can aim a probe camera the same way. */
  function placeCameraAt(cam, k, rad) {
    const polar = lerp(3 * D2R, 79 * D2R, k);
    const azim  = lerp(34 * D2R, 4 * D2R, k);
    const ty    = lerp(2, modelCentreY, k);
    camTarget.set(0, ty, 0);
    cam.position.set(
      rad * Math.sin(polar) * Math.sin(azim),
      rad * Math.cos(polar) + lerp(0, 10, k),
      rad * Math.sin(polar) * Math.cos(azim)
    );
    cam.lookAt(camTarget);
  }

  function placeCamera(p) {
    const k = ease(clamp(p / 0.92));
    const polar = lerp(3 * D2R, 79 * D2R, k);     // plan view -> head-on
    const azim  = lerp(34 * D2R, 4 * D2R, k);
    const rad   = lerp(startDist, endDist, k) + Math.sin(p * Math.PI) * endDist * 0.09;
    placeCameraAt(camera, k, rad);
  }

  /* --------------------------------------------------------------- update */
  const tmp = new THREE.Vector3();
  const ORIGIN = new THREE.Vector3();
  function update(p) {
    jig.material.opacity = seg(p, 0, 0.05) * (1 - seg(p, 0.62, 0.75)) * 0.8;

    if (usingModel) {
      /* The assemblies fly in as wireframe, the surface resolves once they have all
         landed, then the livery paints on. */
      for (const mp of modelParts) {
        const t = easeOut(seg(p, mp.t0, mp.t1));
        mp.g.visible = t > 0.001;
        mp.g.position.copy(tmp.copy(mp.from).lerp(ORIGIN, t));
      }
      const solidM = ease(seg(p, 0.52, 0.68));
      edgeMat.opacity = seg(p, 0.03, 0.10) * (1 - ease(seg(p, 0.54, 0.70))) * 0.85;
      hullMat.opacity = solidM;
      hullDark.opacity = solidM;
      STRIPE.value = ease(seg(p, 0.66, 0.80));
      for (const m of modelDecals) m.opacity = STRIPE.value;
    }

    for (const part of parts) {
      if (usingModel) break;
      const t = easeOut(seg(p, part.t0, part.t1));
      part.g.visible = t > 0.001;
      part.g.position.copy(tmp.copy(part.from).lerp(part.home, t));
      part.g.rotation.set(
        lerp(part.fromRot.x, part.homeRot.x, t),
        lerp(part.fromRot.y, part.homeRot.y, t),
        lerp(part.fromRot.z, part.homeRot.z, t)
      );
    }

    const solid = usingModel ? 1 : ease(seg(p, 0.50, 0.66));
    wireMat.opacity = usingModel ? 0 : seg(p, 0.02, 0.10) * (1 - solid) * 0.9;
    skinMat.opacity = solid;
    trimMat.opacity = solid;
    darkMat.opacity = solid;

    aircraft.rotation.y = lerp(0, yawEnd, ease(seg(p, 0.62, 0.86)));

    const liv = ease(seg(p, 0.66, 0.77));
    livery.visible = !usingModel && liv > 0.001;
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
    for (let i = 0; i < crowd.length; i++) {
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
    /* Open the stand angle enough that the fin — and the mark painted on it — is
       actually readable; half-width tracks the yawed silhouette so the frustum fit
       keeps the whole airframe in frame. Portrait stays squarer, it has less room. */
    yawEnd    = aspect < 1 ? 0.30 : 0.62;
    halfWEnd  = aspect < 1 ? 58 : 66;
    /* Solve both ends of the path. The plan view at the start needs its own fit —
       it frames the full span and length flat-on, which is the widest the airframe
       ever gets, and the old constants were measured against a smaller aircraft. */
    endDist   = solveDistance(aspect, 1, yawEnd)
             || Math.min(340, fitDistance(halfWEnd, HALF_H_END, aspect));
    startDist = solveDistance(aspect, 0, 0)
             || Math.min(430, fitDistance(HALF_W_TOP, HALF_H_TOP, aspect));
    /* Size the stand to the frustum at its own depth so it never runs off the edge.
       Scaling the banner alone — which is what this used to do — left a shrunken
       sign hanging under a full-width truss on a phone, so the stand read as two
       structures at different scales. Solve off the truss instead, the widest
       member, and scale the whole group by it so the proportions hold everywhere.
       Wide viewports clamp to 1, so the desktop framing is untouched. */
    const visW = 2 * (endDist + 100) * Math.tan((camera.fov * D2R) / 2) * aspect;
    const standS = Math.min(1, (visW * 0.86) / TRUSS_W);
    /* X only: the truss is a beam, so shortening it is the honest transform, and a
       uniform shrink would drop the gantry onto the fin. */
    stand.scale.x = standS;
    /* The banner carries type, so it scales uniformly rather than squashing, and
       hangs from a fixed top edge so the gap under the truss doesn't open up. */
    banner.scale.setScalar(standS);
    banner.position.y = BANNER_TOP - (BANNER_H * standS) / 2;
    camera.updateProjectionMatrix();
    needsRender = true;
    readScroll();
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
    /* Visibility is measured here rather than by an IntersectionObserver. The
       observer only reports threshold crossings: if its first sample landed before
       layout settled it would say "off screen", and sitting still inside the section
       crosses nothing afterwards — so rendering would stay switched off for good. */
    const vis = r.bottom > -200 && r.top < innerHeight + 200;
    if (vis !== onScreen) { onScreen = vis; needsRender = true; }
    if (Math.abs(p - progress) > 0.0002) { progress = p; needsRender = true; }
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
    /* The page can load already scrolled — browser scroll restoration, or a deep
       link. Without these the scene would sit frozen at progress 0 until the first
       scroll event, because init ran before layout settled. */
    addEventListener("load", readScroll);
    readScroll();
    requestAnimationFrame(() => { readScroll(); requestAnimationFrame(readScroll); });
    frame();
  }
  section.classList.add("ready3d");
}

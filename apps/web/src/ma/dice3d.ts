/**
 * 真 3D 骰子（three.js）：圆角实体、清漆反光、真实阴影、带弹跳的翻滚和落地。
 * 只负责画面；点数永远来自服务器。按需动态加载，不进主包。
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// 点数 → 该面的法线（对面相加为 7）
const NORMALS: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(0, 0, 1),
  6: new THREE.Vector3(0, 0, -1),
  2: new THREE.Vector3(1, 0, 0),
  5: new THREE.Vector3(-1, 0, 0),
  3: new THREE.Vector3(0, 1, 0),
  4: new THREE.Vector3(0, -1, 0),
};
// 3×3 网格中的点位（1..9）
const PIPS: Record<number, number[]> = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

export type DiceHandle = {
  setState(value: number, rolling: boolean, settleMs: number, reduced: boolean): void;
  dispose(): void;
};

function targetQuat(value: number, yaw: number) {
  const q = new THREE.Quaternion().setFromUnitVectors(NORMALS[value] ?? NORMALS[1], new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}

export function createDice(canvas: HTMLCanvasElement, color: string): DiceHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.42;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 3.5, 3.9);
  camera.lookAt(0, 0.45, 0);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-2.5, 6, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.radius = 6;
  key.shadow.camera.left = -2; key.shadow.camera.right = 2; key.shadow.camera.top = 2; key.shadow.camera.bottom = -2;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xfff6e0, 0x6b5a40, 0.5));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.28 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 骰身：圆角 + 清漆
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(1, 1, 1, 6, 0.16),
    new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.42, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.08 }),
  );
  body.castShadow = true;
  const die = new THREE.Group();
  die.add(body);

  // 点：白色珐琅 + 一圈暗边，做出「刻进去再上色」的感觉
  // 凹坑：圆片的法线向中心倾斜，光照下就像刻进去的小碗
  const dimple = (r: number, tilt: number) => {
    const g = new THREE.CircleGeometry(r, 40);
    const pos = g.attributes.position, nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const n = new THREE.Vector3((-pos.getX(i) / r) * tilt, (-pos.getY(i) / r) * tilt, 1).normalize();
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    return g;
  };
  const pipGeo = dimple(0.088, 0.9);
  const rimGeo = new THREE.CircleGeometry(0.1, 40);
  const pipMat = new THREE.MeshPhysicalMaterial({ color: 0xf6f1e6, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.15, polygonOffset: true, polygonOffsetFactor: -2 });
  const rimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
  const up = new THREE.Vector3(0, 0, 1);
  for (const [v, n] of Object.entries(NORMALS)) {
    const face = new THREE.Group();
    face.quaternion.setFromUnitVectors(up, n);
    for (const cell of PIPS[Number(v)]) {
      const cx = ((cell - 1) % 3) - 1, cy = 1 - Math.floor((cell - 1) / 3);
      const big = Number(v) === 1 ? 1.45 : 1;
      const rim = new THREE.Mesh(rimGeo, rimMat);
      const pip = new THREE.Mesh(pipGeo, pipMat);
      rim.scale.setScalar(big); pip.scale.setScalar(big);
      rim.position.set(cx * 0.27, cy * 0.27, 0.5005);
      pip.position.set(cx * 0.27, cy * 0.27, 0.501);
      face.add(rim, pip);
    }
    die.add(face);
  }
  scene.add(die);

  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  // 动画状态
  let mode: "idle" | "rolling" | "settling" = "idle";
  let raf = 0, t0 = 0, last = 0;
  const spin = new THREE.Vector3();
  let from = new THREE.Quaternion(), to = targetQuat(1, 0.5), fromY = 0, settleMs = 600;
  const tmpQ = new THREE.Quaternion();
  const BASE_Y = 0.5;

  const render = () => renderer.render(scene, camera);
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    if (mode === "rolling") {
      // 连续翻滚 + 一下一下弹起
      tmpQ.setFromAxisAngle(spin.clone().normalize(), spin.length() * dt);
      die.quaternion.premultiply(tmpQ);
      const period = 0.36;
      const ph = (t % period) / period;
      die.position.y = BASE_Y + 0.55 * 4 * ph * (1 - ph);
      const squash = ph < 0.08 ? 1 - 0.08 * (1 - ph / 0.08) : 1;
      die.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    } else if (mode === "settling") {
      const p = Math.min(1, (now - t0) / settleMs);
      // 落地弹跳：先落下，再小弹一次，再轻点一次
      let y: number;
      if (p < 0.35) { const k = p / 0.35; y = fromY * (1 - k * k); }
      else if (p < 0.68) { const k = (p - 0.35) / 0.33; y = 0.22 * 4 * k * (1 - k); }
      else if (p < 0.86) { const k = (p - 0.68) / 0.18; y = 0.06 * 4 * k * (1 - k); }
      else y = 0;
      die.position.y = BASE_Y + y;
      const hit = [0.35, 0.68, 0.86].map((h) => Math.max(0, 1 - Math.abs(p - h) / 0.05)).reduce((a, b) => Math.max(a, b), 0);
      const s = 1 - 0.07 * hit;
      die.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      // 姿态：快速转到结果，最后带一点阻尼摆动
      const e = 1 - Math.pow(1 - Math.min(1, p / 0.7), 3);
      die.quaternion.slerpQuaternions(from, to, e);
      if (p > 0.6) {
        const k = (p - 0.6) / 0.4;
        tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0.4).normalize(), 0.09 * Math.exp(-5 * k) * Math.sin(k * 16));
        die.quaternion.premultiply(tmpQ);
      }
      if (p >= 1) { die.quaternion.copy(to); die.position.y = BASE_Y; die.scale.set(1, 1, 1); mode = "idle"; }
    }
    render();
    if (mode !== "idle") raf = requestAnimationFrame(loop);
  };
  const start = () => { cancelAnimationFrame(raf); t0 = last = performance.now(); raf = requestAnimationFrame(loop); };

  die.position.y = BASE_Y;
  die.quaternion.copy(to);
  render();

  let lastValue = 0, lastRolling: boolean | null = null;
  return {
    setState(value, rolling, ms, reduced) {
      if (value === lastValue && rolling === lastRolling) return;
      const wasRolling = lastRolling;
      lastValue = value; lastRolling = rolling;
      if (rolling) {
        if (reduced) return;
        spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(13 + Math.random() * 4);
        mode = "rolling";
        start();
        return;
      }
      to = targetQuat(value, (Math.random() - 0.5) * 0.9 + 0.55);
      if (reduced || !wasRolling) {
        cancelAnimationFrame(raf); mode = "idle";
        die.quaternion.copy(to); die.position.y = BASE_Y; die.scale.set(1, 1, 1);
        render();
        return;
      }
      from = die.quaternion.clone();
      fromY = Math.max(0.3, die.position.y - BASE_Y);
      settleMs = ms;
      mode = "settling";
      start();
    },
    dispose() {
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
      env.dispose(); pmrem.dispose(); renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

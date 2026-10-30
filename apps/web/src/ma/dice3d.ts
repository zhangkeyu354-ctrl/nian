/** Presentation only: every result comes from the server. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  makeDiceThrow,
  sampleDiceThrow,
  type DiceThrow,
} from "./dice-physics.ts";
const NORMALS: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(0, 0, 1),
  6: new THREE.Vector3(0, 0, -1),
  2: new THREE.Vector3(1, 0, 0),
  5: new THREE.Vector3(-1, 0, 0),
  3: new THREE.Vector3(0, 1, 0),
  4: new THREE.Vector3(0, -1, 0),
};
const PIPS: Record<number, number[]> = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
export type DiceHandle = {
  setState(
    value: number,
    rolling: boolean,
    settleMs: number,
    reduced: boolean,
    rollMs?: number,
  ): void;
  dispose(): void;
};
export function diceTargetQuaternion(value: number, yaw: number) {
  const q = new THREE.Quaternion().setFromUnitVectors(
    NORMALS[value] ?? NORMALS[1],
    new THREE.Vector3(0, 1, 0),
  );
  return new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    .multiply(q);
}
export function disposeDiceScene(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (Array.isArray(mesh.material))
      mesh.material.forEach((m) => materials.add(m));
    else if (mesh.material) materials.add(mesh.material);
    (o as THREE.Object3D & { shadow?: { dispose(): void } }).shadow?.dispose();
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  scene.environment = null;
  scene.clear();
}
export function createDice(
  canvas: HTMLCanvasElement,
  color: string,
): DiceHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio || 1,
      navigator.hardwareConcurrency <= 4 ? 1.25 : 1.75,
    ),
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(),
    pmrem = new THREE.PMREMGenerator(renderer);
  let environment: THREE.WebGLRenderTarget | undefined,
    stopResize = () => {},
    raf = 0,
    disposed = false;
  const release = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    stopResize();
    disposeDiceScene(scene);
    environment?.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  try {
    const room = new RoomEnvironment();
    try {
      environment = pmrem.fromScene(room, 0.08);
    } finally {
      room.dispose();
    }
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.34;
    const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 50);
    camera.position.set(0, 4.4, 3.2);
    camera.lookAt(0, 0.45, 0);
    const light = new THREE.DirectionalLight(0xfffbf4, 2.15);
    light.position.set(-3, 6, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(256, 256);
    light.shadow.radius = 4;
    light.shadow.camera.left = -2;
    light.shadow.camera.right = 2;
    light.shadow.camera.top = 2;
    light.shadow.camera.bottom = -2;
    scene.add(light, new THREE.HemisphereLight(0xffffff, 0x776d63, 0.55));
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.ShadowMaterial({ opacity: 0.2 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const die = new THREE.Group(),
      body = new THREE.Mesh(
        new RoundedBoxGeometry(1, 1, 1, 4, 0.13),
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.3,
          metalness: 0.025,
          clearcoat: 0.38,
          clearcoatRoughness: 0.34,
        }),
      );
    body.castShadow = true;
    // An ink silhouette stays attached to the solid, not a screen-space wobble.
    const outline = new THREE.Mesh(
      body.geometry,
      new THREE.MeshBasicMaterial({
        color: 0x252b3b,
        side: THREE.BackSide,
      }),
    );
    outline.scale.setScalar(1.032);
    die.add(outline, body);
    scene.add(die);
    const pipBase = new THREE.CircleGeometry(0.087, 32),
      rimBase = new THREE.RingGeometry(0.086, 0.103, 32),
      positions = pipBase.attributes.position,
      normals = pipBase.attributes.normal;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        r = Math.hypot(x, y) / 0.087;
      positions.setZ(i, 0.015 * r * r);
      const n = new THREE.Vector3(
        (-x / 0.087) * 1.15,
        (-y / 0.087) * 1.15,
        1,
      ).normalize();
      normals.setXYZ(i, n.x, n.y, n.z);
    }
    const pips: THREE.BufferGeometry[] = [],
      rims: THREE.BufferGeometry[] = [],
      ink: number[] = [];
    for (const [v, n] of Object.entries(NORMALS)) {
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        n,
      );
      // Broken pencil accents on the face margins, away from every pip.
      for (const points of [
        [
          [-0.414, -0.2],
          [-0.422, -0.04],
          [-0.416, 0.11],
        ],
        [
          [0.415, 0.04],
          [0.422, 0.18],
        ],
        [
          [-0.2, 0.419],
          [-0.09, 0.425],
        ],
      ])
        for (let i = 1; i < points.length; i++)
          for (const p of [points[i - 1], points[i]]) {
            const vertex = new THREE.Vector3(p[0], p[1], 0.503).applyQuaternion(
              q,
            );
            ink.push(vertex.x, vertex.y, vertex.z);
          }
      for (const cell of PIPS[+v]) {
        const x = (((cell - 1) % 3) - 1) * 0.27,
          y = (1 - Math.floor((cell - 1) / 3)) * 0.27,
          big = +v === 1 ? 1.4 : 1;
        pips.push(
          pipBase
            .clone()
            .scale(big, big, big)
            .translate(x, y, 0.501)
            .applyQuaternion(q),
        );
        const rim = rimBase.clone(),
          rp = rim.attributes.position;
        for (let i = 0; i < rp.count; i++) {
          const px = rp.getX(i),
            py = rp.getY(i),
            angle = Math.atan2(py, px),
            wobble =
              1 +
              0.023 * Math.sin(angle * 3 + cell) +
              0.012 * Math.sin(angle * 7 + Number(v));
          rp.setXY(i, px * wobble, py * wobble);
        }
        rims.push(
          rim.scale(big, big, big).translate(x, y, 0.517).applyQuaternion(q),
        );
      }
    }
    die.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.Float32BufferAttribute(ink, 3),
        ),
        new THREE.LineBasicMaterial({
          color: 0x303449,
          transparent: true,
          opacity: 0.55,
        }),
      ),
      new THREE.Mesh(
        mergeGeometries(pips),
        new THREE.MeshPhysicalMaterial({
          color: 0xfff7e6,
          roughness: 0.57,
          clearcoat: 0.08,
          clearcoatRoughness: 0.5,
        }),
      ),
      new THREE.Mesh(
        mergeGeometries(rims),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color).multiplyScalar(0.43),
          roughness: 0.7,
        }),
      ),
    );
    [...pips, ...rims, pipBase, rimBase].forEach((g) => g.dispose());
    let mode: "idle" | "moving" = "idle",
      started = 0,
      duration = 1370;
    let trajectory: DiceThrow | null = null;
    let target = diceTargetQuaternion(1, 0.46);
    const BASE = 0.5,
      render = () => {
        if (!disposed) renderer.render(scene, camera);
      };
    const resize = () => {
      if (disposed) return;
      const w = Math.max(1, canvas.clientWidth),
        h = Math.max(1, canvas.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    die.position.y = BASE;
    die.quaternion.copy(target);
    resize();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      stopResize = () => observer.disconnect();
    } else {
      window.addEventListener("resize", resize);
      stopResize = () => window.removeEventListener("resize", resize);
    }
    const loop = (now: number) => {
      if (disposed) return;
      if (mode === "moving" && trajectory) {
        const p = Math.min(1, (now - started) / Math.max(1, duration));
        const sample = sampleDiceThrow(trajectory, p);
        die.position.copy(sample.position);
        die.quaternion.copy(sample.rotation);
        if (p >= 1) mode = "idle";
      }
      render();
      if (mode !== "idle") raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      started = performance.now();
      raf = requestAnimationFrame(loop);
    };
    let lastValue = 0,
      lastRolling: boolean | null = null,
      lastReduced = false,
      lastMs = 0,
      lastRollMs = 0;
    return {
      setState(value, rolling, ms, reduced, throwMs = 750) {
        if (
          disposed ||
          (value === lastValue &&
            rolling === lastRolling &&
            reduced === lastReduced &&
            ms === lastMs &&
            throwMs === lastRollMs)
        )
          return;
        const wasRolling = lastRolling,
          previousValue = lastValue;
        lastValue = value;
        lastRolling = rolling;
        lastReduced = reduced;
        lastMs = ms;
        lastRollMs = throwMs;
        target = diceTargetQuaternion(value, 0.46);
        if (reduced) {
          trajectory = null;
          cancelAnimationFrame(raf);
          mode = "idle";
          die.quaternion.copy(target);
          die.position.set(0, BASE, 0);
          die.scale.setScalar(1);
          render();
          return;
        }
        if (rolling && !wasRolling) {
          trajectory = makeDiceThrow(
            value,
            Math.floor(Math.random() * 2 ** 31),
          );
          duration = throwMs + ms;
          mode = "moving";
          // Present the first physical frame immediately, not the old idle pose.
          die.position.copy(trajectory.frames[0].position);
          die.quaternion.copy(trajectory.frames[0].rotation);
          render();
          start();
          return;
        }
        if (trajectory && value === previousValue) {
          // Server reveals the number halfway through the SAME trajectory.
          // Do not restart the clock, change axes or interpolate to a result pose.
          const progress = Math.min(
            1,
            (performance.now() - started) / Math.max(1, duration),
          );
          duration = throwMs + ms;
          started = performance.now() - progress * duration;
          return;
        }
        if (!rolling) {
          cancelAnimationFrame(raf);
          mode = "idle";
          die.quaternion.copy(target);
          die.position.set(0, BASE, 0);
          die.scale.setScalar(1);
          render();
          return;
        }
      },
      dispose: release,
    };
  } catch (error) {
    release();
    throw error;
  }
}

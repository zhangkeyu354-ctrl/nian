import * as CANNON from "cannon-es";
/** Visual rigid body only. The server result relabels the entire cube trajectory,
 * never applies a last-frame rotation and never determines a game result. */
import { Quaternion, Vector3, Euler, PerspectiveCamera } from "three";

export type DicePose = {
  position: Vector3;
  rotation: Quaternion;
  clearance: number;
  speed: number;
};
export type DiceThrow = { frames: DicePose[]; impacts: number; fov: number };
const faces = [
  new Vector3(0, 0, 1),
  new Vector3(1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, -1, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 0, -1),
];
const corners: Vector3[] = [];
for (const x of [-0.37, 0.37])
  for (const y of [-0.37, 0.37])
    for (const z of [-0.37, 0.37]) corners.push(new Vector3(x, y, z));
const up = new Vector3(0, 1, 0);

function simulateDiceThrow(value: number, seed: number): DiceThrow {
  let state = seed | 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
  // 像真人从桌边把骰子抛进来：从画面一侧外面飞入，落桌、弹跳、翻滚、停在中央。
  const side = random() < 0.5 ? -1 : 1;
  const yaw = random() * Math.PI * 2;
  const releaseRotation = new Quaternion().setFromEuler(
    new Euler(random() * Math.PI, yaw, random() * Math.PI),
  );
  const releasePosition = new Vector3(2.6 * side, 1.5 + random() * 0.3, 1.1 + random() * 0.4);
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -34, 0),
    allowSleep: true,
  });
  (world.solver as CANNON.GSSolver).iterations = 20;
  const felt = new CANNON.Material(),
    enamel = new CANNON.Material();
  world.addContactMaterial(
    new CANNON.ContactMaterial(felt, enamel, {
      friction: 0.55,
      restitution: 0.36,
    }),
  );
  const table = new CANNON.Body({
    mass: 0,
    material: felt,
    shape: new CANNON.Plane(),
  });
  table.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(table);
  const die = new CANNON.Body({
    mass: 1,
    material: enamel,
    linearDamping: 0.35,
    angularDamping: 0.45,
    allowSleep: true,
    sleepSpeedLimit: 0.035,
    sleepTimeLimit: 0.25,
  });
  die.addShape(new CANNON.Box(new CANNON.Vec3(0.37, 0.37, 0.37)));
  // The support function of these eight corner spheres matches the rounded
  // cube against a plane. This prevents the visual bevel from floating above it.
  const sphere = new CANNON.Sphere(0.13);
  for (const c of corners) die.addShape(sphere, new CANNON.Vec3(c.x, c.y, c.z));
  die.position.set(releasePosition.x, releasePosition.y, releasePosition.z);
  die.quaternion.set(
    releaseRotation.x,
    releaseRotation.y,
    releaseRotation.z,
    releaseRotation.w,
  );
  die.velocity.set(-side * (4.6 + random() * 0.8), 0.6 + random() * 0.8, -(1.2 + random() * 0.4));
  die.angularVelocity.set(
    (random() - 0.5) * 30,
    (random() - 0.5) * 16,
    side * (14 + random() * 8),
  );
  world.addBody(die);
  let impacts = 0;
  die.addEventListener("collide", () => impacts++);
  const frames: DicePose[] = [];
  const record = () => {
    const rotation = new Quaternion(
        die.quaternion.x,
        die.quaternion.y,
        die.quaternion.z,
        die.quaternion.w,
      ),
      position = new Vector3(die.position.x, die.position.y, die.position.z),
      floorSupport =
        Math.min(...corners.map((c) => c.clone().applyQuaternion(rotation).y)) -
        0.13;
    position.y = Math.max(position.y, -floorSupport);
    const clearance = position.y + floorSupport;
    frames.push({
      position,
      rotation,
      clearance,
      speed: die.velocity.length() + die.angularVelocity.length(),
    });
  };
  record();
  let visuallyStill = 0;
  for (let step = 0; step < 1440; step++) {
    world.step(1 / 240);
    const q = new Quaternion(
      die.quaternion.x,
      die.quaternion.y,
      die.quaternion.z,
      die.quaternion.w,
    );
    const flat = Math.max(...faces.map((n) => n.clone().applyQuaternion(q).y));
    if (
      die.velocity.length() < 0.08 &&
      die.angularVelocity.length() < 0.1 &&
      flat > 0.99997
    )
      visuallyStill++;
    else visuallyStill = 0;
    if (visuallyStill >= 24) die.sleep();
    record();
    if (die.sleepState === CANNON.Body.SLEEPING) break;
  }
  const last = frames.at(-1)!;
  let top = 0;
  for (let i = 1; i < 6; i++)
    if (
      faces[i].clone().applyQuaternion(last.rotation).y >
      faces[top].clone().applyQuaternion(last.rotation).y
    )
      top = i;
  const relabel = new Quaternion().setFromUnitVectors(
    faces[Math.max(0, Math.min(5, value - 1))],
    faces[top],
  );
  const offsetX = last.position.x,
    offsetZ = last.position.z;
  // 画面外的那段飞行不用播：从骰子刚进入画面边缘时开始
  const enter = frames.findIndex((f) => Math.abs(f.position.x - offsetX) < 1.85);
  if (enter > 0) frames.splice(0, enter);
  for (const f of frames) {
    f.rotation.multiply(relabel);
    f.position.x -= offsetX;
    f.position.z -= offsetZ;
  }
  return { frames, impacts, fov: 34 };
}
export function makeDiceThrow(value: number, seed: number): DiceThrow {
  // 镜头固定，不随轨迹缩放：骰子从画面外飞进来才自然。
  // 偶尔一投滑得太短（会在画面中间凭空出现）或太久，就换一组力度重算。
  let best = simulateDiceThrow(value, seed);
  for (let attempt = 1; attempt < 12; attempt++) {
    const ok = Math.abs(best.frames[0].position.x) > 1.7 && best.frames.length / 240 < 2.1;
    if (ok) break;
    best = simulateDiceThrow(value, (seed + attempt * 104729) | 0);
  }
  return best;
}

export function createDiceCamera(path?: DiceThrow) {
  const camera = new PerspectiveCamera(path?.fov ?? 34, 1, 0.1, 50);
  camera.position.set(0, 4.4, 3.2);
  camera.lookAt(0, 0.9, 0);
  camera.updateMatrixWorld();
  return camera;
}

export function sampleDiceThrow(path: DiceThrow, progress: number): DicePose {
  const index = Math.max(0, Math.min(1, progress)) * (path.frames.length - 1),
    i = Math.floor(index),
    a = path.frames[i],
    b = path.frames[Math.min(i + 1, path.frames.length - 1)],
    t = index - i;
  return {
    position: a.position.clone().lerp(b.position, t),
    rotation: a.rotation.clone().slerp(b.rotation, t),
    clearance: a.clearance + (b.clearance - a.clearance) * t,
    speed: a.speed + (b.speed - a.speed) * t,
  };
}

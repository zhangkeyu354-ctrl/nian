/** Visual rigid body only. The server result relabels the entire cube trajectory,
 * never applies a last-frame rotation and never determines a game result. */
import { Quaternion, Vector3 } from "three";

export type DicePose = {
  position: Vector3;
  rotation: Quaternion;
  clearance: number;
  speed: number;
};
export type DiceThrow = { frames: DicePose[]; impacts: number };
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
  const position = new Vector3(-0.72, 1.65, 0),
    velocity = new Vector3(2.4, 0.8, 0.2),
    rotation = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0.5, 0.7).normalize(),
      random() * 6,
    ),
    omega = new Vector3(7 + random() * 3, -3 + random() * 6, 8 + random() * 3);
  const dt = 1 / 240,
    frames: DicePose[] = [],
    r = new Vector3(),
    point = new Vector3(),
    contactVelocity = new Vector3(),
    cross = new Vector3(),
    impulse = new Vector3(),
    dq = new Quaternion();
  let impacts = 0,
    quiet = 0;
  const support = () =>
    Math.min(...corners.map((c) => r.copy(c).applyQuaternion(rotation).y)) -
    0.13;
  const record = () =>
    frames.push({
      position: position.clone(),
      rotation: rotation.clone(),
      clearance: position.y + support(),
      speed: velocity.length() + omega.length(),
    });
  record();
  for (let step = 0; step < 1440; step++) {
    velocity.y -= 18 * dt;
    position.addScaledVector(velocity, dt);
    const speed = omega.length();
    if (speed > 1e-9)
      rotation
        .premultiply(
          dq.setFromAxisAngle(
            cross.copy(omega).divideScalar(speed),
            speed * dt,
          ),
        )
        .normalize();
    let contact = false;
    // Sequential impulses at rounded corner contacts. Linear and angular momentum
    // change together on impact; friction makes a corner catch and tip the cube.
    for (let iteration = 0; iteration < 8; iteration++)
      for (const corner of corners) {
        r.copy(corner).applyQuaternion(rotation);
        r.y -= 0.13;
        if (position.y + r.y > 0.001) continue;
        contact = true;
        contactVelocity.crossVectors(omega, r).add(velocity);
        if (contactVelocity.y >= 0) continue;
        const closing = contactVelocity.y;
        const restitution = iteration === 0 && closing < -0.9 ? 0.43 : 0;
        cross.crossVectors(r, up);
        const normalImpulse =
          (-(1 + restitution) * closing) / (1 + 6 * cross.lengthSq());
        impulse.set(0, normalImpulse, 0);
        velocity.add(impulse);
        omega.addScaledVector(cross, normalImpulse * 6);
        contactVelocity.crossVectors(omega, r).add(velocity);
        contactVelocity.y = 0;
        const tangentSpeed = contactVelocity.length();
        if (tangentSpeed > 1e-8) {
          point.copy(contactVelocity).divideScalar(tangentSpeed);
          cross.crossVectors(r, point);
          const friction = Math.min(
            0.48 * normalImpulse,
            tangentSpeed / (1 + 6 * cross.lengthSq()),
          );
          impulse.copy(point).multiplyScalar(-friction);
          velocity.add(impulse);
          omega.addScaledVector(cross, -friction * 6);
        }
        if (iteration === 0 && closing < -1) impacts++;
      }
    const penetration = position.y + support();
    if (penetration < 0) position.y -= penetration;
    velocity.multiplyScalar(Math.exp(-(contact ? 0.55 : 0.08) * dt));
    omega.multiplyScalar(Math.exp(-(contact ? 1.4 : 0.08) * dt));
    if (contact && velocity.length() < 0.025 && omega.length() < 0.025) quiet++;
    else quiet = 0;
    record();
    if (quiet > 30) break;
  }
  // A cube symmetry permutes labels without changing its shape or any collision.
  // Apply it to EVERY frame, so the server's face is correct with no result snap.
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
  for (const f of frames) {
    f.rotation.multiply(relabel);
    f.position.x -= offsetX;
    f.position.z -= offsetZ;
  }
  return { frames, impacts };
}

export function makeDiceThrow(value: number, seed: number): DiceThrow {
  // Keep the actual bounces inside the small phone canvas. Select a physical
  // throw that fits, rather than clamping positions or bouncing off invisible walls.
  for (let attempt = 0; attempt < 6; attempt++) {
    const path = simulateDiceThrow(value, seed + attempt * 104729);
    if (
      path.frames.every(
        (f, i) =>
          i < path.frames.length * 0.3 ||
          (Math.abs(f.position.x) < 0.58 && Math.abs(f.position.z) < 0.48),
      )
    )
      return path;
  }
  return simulateDiceThrow(value, 1);
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

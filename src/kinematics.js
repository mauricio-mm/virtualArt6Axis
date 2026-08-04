import * as THREE from "../node_modules/three/build/three.module.js";

const DEG_TO_RAD = Math.PI / 180;
const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export const linkLength = 1.1;
export const workspaceRadius = linkLength * 6;

export const dhDefinitions = [
  { name: "J1", theta: 35, d: linkLength, a: 0.0, alpha: 90, min: -180, max: 180 },
  { name: "J2", theta: -35, d: 0.0, a: linkLength, alpha: 0, min: -130, max: 130 },
  { name: "J3", theta: 65, d: 0.0, a: linkLength, alpha: 0, min: -150, max: 150 },
  { name: "J4", theta: -30, d: 0.0, a: linkLength, alpha: 90, min: -180, max: 180 },
  { name: "J5", theta: 40, d: 0.0, a: linkLength, alpha: -90, min: -130, max: 130 },
  { name: "J6", theta: 10, d: 0.0, a: linkLength, alpha: 0, min: -180, max: 180 },
];

export function createJointState() {
  return dhDefinitions.map((joint) => ({
    ...joint,
    thetaRad: joint.theta * DEG_TO_RAD,
    alphaRad: joint.alpha * DEG_TO_RAD,
    minRad: joint.min * DEG_TO_RAD,
    maxRad: joint.max * DEG_TO_RAD,
  }));
}

export function dhToThree(vector) {
  return new THREE.Vector3(vector.x, vector.z, vector.y);
}

export function threeToDh(vector) {
  return new THREE.Vector3(vector.x, vector.z, vector.y);
}

export function createDhMatrix(theta, d, a, alpha) {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);

  return [ct, -st * ca, st * sa, a * ct, st, ct * ca, -ct * sa, a * st, 0, sa, ca, d, 0, 0, 0, 1];
}

export function multiplyMatrix(left, rightMatrix) {
  const result = new Array(16).fill(0);

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[row * 4 + column] += left[row * 4 + index] * rightMatrix[index * 4 + column];
      }
    }
  }

  return result;
}

function transformOrigin(matrix) {
  return new THREE.Vector3(matrix[3], matrix[7], matrix[11]);
}

function transformAxisZ(matrix) {
  return new THREE.Vector3(matrix[2], matrix[6], matrix[10]).normalize();
}

function clampJoint(joint) {
  joint.thetaRad = THREE.MathUtils.clamp(joint.thetaRad, joint.minRad, joint.maxRad);
}

export function computeForwardKinematics(joints) {
  let transform = [...identityMatrix];
  const origins = [];
  const axes = [];
  const positions = [transformOrigin(transform)];
  const localMatrices = [];
  const cumulativeMatrices = [];

  for (const joint of joints) {
    origins.push(transformOrigin(transform));
    axes.push(transformAxisZ(transform));

    const localMatrix = createDhMatrix(joint.thetaRad, joint.d, joint.a, joint.alphaRad);
    localMatrices.push(localMatrix);

    transform = multiplyMatrix(transform, localMatrix);
    cumulativeMatrices.push(transform);
    positions.push(transformOrigin(transform));
  }

  return {
    axes,
    cumulativeMatrices,
    endPosition: positions[positions.length - 1],
    localMatrices,
    origins,
    positions,
  };
}

export function solveIk(joints, target, options = {}) {
  const iterations = options.iterations ?? 28;
  const tolerance = options.tolerance ?? 0.03;
  const maxStep = options.maxStep ?? 0.28;
  const workingTarget = target.clone();

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let state = computeForwardKinematics(joints);

    if (state.endPosition.distanceTo(workingTarget) <= tolerance) {
      break;
    }

    for (let index = joints.length - 1; index >= 0; index -= 1) {
      state = computeForwardKinematics(joints);

      const origin = state.origins[index];
      const axis = state.axes[index];
      const toEnd = state.endPosition.clone().sub(origin);
      const toTarget = workingTarget.clone().sub(origin);

      const projectedEnd = toEnd.addScaledVector(axis, -toEnd.dot(axis));
      const projectedTarget = toTarget.addScaledVector(axis, -toTarget.dot(axis));

      if (projectedEnd.lengthSq() < 0.000001 || projectedTarget.lengthSq() < 0.000001) {
        continue;
      }

      projectedEnd.normalize();
      projectedTarget.normalize();

      const cross = new THREE.Vector3().crossVectors(projectedEnd, projectedTarget);
      const angle = Math.atan2(cross.dot(axis), projectedEnd.dot(projectedTarget));

      if (!Number.isFinite(angle)) {
        continue;
      }

      joints[index].thetaRad += THREE.MathUtils.clamp(angle, -maxStep, maxStep);
      clampJoint(joints[index]);
    }
  }

  return computeForwardKinematics(joints);
}

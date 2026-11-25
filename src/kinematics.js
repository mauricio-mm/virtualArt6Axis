import * as THREE from "../node_modules/three/build/three.module.js";

const DEG_TO_RAD = Math.PI / 180;
const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export const DH_TO_THREE_SCALE = 0.01;
export const THREE_TO_DH_SCALE = 1 / DH_TO_THREE_SCALE;
export const J3_J4_MM = 255.3;
export const J4_J5_MM = 158.9;
export const J5_J6_MM = 152.0;
export const TOOL_LENGTH_MM = 88.8;
export const dhDefinitions = [
  { name: "J1", theta: 0, thetaOffset: 0,   d: 265.8, a: 0,   alpha: 90,  min: -180, max: 180 },
  { name: "J2", theta: 0, thetaOffset: 0,   d: 0,     a: 256, alpha: 0,   min: -180, max: 180 },
  { name: "J3", theta: 0, thetaOffset: 90,  d: 0,     a: 0,   alpha: 90,  min: -180, max: 180 },
  { name: "J4", theta: 0, thetaOffset: -60, d: 417.1, a: 0,   alpha: -90, min: -180, max: 180 },
  { name: "J5", theta: 0, thetaOffset: 0,   d: 0,     a: 0,   alpha: 90,  min: -180, max: 180 },
  { name: "J6", theta: 0, thetaOffset: 0,   d: 155.3, a: 0,   alpha: 0,   min: -180, max: 180 },
];
export const workspaceRadiusMm = dhDefinitions.reduce(
  (radius, joint) => radius + Math.hypot(joint.d, joint.a),
  0
) + TOOL_LENGTH_MM;
export const workspaceRadius = workspaceRadiusMm * DH_TO_THREE_SCALE;

export function createJointState() {
  return dhDefinitions.map((joint) => ({
    ...joint,
    thetaRad: joint.theta * DEG_TO_RAD,
    thetaOffsetRad: joint.thetaOffset * DEG_TO_RAD,
    alphaRad: joint.alpha * DEG_TO_RAD,
    minRad: joint.min * DEG_TO_RAD,
    maxRad: joint.max * DEG_TO_RAD,
  }));
}

export function dhToThree(vector) {
  return vector.clone().multiplyScalar(DH_TO_THREE_SCALE);
}

export function threeToDh(vector) {
  return vector.clone().multiplyScalar(THREE_TO_DH_SCALE);
}

export function dhMatrixToThree(matrixValues) {
  const threeMatrix = new THREE.Matrix4().set(...matrixValues);
  const position = new THREE.Vector3().setFromMatrixPosition(threeMatrix);

  threeMatrix.setPosition(position.multiplyScalar(DH_TO_THREE_SCALE));
  return threeMatrix;
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
  const jointMatrices = [];
  const localMatrices = [];
  const cumulativeMatrices = [];

  for (const joint of joints) {
    const effectiveTheta = joint.thetaRad + (joint.thetaOffsetRad ?? 0);

    origins.push(transformOrigin(transform));
    axes.push(transformAxisZ(transform));
    jointMatrices.push(multiplyMatrix(transform, createDhMatrix(effectiveTheta, 0, 0, 0)));

    const localMatrix = createDhMatrix(effectiveTheta, joint.d, joint.a, joint.alphaRad);
    localMatrices.push(localMatrix);

    transform = multiplyMatrix(transform, localMatrix);
    cumulativeMatrices.push(transform);
    positions.push(transformOrigin(transform));
  }

  // Matriz do TCP separada da sexta junta: a ponta esta 40 mm a frente
  // no eixo z6. A sexta junta gira o orgao terminal sem mover o TCP.
  const tcpMatrix = multiplyMatrix(transform, createDhMatrix(0, TOOL_LENGTH_MM, 0, 0));
  return {
    axes,
    cumulativeMatrices,
    endPosition: transformOrigin(tcpMatrix),
    tcpMatrix,
    jointMatrices,
    localMatrices,
    origins,
    positions,
  };
}

// A origem DH da J4 coincide com a J3 neste referencial, mas o eixo fisico
// da J4 fica a 252,5 mm ao longo de z3. Ela gira em torno dessa mesma reta.
// Expor posicoes fisicas separadas impede que o visualizador una dois elos.
export function getPhysicalJointPositions(state) {
  const physical = state.origins.map((origin) => origin.clone());
  const frame3 = state.cumulativeMatrices[2];
  const z3 = new THREE.Vector3(frame3[2], frame3[6], frame3[10]).normalize();
  physical[3] = physical[2].clone().addScaledVector(z3, J3_J4_MM);
  // O zero de d5/a5 coloca a origem DH antes de J6 sobre o centro da J5.
  // O centro fisico da J6 fica apos a translacao d6, no eixo longitudinal.
  physical[5] = transformOrigin(state.cumulativeMatrices[5]);
  return physical;
}

export function solveIk(joints, target, options = {}) {
  const iterations = options.iterations ?? 28;
  const tolerance = options.tolerance ?? 2;
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

import { computeForwardKinematics, createJointState, dhToThree } from "./kinematics.js";

const DEG_TO_RAD = Math.PI / 180;

function matrixToRows(matrix) {
  return [
    matrix.slice(0, 4),
    matrix.slice(4, 8),
    matrix.slice(8, 12),
    matrix.slice(12, 16),
  ];
}

export function calculateForwardKinematics(joints = createJointState()) {
  const state = computeForwardKinematics(joints);
  const positionsThree = state.positions.map((position) => dhToThree(position));

  return {
    axes: state.axes,
    cumulativeMatrices: state.cumulativeMatrices,
    cumulativeMatrixRows: state.cumulativeMatrices.map(matrixToRows),
    endEffectorDh: state.endPosition,
    endEffectorThree: positionsThree[positionsThree.length - 1],
    joints,
    localMatrices: state.localMatrices,
    localMatrixRows: state.localMatrices.map(matrixToRows),
    origins: state.origins,
    positionsDh: state.positions,
    positionsThree,
  };
}

export function applyForwardKinematicsAngles(joints, anglesDegrees) {
  anglesDegrees.forEach((angleDeg, index) => {
    if (!joints[index] || !Number.isFinite(angleDeg)) {
      return;
    }

    joints[index].thetaRad = angleDeg * DEG_TO_RAD;
  });

  return computeForwardKinematics(joints);
}

export function getEndEffectorPose(joints = createJointState()) {
  const state = calculateForwardKinematics(joints);
  const transform = state.cumulativeMatrices[state.cumulativeMatrices.length - 1];

  return {
    matrix: transform,
    matrixRows: matrixToRows(transform),
    positionDh: state.endEffectorDh,
    positionThree: state.endEffectorThree,
  };
}

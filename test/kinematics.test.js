import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../node_modules/three/build/three.module.js";
import {
  computeForwardKinematics,
  createDhMatrix,
  createJointState,
  dhMatrixToThree,
  dhToThree,
  getPhysicalJointPositions,
  threeToDh,
} from "../src/kinematics.js";

const tolerance = 1e-9;

function assertVectorClose(actual, expected) {
  assert.equal(actual.length, expected.length);

  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) <= tolerance, `${value} != ${expected[index]}`);
  });
}

test("zero pose exposes the physical joint axes in Three.js coordinates", () => {
  const state = computeForwardKinematics(createJointState());
  const expectedAxes = [
    [0, 0, 1],
    [0, 1, 0],
    [0, 1, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 1, 0],
  ];

  state.axes.forEach((axis, index) => {
    assertVectorClose(dhToThree(axis).normalize().toArray(), expectedAxes[index]);
  });
});

test("DH and Three.js vector conversions are reversible", () => {
  const vectorDh = new THREE.Vector3(12, -34, 56);
  const roundTrip = threeToDh(dhToThree(vectorDh));

  assert.ok(roundTrip.distanceTo(vectorDh) <= tolerance);
});

test("links from J2 through J6 follow X in the zero pose", () => {
  const state = computeForwardKinematics(createJointState());
  const positions = getPhysicalJointPositions(state);
  const link2Direction = positions[2].clone().sub(positions[1]).normalize();
  const link3Direction = positions[3].clone().sub(positions[2]).normalize();
  const link4Direction = positions[4].clone().sub(positions[3]).normalize();
  const link5Direction = positions[5].clone().sub(positions[4]).normalize();

  assertVectorClose(link2Direction.toArray(), [1, 0, 0]);
  assertVectorClose(link3Direction.toArray(), [1, 0, 0]);
  assertVectorClose(link4Direction.toArray(), [1, 0, 0]);
  assertVectorClose(link5Direction.toArray(), [1, 0, 0]);
});

test("factorized Three.js transforms reproduce the cumulative DH matrices", () => {
  const joints = createJointState();
  const angles = [25, -40, 15, 32, -18, 55];

  joints.forEach((joint, index) => {
    joint.thetaRad = THREE.MathUtils.degToRad(angles[index]);
  });

  const state = computeForwardKinematics(joints);
  let hierarchyMatrix = new THREE.Matrix4();

  joints.forEach((joint, index) => {
    const effectiveTheta = joint.thetaRad + joint.thetaOffsetRad;

    hierarchyMatrix
      .multiply(new THREE.Matrix4().makeRotationZ(effectiveTheta))
      .multiply(dhMatrixToThree(createDhMatrix(0, joint.d, joint.a, joint.alphaRad)));

    const expectedMatrix = dhMatrixToThree(state.cumulativeMatrices[index]);
    hierarchyMatrix.elements.forEach((value, elementIndex) => {
      assert.ok(
        Math.abs(value - expectedMatrix.elements[elementIndex]) <= tolerance,
        `J${index + 1}, element ${elementIndex}: ${value} != ${expectedMatrix.elements[elementIndex]}`
      );
    });
  });
});

test("J5 rotates J5-J6 from X into the XZ plane", () => {
  const joints = createJointState();
  joints[4].thetaRad = Math.PI / 2;

  const positions = getPhysicalJointPositions(computeForwardKinematics(joints));
  const j5ToJ6 = positions[5].clone().sub(positions[4]);

  assertVectorClose(j5ToJ6.toArray(), [0, 0, -152]);
});

test("J1 and J2 no longer collapse into the same motion", () => {
  const jointsJ1 = createJointState();
  const jointsJ2 = createJointState();

  jointsJ1[0].thetaRad = THREE.MathUtils.degToRad(30);
  jointsJ2[1].thetaRad = THREE.MathUtils.degToRad(30);

  const endJ1 = computeForwardKinematics(jointsJ1).endPosition;
  const endJ2 = computeForwardKinematics(jointsJ2).endPosition;

  assert.ok(endJ1.distanceTo(endJ2) > 1);
});

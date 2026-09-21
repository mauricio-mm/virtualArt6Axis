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
    [1, 0, 0],
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

test("links J2-J3 and J3-J4 both follow X in the zero pose", () => {
  const state = computeForwardKinematics(createJointState());
  const positions = getPhysicalJointPositions(state);
  const link2Direction = positions[2].clone().sub(positions[1]).normalize();
  const link3Direction = positions[3].clone().sub(positions[2]).normalize();

  assertVectorClose(link2Direction.toArray(), [1, 0, 0]);
  assertVectorClose(link3Direction.toArray(), [1, 0, 0]);
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

test("J4 rotates its downstream link in the YZ plane", () => {
  const joints = createJointState();
  joints[3].thetaRad = Math.PI / 2;

  const positions = getPhysicalJointPositions(computeForwardKinematics(joints));
  const j4ToJ5 = positions[4].clone().sub(positions[3]);

  assertVectorClose(j4ToJ5.toArray(), [0, 0, 158.9]);
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

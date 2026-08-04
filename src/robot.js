import * as THREE from "../node_modules/three/build/three.module.js";
import {
  computeForwardKinematics,
  createJointState,
  dhToThree,
  solveIk,
  threeToDh,
  workspaceRadius,
} from "./kinematics.js";
import { applyForwardKinematicsAngles } from "./forward-kinematics.js";

const jointRadius = 0.13;
const endEffectorRadius = 0.2;
const defaultMotionDuration = 1.2;

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;
}

function shortestAngleTarget(current, target) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));

  return current + delta;
}

export class RobotArm {
  constructor() {
    this.group = new THREE.Group();
    this.joints = createJointState();
    this.kinematics = computeForwardKinematics(this.joints);
    this.motion = null;
    this.targetActive = false;
    this.targetPosition = dhToThree(this.kinematics.endPosition);

    this.linkGeometry = new THREE.BufferGeometry();
    this.link = new THREE.Line(
      this.linkGeometry,
      new THREE.LineBasicMaterial({
        color: 0xdce5ef,
        linewidth: 2,
      })
    );

    this.jointMeshes = this.kinematics.positions.slice(0, -1).map((_, index) => {
      const geometry = new THREE.SphereGeometry(index === 0 ? 0.17 : jointRadius, 24, 16);
      const material = new THREE.MeshStandardMaterial({
        color: index === 0 ? 0x9aa7b5 : 0xe7edf3,
        roughness: 0.44,
        metalness: 0.12,
      });

      return new THREE.Mesh(geometry, material);
    });

    this.endEffector = new THREE.Mesh(
      new THREE.SphereGeometry(endEffectorRadius, 28, 18),
      new THREE.MeshStandardMaterial({
        color: 0xffc857,
        emissive: 0x3a2500,
        roughness: 0.34,
        metalness: 0.08,
      })
    );
    this.endEffector.userData.role = "endEffector";

    this.workspace = new THREE.Mesh(
      new THREE.SphereGeometry(workspaceRadius, 48, 24),
      new THREE.MeshBasicMaterial({
        color: 0x8fd3ff,
        opacity: 0.09,
        transparent: true,
        wireframe: true,
      })
    );
    this.workspace.name = "workspace";
    this.workspace.visible = false;

    this.target = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0x5eead4,
        emissive: 0x06312c,
        roughness: 0.28,
        metalness: 0.04,
        transparent: true,
        opacity: 0.85,
      })
    );
    this.target.userData.role = "ikTarget";
    this.target.visible = false;

    this.group.add(this.workspace, this.link, this.endEffector, this.target, ...this.jointMeshes);
    this.updateVisuals();
  }

  activateTarget() {
    if (!this.targetActive) {
      this.motion = null;
      this.targetPosition.copy(this.getEndEffectorPosition());
      this.targetActive = true;
      this.target.visible = true;
      this.target.position.copy(this.targetPosition);
    }
  }

  getEndEffectorPosition() {
    return dhToThree(this.kinematics.endPosition);
  }

  getInteractiveObjects() {
    return this.target.visible ? [this.endEffector, this.target] : [this.endEffector];
  }

  getMatrixRows() {
    return this.joints.map((joint, index) => ({
      alphaDeg: joint.alpha,
      a: joint.a,
      d: joint.d,
      index,
      matrix: this.kinematics.localMatrices[index],
      name: joint.name,
      thetaDeg: THREE.MathUtils.radToDeg(joint.thetaRad),
    }));
  }

  getStatus() {
    const end = this.getEndEffectorPosition();
    const target = this.targetPosition;
    const endMm = this.kinematics.endPosition.clone();
    const targetMm = threeToDh(target);
    const error = this.targetActive ? end.distanceTo(target) : 0;
    const errorMm = this.targetActive ? endMm.distanceTo(targetMm) : 0;

    return {
      end,
      endMm,
      error,
      errorMm,
      target,
      targetMm,
      targetActive: this.targetActive,
    };
  }

  setWorkspaceVisible(isVisible) {
    this.workspace.visible = isVisible;
  }

  setJointAnglesDegrees(anglesDegrees, options = {}) {
    this.targetActive = false;
    this.target.visible = false;

    const animate = options.animate ?? true;
    const duration = options.duration ?? defaultMotionDuration;

    if (!animate || duration <= 0) {
      this.motion = null;
      this.kinematics = applyForwardKinematicsAngles(this.joints, anglesDegrees);
      this.updateVisuals();
      return;
    }

    const startAngles = this.joints.map((joint) => joint.thetaRad);
    const targetAngles = this.joints.map((joint, index) => {
      const angleDeg = anglesDegrees[index];

      if (!Number.isFinite(angleDeg)) {
        return joint.thetaRad;
      }

      return shortestAngleTarget(joint.thetaRad, THREE.MathUtils.degToRad(angleDeg));
    });

    this.motion = {
      duration,
      elapsed: 0,
      startAngles,
      targetAngles,
    };
  }

  setTargetPosition(position) {
    this.motion = null;
    this.activateTarget();
    this.targetPosition.copy(position);
    this.target.position.copy(position);
  }

  solveToTarget() {
    this.motion = null;
    this.activateTarget();
    this.kinematics = solveIk(this.joints, threeToDh(this.targetPosition));
    this.updateVisuals();
  }

  updateMotion(deltaTime) {
    if (!this.motion) {
      return false;
    }

    this.motion.elapsed = Math.min(this.motion.elapsed + deltaTime, this.motion.duration);

    const progress = this.motion.duration > 0 ? this.motion.elapsed / this.motion.duration : 1;
    const easedProgress = easeInOutCubic(progress);

    this.joints.forEach((joint, index) => {
      const start = this.motion.startAngles[index];
      const target = this.motion.targetAngles[index];
      joint.thetaRad = THREE.MathUtils.lerp(start, target, easedProgress);
    });

    if (progress >= 1) {
      this.joints.forEach((joint, index) => {
        joint.thetaRad = this.motion.targetAngles[index];
      });
      this.motion = null;
    }

    this.updateVisuals();
    return true;
  }

  updateVisuals() {
    this.kinematics = computeForwardKinematics(this.joints);

    const points = this.kinematics.positions.map((position) => dhToThree(position));
    this.linkGeometry.setFromPoints(points);
    this.linkGeometry.computeBoundingSphere();

    this.jointMeshes.forEach((mesh, index) => {
      mesh.position.copy(points[index]);
    });

    this.endEffector.position.copy(points[points.length - 1]);

    if (!this.targetActive) {
      this.targetPosition.copy(this.endEffector.position);
    }

    this.target.visible = this.targetActive;
    this.target.position.copy(this.targetPosition);
  }
}

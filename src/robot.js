import * as THREE from "../node_modules/three/build/three.module.js";
import { GLTFLoader } from "../node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import {
  computeForwardKinematics,
  createJointState,
  dhMatrixToThree,
  dhToThree,
  getPhysicalJointPositions,
  solveIk,
  threeToDh,
  workspaceRadius,
} from "./kinematics.js";
import { applyForwardKinematicsAngles } from "./forward-kinematics.js";

const jointRadius = 0.13;
const endEffectorRadius = 0.2;
const defaultMotionDuration = 1.2;
const modelFiles = [
  { fileName: "base.glb", role: "base", visualScale: 1 },
  { fileName: "art1.glb", jointIndex: 0, role: "link", visualScale: 1 },
  { fileName: "art2.glb", jointIndex: 1, role: "link", visualScale: 1 },
  { fileName: "art3.glb", jointIndex: 2, role: "link", visualScale: 1 },
  { fileName: "art4.glb", jointIndex: 3, role: "link", visualScale: 1 },
  { fileName: "art5.glb", jointIndex: 4, role: "link", visualScale: 1 },
  { fileName: "orgaoterminal.glb", jointIndex: 5, role: "tool", visualScale: 1 },
];

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;
}

function shortestAngleTarget(current, target) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));

  return current + delta;
}

function createJointLabel(label) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;

  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(20, 25, 32, 0.9)";
  context.beginPath();
  context.arc(64, 64, 46, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "700 44px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    })
  );
  sprite.scale.set(0.22, 0.22, 1);
  sprite.renderOrder = 3;
  return sprite;
}

export class RobotArm {
  constructor() {
    this.group = new THREE.Group();
    this.models = new THREE.Group();
    this.models.name = "robotModels";
    this.loadedModels = new Map();
    this.joints = createJointState();
    this.kinematics = computeForwardKinematics(this.joints);
    this.zeroKinematics = computeForwardKinematics(createJointState());
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

    this.jointGizmos = this.kinematics.origins.map((_, index) => {
      const gizmo = new THREE.Group();
      const ringGeometry = new THREE.TorusGeometry(0.3, 0.008, 8, 64);
      const rings = [
        { color: 0xff3b30, rotation: [0, Math.PI / 2, 0] },
        { color: 0x34c759, rotation: [Math.PI / 2, 0, 0] },
        { color: 0x007aff, rotation: [0, 0, 0] },
      ];

      rings.forEach(({ color, rotation }) => {
        const ring = new THREE.Mesh(
          ringGeometry,
          new THREE.MeshBasicMaterial({
            color,
            depthTest: false,
            opacity: 0.9,
            transparent: true,
          })
        );
        ring.rotation.set(...rotation);
        gizmo.add(ring);
      });

      gizmo.add(createJointLabel(`J${index + 1}`));

      gizmo.name = `jointGizmo${index + 1}`;
      gizmo.renderOrder = 2;
      return gizmo;
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

    this.group.add(
      this.models,
      this.workspace,
      this.link,
      this.endEffector,
      this.target,
      ...this.jointMeshes,
      ...this.jointGizmos
    );
    this.loadModels();
    this.updateVisuals();
  }

  getPhysicalPoints(state = this.kinematics) {
    return getPhysicalJointPositions(state).map((position) => dhToThree(position));
  }

  loadModels() {
    const loader = new GLTFLoader();
    const zeroPoints = this.getPhysicalPoints(this.zeroKinematics);

    modelFiles.forEach((spec) => {
      const { fileName } = spec;

      loader.load(
        `./src/models/${fileName}`,
        (gltf) => {
          const model = gltf.scene;
          model.name = fileName.replace(".glb", "");
          const bounds = new THREE.Box3().setFromObject(model);

          if (spec.role === "base") {
            model.scale.setScalar(spec.visualScale);
            model.rotation.x = Math.PI / 2;
            this.models.add(model);
            this.loadedModels.set(fileName, { model, role: spec.role });
            return;
          }

          const visualPivot = new THREE.Group();

          visualPivot.name = `${model.name}VisualPivot`;
          visualPivot.matrixAutoUpdate = false;

          if (spec.role === "tool") {
            const zeroWorldMatrix = dhMatrixToThree(
              this.zeroKinematics.jointMatrices[spec.jointIndex]
            );

            zeroWorldMatrix.setPosition(zeroPoints[spec.jointIndex]);
            model.scale.setScalar(spec.visualScale);
            model.rotation.x = Math.PI / 2;
            visualPivot.matrix.copy(zeroWorldMatrix);
            visualPivot.add(model);
            this.models.add(visualPivot);
            this.loadedModels.set(fileName, {
              jointIndex: spec.jointIndex,
              model,
              role: spec.role,
              visualPivot,
              zeroWorldMatrix: zeroWorldMatrix.clone(),
            });
            this.updateModelTransforms();
            return;
          }

          const start = zeroPoints[spec.jointIndex];
          const direction = zeroPoints[spec.jointIndex + 1].clone().sub(start);
          const length = direction.length();
          const barLength = bounds.max.y - bounds.min.y;

          if (length <= 0 || barLength <= 0) {
            console.error(`Dimensoes invalidas para posicionar ${fileName}.`);
            return;
          }

          const scaleY = length / barLength;
          const rotation = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction.normalize()
          );
          const zeroWorldMatrix = new THREE.Matrix4().compose(
            start,
            rotation,
            new THREE.Vector3(1, 1, 1)
          );

          visualPivot.matrix.copy(zeroWorldMatrix);
          model.position.set(0, -bounds.min.y * scaleY, 0);
          model.scale.set(spec.visualScale, scaleY, spec.visualScale);
          visualPivot.add(model);
          this.models.add(visualPivot);
          this.loadedModels.set(fileName, {
            jointIndex: spec.jointIndex,
            model,
            role: spec.role,
            visualPivot,
            zeroWorldMatrix: zeroWorldMatrix.clone(),
          });
          this.updateModelTransforms();
        },
        undefined,
        (error) => {
          console.error(`Nao foi possivel carregar ${fileName}.`, error);
        }
      );
    });
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
      thetaDhDeg: THREE.MathUtils.radToDeg(joint.thetaRad + joint.thetaOffsetRad),
      thetaOffsetDeg: joint.thetaOffset,
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
    this.updateModelTransforms();

    const points = this.getPhysicalPoints();
    this.linkGeometry.setFromPoints(points);
    this.linkGeometry.computeBoundingSphere();

    this.jointMeshes.forEach((mesh, index) => {
      mesh.position.copy(points[index]);
    });

    this.jointGizmos.forEach((gizmo, index) => {
      const orientation = dhMatrixToThree(this.kinematics.jointMatrices[index]);

      gizmo.position.copy(points[index]);
      gizmo.quaternion.setFromRotationMatrix(orientation);
    });

    this.endEffector.position.copy(points[points.length - 1]);

    if (!this.targetActive) {
      this.targetPosition.copy(this.endEffector.position);
    }

    this.target.visible = this.targetActive;
    this.target.position.copy(this.targetPosition);
  }

  updateModelTransforms() {
    this.loadedModels.forEach((instance) => {
      if (!instance.visualPivot) {
        return;
      }

      const currentJointMatrix = dhMatrixToThree(
        this.kinematics.jointMatrices[instance.jointIndex]
      );
      const inverseZeroJointMatrix = dhMatrixToThree(
        this.zeroKinematics.jointMatrices[instance.jointIndex]
      ).invert();
      const modelMatrix = currentJointMatrix
        .multiply(inverseZeroJointMatrix)
        .multiply(instance.zeroWorldMatrix);

      instance.visualPivot.matrix.copy(modelMatrix);
      instance.visualPivot.matrixWorldNeedsUpdate = true;
    });
  }
}

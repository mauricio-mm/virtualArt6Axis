import * as THREE from "../node_modules/three/build/three.module.js";
import { GLTFLoader } from "../node_modules/three/examples/jsm/loaders/GLTFLoader.js";
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
<<<<<<< HEAD
const modelFiles = [
  { fileName: "base.glb", startIndex: null, endIndex: null, visualScale: 1, scaleOffset: { x: 1, y: 1.05, z: 1 } },
  { fileName: "art1.glb", startIndex: 0, endIndex: 2, visualScale: 1, scaleOffset: { x: 1, y: 1.05, z: 1 } },
  { fileName: "art2.glb", startIndex: 2, endIndex: 3, visualScale: 1, scaleOffset: { x: 1, y: 1.05, z: 1 } },
=======
const modelDefinitions = [
  { name: "base", path: "./src/models/base.glb", pointIndex: 0, matrixIndex: null },
  { name: "art1", path: "./src/models/art1.glb", pointIndex: 0, matrixIndex: 0 },
  { name: "art2", path: "./src/models/art2.glb", pointIndex: 1, matrixIndex: 1 },
  { name: "art3", path: "./src/models/art3.glb", pointIndex: 2, matrixIndex: 2 },
  { name: "art4", path: "./src/models/art4.glb", pointIndex: 3, matrixIndex: 3 },
  { name: "art5", path: "./src/models/art5.glb", pointIndex: 4, matrixIndex: 4 },
  { name: "orgaoterminal", path: "./src/models/orgaoterminal.glb", pointIndex: 5, matrixIndex: 5 },
>>>>>>> 548d1996ef77fea3e494a7b357dd7e1d39404793
];

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;
}

function shortestAngleTarget(current, target) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));

  return current + delta;
}

function dhMatrixToThree(matrix) {
  return new THREE.Matrix4().set(
    matrix[0], matrix[2], matrix[1], matrix[3],
    matrix[8], matrix[10], matrix[9], matrix[11],
    matrix[4], matrix[6], matrix[5], matrix[7],
    0, 0, 0, 1
  );
}

export class RobotArm {
  constructor() {
    this.group = new THREE.Group();
    this.models = new THREE.Group();
    this.models.name = "robotModels";
    this.loadedModels = new Map();
    this.joints = createJointState();
    this.kinematics = computeForwardKinematics(this.joints);
    this.motion = null;
    this.targetActive = false;
    this.targetPosition = dhToThree(this.kinematics.endPosition);
    this.models = new THREE.Group();
    this.models.name = "robotModels";
    this.modelLoader = new GLTFLoader();

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

<<<<<<< HEAD
    this.group.add(this.models, this.workspace, this.link, this.endEffector, this.target, ...this.jointMeshes);
    this.loadModels();
=======
    this.group.add(
      this.models,
      this.workspace,
      this.link,
      this.endEffector,
      this.target,
      ...this.jointMeshes
    );
>>>>>>> 548d1996ef77fea3e494a7b357dd7e1d39404793
    this.updateVisuals();
    this.loadModels();
  }

  loadModels() {
    modelDefinitions.forEach(({ name, path, pointIndex, matrixIndex }) => {
      this.modelLoader.load(
        path,
        (gltf) => {
          const model = gltf.scene;
          model.name = name;
          model.userData.pointIndex = pointIndex;
          model.userData.matrixIndex = matrixIndex;
          this.models.add(model);
          this.updateVisuals();
        },
        undefined,
        (error) => {
          console.error(`Nao foi possivel carregar o modelo ${name}.`, error);
        }
      );
    });
  }

  loadModels() {
    const loader = new GLTFLoader();

    modelFiles.forEach(({ fileName }) => {
      loader.load(
        `./src/models/${fileName}`,
        (gltf) => {
          const model = gltf.scene;
          model.name = fileName.replace(".glb", "");
          model.matrixAutoUpdate = true;
          model.updateMatrix();
          const bounds = new THREE.Box3().setFromObject(model);
          const spec = modelFiles.find((item) => item.fileName === fileName);

          if (spec.startIndex === null) {
            this.loadedModels.set(fileName, { model });
            this.models.add(model);
          } else {
            const startPivot = new THREE.Group();
            startPivot.name = `${model.name}PivotStart`;
            const endPivot = new THREE.Group();
            endPivot.name = `${model.name}PivotEnd`;
            startPivot.add(model, endPivot);
            this.models.add(startPivot);
            this.loadedModels.set(fileName, {
              barLength: bounds.max.y - bounds.min.y,
              barMinY: bounds.min.y,
              endPivot,
              model,
              startPivot,
            });
          }

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

    const points = this.kinematics.positions.map((position) => dhToThree(position));
    this.linkGeometry.setFromPoints(points);
    this.linkGeometry.computeBoundingSphere();

    this.jointMeshes.forEach((mesh, index) => {
      mesh.position.copy(points[index]);
    });

    this.models.children.forEach((model) => {
      const pointIndex = model.userData.pointIndex;
      const matrixIndex = model.userData.matrixIndex;

      model.position.copy(points[pointIndex]);

      if (matrixIndex === null) {
        model.quaternion.identity();
        return;
      }

      const modelMatrix = dhMatrixToThree(this.kinematics.cumulativeMatrices[matrixIndex]);
      model.quaternion.setFromRotationMatrix(modelMatrix);
    });

    this.endEffector.position.copy(points[points.length - 1]);

    if (!this.targetActive) {
      this.targetPosition.copy(this.endEffector.position);
    }

    this.target.visible = this.targetActive;
    this.target.position.copy(this.targetPosition);
  }

  updateModelTransforms() {
    modelFiles.forEach(({ fileName, startIndex, endIndex, visualScale, scaleOffset }) => {
      const instance = this.loadedModels.get(fileName);

      if (!instance) {
        return;
      }

      if (startIndex === null || endIndex === null) {
        instance.model.position.set(0, 0, 0);
        instance.model.rotation.set(0, 0, 0);
        instance.model.scale.set(
          visualScale * scaleOffset.x,
          visualScale * scaleOffset.y,
          visualScale * scaleOffset.z
        );
        return;
      }

      const start = this.kinematics?.positions[startIndex];
      const end = this.kinematics?.positions[endIndex];

      if (start && end) {
        const startThree = dhToThree(start);
        const endThree = dhToThree(end);
        const direction = endThree.clone().sub(startThree);
        const length = direction.length();

        if (length === 0) {
          return;
        }

        const rotation = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.normalize()
        );
        const scaleY = instance.barLength > 0 ? length / instance.barLength : 1;

        instance.startPivot.position.copy(startThree);
        instance.startPivot.quaternion.copy(rotation);
        instance.startPivot.scale.set(1, 1, 1);
        instance.model.position.set(0, -instance.barMinY * scaleY, 0);
        instance.model.rotation.set(0, 0, 0);
        instance.model.scale.set(
          visualScale * scaleOffset.x,
          scaleY * scaleOffset.y,
          visualScale * scaleOffset.z
        );
        instance.endPivot.position.set(0, length, 0);
      }
    });
  }
}

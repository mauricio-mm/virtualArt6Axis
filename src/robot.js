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
  DH_TO_THREE_SCALE,
} from "./kinematics.js";
import { applyForwardKinematicsAngles } from "./forward-kinematics.js";

const jointRadius = 0.13;
const endEffectorRadius = 0.2;
const defaultMotionDuration = 1.2;
const telemetryPointRadius = 0.08;
const maxTelemetryPoints = 1000;
const modelFiles = [
  { fileName: "base.glb", role: "base", visualScale: 1 },
  // Modelos GLB sao apenas representacoes visuais; as matrizes DH nao
  // dependem do tamanho ou da posicao dos arquivos CAD.
  { fileName: "art1.glb", jointIndex: 0, fromPoint: 0, toPoint: 1, role: "link", visualScale: 1 },
  { fileName: "art2.glb", jointIndex: 1, fromPoint: 1, toPoint: 2, role: "link", visualScale: 1 },
  // art3 termina em J4 e pertence ao corpo movido por J3 (NAO por J4).
  { fileName: "art3.glb", jointIndex: 2, fromPoint: 2, toPoint: 3, role: "link", visualScale: 1 },
  // art4 parte do pivô J4: acompanha somente a rotacao longitudinal de J4.
  { fileName: "art4.glb", jointIndex: 3, fromPoint: 3, toPoint: 4, role: "link", visualScale: 1 },
  // J5 flexiona o ultimo segmento; J6 faz roll do orgao terminal.
  { fileName: "art5.glb", jointIndex: 4, fromPoint: 4, toPoint: 5, role: "link", visualScale: 1 },
  { fileName: "orgaoterminal.glb", jointIndex: 5, role: "tool", visualScale: 1 },
];

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;
}

function shortestAngleTarget(current, target) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));

  return current + delta;
}

// Etiquetas que acompanham os pontos/segmentos na cena 3D.
function createTelemetryLabel(text, textColor = "#ffffff") {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = "600 22px Arial, sans-serif";
  canvas.width = Math.ceil(context.measureText(text).width + 24);
  canvas.height = 48;

  context.fillStyle = "rgba(12, 18, 26, 0.88)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255, 255, 255, 0.42)";
  context.lineWidth = 2;
  context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  context.font = "600 22px Arial, sans-serif";
  context.fillStyle = textColor;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  label.scale.set(canvas.width * 0.006, canvas.height * 0.006, 1);
  label.renderOrder = 10;
  return label;
}

function disposeTelemetryLabel(label) {
  label.material.map?.dispose();
  label.material.dispose();
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
    this.terminalSelected = false;
    this.joints = createJointState();
    this.kinematics = computeForwardKinematics(this.joints);
    this.zeroKinematics = computeForwardKinematics(createJointState());
    // Sem marcadores laranja artificiais: selecao sera destacada no proprio GLB.
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
    // A ponta continua sendo calculada, mas nao exibimos mais a esfera laranja.
    this.endEffector.visible = false;

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

    this.telemetryPoints = new THREE.Group();
    this.telemetryPoints.name = "telemetryPoints";
    this.telemetryPointNumber = 0;
    this.telemetryCoordinateLabels = new THREE.Group();
    this.telemetryCoordinateLabels.name = "telemetryCoordinateLabels";
    this.telemetryCoordinateLabels.visible = false;
    this.telemetryDistanceLabels = new THREE.Group();
    this.telemetryDistanceLabels.name = "telemetryDistanceLabels";
    this.telemetryDistanceLabels.visible = false;
    this.telemetryPointGeometry = new THREE.SphereGeometry(telemetryPointRadius, 12, 8);
    this.telemetryPointMaterial = new THREE.MeshBasicMaterial({ color: 0x5eead4 });
    this.telemetryLinePositions = new Float32Array(maxTelemetryPoints * 3);
    this.telemetryLineGeometry = new THREE.BufferGeometry();
    this.telemetryLineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.telemetryLinePositions, 3).setUsage(THREE.DynamicDrawUsage)
    );
    this.telemetryLineGeometry.setDrawRange(0, 0);
    this.telemetryLine = new THREE.Line(
      this.telemetryLineGeometry,
      new THREE.LineBasicMaterial({ color: 0x5eead4 })
    );
    this.telemetryLine.name = "telemetryLine";
    this.telemetryLine.frustumCulled = false;

    this.group.add(
      this.models,
      this.workspace,
      this.telemetryPoints,
      this.telemetryLine,
      this.telemetryCoordinateLabels,
      this.telemetryDistanceLabels,
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
    const zeroPoints = [
      ...this.getPhysicalPoints(this.zeroKinematics),
      dhToThree(this.zeroKinematics.endPosition),
    ];

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
            // O pivot do orgao terminal coincide com a J6 REAL, nao com
            // a origem anterior de d6. O eixo local -Z do GLB aponta
            // para frente apos um giro de 180 graus em Y.
            const zeroWorldMatrix = dhMatrixToThree(
              this.zeroKinematics.cumulativeMatrices[spec.jointIndex]
            );
            model.scale.setScalar(spec.visualScale);
            model.rotation.y = Math.PI;
            // O corpo principal do GLB tem eixo longitudinal proximo de
            // x=0,25, y=0,01 (unidades do CAD). Centralizar esse eixo no
            // pivot impede que a ferramenta orbite como um cotovelo.
            model.position.set(0.25, -0.01, 0);
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

          const start = zeroPoints[spec.fromPoint];
          const direction = zeroPoints[spec.toPoint].clone().sub(start);
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
      this.target.visible = false;
      this.target.position.copy(this.targetPosition);
    }
  }

  getEndEffectorPosition() {
    return dhToThree(this.kinematics.endPosition);
  }

  getTerminalModel() {
    return this.loadedModels.get("orgaoterminal.glb")?.model ?? null;
  }

  setTerminalSelected(selected) {
    this.terminalSelected = Boolean(selected);
  }

  getInteractiveObjects() {
    const terminal = this.getTerminalModel();
    return terminal ? [terminal] : [];
  }

  getJointAnglesDegrees() {
    return this.joints.map((joint) => THREE.MathUtils.radToDeg(joint.thetaRad));
  }

  calculateEndEffectorPositionMm(anglesDegrees) {
    const joints = createJointState();
    const kinematics = applyForwardKinematicsAngles(joints, anglesDegrees);

    return kinematics.endPosition.clone();
  }

  createCoordinateLabel(marker) {
    const { pointNumber, positionMm } = marker.userData;
    const text = `P${pointNumber}  X:${positionMm.x.toFixed(1)}  Y:${positionMm.y.toFixed(1)}  Z:${positionMm.z.toFixed(1)} mm`;
    const label = createTelemetryLabel(text, "#a6f1e4");
    label.position.copy(marker.position).add(new THREE.Vector3(0, 0, 0.35));
    return label;
  }

  createDistanceLabel(previous, current) {
    const distance = previous.userData.positionMm.distanceTo(current.userData.positionMm);
    const text = `P${previous.userData.pointNumber}-P${current.userData.pointNumber}: ${distance.toFixed(1)} mm`;
    const label = createTelemetryLabel(text, "#ffd993");
    label.position.copy(previous.position).add(current.position).multiplyScalar(0.5);
    label.position.z -= 0.3;
    return label;
  }

  clearTelemetryLabels(group) {
    group.children.forEach(disposeTelemetryLabel);
    group.clear();
  }

  removeFirstTelemetryLabel(group) {
    const first = group.children[0];
    if (!first) return;
    group.remove(first);
    disposeTelemetryLabel(first);
  }

  setTelemetryCoordinatesVisible(visible) {
    const group = this.telemetryCoordinateLabels;
    if (group.visible === Boolean(visible)) return;
    group.visible = Boolean(visible);
    if (group.visible) {
      this.telemetryPoints.children.forEach((marker) => group.add(this.createCoordinateLabel(marker)));
    } else {
      this.clearTelemetryLabels(group);
    }
  }

  setTelemetryDistancesVisible(visible) {
    const group = this.telemetryDistanceLabels;
    if (group.visible === Boolean(visible)) return;
    group.visible = Boolean(visible);
    if (group.visible) {
      const points = this.telemetryPoints.children;
      for (let index = 1; index < points.length; index += 1) {
        group.add(this.createDistanceLabel(points[index - 1], points[index]));
      }
    } else {
      this.clearTelemetryLabels(group);
    }
  }

  addTelemetryPoint(anglesDegrees = null) {
    const positionMm = anglesDegrees
      ? this.calculateEndEffectorPositionMm(anglesDegrees)
      : this.kinematics.endPosition.clone();
    const marker = new THREE.Mesh(this.telemetryPointGeometry, this.telemetryPointMaterial);
    const previous = this.telemetryPoints.children.at(-1);

    marker.position.copy(dhToThree(positionMm));
    marker.userData.role = "telemetryPoint";
    marker.userData.positionMm = positionMm.clone();
    marker.userData.pointNumber = ++this.telemetryPointNumber;
    this.telemetryPoints.add(marker);

    if (this.telemetryPoints.children.length > maxTelemetryPoints) {
      this.telemetryPoints.remove(this.telemetryPoints.children[0]);
      this.telemetryLinePositions.copyWithin(0, 3);
      this.removeFirstTelemetryLabel(this.telemetryCoordinateLabels);
      this.removeFirstTelemetryLabel(this.telemetryDistanceLabels);
    }

    const lastIndex = this.telemetryPoints.children.length - 1;
    const linePosition = this.telemetryLineGeometry.getAttribute("position");
    linePosition.setXYZ(lastIndex, marker.position.x, marker.position.y, marker.position.z);
    linePosition.needsUpdate = true;
    this.telemetryLineGeometry.setDrawRange(0, this.telemetryPoints.children.length);

    if (this.telemetryCoordinateLabels.visible) {
      this.telemetryCoordinateLabels.add(this.createCoordinateLabel(marker));
    }
    if (this.telemetryDistanceLabels.visible && previous) {
      this.telemetryDistanceLabels.add(this.createDistanceLabel(previous, marker));
    }

    return positionMm;
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
    this.linkGeometry.setFromPoints([...points, dhToThree(this.kinematics.endPosition)]);
    this.linkGeometry.computeBoundingSphere();

    this.jointMeshes.forEach((mesh, index) => {
      mesh.position.copy(points[index]);
    });

    this.jointGizmos.forEach((gizmo, index) => {
      const orientation = dhMatrixToThree(this.kinematics.jointMatrices[index]);

      gizmo.position.copy(points[index]);
      gizmo.quaternion.setFromRotationMatrix(orientation);
    });

    this.endEffector.position.copy(dhToThree(this.kinematics.endPosition));

    if (!this.targetActive) {
      this.targetPosition.copy(this.endEffector.position);
    }

    // A mira de IK permanece logica, sem criar uma nova bolinha visivel.
    this.target.visible = false;
    this.target.position.copy(this.targetPosition);
  }

  updateModelTransforms() {
    this.loadedModels.forEach((instance) => {
      if (!instance.visualPivot) {
        return;
      }

      // O GLB terminal precisa seguir o pivot DEPOIS de d6 e da rotacao
      // theta6; os elos anteriores seguem os pivots antes de cada junta.
      const matrixField = instance.role === "tool" ? "cumulativeMatrices" : "jointMatrices";
      const currentJointMatrix = dhMatrixToThree(this.kinematics[matrixField][instance.jointIndex]);
      const inverseZeroJointMatrix = dhMatrixToThree(this.zeroKinematics[matrixField][instance.jointIndex]).invert();
      const modelMatrix = currentJointMatrix
        .multiply(inverseZeroJointMatrix)
        .multiply(instance.zeroWorldMatrix);

      instance.visualPivot.matrix.copy(modelMatrix);
      instance.visualPivot.matrixWorldNeedsUpdate = true;
    });
  }
}

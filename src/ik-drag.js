import * as THREE from "../node_modules/three/build/three.module.js";

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const dragPlane = new THREE.Plane();
const dragPoint = new THREE.Vector3();
const dragOffset = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();

export function createIkDrag({ canvas, camera, robot, onRobotChange }) {
  const drag = {
    active: false,
    pointerId: null,
  };

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();

    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickRobotObject(event) {
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);

    return raycaster.intersectObjects(robot.getInteractiveObjects(), false)[0]?.object ?? null;
  }

  function start(event) {
    const pickedObject = pickRobotObject(event);

    if (!pickedObject) {
      return false;
    }

    robot.activateTarget();
    robot.solveToTarget();
    onRobotChange();

    camera.getWorldDirection(cameraDirection);
    dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, robot.targetPosition);

    if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
      dragOffset.copy(robot.targetPosition).sub(dragPoint);
    } else {
      dragOffset.set(0, 0, 0);
    }

    drag.active = true;
    drag.pointerId = event.pointerId;
    canvas.classList.add("is-dragging");
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();

    return true;
  }

  function update(event) {
    if (!drag.active) {
      return;
    }

    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);

    if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
      robot.setTargetPosition(dragPoint.add(dragOffset));
      robot.solveToTarget();
      onRobotChange();
    }
  }

  function end(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) {
      return;
    }

    drag.active = false;
    drag.pointerId = null;
    canvas.classList.remove("is-dragging");

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function updateHover(event) {
    if (drag.active) {
      return;
    }

    canvas.classList.toggle("is-pickable", Boolean(pickRobotObject(event)));
  }

  canvas.addEventListener("pointermove", update);
  canvas.addEventListener("pointermove", updateHover);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  return { start };
}

import * as THREE from "../node_modules/three/build/three.module.js";

const right = new THREE.Vector3();
const up = new THREE.Vector3();
const forward = new THREE.Vector3();
const panDelta = new THREE.Vector3();

const minElevation = -Math.PI / 2 + 0.08;
const maxElevation = Math.PI / 2 - 0.08;
const minDistance = 2.5;
const maxDistance = 60;

function applyCamera(camera, target, orbit) {
  orbit.elevation = THREE.MathUtils.clamp(orbit.elevation, minElevation, maxElevation);
  orbit.radius = THREE.MathUtils.clamp(orbit.radius, minDistance, maxDistance);

  const horizontalRadius = orbit.radius * Math.cos(orbit.elevation);

  camera.position.set(
    target.x + horizontalRadius * Math.cos(orbit.azimuth),
    target.y + horizontalRadius * Math.sin(orbit.azimuth),
    target.z + orbit.radius * Math.sin(orbit.elevation)
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

function getWorldUnitsPerPixel(camera, canvas, orbit) {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const visibleHeight = 2 * Math.tan(fov / 2) * orbit.radius;

  return visibleHeight / Math.max(canvas.clientHeight, 1);
}

export function createCameraControls(camera, canvas, options = {}) {
  const target = camera.userData.target ?? new THREE.Vector3(0, 0, 0);
  const offset = camera.position.clone().sub(target);
  const radius = Math.max(offset.length(), minDistance);
  const orbit = {
    azimuth: Math.atan2(offset.y, offset.x),
    elevation: Math.asin(THREE.MathUtils.clamp(offset.z / radius, -1, 1)),
    radius,
  };
  const pressedKeys = new Set();
  const pointer = {
    active: false,
    mode: "rotate",
    x: 0,
    y: 0,
  };

  function rotate(deltaX, deltaY) {
    orbit.azimuth -= deltaX * 0.006;
    orbit.elevation -= deltaY * 0.006;
    applyCamera(camera, target, orbit);
  }

  function pan(deltaX, deltaY) {
    const unitsPerPixel = getWorldUnitsPerPixel(camera, canvas, orbit);

    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);

    panDelta
      .copy(right)
      .multiplyScalar(-deltaX * unitsPerPixel)
      .addScaledVector(up, deltaY * unitsPerPixel);

    target.add(panDelta);
    applyCamera(camera, target, orbit);
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (options.onPointerDown?.(event)) {
      return;
    }

    pointer.active = true;
    pointer.mode = event.button === 1 || event.button === 2 || event.shiftKey ? "pan" : "rotate";
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    canvas.classList.add("is-dragging");
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointer.active) {
      return;
    }

    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;

    if (pointer.mode === "pan") {
      pan(deltaX, deltaY);
    } else {
      rotate(deltaX, deltaY);
    }

    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!pointer.active) {
      return;
    }

    pointer.active = false;
    canvas.classList.remove("is-dragging");

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbit.radius *= event.deltaY > 0 ? 1.1 : 0.9;
    applyCamera(camera, target, orbit);
  });

  window.addEventListener("keydown", (event) => {
    pressedKeys.add(event.key.toLowerCase());
  });

  window.addEventListener("keyup", (event) => {
    pressedKeys.delete(event.key.toLowerCase());
  });

  function update(deltaTime) {
    panDelta.set(0, 0, 0);
    forward.subVectors(target, camera.position);
    forward.z = 0;

    if (forward.lengthSq() < 0.0001) {
      forward.set(0, 1, 0);
    } else {
      forward.normalize();
    }

    right.crossVectors(forward, camera.up).normalize();

    const speed = 4.5 * deltaTime * Math.max(orbit.radius / 10, 0.45);

    if (pressedKeys.has("w") || pressedKeys.has("arrowup")) {
      panDelta.addScaledVector(forward, speed);
    }

    if (pressedKeys.has("s") || pressedKeys.has("arrowdown")) {
      panDelta.addScaledVector(forward, -speed);
    }

    if (pressedKeys.has("a") || pressedKeys.has("arrowleft")) {
      panDelta.addScaledVector(right, -speed);
    }

    if (pressedKeys.has("d") || pressedKeys.has("arrowright")) {
      panDelta.addScaledVector(right, speed);
    }

    if (panDelta.lengthSq() > 0) {
      target.add(panDelta);
      applyCamera(camera, target, orbit);
    }
  }

  applyCamera(camera, target, orbit);

  return { update };
}

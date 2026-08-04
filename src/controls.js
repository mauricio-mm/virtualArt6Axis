import * as THREE from "../node_modules/three/build/three.module.js";

const right = new THREE.Vector3();
const up = new THREE.Vector3();
const forward = new THREE.Vector3();
const panDelta = new THREE.Vector3();

const minPolarAngle = 0.08;
const maxPolarAngle = Math.PI - 0.08;
const minDistance = 2.5;
const maxDistance = 60;

function applyCamera(camera, target, spherical) {
  spherical.phi = THREE.MathUtils.clamp(spherical.phi, minPolarAngle, maxPolarAngle);
  spherical.radius = THREE.MathUtils.clamp(spherical.radius, minDistance, maxDistance);

  camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

function getWorldUnitsPerPixel(camera, canvas, spherical) {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const visibleHeight = 2 * Math.tan(fov / 2) * spherical.radius;

  return visibleHeight / Math.max(canvas.clientHeight, 1);
}

export function createCameraControls(camera, canvas, options = {}) {
  const target = camera.userData.target ?? new THREE.Vector3(0, 0, 0);
  const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
  const pressedKeys = new Set();
  const pointer = {
    active: false,
    mode: "rotate",
    x: 0,
    y: 0,
  };

  function rotate(deltaX, deltaY) {
    spherical.theta -= deltaX * 0.006;
    spherical.phi += deltaY * 0.006;
    applyCamera(camera, target, spherical);
  }

  function pan(deltaX, deltaY) {
    const unitsPerPixel = getWorldUnitsPerPixel(camera, canvas, spherical);

    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);

    panDelta
      .copy(right)
      .multiplyScalar(-deltaX * unitsPerPixel)
      .addScaledVector(up, deltaY * unitsPerPixel);

    target.add(panDelta);
    applyCamera(camera, target, spherical);
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
    spherical.radius *= event.deltaY > 0 ? 1.1 : 0.9;
    applyCamera(camera, target, spherical);
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
    forward.y = 0;

    if (forward.lengthSq() < 0.0001) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }

    right.crossVectors(forward, camera.up).normalize();

    const speed = 4.5 * deltaTime * Math.max(spherical.radius / 10, 0.45);

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
      applyCamera(camera, target, spherical);
    }
  }

  applyCamera(camera, target, spherical);

  return { update };
}

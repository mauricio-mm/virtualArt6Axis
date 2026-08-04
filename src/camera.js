import * as THREE from "../node_modules/three/build/three.module.js";

const initialTarget = new THREE.Vector3(0, 2.2, 0);

export function createSceneCamera(width, height) {
  const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 200);

  camera.position.set(7.5, 5.8, 9);
  camera.userData.target = initialTarget.clone();
  camera.lookAt(camera.userData.target);
  camera.updateMatrixWorld();

  resizeSceneCamera(camera, width, height);

  return camera;
}

export function resizeSceneCamera(camera, width, height) {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

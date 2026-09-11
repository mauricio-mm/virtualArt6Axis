import * as THREE from "../node_modules/three/build/three.module.js";

export function createGrid() {
  const grid = new THREE.GridHelper(10, 10, 0xe8edf2, 0xb8c0ca);
  grid.position.y = -0.5;
  grid.material.opacity = 0.72;
  grid.material.transparent = true;

  return grid;
}

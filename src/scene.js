import * as THREE from "../node_modules/three/build/three.module.js";
import { createSceneCamera, resizeSceneCamera } from "./camera.js";
import { createGrid } from "./grid.js";
import { RobotArm } from "./robot.js";

const backgroundColor = 0x444444;

function addLights(scene) {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
  const fillLight = new THREE.DirectionalLight(0x9fb7ff, 0.7);

  keyLight.position.set(4, 8, 6);
  fillLight.position.set(-6, 4, -4);
  scene.add(ambientLight, keyLight, fillLight);
}

export function createRobotScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(backgroundColor);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const camera = createSceneCamera(window.innerWidth, window.innerHeight);
  const grid = createGrid();
  const robot = new RobotArm();

  scene.add(grid, robot.group);
  addLights(scene);

  function resize() {
    resizeSceneCamera(camera, window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  return {
    camera,
    renderer,
    resize,
    robot,
    scene,
  };
}

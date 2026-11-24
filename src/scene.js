import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { createSceneCamera, resizeSceneCamera } from "./camera.js";
import { createGrid } from "./grid.js";
import { RobotArm } from "./robot.js";

const backgroundColor = 0x444444;

function addLights(scene) {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
  const fillLight = new THREE.DirectionalLight(0x9fb7ff, 0.7);

  keyLight.position.set(4, -6, 8);
  fillLight.position.set(-6, 4, 4);
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

  // Contorno de selecao real do GLB, sem desenhar esfera nem eixo auxiliar.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const outline = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
  outline.edgeStrength = 5;
  outline.edgeGlow = 0;
  outline.edgeThickness = 2;
  outline.pulsePeriod = 0;
  outline.visibleEdgeColor.set(0xff9400);
  outline.hiddenEdgeColor.set(0x8a4500);
  composer.addPass(outline);
  composer.addPass(new OutputPass());

  function render() {
    const terminal = robot.getTerminalModel();
    outline.selectedObjects = robot.terminalSelected && terminal ? [terminal] : [];
    composer.render();
  }

  function resize() {
    resizeSceneCamera(camera, window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  }

  return {
    camera,
    renderer,
    render,
    resize,
    robot,
    scene,
  };
}

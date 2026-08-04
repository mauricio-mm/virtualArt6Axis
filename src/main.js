import { createCameraControls } from "./controls.js";
import { createIkDrag } from "./ik-drag.js";
import { createRobotScene } from "./scene.js";
import { createUi } from "./ui.js";

const canvas = document.querySelector("#scene");
const robotScene = createRobotScene(canvas);
const ui = createUi({ robot: robotScene.robot });
const ikDrag = createIkDrag({
  canvas,
  camera: robotScene.camera,
  robot: robotScene.robot,
  onRobotChange: ui.updateRobot,
});

const controls = createCameraControls(robotScene.camera, robotScene.renderer.domElement, {
  onPointerDown: ikDrag.start,
});

let previousTime = 0;

function render(time = 0) {
  const deltaTime = Math.min((time - previousTime) / 1000, 0.05);
  previousTime = time;

  controls.update(deltaTime);

  if (robotScene.robot.updateMotion(deltaTime)) {
    ui.updateRobot();
  }

  robotScene.renderer.render(robotScene.scene, robotScene.camera);
  requestAnimationFrame(render);
}

window.addEventListener("resize", robotScene.resize);

robotScene.resize();
render();

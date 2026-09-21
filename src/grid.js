import * as THREE from "../node_modules/three/build/three.module.js";

function createAxisLabel(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.font = "bold 76px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    })
  );
  label.scale.set(0.6, 0.6, 1);
  label.renderOrder = 3;

  return label;
}

export function createGrid() {
  const grid = new THREE.GridHelper(10, 10, 0xe8edf2, 0xb8c0ca);
  grid.position.y = -0.5;
  grid.material.opacity = 0.72;
  grid.material.transparent = true;

  const labels = new THREE.Group();
  labels.name = "worldAxisLabels";

  const xLabel = createAxisLabel("X", "#ff3b30");
  xLabel.position.set(5.35, -0.45, 0);
  labels.add(xLabel);

  const yLabel = createAxisLabel("Y", "#34c759");
  yLabel.position.set(0, 5, 0);
  labels.add(yLabel);

  const zLabel = createAxisLabel("Z", "#007aff");
  zLabel.position.set(0, -0.45, 5.35);
  labels.add(zLabel);

  grid.add(labels);

  return grid;
}

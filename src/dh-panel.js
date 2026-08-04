import { createCollapsibleSection, formatAngle, formatNumber, formatPosition } from "./ui-utils.js";

function matrixCells(matrix) {
  return matrix.map((value) => `<span>${formatNumber(value)}</span>`).join("");
}

export function createDhPanel() {
  const list = document.querySelector("#dh-list");
  const status = document.querySelector("#robot-status");

  createCollapsibleSection("#dh-panel", "#dh-toggle");

  function update(robot) {
    const robotStatus = robot.getStatus();
    const mode = robotStatus.targetActive ? "IK ativo" : "IK em espera";

    status.textContent = `${mode} | terminal ${formatPosition(robotStatus.end)} | erro ${formatNumber(robotStatus.error)}`;

    list.innerHTML = robot
      .getMatrixRows()
      .map(
        (joint) => `
          <section class="dh-joint">
            <div class="dh-joint-title">
              <span>${joint.name}</span>
              <span>${formatAngle(joint.thetaDeg)}</span>
            </div>

            <div class="dh-params" aria-label="Parametros DH ${joint.name}">
              <div>
                <span class="param-label">theta</span>
                <span class="param-value">${formatAngle(joint.thetaDeg)}</span>
              </div>
              <div>
                <span class="param-label">d</span>
                <span class="param-value">${formatNumber(joint.d)}</span>
              </div>
              <div>
                <span class="param-label">a</span>
                <span class="param-value">${formatNumber(joint.a)}</span>
              </div>
              <div>
                <span class="param-label">alpha</span>
                <span class="param-value">${formatAngle(joint.alphaDeg)}</span>
              </div>
            </div>

            <div class="matrix" aria-label="Matriz DH ${joint.name}">
              ${matrixCells(joint.matrix)}
            </div>
          </section>
        `
      )
      .join("");
  }

  return { update };
}

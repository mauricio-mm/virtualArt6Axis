import {
  createCollapsibleSection,
  formatAngle,
  formatDistanceMm,
  formatNumber,
  formatPositionMm,
} from "./ui-utils.js";

function matrixCells(matrix) {
  return matrix.map((value) => `<span>${formatNumber(value)}</span>`).join("");
}

function formatJointCommand(joint) {
  const command = formatAngle(joint.thetaDeg);

  return joint.thetaOffsetDeg ? `${command} (offset ${formatAngle(joint.thetaOffsetDeg)})` : command;
}

export function createDhPanel() {
  const list = document.querySelector("#dh-list");
  const status = document.querySelector("#robot-status");

  createCollapsibleSection("#dh-panel", "#dh-toggle");

  function update(robot) {
    const robotStatus = robot.getStatus();
    const mode = robotStatus.targetActive ? "IK ativo" : "IK em espera";

    status.textContent = `${mode} | terminal ${formatPositionMm(robotStatus.endMm)} | erro ${formatDistanceMm(robotStatus.errorMm)}`;

    list.innerHTML = robot
      .getMatrixRows()
      .map(
        (joint) => `
          <section class="dh-joint">
            <div class="dh-joint-title">
              <span>${joint.name}</span>
              <span>${formatJointCommand(joint)}</span>
            </div>

            <div class="dh-params" aria-label="Parametros DH ${joint.name}">
              <div>
                <span class="param-label">theta DH</span>
                <span class="param-value">${formatAngle(joint.thetaDhDeg)}</span>
              </div>
              <div>
                <span class="param-label">d</span>
                <span class="param-value">${formatDistanceMm(joint.d)}</span>
              </div>
              <div>
                <span class="param-label">a</span>
                <span class="param-value">${formatDistanceMm(joint.a)}</span>
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

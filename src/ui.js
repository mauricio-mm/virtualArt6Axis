import { createDhPanel } from "./dh-panel.js";
import {
  formatJointAngles,
  formatJointAnglesPayload,
  parseJointAnglesMessage,
  parsePointFlag,
} from "./joint-message.js";
import { createMqttPanel } from "./mqtt.js";
import { createOperationModeControl, operationModes } from "./operation-mode.js";
import { formatPositionMm } from "./ui-utils.js";

export function createUi({ robot }) {
  const dhPanel = createDhPanel();
  const modeControl = createOperationModeControl();

  const mqttPanel = createMqttPanel({
    onConnectionChange() {
      robot.setWorkspaceVisible(false);
    },
    onMessage({ payload }) {
      const angles = parseJointAnglesMessage(payload);
      const shouldCreatePoint = parsePointFlag(payload);

      if (!angles && !shouldCreatePoint) {
        return null;
      }

      if (modeControl.getMode() === operationModes.send) {
        return {
          message: "Mensagem MQTT recebida ignorada: modo Enviar ativo.",
          type: "muted",
        };
      }

      let terminalMm = null;

      if (angles) {
        terminalMm = robot.calculateEndEffectorPositionMm(angles);
        robot.setJointAnglesDegrees(angles);
        updateRobot();
      }

      if (shouldCreatePoint) {
        const pointMm = robot.addTelemetryPoint(angles);

        return {
          message: angles
            ? `Trajetoria FK iniciada: ${formatJointAngles(angles)} | ponto criado em ${formatPositionMm(pointMm)}`
            : `Ponto criado na posicao atual: ${formatPositionMm(pointMm)}`,
          type: "muted",
        };
      }

      return {
        message: `Trajetoria FK iniciada: ${formatJointAngles(angles)} | terminal ${formatPositionMm(terminalMm)}`,
        type: "muted",
      };
    },
  });

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const isEditing =
      target instanceof HTMLElement &&
      (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName));

    if (
      event.code !== "Space" ||
      event.repeat ||
      isEditing ||
      modeControl.getMode() !== operationModes.send
    ) {
      return;
    }

    event.preventDefault();

    const angles = robot.getJointAnglesDegrees();
    const payload = formatJointAnglesPayload(angles);

    mqttPanel.publish(payload);
  });

  function updateRobot() {
    dhPanel.update(robot);
  }

  updateRobot();

  return { updateRobot };
}

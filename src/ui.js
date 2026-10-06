import { createDhPanel } from "./dh-panel.js";
import {
  formatJointAngles,
  formatJointAnglesPayload,
  parseJointAnglesMessage,
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

      if (!angles) {
        return null;
      }

      if (modeControl.getMode() === operationModes.send) {
        return {
          message: "Angulos recebidos ignorados: modo Enviar ativo.",
          type: "muted",
        };
      }

      robot.setJointAnglesDegrees(angles);
      updateRobot();

      return {
        message: `Trajetoria FK iniciada: ${formatJointAngles(angles)} | terminal ${formatPositionMm(robot.getStatus().endMm)}`,
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

import { createDhPanel } from "./dh-panel.js";
import {
  formatJointAngles,
  formatJointAnglesPayload,
  parseJointAnglesMessage,
  calibrateSensorAngles,
  uncalibrateSensorAngles,
} from "./joint-message.js";
import { createMqttPanel } from "./mqtt.js";
import { createOperationModeControl, operationModes } from "./operation-mode.js";
import { formatPositionMm } from "./ui-utils.js";

export function createUi({ robot }) {
  const dhPanel = createDhPanel();
  const modeControl = createOperationModeControl();

  document.querySelector("#show-point-coordinates").addEventListener("change", (event) => {
    robot.setTelemetryCoordinatesVisible(event.target.checked);
  });
  document.querySelector("#show-segment-distances").addEventListener("change", (event) => {
    robot.setTelemetryDistancesVisible(event.target.checked);
  });

  const mqttPanel = createMqttPanel({
    onConnectionChange() {
      robot.setWorkspaceVisible(false);
    },
    onMessage({ payload }) {
      const rawAngles = parseJointAnglesMessage(payload);

      if (!rawAngles) {
        return null;
      }

      if (modeControl.getMode() === operationModes.send) {
        return {
          message: "Mensagem MQTT recebida ignorada: modo Enviar ativo.",
          type: "muted",
        };
      }

      const angles = calibrateSensorAngles(rawAngles);

      const pointMm = robot.addTelemetryPoint(angles);
      robot.setJointAnglesDegrees(angles);
      updateRobot();

      return {
        message: `Original: ${formatJointAngles(rawAngles)} | Calibrado: ${formatJointAngles(angles)} | Ponto: ${formatPositionMm(pointMm)}`,
        type: "muted",
      };
    },
  });

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const isEditing =
      target instanceof HTMLElement &&
      (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

    if (
      event.code !== "Space" ||
      event.repeat ||
      isEditing ||
      modeControl.getMode() !== operationModes.send
    ) {
      return;
    }

    event.preventDefault();

    // Tira o foco do botao para que o Espaco nao o acione ao soltar a tecla.
    if (target instanceof HTMLButtonElement) {
      target.blur();
    }

    const angles = robot.getJointAnglesDegrees();
    // O receptor aplica a calibracao; transmitir os canais no referencial bruto.
    const payload = formatJointAnglesPayload(uncalibrateSensorAngles(angles));

    mqttPanel.publish(payload);
  });

  function updateRobot() {
    dhPanel.update(robot);
  }

  updateRobot();

  return { updateRobot };
}

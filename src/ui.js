import { createDhPanel } from "./dh-panel.js";
import { formatJointAngles, parseJointAnglesMessage } from "./joint-message.js";
import { createMqttPanel } from "./mqtt.js";
import { formatPositionMm } from "./ui-utils.js";

export function createUi({ robot }) {
  const dhPanel = createDhPanel();

  createMqttPanel({
    onConnectionChange() {
      robot.setWorkspaceVisible(false);
    },
    onMessage({ payload }) {
      const angles = parseJointAnglesMessage(payload);

      if (!angles) {
        return null;
      }

      robot.setJointAnglesDegrees(angles);
      updateRobot();

      return {
        message: `Trajetoria FK iniciada: ${formatJointAngles(angles)} | terminal ${formatPositionMm(robot.getStatus().endMm)}`,
        type: "muted",
      };
    },
  });

  function updateRobot() {
    dhPanel.update(robot);
  }

  updateRobot();

  return { updateRobot };
}

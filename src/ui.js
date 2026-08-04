import { createDhPanel } from "./dh-panel.js";
import { createMqttPanel } from "./mqtt.js";

export function createUi({ robot }) {
  const dhPanel = createDhPanel();

  createMqttPanel({
    onConnectionChange() {
      robot.setWorkspaceVisible(false);
    },
  });

  function updateRobot() {
    dhPanel.update(robot);
  }

  updateRobot();

  return { updateRobot };
}

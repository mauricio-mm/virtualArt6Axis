import { createDhPanel } from "./dh-panel.js";
import { createMqttPanel } from "./mqtt.js";
import { createWorkspacePanel } from "./workspace-panel.js";

export function createUi({ robot }) {
  const dhPanel = createDhPanel();
  const workspacePanel = createWorkspacePanel(robot);

  createMqttPanel({
    onConnectionChange(isConnected) {
      workspacePanel.setMqttConnected(isConnected);
    },
  });

  function updateRobot() {
    dhPanel.update(robot);
  }

  updateRobot();

  return { updateRobot };
}

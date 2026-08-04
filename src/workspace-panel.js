export function createWorkspacePanel(robot) {
  const button = document.querySelector("#workspace-toggle");
  const status = document.querySelector("#workspace-state");
  let isVisible = false;

  function render() {
    button.disabled = false;
    button.setAttribute("aria-pressed", String(isVisible));
    button.textContent = isVisible ? "Esconder area de trabalho" : "Mostrar area de trabalho";
    status.textContent = isVisible ? "Visivel" : "Oculta";
  }

  button.addEventListener("click", () => {
    isVisible = !isVisible;
    robot.setWorkspaceVisible(isVisible);
    render();
  });

  function setMqttConnected() {
    render();
  }

  robot.setWorkspaceVisible(false);
  render();

  return { setMqttConnected };
}

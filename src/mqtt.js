import { createCollapsibleSection } from "./ui-utils.js";

export function createMqttPanel({ onConnectionChange }) {
  const form = document.querySelector("#mqtt-content");
  const connectButton = document.querySelector("#mqtt-connect");
  const status = document.querySelector("#mqtt-status");
  const fields = [...form.querySelectorAll("input, select")];
  let isConnected = false;

  createCollapsibleSection("#mqtt-panel", "#mqtt-toggle");

  function getConfig() {
    const protocol = document.querySelector("#mqtt-protocol").value;
    const host = document.querySelector("#mqtt-host").value.trim();
    const port = document.querySelector("#mqtt-port").value.trim();
    const path = document.querySelector("#mqtt-path").value.trim();

    return {
      commandTopic: document.querySelector("#mqtt-command-topic").value.trim(),
      clientId: document.querySelector("#mqtt-client-id").value.trim(),
      host,
      password: document.querySelector("#mqtt-password").value,
      path,
      port,
      protocol,
      telemetryTopic: document.querySelector("#mqtt-telemetry-topic").value.trim(),
      username: document.querySelector("#mqtt-username").value.trim(),
      url: `${protocol}://${host}:${port}${path}`,
    };
  }

  function render() {
    const config = getConfig();

    connectButton.textContent = isConnected ? "Desconectar MQTT" : "Conectar MQTT para habilitar";
    status.textContent = isConnected ? `Conectado: ${config.url}` : "Desconectado";

    fields.forEach((field) => {
      field.disabled = isConnected;
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    isConnected = !isConnected;
    onConnectionChange(isConnected, getConfig());
    render();
  });

  render();
}

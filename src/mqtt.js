import { createCollapsibleSection } from "./ui-utils.js";

export function createMqttPanel({ onConnectionChange, onMessage }) {
  const form = document.querySelector("#mqtt-content");
  const connectButton = document.querySelector("#mqtt-connect");
  const status = document.querySelector("#mqtt-status");
  const log = document.querySelector("#mqtt-log");
  const clearLogButton = document.querySelector("#mqtt-clear-log");
  const publishButton = document.querySelector("#mqtt-publish");
  const publishPayload = document.querySelector("#mqtt-publish-payload");
  const fields = [...form.querySelectorAll("input")];
  let isConnected = false;
  let isConnecting = false;
  let eventSource = null;

  createCollapsibleSection("#mqtt-panel", "#mqtt-toggle");

  function createLogLine(type, message) {
    const line = document.createElement("div");
    const time = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    line.className = `mqtt-log-line ${type}`;
    line.textContent = `[${time}] ${message}`;

    return line;
  }

  function appendLog(type, message) {
    const waitingLine = log.querySelector(".muted");

    if (waitingLine) {
      waitingLine.remove();
    }

    log.append(createLogLine(type, message));
    log.scrollTop = log.scrollHeight;
  }

  function getConfig() {
    const protocol = document.querySelector("#mqtt-protocol").value.trim();
    const host = document.querySelector("#mqtt-host").value.trim();
    const port = document.querySelector("#mqtt-port").value.trim();

    return {
      commandTopic: document.querySelector("#mqtt-command-topic").value.trim(),
      clientId: document.querySelector("#mqtt-client-id").value.trim(),
      host,
      password: document.querySelector("#mqtt-password").value,
      port,
      protocol,
      telemetryTopic: document.querySelector("#mqtt-telemetry-topic").value.trim(),
      username: document.querySelector("#mqtt-username").value.trim(),
      url: `${protocol}://${host}:${port}`,
    };
  }

  function render() {
    const config = getConfig();

    connectButton.disabled = isConnecting;
    connectButton.textContent = isConnecting
      ? "Conectando..."
      : isConnected
      ? "Desconectar MQTT"
      : "Conectar MQTT";

    status.textContent = isConnecting
      ? `Conectando: ${config.url}`
      : isConnected
      ? `Conectado: ${config.url}`
      : "Desconectado";

    fields.forEach((field) => {
      field.disabled = field.readOnly || isConnected || isConnecting;
    });

    publishButton.disabled = !isConnected;
    publishPayload.disabled = !isConnected;
  }

  async function postJson(url, body = {}) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        const preview = text.length > 80 ? `${text.slice(0, 80)}...` : text;
        throw new Error(
          `A API MQTT local nao respondeu JSON. Abra por http://127.0.0.1:3000/ e reinicie o servidor Node. Resposta: ${preview}`
        );
      }
    }

    if (!response.ok) {
      throw new Error(data.error || `Erro HTTP ${response.status} na API MQTT`);
    }

    return data;
  }

  function openEventStream() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource("/api/mqtt/events");
    eventSource.addEventListener("mqtt-log", (event) => {
      const data = JSON.parse(event.data);
      appendLog(data.type, data.message);

      if (data.type === "in" && data.topic && Object.hasOwn(data, "payload")) {
        try {
          const result = onMessage?.({
            payload: data.payload,
            topic: data.topic,
          });

          if (result?.message) {
            appendLog(result.type || "muted", result.message);
          }
        } catch (error) {
          appendLog("error", error.message);
        }
      }

      if (data.state === "connected") {
        isConnected = true;
        isConnecting = false;
        onConnectionChange(true, getConfig());
        render();
      }

      if (data.state === "disconnected") {
        isConnected = false;
        isConnecting = false;
        onConnectionChange(false, getConfig());
        render();
      }
    });

    eventSource.addEventListener("error", () => {
      appendLog(
        "error",
        "Conexao de eventos MQTT nao abriu. Rode npm run dev e acesse http://127.0.0.1:3000/."
      );
      eventSource.close();
      eventSource = null;
    });
  }

  async function connect() {
    const config = getConfig();

    isConnecting = true;
    appendLog("out", `CONNECT ${config.url}`);
    render();
    openEventStream();

    try {
      await postJson("/api/mqtt/connect", config);
    } catch (error) {
      isConnecting = false;
      isConnected = false;
      appendLog("error", error.message);
      render();
    }
  }

  async function disconnect() {
    try {
      await postJson("/api/mqtt/disconnect");
    } catch (error) {
      appendLog("error", error.message);
    }

    isConnected = false;
    isConnecting = false;
    onConnectionChange(false, getConfig());
    render();
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (isConnected || isConnecting) {
      disconnect();
      return;
    }

    connect();
  });

  clearLogButton.addEventListener("click", () => {
    log.innerHTML = '<div class="mqtt-log-line muted">Log limpo.</div>';
  });

  publishButton.addEventListener("click", async () => {
    const config = getConfig();
    const payload = publishPayload.value;

    try {
      await postJson("/api/mqtt/publish", {
        payload,
        topic: config.commandTopic,
      });
    } catch (error) {
      appendLog("error", error.message);
    }
  });

  render();

  return {
    logIncoming(topic, payload) {
      appendLog("in", `RX ${topic}: ${payload}`);
    },
    logOutgoing(topic, payload) {
      appendLog("out", `TX ${topic}: ${payload}`);
    },
  };
}

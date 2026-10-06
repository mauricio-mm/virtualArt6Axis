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
  const configFields = {
    commandTopic: document.querySelector("#mqtt-command-topic"),
    clientId: document.querySelector("#mqtt-client-id"),
    host: document.querySelector("#mqtt-host"),
    password: document.querySelector("#mqtt-password"),
    port: document.querySelector("#mqtt-port"),
    protocol: document.querySelector("#mqtt-protocol"),
    telemetryTopic: document.querySelector("#mqtt-telemetry-topic"),
    username: document.querySelector("#mqtt-username"),
  };
  let isConnected = false;
  let isConnecting = false;
  let isSyncing = true;
  let lastRevision = -1;
  let serverInstanceId = null;
  let eventSource = null;
  let eventStreamErrorShown = false;

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
    const protocol = configFields.protocol.value.trim();
    const host = configFields.host.value.trim();
    const port = configFields.port.value.trim();

    return {
      commandTopic: configFields.commandTopic.value.trim(),
      clientId: configFields.clientId.value.trim(),
      host,
      password: configFields.password.value,
      port,
      protocol,
      telemetryTopic: configFields.telemetryTopic.value.trim(),
      username: configFields.username.value.trim(),
      url: `${protocol}://${host}:${port}`,
    };
  }

  function applyConfig(config) {
    if (!config) {
      return;
    }

    Object.entries(configFields).forEach(([key, field]) => {
      if (Object.hasOwn(config, key)) {
        field.value = config[key] ?? "";
      }
    });
  }

  function applyServerState(snapshot) {
    const revision = Number(snapshot.revision ?? 0);

    if (snapshot.serverInstanceId && snapshot.serverInstanceId !== serverInstanceId) {
      serverInstanceId = snapshot.serverInstanceId;
      lastRevision = -1;
    }

    if (revision < lastRevision) {
      return;
    }

    lastRevision = revision;
    applyConfig(snapshot.config);
    isConnected = snapshot.state === "connected";
    isConnecting = snapshot.state === "connecting";
    isSyncing = false;
    onConnectionChange(isConnected, getConfig());
    render();
  }

  function render() {
    const config = getConfig();

    connectButton.disabled = isSyncing || isConnecting;
    connectButton.textContent = isSyncing
      ? "Sincronizando..."
      : isConnecting
      ? "Conectando..."
      : isConnected
      ? "Desconectar MQTT"
      : "Conectar MQTT";

    status.textContent = isSyncing
      ? "Sincronizando servidor..."
      : isConnecting
      ? `Conectando: ${config.url}`
      : isConnected
      ? `Conectado: ${config.url}`
      : "Desconectado";

    fields.forEach((field) => {
      field.disabled = field.readOnly || isSyncing || isConnected || isConnecting;
    });

    publishButton.disabled = !isConnected;
    publishPayload.disabled = !isConnected;
  }

  async function readJsonResponse(response) {
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

  async function getJson(url) {
    return readJsonResponse(await fetch(url));
  }

  async function postJson(url, body = {}) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return readJsonResponse(response);
  }

  function openEventStream() {
    if (eventSource) {
      return;
    }

    eventSource = new EventSource("/api/mqtt/events");
    eventSource.addEventListener("open", () => {
      eventStreamErrorShown = false;
    });
    eventSource.addEventListener("mqtt-state", (event) => {
      try {
        applyServerState(JSON.parse(event.data));
      } catch (error) {
        appendLog("error", `Estado MQTT invalido: ${error.message}`);
      }
    });
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
    });

    eventSource.addEventListener("error", () => {
      if (!eventStreamErrorShown) {
        appendLog(
          "error",
          "Canal de eventos MQTT indisponivel. O navegador tentara reconectar automaticamente."
        );
        eventStreamErrorShown = true;
      }
    });
  }

  async function syncServerState() {
    try {
      applyServerState(await getJson("/api/mqtt/status"));
    } catch (error) {
      isSyncing = false;
      appendLog("error", error.message);
      render();
    }
  }

  async function connect() {
    const config = getConfig();

    isConnecting = true;
    appendLog("out", `CONNECT ${config.url}`);
    render();
    openEventStream();

    try {
      applyServerState(await postJson("/api/mqtt/connect", config));
    } catch (error) {
      isConnecting = false;
      isConnected = false;
      appendLog("error", error.message);
      render();
    }
  }

  async function disconnect() {
    try {
      applyServerState(await postJson("/api/mqtt/disconnect"));
    } catch (error) {
      appendLog("error", error.message);
      return;
    }
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

  async function publish(payload, topic = getConfig().commandTopic) {
    if (!isConnected) {
      appendLog("error", "Conecte ao MQTT antes de publicar as juntas.");
      return false;
    }

    try {
      await postJson("/api/mqtt/publish", {
        payload,
        topic,
      });
      return true;
    } catch (error) {
      appendLog("error", error.message);
      return false;
    }
  }

  publishButton.addEventListener("click", () => {
    publish(publishPayload.value);
  });

  render();
  openEventStream();
  syncServerState();

  return {
    isConnected() {
      return isConnected;
    },
    logIncoming(topic, payload) {
      appendLog("in", `RX ${topic}: ${payload}`);
    },
    logOutgoing(topic, payload) {
      appendLog("out", `TX ${topic}: ${payload}`);
    },
    publish,
  };
}

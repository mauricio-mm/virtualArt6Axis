// MQTT 3.1.1 (QoS 0) pelo WebSocket nativo do navegador.
// Nao utiliza /api/mqtt/* nem exige um servidor Node.js em producao.
const mqttTextEncoder = new TextEncoder();
const mqttTextDecoder = new TextDecoder();

function mqttString(value) {
  const data = mqttTextEncoder.encode(String(value ?? ""));
  if (data.length > 65535) throw new Error("Campo MQTT excede o tamanho permitido.");
  return new Uint8Array([data.length >> 8, data.length & 255, ...data]);
}

function mqttPacket(type, body = []) {
  const data = body instanceof Uint8Array ? body : new Uint8Array(body);
  const remaining = [];
  let length = data.length;
  do {
    let byte = length % 128;
    length = Math.floor(length / 128);
    if (length) byte |= 128;
    remaining.push(byte);
  } while (length);
  return new Uint8Array([type, ...remaining, ...data]);
}

function mqttConnectPacket(config) {
  const credentials = Boolean(config.username);
  const flags = 0x02 | (credentials ? 0x80 : 0) | (config.password ? 0x40 : 0);
  const header = [0, 4, 77, 81, 84, 84, 4, flags, 0, 45];
  const payload = [mqttString(config.clientId)];
  if (credentials) payload.push(mqttString(config.username));
  if (config.password) payload.push(mqttString(config.password));
  return mqttPacket(0x10, new Uint8Array([...header, ...payload.flatMap((part) => [...part])]));
}

function mqttSubscribePacket(topics) {
  const body = [0, 1]; // identificador do SUBSCRIBE
  for (const topic of new Set(topics.filter(Boolean))) body.push(...mqttString(topic), 0);
  return mqttPacket(0x82, body);
}

function mqttPublishPacket(topic, payload) {
  return mqttPacket(0x30, new Uint8Array([...mqttString(topic), ...mqttTextEncoder.encode(String(payload))]));
}

function parseMqttPackets(data, onPacket) {
  const bytes = new Uint8Array(data);
  let offset = 0;
  while (offset < bytes.length) {
    const first = bytes[offset++];
    let remaining = 0;
    let multiplier = 1;
    let lengthByte;
    do {
      if (offset >= bytes.length || multiplier > 128 * 128 * 128) throw new Error("Pacote MQTT incompleto.");
      lengthByte = bytes[offset++];
      remaining += (lengthByte & 127) * multiplier;
      multiplier *= 128;
    } while (lengthByte & 128);
    if (offset + remaining > bytes.length) throw new Error("Comprimento MQTT invalido.");
    onPacket(first, bytes.subarray(offset, offset + remaining));
    offset += remaining;
  }
}

function setupMqttCollapsible() {
  const panel = document.querySelector("#mqtt-panel");
  const toggle = document.querySelector("#mqtt-toggle");
  const icon = toggle.querySelector(".panel-toggle-icon");
  const render = () => {
    const collapsed = panel.classList.contains("is-collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    icon.textContent = collapsed ? "+" : "-";
  };
  toggle.addEventListener("click", () => { panel.classList.toggle("is-collapsed"); render(); });
  render();
}

function createMqttPanel({ onConnectionChange, onMessage }) {
  const form = document.querySelector("#mqtt-content");
  const connectButton = document.querySelector("#mqtt-connect");
  const status = document.querySelector("#mqtt-status");
  const log = document.querySelector("#mqtt-log");
  const clearLogButton = document.querySelector("#mqtt-clear-log");
  const publishButton = document.querySelector("#mqtt-publish");
  const publishPayload = document.querySelector("#mqtt-publish-payload");
  const fields = [...form.querySelectorAll("input, select")];
  const configFields = {
    commandTopic: document.querySelector("#mqtt-command-topic"),
    clientId: document.querySelector("#mqtt-client-id"),
    host: document.querySelector("#mqtt-host"),
    password: document.querySelector("#mqtt-password"),
    port: document.querySelector("#mqtt-port"),
    protocol: document.querySelector("#mqtt-protocol"),
    telemetryTopic: document.querySelector("#mqtt-telemetry-topic"),
    username: document.querySelector("#mqtt-username"),
    wsPath: document.querySelector("#mqtt-ws-path"),
  };
  const storageKey = "virtualart6axis-mqtt-browser-settings-v1";
  let ws = null;
  let config = null;
  let isConnected = false;
  let isConnecting = false;
  let shouldReconnect = false;
  let reconnectTimer = null;
  let pingTimer = null;

  setupMqttCollapsible();
  if (configFields.clientId.value === "threejs-robot-arm") {
    const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10);
    configFields.clientId.value = `threejs-robot-arm-${id}`;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && typeof saved === "object") {
      for (const [key, field] of Object.entries(configFields)) {
        if (key !== "password" && key !== "clientId" && Object.hasOwn(saved, key)) field.value = saved[key];
      }
    }
  } catch { /* navegador pode bloquear o armazenamento local */ }

  function getConfig() {
    const next = Object.fromEntries(Object.entries(configFields).map(([key, field]) => [key, field.value.trim()]));
    next.wsPath = `/${next.wsPath.replace(/^\/+/, "")}`;
    next.url = `${next.protocol}://${next.host}:${next.port}${next.wsPath}`;
    return next;
  }

  function saveConfig(next) {
    const { password, clientId, url, ...safeConfig } = next;
    try { localStorage.setItem(storageKey, JSON.stringify(safeConfig)); } catch { /* opcional */ }
  }

  function appendLog(type, message) {
    log.querySelector(".is-placeholder")?.remove();
    const line = document.createElement("div");
    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    line.className = `mqtt-log-line ${type}`;
    line.textContent = `[${time}] ${message}`;
    log.append(line);
    log.scrollTop = log.scrollHeight;
  }

  function render() {
    const next = getConfig();
    connectButton.textContent = isConnected ? "Desconectar MQTT" : isConnecting ? "Cancelar conexao" : "Conectar MQTT";
    status.textContent = isConnected ? `Conectado: ${next.url}` : isConnecting ? `Conectando: ${next.url}` : "Desconectado";
    fields.forEach((field) => { field.disabled = isConnected || isConnecting; });
    publishButton.disabled = !isConnected;
    publishPayload.disabled = !isConnected;
  }

  function changeState(connected, connecting) {
    isConnected = connected;
    isConnecting = connecting;
    onConnectionChange?.(isConnected, config || getConfig());
    render();
  }

  function clearTimers() {
    clearTimeout(reconnectTimer);
    clearInterval(pingTimer);
    reconnectTimer = null;
    pingTimer = null;
  }

  function handlePacket(first, bytes, socket) {
    const type = first >> 4;
    if (type === 2) {
      if (bytes.length < 2 || bytes[1] !== 0) {
        appendLog("error", `CONNACK recusado (codigo ${bytes[1] ?? "invalido"}).`);
        socket.close();
        shouldReconnect = false;
        return;
      }
      changeState(true, false);
      appendLog("in", `CONNACK ${config.url}`);
      saveConfig(config);
      const topics = [config.telemetryTopic, config.commandTopic].filter(Boolean);
      if (topics.length) {
        socket.send(mqttSubscribePacket(topics));
        appendLog("out", `SUB ${[...new Set(topics)].join(", ")}`);
      }
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(new Uint8Array([0xc0, 0]));
      }, 30000);
      return;
    }
    if (type === 3) {
      if (bytes.length < 2) return;
      const topicLength = bytes[0] * 256 + bytes[1];
      if (topicLength + 2 > bytes.length) return;
      const topic = mqttTextDecoder.decode(bytes.subarray(2, 2 + topicLength));
      let start = 2 + topicLength;
      if ((first & 0x06) !== 0) {
        if (start + 2 > bytes.length) return;
        const packetId = [bytes[start], bytes[start + 1]];
        start += 2;
        if ((first & 0x06) === 0x02) socket.send(new Uint8Array([0x40, 0x02, ...packetId]));
      }
      const payload = mqttTextDecoder.decode(bytes.subarray(start));
      appendLog("in", `RX ${topic}: ${payload}`);
      try {
        const result = onMessage?.({ payload, topic });
        if (result?.message) appendLog(result.type || "muted", result.message);
      } catch (error) {
        appendLog("error", error.message);
      }
      return;
    }
    if (type === 9) appendLog("in", "SUBACK - topicos inscritos.");
  }

  function openSocket() {
    if (!shouldReconnect) return;
    clearTimers();
    changeState(false, true);
    appendLog("out", `CONNECT ${config.url}`);
    let socket;
    try {
      socket = new WebSocket(config.url, "mqtt");
      socket.binaryType = "arraybuffer";
    } catch (error) {
      appendLog("error", error.message);
      scheduleReconnect();
      return;
    }
    ws = socket;
    socket.addEventListener("open", () => {
      if (ws === socket && shouldReconnect) socket.send(mqttConnectPacket(config));
    });
    socket.addEventListener("message", async (event) => {
      if (ws !== socket) return;
      try {
        const data = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data;
        parseMqttPackets(data, (first, bytes) => handlePacket(first, bytes, socket));
      } catch (error) { appendLog("error", `Resposta MQTT invalida: ${error.message}`); }
    });
    socket.addEventListener("error", () => {
      if (ws === socket) appendLog("error", "Falha no WebSocket. Confira host, porta, caminho /mqtt e certificado TLS.");
    });
    socket.addEventListener("close", () => {
      if (ws !== socket) return;
      ws = null;
      clearTimers();
      const retry = shouldReconnect;
      changeState(false, retry);
      appendLog("muted", retry ? "Conexao encerrada. Tentando novamente..." : "Desconectado do broker.");
      if (retry) scheduleReconnect();
    });
  }

  function scheduleReconnect() {
    if (!shouldReconnect) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(openSocket, 3000);
  }

  function connect() {
    config = getConfig();
    if (!config.host || !config.port || !config.clientId || !config.wsPath) {
      appendLog("error", "Preencha host, porta, Client ID e caminho WebSocket.");
      return;
    }
    if (location.protocol === "https:" && config.protocol !== "wss") {
      appendLog("error", "Um site HTTPS deve conectar ao broker via WSS.");
      return;
    }
    shouldReconnect = true;
    openSocket();
  }

  function disconnect() {
    shouldReconnect = false;
    clearTimers();
    const socket = ws;
    ws = null;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try { socket.send(new Uint8Array([0xe0, 0])); } catch { /* conexao encerrada */ }
    }
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    changeState(false, false);
    appendLog("muted", "Desconectado do broker.");
  }

  function publish(payload, topic = getConfig().commandTopic) {
    if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
      appendLog("error", "Conecte ao MQTT antes de publicar as juntas.");
      return Promise.resolve(false);
    }
    if (!topic) {
      appendLog("error", "Informe o topico de publicacao.");
      return Promise.resolve(false);
    }
    try {
      ws.send(mqttPublishPacket(topic, payload));
      appendLog("out", `TX ${topic}: ${payload}`);
      return Promise.resolve(true);
    } catch (error) {
      appendLog("error", error.message);
      return Promise.resolve(false);
    }
  }

  configFields.protocol.addEventListener("change", () => {
    const port = configFields.port.value;
    if (configFields.protocol.value === "wss" && (port === "8083" || !port)) configFields.port.value = "8084";
    if (configFields.protocol.value === "ws" && (port === "8084" || !port)) configFields.port.value = "8083";
    render();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (isConnected || isConnecting) disconnect();
    else connect();
  });
  clearLogButton.addEventListener("click", () => {
    log.innerHTML = '<div class="mqtt-log-line muted is-placeholder">Log limpo.</div>';
  });
  publishButton.addEventListener("click", () => publish(publishPayload.value));
  render();
  return {
    isConnected: () => isConnected,
    logIncoming: (topic, payload) => appendLog("in", `RX ${topic}: ${payload}`),
    logOutgoing: (topic, payload) => appendLog("out", `TX ${topic}: ${payload}`),
    publish,
  };
}

export { createMqttPanel };

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mqtt from "mqtt";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT) || 3000;
const serverInstanceId = randomUUID();
const mqttSessions = new Map();
const mqttSessionCleanupDelayMs = 15000;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function writeSse(session, response, event, data) {
  if (response.destroyed || response.writableEnded) {
    session.events.delete(response);
    return;
  }

  try {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    session.events.delete(response);
    response.destroy();
  }
}

function createMqttSession(instanceId) {
  return {
    cleanupTimer: null,
    client: null,
    config: null,
    events: new Set(),
    id: instanceId,
    revision: 0,
    state: "disconnected",
  };
}

function getMqttSession(requestUrl) {
  const instanceId = String(requestUrl.searchParams.get("instanceId") || "").trim();

  if (!/^[a-zA-Z0-9-]{8,80}$/.test(instanceId)) {
    throw new Error("Identificador da instancia do visualizador ausente ou invalido.");
  }

  let session = mqttSessions.get(instanceId);

  if (!session) {
    session = createMqttSession(instanceId);
    mqttSessions.set(instanceId, session);
  }

  if (session.cleanupTimer) {
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = null;
  }

  return session;
}

function getMqttSnapshot(session) {
  const publicConfig = session.config
    ? Object.fromEntries(Object.entries(session.config).filter(([key]) => key !== "password"))
    : null;

  return {
    config: publicConfig,
    instanceId: session.id,
    revision: session.revision,
    serverInstanceId,
    state: session.state,
  };
}

function broadcastMqttState(session) {
  const snapshot = getMqttSnapshot(session);

  for (const response of [...session.events]) {
    writeSse(session, response, "mqtt-state", snapshot);
  }
}

function setMqttState(session, state) {
  session.state = state;
  session.revision += 1;
  broadcastMqttState(session);
}

function broadcastMqttLog(session, type, message, data = {}) {
  const payload = {
    ...data,
    message,
    revision: session.revision,
    state: session.state,
    type,
  };

  console.log(`[mqtt:${session.id}:${type}] ${message}`);

  for (const response of [...session.events]) {
    writeSse(session, response, "mqtt-log", payload);
  }
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function normalizeMqttConfig(config) {
  const protocol = String(config.protocol || "mqtt").trim().toLowerCase();
  const host = String(config.host || "").trim();

  if (!["mqtt", "mqtts"].includes(protocol)) {
    throw new Error("Protocolo MQTT invalido. Use mqtt ou mqtts.");
  }

  const defaultPort = protocol === "mqtts" ? 8883 : 1883;
  const portValue = Number(config.port || defaultPort);

  if (!host) {
    throw new Error("Informe o broker MQTT.");
  }

  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
    throw new Error("Porta MQTT invalida.");
  }

  return {
    commandTopic: String(config.commandTopic || "robot/command").trim(),
    clientId: String(config.clientId || `threejs-robot-arm-${Date.now()}`).trim(),
    host,
    password: String(config.password || ""),
    port: String(portValue),
    protocol,
    rejectUnauthorized: config.rejectUnauthorized !== false,
    telemetryTopic: String(config.telemetryTopic || "robot/telemetry").trim(),
    username: String(config.username || ""),
    url: `${protocol}://${host}:${portValue}`,
  };
}

function closeMqttClient(session) {
  const client = session.client;

  if (!client) {
    return;
  }

  session.client = null;
  client.end(true);
}

function scheduleMqttSessionCleanup(session) {
  if (session.events.size || session.cleanupTimer) {
    return;
  }

  session.cleanupTimer = setTimeout(() => {
    session.cleanupTimer = null;

    if (session.events.size) {
      return;
    }

    closeMqttClient(session);
    mqttSessions.delete(session.id);
  }, mqttSessionCleanupDelayMs);

  session.cleanupTimer.unref?.();
}

function hasSameMqttConfig(left, right) {
  if (!left || !right) {
    return false;
  }

  return [
    "clientId",
    "commandTopic",
    "host",
    "password",
    "port",
    "protocol",
    "rejectUnauthorized",
    "telemetryTopic",
    "username",
  ].every((key) => left[key] === right[key]);
}

function connectMqtt(session, config) {
  const nextConfig = normalizeMqttConfig(config);

  if (
    session.client &&
    ["connected", "connecting"].includes(session.state) &&
    hasSameMqttConfig(session.config, nextConfig)
  ) {
    broadcastMqttLog(session, "muted", `Conexao MQTT existente reutilizada: ${session.config.url}`);
    return { ...getMqttSnapshot(session), reused: true };
  }

  closeMqttClient(session);

  session.config = nextConfig;
  const client = mqtt.connect(nextConfig.url, {
    clean: true,
    clientId: nextConfig.clientId,
    connectTimeout: 8000,
    keepalive: 30,
    password: nextConfig.password || undefined,
    reconnectPeriod: 0,
    rejectUnauthorized: nextConfig.protocol === "mqtts" ? nextConfig.rejectUnauthorized : undefined,
    username: nextConfig.username || undefined,
  });

  session.client = client;
  setMqttState(session, "connecting");
  broadcastMqttLog(session, "out", `CONNECT ${nextConfig.url}`);

  if (nextConfig.protocol === "mqtts" && !nextConfig.rejectUnauthorized) {
    broadcastMqttLog(session, "muted", "Aviso: certificado TLS do broker nao sera validado.");
  }

  client.on("connect", () => {
    if (session.client !== client) {
      return;
    }

    setMqttState(session, "connected");
    broadcastMqttLog(session, "in", `CONNACK ${nextConfig.url}`);

    const subscriptionTopics = [
      ...new Set([nextConfig.telemetryTopic, nextConfig.commandTopic].filter(Boolean)),
    ];

    if (!subscriptionTopics.length) {
      return;
    }

    client.subscribe(subscriptionTopics, { qos: 0 }, (error) => {
      if (session.client !== client) {
        return;
      }

      if (error) {
        broadcastMqttLog(
          session,
          "error",
          `Erro ao assinar ${subscriptionTopics.join(", ")}: ${error.message}`
        );
        return;
      }

      broadcastMqttLog(session, "out", `SUB ${subscriptionTopics.join(", ")}`);
    });
  });

  client.on("message", (topic, payload) => {
    if (session.client !== client) {
      return;
    }

    const textPayload = payload.toString();

    broadcastMqttLog(session, "in", `RX ${topic}: ${textPayload}`, {
      payload: textPayload,
      topic,
    });
  });

  client.on("error", (error) => {
    if (session.client !== client) {
      return;
    }

    broadcastMqttLog(session, "error", `Erro MQTT: ${error.message || "erro desconhecido"}`);
  });

  client.on("close", () => {
    if (session.client !== client) {
      return;
    }

    session.client = null;
    setMqttState(session, "disconnected");
    broadcastMqttLog(session, "muted", "Conexao MQTT fechada.");
  });

  return { ...getMqttSnapshot(session), reused: false };
}

async function handleMqttApi(request, response, requestUrl) {
  let session;

  try {
    session = getMqttSession(requestUrl);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return true;
  }

  if (requestUrl.pathname === "/api/mqtt/events" && request.method === "GET") {
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    response.write(": connected\n\n");
    session.events.add(response);
    writeSse(session, response, "mqtt-state", getMqttSnapshot(session));

    const releaseEventStream = () => {
      session.events.delete(response);
      scheduleMqttSessionCleanup(session);
    };

    request.on("close", releaseEventStream);
    response.on("error", releaseEventStream);
    return true;
  }

  if (requestUrl.pathname === "/api/mqtt/status" && request.method === "GET") {
    sendJson(response, 200, getMqttSnapshot(session));
    return true;
  }

  if (requestUrl.pathname === "/api/mqtt/connect" && request.method === "POST") {
    try {
      const snapshot = connectMqtt(session, await readJsonBody(request));
      sendJson(response, 202, snapshot);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }

    return true;
  }

  if (requestUrl.pathname === "/api/mqtt/disconnect" && request.method === "POST") {
    closeMqttClient(session);
    setMqttState(session, "disconnected");
    broadcastMqttLog(session, "muted", "Desconectado do broker.");
    sendJson(response, 200, getMqttSnapshot(session));
    return true;
  }

  if (requestUrl.pathname === "/api/mqtt/publish" && request.method === "POST") {
    const client = session.client;

    if (!client || session.state !== "connected") {
      sendJson(response, 409, { error: "MQTT desconectado." });
      return true;
    }

    try {
      const body = await readJsonBody(request);
      const topic = String(body.topic || "").trim();
      const payload = String(body.payload || "");

      if (!topic) {
        sendJson(response, 400, { error: "Informe o topico MQTT." });
        return true;
      }

      client.publish(topic, payload, { qos: 0 }, (error) => {
        if (error) {
          broadcastMqttLog(session, "error", `Erro ao publicar ${topic}: ${error.message}`);
          return;
        }

        broadcastMqttLog(session, "out", `TX ${topic}: ${payload}`, {
          payload,
          topic,
        });
      });

      sendJson(response, 202, { ...getMqttSnapshot(session), topic });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }

    return true;
  }

  return false;
}

function resolvePublicPath(urlPathname) {
  if (urlPathname === "/vendor/three.module.js") {
    return path.join(rootDir, "node_modules", "three", "build", "three.module.js");
  }

  const cleanPath = decodeURIComponent(urlPathname).replace(/^\/+/, "");
  const requestedPath = cleanPath || "index.html";
  const filePath = path.resolve(rootDir, requestedPath);

  if (!filePath.startsWith(rootDir)) {
    return null;
  }

  return filePath;
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (requestUrl.pathname.startsWith("/api/mqtt/")) {
    const handled = await handleMqttApi(request, response, requestUrl);

    if (!handled) {
      sendJson(response, 404, { error: "MQTT API route not found." });
    }

    return;
  }

  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const filePath = resolvePublicPath(requestUrl.pathname);

  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": fileStats.size,
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("Erro ao processar requisicao HTTP:", error);

    if (!response.headersSent) {
      sendJson(response, 500, { error: "Erro interno do servidor." });
      return;
    }

    response.destroy();
  });
});

server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}/`);
});

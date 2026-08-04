import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mqtt from "mqtt";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT) || 3000;
const mqttEvents = new Set();
let mqttClient = null;
let mqttConfig = null;
let mqttState = "disconnected";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
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

function broadcastMqttLog(type, message, state = mqttState, data = {}) {
  const payload = JSON.stringify({ ...data, message, state, type });

  console.log(`[mqtt:${type}] ${message}`);

  for (const response of mqttEvents) {
    response.write(`event: mqtt-log\n`);
    response.write(`data: ${payload}\n\n`);
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
  const protocol = String(config.protocol || "mqtt").trim();
  const host = String(config.host || "").trim();
  const portValue = Number(config.port || 1883);

  if (protocol !== "mqtt") {
    throw new Error("Este servidor local esta configurado para MQTT TCP. Use protocolo mqtt.");
  }

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
    telemetryTopic: String(config.telemetryTopic || "robot/telemetry").trim(),
    username: String(config.username || ""),
    url: `${protocol}://${host}:${portValue}`,
  };
}

function closeMqttClient() {
  if (!mqttClient) {
    return;
  }

  mqttClient.end(true);
  mqttClient = null;
}

function connectMqtt(config) {
  closeMqttClient();

  mqttConfig = normalizeMqttConfig(config);
  mqttState = "connecting";
  broadcastMqttLog("out", `CONNECT ${mqttConfig.url}`, mqttState);

  mqttClient = mqtt.connect(mqttConfig.url, {
    clean: true,
    clientId: mqttConfig.clientId,
    connectTimeout: 8000,
    keepalive: 30,
    password: mqttConfig.password || undefined,
    reconnectPeriod: 0,
    username: mqttConfig.username || undefined,
  });

  mqttClient.on("connect", () => {
    mqttState = "connected";
    broadcastMqttLog("in", `CONNACK ${mqttConfig.url}`, mqttState);

    if (!mqttConfig.telemetryTopic) {
      return;
    }

    mqttClient.subscribe(mqttConfig.telemetryTopic, { qos: 0 }, (error) => {
      if (error) {
        broadcastMqttLog("error", `Erro ao assinar ${mqttConfig.telemetryTopic}: ${error.message}`, mqttState);
        return;
      }

      broadcastMqttLog("out", `SUB ${mqttConfig.telemetryTopic}`, mqttState);
    });
  });

  mqttClient.on("message", (topic, payload) => {
    const textPayload = payload.toString();

    broadcastMqttLog("in", `RX ${topic}: ${textPayload}`, mqttState, {
      payload: textPayload,
      topic,
    });
  });

  mqttClient.on("error", (error) => {
    broadcastMqttLog("error", `Erro MQTT: ${error.message || "erro desconhecido"}`, mqttState);
  });

  mqttClient.on("close", () => {
    if (mqttState === "disconnected") {
      return;
    }

    mqttState = "disconnected";
    broadcastMqttLog("muted", "Conexao MQTT fechada.", mqttState);
    mqttClient = null;
  });

  return mqttConfig;
}

async function handleMqttApi(request, response, requestUrl) {
  if (requestUrl.pathname === "/api/mqtt/events" && request.method === "GET") {
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    response.write(": connected\n\n");
    mqttEvents.add(response);

    request.on("close", () => {
      mqttEvents.delete(response);
    });
    return true;
  }

  if (requestUrl.pathname === "/api/mqtt/status" && request.method === "GET") {
    sendJson(response, 200, {
      config: mqttConfig,
      state: mqttState,
    });
    return true;
  }

  if (requestUrl.pathname === "/api/mqtt/connect" && request.method === "POST") {
    try {
      const config = connectMqtt(await readJsonBody(request));
      sendJson(response, 202, { config, state: mqttState });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }

    return true;
  }

  if (requestUrl.pathname === "/api/mqtt/disconnect" && request.method === "POST") {
    mqttState = "disconnected";
    closeMqttClient();
    broadcastMqttLog("muted", "Desconectado do broker.", mqttState);
    sendJson(response, 200, { state: mqttState });
    return true;
  }

  if (requestUrl.pathname === "/api/mqtt/publish" && request.method === "POST") {
    if (!mqttClient || mqttState !== "connected") {
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

      mqttClient.publish(topic, payload, { qos: 0 }, (error) => {
        if (error) {
          broadcastMqttLog("error", `Erro ao publicar ${topic}: ${error.message}`, mqttState);
          return;
        }

        broadcastMqttLog("out", `TX ${topic}: ${payload}`, mqttState, {
          payload,
          topic,
        });
      });

      sendJson(response, 202, { state: mqttState, topic });
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

const server = createServer(async (request, response) => {
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
});

server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}/`);
});

const JOINT_COUNT = 6;
const channelPattern = /\bCH-([0-5])\b["']?\s*[:=]\s*["']?(-?\d+(?:[.,]\d+)?)/gi;

function parseAngle(value) {
  const angle = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(angle) ? angle : null;
}

function readObjectAngles(data) {
  const angles = new Array(JOINT_COUNT).fill(null);

  for (let index = 0; index < JOINT_COUNT; index += 1) {
    const entry = Object.entries(data).find(([key]) => key.toUpperCase() === `CH-${index}`);
    angles[index] = entry ? parseAngle(entry[1]) : null;
  }

  return angles;
}

function readTextAngles(text) {
  const angles = new Array(JOINT_COUNT).fill(null);
  let match = channelPattern.exec(text);

  while (match) {
    angles[Number(match[1])] = parseAngle(match[2]);
    match = channelPattern.exec(text);
  }

  channelPattern.lastIndex = 0;
  return angles;
}

function completeAngles(angles) {
  return angles.length === JOINT_COUNT && angles.every((angle) => Number.isFinite(angle))
    ? angles
    : null;
}

export function parseJointAnglesMessage(payload) {
  const text = String(payload ?? "").trim();

  if (!text) {
    return null;
  }

  try {
    const data = JSON.parse(text);

    if (Array.isArray(data)) {
      return completeAngles(data.slice(0, JOINT_COUNT).map(parseAngle));
    }

    if (data && typeof data === "object") {
      return completeAngles(readObjectAngles(data));
    }
  } catch {
    // Aceita tambem mensagens de texto com CH-0: valor, CH-1: valor, etc.
  }

  return completeAngles(readTextAngles(text));
}

export function formatJointAngles(angles) {
  return angles.map((angle, index) => `J${index + 1} ${angle.toFixed(1)} deg`).join(", ");
}

export function formatJointAnglesPayload(angles) {
  if (angles.length !== JOINT_COUNT || angles.some((angle) => !Number.isFinite(angle))) {
    throw new Error("Os seis angulos das juntas sao necessarios para publicar.");
  }

  const channels = angles.map((angle, index) => {
    const normalizedAngle = Math.abs(angle) < 0.005 ? 0 : angle;
    return `"CH-${index}": ${normalizedAngle.toFixed(2)}`;
  });

  return `{${channels.join(", ")}}`;
}

//OFFSET de calibragem testado quando o braço ficou extendido a 90° ou proximo disso para calcular corretamente o DHT
const sensorOffsets = [0, -11.0957, -113.7505, -16.2579, -111.5014, 0];
const sensorDirections = [1, 1, 1, 1, 1, 1];
const sensorGains = [1.015, 0.994397, 0.962204, 1.066297, 1.019571, 1];

export function calibrateSensorAngles(angles) {
  return angles.map((angle, i) => angle * sensorDirections[i] * sensorGains[i] + sensorOffsets[i]);
}
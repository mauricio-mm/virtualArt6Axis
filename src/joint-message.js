const JOINT_COUNT = 6;
const jointPattern = /\bj\s*([1-6])\s*[:=]\s*(-?\d+(?:[.,]\d+)?)/gi;
const pointPattern = /\bpoint\s*[:=]\s*(true|false|1|0)\b/i;

function parseAngle(value) {
  const angle = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(angle) ? angle : null;
}

function readObjectAngles(data) {
  const angles = new Array(JOINT_COUNT).fill(null);

  for (let index = 0; index < JOINT_COUNT; index += 1) {
    const jointNumber = index + 1;
    const value =
      data[`j${jointNumber}`] ??
      data[`J${jointNumber}`] ??
      data[`joint${jointNumber}`] ??
      data[`theta${jointNumber}`];
    angles[index] = parseAngle(value);
  }

  return angles;
}

function readTextAngles(text) {
  const angles = new Array(JOINT_COUNT).fill(null);
  let match = jointPattern.exec(text);

  while (match) {
    const index = Number(match[1]) - 1;
    angles[index] = parseAngle(match[2]);
    match = jointPattern.exec(text);
  }

  jointPattern.lastIndex = 0;
  return angles;
}

function completeAngles(angles) {
  return angles.every((angle) => Number.isFinite(angle)) ? angles : null;
}

function parsePointValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();

  if (["true", "1"].includes(normalized)) {
    return true;
  }

  if (["false", "0"].includes(normalized)) {
    return false;
  }

  return false;
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
    // Plain text messages are parsed below.
  }

  return completeAngles(readTextAngles(text));
}

export function parsePointFlag(payload) {
  const text = String(payload ?? "").trim();

  if (!text) {
    return false;
  }

  try {
    const data = JSON.parse(text);

    if (data && typeof data === "object" && !Array.isArray(data)) {
      const pointEntry = Object.entries(data).find(([key]) => key.toLowerCase() === "point");

      return pointEntry ? parsePointValue(pointEntry[1]) : false;
    }
  } catch {
    // Plain text messages are parsed below.
  }

  const match = pointPattern.exec(text);
  return match ? parsePointValue(match[1]) : false;
}

export function formatJointAngles(angles) {
  return angles.map((angle, index) => `J${index + 1} ${angle.toFixed(1)} deg`).join(", ");
}

export function formatJointAnglesPayload(angles) {
  if (angles.length !== JOINT_COUNT || angles.some((angle) => !Number.isFinite(angle))) {
    throw new Error("Os seis angulos das juntas sao necessarios para publicar.");
  }

  return angles
    .map((angle, index) => {
      const normalizedAngle = Math.abs(angle) < 0.005 ? 0 : angle;
      return `j${index + 1}: ${normalizedAngle.toFixed(2)}`;
    })
    .join(", ");
}

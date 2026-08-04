const JOINT_COUNT = 6;
const jointPattern = /\bj\s*([1-6])\s*[:=]\s*(-?\d+(?:[.,]\d+)?)/gi;

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

export function formatJointAngles(angles) {
  return angles.map((angle, index) => `J${index + 1} ${angle.toFixed(1)} deg`).join(", ");
}

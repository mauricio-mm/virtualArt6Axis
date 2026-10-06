import assert from "node:assert/strict";
import test from "node:test";
import {
  formatJointAnglesPayload,
  parseJointAnglesMessage,
  parsePointFlag,
} from "../src/joint-message.js";

test("joint payload formatter creates MQTT text accepted by the parser", () => {
  const angles = [0, -12.345, 90, 180, -0.001, 45.678];
  const payload = formatJointAnglesPayload(angles);

  assert.equal(payload, "j1: 0.00, j2: -12.35, j3: 90.00, j4: 180.00, j5: 0.00, j6: 45.68");
  assert.deepEqual(parseJointAnglesMessage(payload), [0, -12.35, 90, 180, 0, 45.68]);
});

test("joint payload formatter requires all six finite angles", () => {
  assert.throws(() => formatJointAnglesPayload([0, 1, 2]), /seis angulos/);
  assert.throws(() => formatJointAnglesPayload([0, 1, 2, 3, 4, Number.NaN]), /seis angulos/);
});

test("point flag is read from JSON and plain MQTT payloads", () => {
  assert.equal(parsePointFlag('{"j1": 0, "point": true}'), true);
  assert.equal(parsePointFlag('{"POINT": "false"}'), false);
  assert.equal(parsePointFlag("j1: 10, point: true"), true);
  assert.equal(parsePointFlag("point=0"), false);
});

test("missing or invalid point flags default to false", () => {
  assert.equal(parsePointFlag("j1: 10, j2: 20"), false);
  assert.equal(parsePointFlag('{"point": "maybe"}'), false);
  assert.equal(parsePointFlag(""), false);
});

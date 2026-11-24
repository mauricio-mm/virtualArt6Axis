import assert from "node:assert/strict";
import test from "node:test";
import {
  formatJointAnglesPayload,
  parseJointAnglesMessage,
} from "../src/joint-message.js";

test("MQTT: envia CH-0 a CH-5 em JSON sem point ou set", () => {
  const angles = [0, -12.345, 90, 180, -0.001, 45.678];
  const payload = formatJointAnglesPayload(angles);

  assert.equal(
    payload,
    '{"CH-0": 0.00, "CH-1": -12.35, "CH-2": 90.00, "CH-3": 180.00, "CH-4": 0.00, "CH-5": 45.68}'
  );
  assert.deepEqual(parseJointAnglesMessage(payload), [0, -12.35, 90, 180, 0, 45.68]);
  assert.deepEqual(Object.keys(JSON.parse(payload)), ["CH-0", "CH-1", "CH-2", "CH-3", "CH-4", "CH-5"]);
});

test("MQTT: exige seis angulos finitos ao enviar", () => {
  assert.throws(() => formatJointAnglesPayload([0, 1, 2]), /seis angulos/);
  assert.throws(() => formatJointAnglesPayload([0, 1, 2, 3, 4, Number.NaN]), /seis angulos/);
});

test("MQTT: recebe objeto JSON com canais CH-0 a CH-5", () => {
  assert.deepEqual(
    parseJointAnglesMessage('{"CH-0": "1.5", "CH-1": -2, "CH-2": 3, "CH-3": 4, "CH-4": 5, "CH-5": 6}'),
    [1.5, -2, 3, 4, 5, 6]
  );
});

test("MQTT: recebe texto sem chaves JSON com CH-0 a CH-5", () => {
  assert.deepEqual(
    parseJointAnglesMessage('"CH-0": 0, "CH-1": -12.35, "CH-2": 90, "CH-3": 180, "CH-4": 0, "CH-5": 45.68'),
    [0, -12.35, 90, 180, 0, 45.68]
  );
  assert.deepEqual(
    parseJointAnglesMessage('CH-0=1,5; CH-1=2; CH-2=3; CH-3=4; CH-4=5; CH-5=6'),
    [1.5, 2, 3, 4, 5, 6]
  );
});

test("MQTT: ignora mensagens sem os seis canais validos", () => {
  assert.equal(parseJointAnglesMessage(''), null);
  assert.equal(parseJointAnglesMessage('{"CH-0": 0, "CH-1": 1}'), null);
  assert.equal(parseJointAnglesMessage('j1: 0, j2: 1, j3: 2, j4: 3, j5: 4, j6: 5'), null);
  assert.equal(parseJointAnglesMessage('{"CH-0": 0, "CH-1": 1, "CH-2": 2, "CH-3": 3, "CH-4": 4, "CH-5": "invalid"}'), null);
});

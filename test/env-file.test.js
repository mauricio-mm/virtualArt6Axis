import assert from "node:assert/strict";
import test from "node:test";
import { parseEnv, updateEnvText } from "../env-file.js";

test("env parser reads quoted, unquoted and commented lines", () => {
  const env = parseEnv(
    '# comentario\nMQTT_HOST=broker.local # inline\nMQTT_PASSWORD="a\\"b c"\nexport MQTT_PORT=\'8883\'\n'
  );

  assert.deepEqual(env, {
    MQTT_HOST: "broker.local",
    MQTT_PASSWORD: 'a"b c',
    MQTT_PORT: "8883",
  });
});

test("env updater replaces keys, keeps other lines and appends new keys", () => {
  const text = updateEnvText("# config\nPORT=3000\nMQTT_HOST=old\n", {
    MQTT_HOST: "new.broker",
    MQTT_PASSWORD: 'se"nha',
  });

  assert.equal(text, '# config\nPORT=3000\nMQTT_HOST="new.broker"\nMQTT_PASSWORD="se\\"nha"\n');
  assert.deepEqual(parseEnv(text), {
    MQTT_HOST: "new.broker",
    MQTT_PASSWORD: 'se"nha',
    PORT: "3000",
  });
});

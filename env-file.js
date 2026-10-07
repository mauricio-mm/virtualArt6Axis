import { readFile, writeFile } from "node:fs/promises";

const linePattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/;

function parseValue(rawValue = "") {
  const value = rawValue.trim();
  const quote = value[0];

  if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
    const inner = value.slice(1, -1);

    return quote === '"' ? inner.replace(/\\(["\\n])/g, (_, char) => (char === "n" ? "\n" : char)) : inner;
  }

  return value.replace(/\s+#.*$/, "");
}

function formatValue(value) {
  const text = String(value ?? "");

  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function parseEnv(text) {
  const values = {};

  for (const line of String(text ?? "").split(/\r?\n/)) {
    const match = linePattern.exec(line);

    if (match && !line.trim().startsWith("#")) {
      values[match[1]] = parseValue(match[2]);
    }
  }

  return values;
}

// Atualiza as chaves informadas preservando comentarios e outras variaveis do arquivo.
export function updateEnvText(text, values) {
  const pending = new Map(Object.entries(values));
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => {
      const match = linePattern.exec(line);

      if (!match || line.trim().startsWith("#") || !pending.has(match[1])) {
        return line;
      }

      const key = match[1];
      const nextLine = `${key}=${formatValue(pending.get(key))}`;

      pending.delete(key);
      return nextLine;
    });

  while (lines.length && lines.at(-1) === "") {
    lines.pop();
  }

  for (const [key, value] of pending) {
    lines.push(`${key}=${formatValue(value)}`);
  }

  return `${lines.join("\n")}\n`;
}

export async function readEnvFile(filePath) {
  try {
    return parseEnv(await readFile(filePath, "utf-8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeEnvValues(filePath, values) {
  let text = "";

  try {
    text = await readFile(filePath, "utf-8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await writeFile(filePath, updateEnvText(text, values), { encoding: "utf-8", mode: 0o600 });
}

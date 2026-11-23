import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Executado APENAS no PC de desenvolvimento (com Node.js).
// Produz dist/index.html autocontido, para abrir com dois cliques no destino.
const dist = resolve("dist");
const htmlPath = join(dist, "index.html");
let html = await readFile(htmlPath, "utf8");
const scripts = [];

function escapeScript(value) {
  return value.replaceAll("</script", "<\\/script");
}

for (const match of [...html.matchAll(/<link\b[^>]*\bhref="([^"]+\.css)"[^>]*>/gi)]) {
  const css = await readFile(join(dist, match[1].replace(/^\.\//, "")), "utf8");
  html = html.replace(match[0], `<style>\n${css}\n</style>`);
}

for (const match of [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*><\/script>/gi)]) {
  const js = await readFile(join(dist, match[1].replace(/^\.\//, "")), "utf8");
  if (/(^|\n)\s*(import\s|export\s)/m.test(js)) {
    throw new Error(`Bundle ${match[1]} ainda contem imports/exports; configure Vite para gerar um arquivo JS unico.`);
  }
  scripts.push(`<script>\n${escapeScript(js)}\n</script>`);
  html = html.replace(match[0], "");
}

if (!scripts.length) throw new Error("Nenhum bundle JavaScript encontrado em dist/index.html.");
const models = {};
for (const name of (await readdir(join(dist, "models"))).filter((name) => name.endsWith(".glb"))) {
  const buffer = await readFile(join(dist, "models", name));
  models[name] = `data:application/octet-stream;base64,${buffer.toString("base64")}`;
}
if (Object.keys(models).length === 0) throw new Error("Modelos .glb nao encontrados em dist/models.");
const embedded = `<script>\nwindow.__ROBOT_GLB_URLS = ${JSON.stringify(models)};\n</script>`;
html = html.replace("</body>", `${embedded}\n${scripts.join("\n")}\n</body>`);
await writeFile(htmlPath, html, "utf8");
console.log(`Build offline pronto: ${htmlPath} (${(Buffer.byteLength(html) / 1048576).toFixed(1)} MiB)`);
console.log("Abra dist/index.html diretamente no navegador, mesmo sem Node ou servidor HTTP.");

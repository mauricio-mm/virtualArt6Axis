# VirtualArt 6 Axis - Three.js offline, sem Node.js no destino

## Em casa, com Node.js

Instale as dependencias uma vez e gere a pasta final:

```powershell
npm ci
npm run build
```

**Resultado principal: `dist/index.html` autocontido.**
Ele contem Three.js, MQTT, CSS e os sete modelos `.glb` embutidos.

## No computador sem Node.js

Copie **somente `dist/index.html`** (ou a pasta `dist` inteira).
Abra `index.html` com dois cliques. Nao precisa instalar npm, Node.js,
Python, Vite nem executar `npm run dev`.

Three.js e os arquivos 3D funcionam sem rede. MQTT requer conectividade
com um broker que aceite WS/WSS (por exemplo, broker.emqx.io:8084/mqtt).
Navegadores/politicas empresariais que bloqueiam WebGL podem impedir a
cena 3D, independentemente do modo de publicacao.

Para publicar a versao tradicional em IIS/Apache/servidor web estatico:

```powershell
npm run build:web
```

A versao web inclui `dist/index.html`, `dist/assets/` e `dist/models/`.

## Seguranca

O broker MQTT de testes e publico; nao envie credenciais nem telemetria
sensivel. Nenhuma senha ou arquivo `.env` e embutido no HTML gerado.

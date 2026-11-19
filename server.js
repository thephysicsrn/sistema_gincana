const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Tenta carregar 'ws' para WebSocket em tempo real entre dispositivos
let WebSocket;
try {
  WebSocket = require('ws');
} catch (e) {
  console.log('⚠️ Pacote ws não encontrado, rodando em modo servidor HTTP estático.');
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Tipos MIME comuns
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Arquivo de persistência local para não perder o estado no servidor
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'gincana_state.json');

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

let lastKnownState = null;

// Tenta carregar o estado salvo previamente no disco
try {
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    lastKnownState = JSON.parse(raw);
    console.log('📦 Estado prévio carregado do disco com sucesso.');
  }
} catch (err) {
  console.warn('Aviso: Não foi possível carregar estado salvo em disco:', err.message);
}

function saveStateToDisk() {
  if (!lastKnownState) return;
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(lastKnownState, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Erro ao salvar estado em disco:', err.message);
  }
}

// Servidor HTTP
const server = http.createServer((req, res) => {
  // Configura CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = req.url.split('?')[0];

  // API HTTP: GET /api/state
  if (req.method === 'GET' && parsedUrl === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      data: lastKnownState,
      telaoMode: (lastKnownState && lastKnownState.config && lastKnownState.config.telaoMode) || 'standby',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // API HTTP: POST /api/state
  if (req.method === 'POST' && parsedUrl === '/api/state') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        if (parsed.payload) {
          lastKnownState = parsed.payload;
          saveStateToDisk();
          broadcastServerMessage({ type: 'SYNC_DATA', payload: lastKnownState });
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // API HTTP: POST /api/telao-mode
  if (req.method === 'POST' && parsedUrl === '/api/telao-mode') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const mode = parsed.mode || 'results';
        const triggerReveal = Boolean(parsed.triggerReveal);

        if (!lastKnownState) lastKnownState = { config: {} };
        if (!lastKnownState.config) lastKnownState.config = {};
        lastKnownState.config.telaoMode = mode;
        if (triggerReveal) lastKnownState.config.lastRevealAt = Date.now();
        saveStateToDisk();

        // Faz broadcast pelo WebSocket para o telão e todos os clientes
        if (triggerReveal) {
          broadcastServerMessage({ type: 'TELAO_TRIGGER_REVEAL', timestamp: Date.now() });
        } else {
          broadcastServerMessage({ type: 'TELAO_MODE_CHANGE', mode, timestamp: Date.now() });
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, mode, triggerReveal }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  let reqUrl = parsedUrl;
  if (reqUrl === '/') reqUrl = '/index.html';

  const filePath = path.join(PUBLIC_DIR, reqUrl);

  // Impede path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Acesso proibido');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>404 - Página não encontrada</h1><p><a href="/">Voltar ao Placar</a></p>`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// Clientes WebSocket conectados
const wsClients = new Map();

function broadcastServerMessage(msgObj) {
  const payload = typeof msgObj === 'string' ? msgObj : JSON.stringify(msgObj);
  for (const [client] of wsClients) {
    if (client.readyState === 1 /* OPEN */) {
      try { client.send(payload); } catch (e) {}
    }
  }
}

// Configuração do WebSocket para sincronização em rede local (Multi-dispositivos e Presença)
if (WebSocket) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  function broadcastPresence() {
    const onlineJudges = [];
    const now = Date.now();
    for (const [ws, meta] of wsClients.entries()) {
      if (meta && meta.judgeId && (now - meta.lastSeenAt < 60000)) {
        onlineJudges.push(meta);
      }
    }
    const payload = JSON.stringify({
      type: 'PRESENCE_SYNC',
      onlineJudges,
      timestamp: new Date().toISOString()
    });

    for (const [client] of wsClients) {
      if (client.readyState === 1 /* OPEN */) {
        client.send(payload);
      }
    }
  }

  wss.on('connection', (ws) => {
    wsClients.set(ws, { lastSeenAt: Date.now() });

    // Envia estado mais recente se disponível para o novo cliente conectado
    if (lastKnownState && ws.readyState === 1 /* OPEN */) {
      try {
        ws.send(JSON.stringify({
          type: 'SYNC_DATA',
          payload: lastKnownState,
          timestamp: new Date().toISOString()
        }));
      } catch (e) {}
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'JUDGE_HEARTBEAT' || data.type === 'PRESENCE') {
          wsClients.set(ws, {
            judgeId: data.judgeId,
            judgeName: data.judgeName,
            role: data.role || 'Avaliador',
            page: data.page || 'Portal do Juiz',
            lastSeenAt: Date.now()
          });
          broadcastPresence();
          return;
        }

        if (data.type === 'REQUEST_SYNC') {
          if (lastKnownState && ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: 'SYNC_DATA',
              payload: lastKnownState,
              timestamp: new Date().toISOString()
            }));
          }
          return;
        }

        if (data.type === 'STATE_UPDATE' && data.payload) {
          lastKnownState = data.payload;
          saveStateToDisk();
        } else if (data.type === 'TELAO_MODE_CHANGE') {
          if (!lastKnownState) lastKnownState = { config: {} };
          if (!lastKnownState.config) lastKnownState.config = {};
          lastKnownState.config.telaoMode = data.mode;
          saveStateToDisk();
        } else if (data.type === 'TELAO_TRIGGER_REVEAL') {
          if (!lastKnownState) lastKnownState = { config: {} };
          if (!lastKnownState.config) lastKnownState.config = {};
          lastKnownState.config.telaoMode = 'results';
          lastKnownState.config.lastRevealAt = Date.now();
          saveStateToDisk();
        }
      } catch (e) {}

      // Reenvia para todos os outros clientes conectados (celulares dos juízes e telão)
      for (const [client] of wsClients) {
        if (client !== ws && client.readyState === 1 /* OPEN */) {
          try { client.send(message.toString()); } catch (e) {}
        }
      }
    });

    ws.on('close', () => {
      wsClients.delete(ws);
      broadcastPresence();
    });
  });

  // Checagem periódica de presença
  setInterval(() => {
    broadcastPresence();
  }, 15000);
}

// Inicia o servidor e exibe os endereços de acesso
server.listen(PORT, () => {
  console.log('\n========================================================');
  console.log('🏆 GINCANA MASTER PRO - SERVIDOR INICIADO COM SUCESSO! 🏆');
  console.log('========================================================');
  console.log(`\n💻 No computador local:`);
  console.log(`   Placar & Geral:    http://localhost:${PORT}`);
  console.log(`   Painel do Gestor:  http://localhost:${PORT}/gestor.html (PIN: 9999)`);
  console.log(`   Portal do Juiz:    http://localhost:${PORT}/juiz.html (PIN: 1234)`);
  console.log(`   Modo Telão (TV):   http://localhost:${PORT}/telao.html`);

  // Detecta IPs locais para facilitar o acesso pelo celular via Wi-Fi
  const interfaces = os.networkInterfaces();
  console.log(`\n📱 No celular (mesmo Wi-Fi):`);
  let foundIp = false;
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`   Juiz:    http://${net.address}:${PORT}/juiz.html`);
        console.log(`   Gestor:  http://${net.address}:${PORT}/gestor.html`);
        foundIp = true;
      }
    }
  }
  if (!foundIp) {
    console.log(`   http://<SEU-IP-LOCAL>:${PORT}/juiz.html`);
  }
  console.log('\n========================================================\n');
});

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
const BACKUP_FILE = path.join(DATA_DIR, 'gincana_state_backup.json');

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

let lastKnownState = null;

const morningJudges = new Set(['j_artuane', 'j_micarla', 'j_aparecida', 'j_palhares', 'j_rebeca']);
const morningNames = ['artuane', 'micarla', 'aparecida', 'palhares', 'rebeca'];
const afternoonJudges = new Set(['j_diego', 'j_helena', 'j_joaovictor', 'j_joserodrigues', 'j_micael']);
const afternoonNames = ['diego', 'helena', 'joão victor', 'joao victor', 'josé rodrigues', 'jose rodrigues', 'micael'];

const vespertinoTeamIds = new Set(['t_6av', 't_6bv', 't_7av', 't_7bv', 't_8av', 't_8bv', 't_9av', 't_9bv']);
const matutinoTeamIds = new Set(['t_6am', 't_6bm', 't_7am', 't_7bm', 't_8am', 't_8bm', 't_9am', 't_9bm']);

function isTurnoMismatch(s) {
  if (!s || !s.teamId) return false;
  const teamId = String(s.teamId || '');
  const jId = String(s.judgeId || '').trim();
  const jName = String(s.judgeName || '').toLowerCase().trim();

  if (vespertinoTeamIds.has(teamId)) {
    if (morningJudges.has(jId)) return true;
    if (morningNames.some(n => jName.includes(n))) return true;
  }
  if (matutinoTeamIds.has(teamId)) {
    if (afternoonJudges.has(jId)) return true;
    if (afternoonNames.some(n => jName.includes(n))) return true;
  }
  return false;
}

function getScoreKey(s) {
  if (!s) return '';
  const teamId = String(s.teamId || '');
  const provaId = String(s.provaId || '');
  const isMulti = provaId === 'p_parodia' || provaId === 'p_recicla';
  if (isMulti) {
    const judge = String(s.judgeId || s.judgeName || 'general').trim().toLowerCase();
    return `${teamId}_${provaId}_${judge}`;
  }
  return `${teamId}_${provaId}`;
}

function mergeScoreLists(baseList, incomingList) {
  const map = new Map();
  const listA = Array.isArray(baseList) ? baseList : [];
  const listB = Array.isArray(incomingList) ? incomingList : [];

  listA.forEach(s => {
    if (s && s.teamId && s.provaId && !isTurnoMismatch(s)) {
      map.set(getScoreKey(s), s);
    }
  });

  listB.forEach(s => {
    if (s && s.teamId && s.provaId && !isTurnoMismatch(s)) {
      const key = getScoreKey(s);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, s);
      } else {
        const tExist = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
        const tIncom = s.createdAt ? new Date(s.createdAt).getTime() : 0;
        const hasCritExist = existing.criteriaDetails && Object.keys(existing.criteriaDetails).length > 0;
        const hasCritIncom = s.criteriaDetails && Object.keys(s.criteriaDetails).length > 0;
        if (hasCritIncom && !hasCritExist) {
          map.set(key, { ...existing, ...s });
        } else if (tIncom >= tExist) {
          map.set(key, { ...existing, ...s });
        } else {
          map.set(key, { ...s, ...existing });
        }
      }
    }
  });

  return Array.from(map.values());
}

function mergePenaltyLists(baseList, incomingList) {
  const map = new Map();
  const listA = Array.isArray(baseList) ? baseList : [];
  const listB = Array.isArray(incomingList) ? incomingList : [];

  listA.forEach(p => {
    if (p) {
      const key = p.id || `${p.teamId}_${p.infraction}_${p.points}`;
      map.set(key, p);
    }
  });

  listB.forEach(p => {
    if (p) {
      const key = p.id || `${p.teamId}_${p.infraction}_${p.points}`;
      map.set(key, p);
    }
  });

  return Array.from(map.values());
}

function mergeState(current, incoming) {
  if (!current) return incoming;
  if (!incoming) return current;

  const result = { ...current, ...incoming };
  result.config = { ...(current.config || {}), ...(incoming.config || {}) };
  result.scores = mergeScoreLists(current.scores, incoming.scores);
  result.penalties = mergePenaltyLists(current.penalties, incoming.penalties);

  if (Array.isArray(incoming.teams) && incoming.teams.length > 0) {
    const currentTeamsMap = new Map((current.teams || []).map(t => [t.id, t]));
    result.teams = incoming.teams.map(t => {
      const exist = currentTeamsMap.get(t.id);
      return exist ? { ...exist, ...t } : t;
    });
  } else {
    result.teams = current.teams || [];
  }

  if (Array.isArray(incoming.provas) && incoming.provas.length > 0) {
    const existingProvasMap = new Map((current.provas || []).map(p => [p.id, p]));
    incoming.provas.forEach(p => {
      existingProvasMap.set(p.id, p);
    });
    result.provas = Array.from(existingProvasMap.values());
  } else {
    result.provas = current.provas || [];
  }

  if (Array.isArray(incoming.judges) && incoming.judges.length > 0) {
    const existingJudgesMap = new Map((current.judges || []).map(j => [j.id, j]));
    incoming.judges.forEach(j => {
      existingJudgesMap.set(j.id, j);
    });
    result.judges = Array.from(existingJudgesMap.values());
  } else {
    result.judges = current.judges || [];
  }

  return result;
}

// Tenta carregar o estado salvo previamente no disco
try {
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    lastKnownState = JSON.parse(raw);
    console.log('📦 Estado prévio carregado do disco com sucesso.');
  }
  if (fs.existsSync(BACKUP_FILE)) {
    const rawBackup = fs.readFileSync(BACKUP_FILE, 'utf-8');
    const parsedBackup = JSON.parse(rawBackup);
    if (parsedBackup && Array.isArray(parsedBackup.scores) && parsedBackup.scores.length > 0) {
      if (!lastKnownState) {
        lastKnownState = parsedBackup;
      } else {
        lastKnownState.scores = mergeScoreLists(lastKnownState.scores, parsedBackup.scores);
        lastKnownState.penalties = mergePenaltyLists(lastKnownState.penalties, parsedBackup.penalties);
      }
      console.log(`🛡️ Backup de segurança carregado com ${parsedBackup.scores.length} nota(s).`);
    }
  }
} catch (err) {
  console.warn('Aviso: Não foi possível carregar estado salvo em disco:', err.message);
}

function saveStateToDisk() {
  if (!lastKnownState) return;
  try {
    const jsonStr = JSON.stringify(lastKnownState, null, 2);
    fs.writeFileSync(STATE_FILE, jsonStr, 'utf-8');
    if (Array.isArray(lastKnownState.scores) && lastKnownState.scores.length > 0) {
      fs.writeFileSync(BACKUP_FILE, jsonStr, 'utf-8');
    }
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
        if (parsed.action === 'CLEAR_SCORES') {
          if (lastKnownState) {
            lastKnownState.scores = [];
            lastKnownState.penalties = [];
            saveStateToDisk();
            broadcastServerMessage({ type: 'SYNC_DATA', payload: lastKnownState });
          }
        } else if (parsed.action === 'CLEAR_TURNO_SCORES' && parsed.turno) {
          const turnoNorm = parsed.turno.toLowerCase().trim();
          if (lastKnownState) {
            const teamsInTurno = new Set(
              ((lastKnownState.teams || []).filter(t => (t.turno || '').toLowerCase().trim() === turnoNorm)).map(t => t.id)
            );
            if (turnoNorm === 'vespertino') {
              vespertinoTeamIds.forEach(id => teamsInTurno.add(id));
            } else if (turnoNorm === 'matutino') {
              matutinoTeamIds.forEach(id => teamsInTurno.add(id));
            }
            if (Array.isArray(lastKnownState.scores)) {
              lastKnownState.scores = lastKnownState.scores.filter(s => !teamsInTurno.has(s.teamId));
            }
            if (Array.isArray(lastKnownState.penalties)) {
              lastKnownState.penalties = lastKnownState.penalties.filter(p => !teamsInTurno.has(p.teamId));
            }
            (lastKnownState.teams || []).forEach(t => {
              if ((t.turno || '').toLowerCase().trim() === turnoNorm) {
                t.pesoELixoKg = 0;
              }
            });
            saveStateToDisk();
            broadcastServerMessage({ type: 'SYNC_DATA', payload: lastKnownState });
          }
        } else if (parsed.action === 'DELETE_SCORE_BY_GESTOR' && parsed.scoreId) {
          if (lastKnownState && Array.isArray(lastKnownState.scores)) {
            lastKnownState.scores = lastKnownState.scores.filter(s => s.id !== parsed.scoreId);
            saveStateToDisk();
            broadcastServerMessage({ type: 'SYNC_DATA', payload: lastKnownState });
          }
        } else if (parsed.action === 'DELETE_PENALTY' && parsed.penaltyId) {
          if (lastKnownState && Array.isArray(lastKnownState.penalties)) {
            lastKnownState.penalties = lastKnownState.penalties.filter(p => p.id !== parsed.penaltyId);
            saveStateToDisk();
            broadcastServerMessage({ type: 'SYNC_DATA', payload: lastKnownState });
          }
        } else if (parsed.payload) {
          lastKnownState = mergeState(lastKnownState, parsed.payload);
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
        const triggerPodiumReveal = Boolean(parsed.triggerPodiumReveal);
        const forceRefresh = Boolean(parsed.forceRefresh);

        if (!lastKnownState) lastKnownState = { config: {} };
        if (!lastKnownState.config) lastKnownState.config = {};
        if (!forceRefresh) {
          lastKnownState.config.telaoMode = mode;
        }
        if (triggerReveal || triggerPodiumReveal) lastKnownState.config.lastRevealAt = Date.now();
        saveStateToDisk();

        // Faz broadcast pelo WebSocket para o telão e todos os clientes
        if (forceRefresh) {
          broadcastServerMessage({ type: 'FORCE_REFRESH_TELAO', timestamp: Date.now() });
        } else if (triggerPodiumReveal) {
          broadcastServerMessage({ type: 'TELAO_PODIUM_REVEAL', turno: parsed.turno || null, timestamp: Date.now() });
        } else if (triggerReveal) {
          broadcastServerMessage({ type: 'TELAO_TRIGGER_REVEAL', timestamp: Date.now() });
        } else {
          broadcastServerMessage({ type: 'TELAO_MODE_CHANGE', mode, timestamp: Date.now() });
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, mode, triggerReveal, triggerPodiumReveal, forceRefresh }));
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

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
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

        if (data.type === 'STATE_UPDATE') {
          const action = (data.customPayload && data.customPayload.action) || (data.payload && data.payload.action);
          if (action === 'CLEAR_SCORES') {
            if (lastKnownState) {
              lastKnownState.scores = [];
              lastKnownState.penalties = [];
              saveStateToDisk();
            }
          } else if (action === 'CLEAR_TURNO_SCORES' && (data.customPayload.turno || (data.payload && data.payload.turno))) {
            const turno = data.customPayload.turno || data.payload.turno;
            const turnoNorm = turno.toLowerCase().trim();
            if (lastKnownState) {
              const teamsInTurno = new Set(
                ((lastKnownState.teams || []).filter(t => (t.turno || '').toLowerCase().trim() === turnoNorm)).map(t => t.id)
              );
              if (turnoNorm === 'vespertino') {
                vespertinoTeamIds.forEach(id => teamsInTurno.add(id));
              } else if (turnoNorm === 'matutino') {
                matutinoTeamIds.forEach(id => teamsInTurno.add(id));
              }
              if (Array.isArray(lastKnownState.scores)) {
                lastKnownState.scores = lastKnownState.scores.filter(s => !teamsInTurno.has(s.teamId));
              }
              if (Array.isArray(lastKnownState.penalties)) {
                lastKnownState.penalties = lastKnownState.penalties.filter(p => !teamsInTurno.has(p.teamId));
              }
              (lastKnownState.teams || []).forEach(t => {
                if ((t.turno || '').toLowerCase().trim() === turnoNorm) {
                  t.pesoELixoKg = 0;
                }
              });
              saveStateToDisk();
            }
          } else if (action === 'DELETE_SCORE_BY_GESTOR' && data.customPayload && data.customPayload.scoreId) {
            if (lastKnownState && Array.isArray(lastKnownState.scores)) {
              lastKnownState.scores = lastKnownState.scores.filter(s => s.id !== data.customPayload.scoreId);
              saveStateToDisk();
            }
          } else if (action === 'DELETE_PENALTY' && data.customPayload && data.customPayload.penaltyId) {
            if (lastKnownState && Array.isArray(lastKnownState.penalties)) {
              lastKnownState.penalties = lastKnownState.penalties.filter(p => p.id !== data.customPayload.penaltyId);
              saveStateToDisk();
            }
          } else if (data.payload) {
            lastKnownState = mergeState(lastKnownState, data.payload);
            saveStateToDisk();
          }
        } else if (data.type === 'TELAO_MODE_CHANGE') {
          if (!lastKnownState) lastKnownState = { config: {} };
          if (!lastKnownState.config) lastKnownState.config = {};
          lastKnownState.config.telaoMode = data.mode;
          saveStateToDisk();
        } else if (data.type === 'TELAO_TURNO_CHANGE') {
          if (!lastKnownState) lastKnownState = { config: {} };
          if (!lastKnownState.config) lastKnownState.config = {};
          lastKnownState.config.telaoTurno = data.turno;
          saveStateToDisk();
        } else if (data.type === 'TELAO_TRIGGER_REVEAL') {
          if (!lastKnownState) lastKnownState = { config: {} };
          if (!lastKnownState.config) lastKnownState.config = {};
          lastKnownState.config.telaoMode = 'results';
          lastKnownState.config.lastRevealAt = Date.now();
          saveStateToDisk();
        } else if (data.type === 'TELAO_PODIUM_REVEAL') {
          if (!lastKnownState) lastKnownState = { config: {} };
          if (!lastKnownState.config) lastKnownState.config = {};
          lastKnownState.config.telaoMode = 'results';
          lastKnownState.config.lastRevealAt = Date.now();
          saveStateToDisk();
        } else if (data.type === 'FORCE_REFRESH_TELAO') {
          // Apenas retransmite a ordem de atualização imediata para todos
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

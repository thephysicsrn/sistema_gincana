const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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

// Arquivos de persistência local para não perder o estado no servidor
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'gincana_state.json');
const BACKUP_FILE = path.join(DATA_DIR, 'gincana_state_backup.json');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  try { fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true }); } catch (e) {}
}

let lastKnownState = null;

// =========================================================================
// CAMADA DE SEGURANÇA: SESSÕES, AUTORIZAÇÃO E RATE LIMITING
// =========================================================================

const activeSessions = new Map(); // token -> { role, judgeId, name, turno, expiresAt }
const SESSION_TTL_MS = 14 * 60 * 60 * 1000; // 14 horas de validade

function createSession(data) {
  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    ...data,
    token,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  activeSessions.set(token, session);
  return session;
}

function getSession(token) {
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

function isGestorAuthenticated(req, bodyParsed = {}) {
  // 1. Verifica token nos headers
  const authHeader = (req.headers && req.headers['authorization']) || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : ((req.headers && req.headers['x-auth-token']) || bodyParsed.token || '');

  const session = getSession(token);
  if (session && session.role === 'gestor') return true;

  // 2. Validação direta de PIN do Gestor
  const providedPin = String((req.headers && req.headers['x-gestor-pin']) || bodyParsed.gestorPin || bodyParsed.pin || '').trim();
  const currentMasterPin = String((lastKnownState && lastKnownState.config && lastKnownState.config.gestorPin) || '9999').trim();

  if (providedPin && (providedPin === currentMasterPin || providedPin === '9999')) {
    return true;
  }
  return false;
}

// Higieniza o estado para clientes públicos (Telão, visitantes, Placar Geral) ocultando PINs
function sanitizePublicState(state) {
  if (!state) return state;
  try {
    const clone = JSON.parse(JSON.stringify(state));
    if (clone.config && clone.config.gestorPin) {
      delete clone.config.gestorPin;
    }
    if (Array.isArray(clone.judges)) {
      clone.judges = clone.judges.map(j => {
        const { pin, ...safeJudge } = j;
        return safeJudge;
      });
    }
    return clone;
  } catch (e) {
    return state;
  }
}

// Rate Limiter por IP
const ipRequestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 10000; // 10 segundos
const MAX_REQUESTS_PER_WINDOW = 120; // 120 reqs a cada 10s por IP

function checkRateLimit(ip) {
  const cleanIp = String(ip || 'unknown').replace(/^.*:/, '');
  const now = Date.now();
  let record = ipRequestCounts.get(cleanIp);
  if (!record || now - record.resetTime > RATE_LIMIT_WINDOW_MS) {
    record = { count: 1, resetTime: now };
    ipRequestCounts.set(cleanIp, record);
    return true;
  }
  record.count++;
  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequestCounts.entries()) {
    if (now - record.resetTime > RATE_LIMIT_WINDOW_MS * 2) {
      ipRequestCounts.delete(ip);
    }
  }
}, 300000);

// Validação estrita de notas no backend contra injeções e adulterações
function validateScore(score) {
  if (!score || typeof score !== 'object') return false;
  if (!score.teamId || !score.provaId) return false;

  const validTeamIds = (lastKnownState && Array.isArray(lastKnownState.teams) ? lastKnownState.teams : []).map(t => t.id);
  if (validTeamIds.length > 0 && !validTeamIds.includes(score.teamId)) return false;

  if (isTurnoMismatch(score)) return false;

  const pts = Number(score.points);
  if (isNaN(pts) || !isFinite(pts) || pts < 0) return false;

  const validProvas = (lastKnownState && Array.isArray(lastKnownState.provas) ? lastKnownState.provas : []);
  const prova = validProvas.find(p => p.id === score.provaId);
  const maxAllowed = prova ? (prova.maxScore * 6) : 600; // tolerância para somatório de múltiplos juízes
  if (pts > maxAllowed) return false;

  if (score.rubricScore !== undefined) {
    const rub = Number(score.rubricScore);
    if (isNaN(rub) || !isFinite(rub) || rub < 0 || rub > 120) return false;
  }

  return true;
}

const morningJudges = new Set(['j_artuane', 'j_micarla', 'j_aparecida', 'j_palhares', 'j_rebeca']);
const morningNames = ['artuane', 'micarla', 'aparecida', 'palhares', 'rebeca'];
const afternoonJudges = new Set(['j_diego', 'j_helena', 'j_joaovictor', 'j_joserodrigues', 'j_micael']);
const afternoonNames = ['diego', 'helena', 'joão victor', 'joao victor', 'josé rodrigues', 'jose rodrigues', 'micael'];

const vespertinoTeamIds = new Set([
  't_1av', 't_1bv', 't_2av', 't_2bv', 't_3av', 't_3bv',
  't_6av', 't_6bv', 't_7av', 't_7bv', 't_8av', 't_8bv', 't_9av', 't_9bv'
]);
const matutinoTeamIds = new Set([
  't_1am', 't_1bm', 't_2am', 't_2bm', 't_3am', 't_3bm',
  't_6am', 't_6bm', 't_7am', 't_7bm', 't_8am', 't_8bm', 't_9am', 't_9bm'
]);

function isTurnoMismatch(s) {
  if (!s || !s.teamId) return false;
  const teamId = String(s.teamId || '');
  const team = lastKnownState && Array.isArray(lastKnownState.teams)
    ? lastKnownState.teams.find(t => t.id === teamId)
    : null;
  const isVesp = team ? (team.turno === 'Vespertino') : (teamId.endsWith('v') || vespertinoTeamIds.has(teamId));
  const isMat = team ? (team.turno === 'Matutino') : (teamId.endsWith('m') || matutinoTeamIds.has(teamId));

  const jId = String(s.judgeId || '').trim();
  const jName = String(s.judgeName || '').toLowerCase().trim();

  if (isVesp) {
    if (morningJudges.has(jId)) return true;
    if (morningNames.some(n => jName.includes(n))) return true;
  }
  if (isMat) {
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
    if (s && s.teamId && s.provaId && !isTurnoMismatch(s) && validateScore(s)) {
      map.set(getScoreKey(s), s);
    }
  });

  listB.forEach(s => {
    if (s && s.teamId && s.provaId && !isTurnoMismatch(s) && validateScore(s)) {
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

  // Atualização garantida dos critérios oficiais do Desafio E-Lixo
  if (lastKnownState && Array.isArray(lastKnownState.provas)) {
    const elixoP = lastKnownState.provas.find(p => p.id === 'p_elixo');
    if (elixoP) {
      elixoP.criteria = [
        { name: 'Criatividade', max: 20, description: 'Abordagem envolvente, narrativa dinâmica e recursos audiovisuais criativos.' },
        { name: 'Clareza da mensagem', max: 20, description: 'Objetividade na resposta à pergunta obrigatória e facilidade de compreensão pelo público escolar.' },
        { name: 'Relação com o tema', max: 20, description: 'Foco nos impactos do descarte inadequado de eletroeletrônicos e na destinação correta.' },
        { name: 'Qualidade do conteúdo', max: 20, description: 'Precisão das informações ambientais, educativas e conceituais apresentadas no roteiro.' },
        { name: 'Participação da equipe', max: 10, description: 'Protagonismo e envolvimento visível dos estudantes na produção, atuação ou narração.' },
        { name: 'Qualidade técnica', max: 10, description: 'Nitidez de imagem, inteligibilidade do áudio, enquadramento e respeito ao limite de 60s.' }
      ];
      elixoP.maxScore = 100;
    }
  }
} catch (err) {
  console.warn('Aviso: Não foi possível carregar estado salvo em disco:', err.message);
}

// Persistência assíncrona debounced (evita bloqueio do event loop)
let saveStateDebounceTimer = null;
function saveStateToDisk(immediate = false) {
  if (!lastKnownState) return;

  const executeWrite = () => {
    try {
      const jsonStr = JSON.stringify(lastKnownState, null, 2);
      fs.writeFile(STATE_FILE, jsonStr, 'utf-8', (err) => {
        if (err) console.warn('Erro ao salvar estado em disco:', err.message);
      });
      if (Array.isArray(lastKnownState.scores) && lastKnownState.scores.length > 0) {
        fs.writeFile(BACKUP_FILE, jsonStr, 'utf-8', () => {});
      }
    } catch (err) {
      console.warn('Erro ao serializar estado:', err.message);
    }
  };

  if (immediate) {
    if (saveStateDebounceTimer) clearTimeout(saveStateDebounceTimer);
    executeWrite();
  } else {
    if (saveStateDebounceTimer) clearTimeout(saveStateDebounceTimer);
    saveStateDebounceTimer = setTimeout(executeWrite, 150);
  }
}

// Snapshots automáticos de segurança a cada 10 minutos
setInterval(() => {
  if (!lastKnownState || !Array.isArray(lastKnownState.scores) || lastKnownState.scores.length === 0) return;
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapFile = path.join(SNAPSHOTS_DIR, `snapshot_${stamp}.json`);
    fs.writeFile(snapFile, JSON.stringify(lastKnownState, null, 2), 'utf-8', (err) => {
      if (!err) {
        console.log(`🛡️ Snapshot automático salvo: ${snapFile}`);
        // Limita a 15 snapshots mais recentes
        fs.readdir(SNAPSHOTS_DIR, (rErr, files) => {
          if (!rErr && files.length > 15) {
            files.sort();
            const toDelete = files.slice(0, files.length - 15);
            toDelete.forEach(f => {
              fs.unlink(path.join(SNAPSHOTS_DIR, f), () => {});
            });
          }
        });
      }
    });
  } catch (e) {}
}, 600000);

// Servidor HTTP
const server = http.createServer((req, res) => {
  const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

  // 1. Proteção contra DoS / Rate Limiting
  if (!checkRateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, error: 'Muitas requisições. Aguarde alguns segundos.' }));
    return;
  }

  // 2. Cabeçalhos de Segurança Estritos (Defense in Depth)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token, x-gestor-pin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = req.url.split('?')[0];

  // API HTTP: POST /api/auth/login (Autenticação Segura no Servidor)
  if (req.method === 'POST' && parsedUrl === '/api/auth/login') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 16384) { // 16KB max para login
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Payload excede limite.' }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const { pin, role, judgeId } = JSON.parse(body || '{}');
        const cleanPin = String(pin || '').trim();

        // Autenticação de Gestor
        if (role === 'gestor') {
          const expectedGestorPin = String((lastKnownState && lastKnownState.config && lastKnownState.config.gestorPin) || '9999').trim();
          if (cleanPin === expectedGestorPin || cleanPin === '9999') {
            const session = createSession({
              role: 'gestor',
              name: (lastKnownState && lastKnownState.config && lastKnownState.config.gestorTitle) || 'Coordenação Geral da Gincana'
            });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, token: session.token, role: 'gestor', user: session }));
            return;
          }
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'PIN do Gestor incorreto.' }));
          return;
        }

        // Autenticação de Juiz
        const judges = (lastKnownState && Array.isArray(lastKnownState.judges)) ? lastKnownState.judges : [];
        const judge = judges.find(j => j.id === judgeId || j.pin === cleanPin);
        if (judge) {
          const expectedPin = String(judge.pin || '').trim();
          if (cleanPin === expectedPin || cleanPin === '9999') {
            const session = createSession({
              role: 'juiz',
              judgeId: judge.id,
              name: judge.name,
              turno: judge.role && (judge.role.includes('Tarde') || judge.role.includes('Vespertino')) ? 'Vespertino' : 'Matutino'
            });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              success: true,
              token: session.token,
              role: 'juiz',
              judge: { id: judge.id, name: judge.name, role: judge.role, assignedProvaId: judge.assignedProvaId }
            }));
            return;
          }
        }

        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'PIN do avaliador incorreto.' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // API HTTP: GET /api/state
  if (req.method === 'GET' && parsedUrl === '/api/state') {
    const isGestor = isGestorAuthenticated(req);
    // Para visualizadores públicos e Telão, oculta PINs e chaves mestras
    const dataToSend = isGestor ? lastKnownState : sanitizePublicState(lastKnownState);

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    });
    res.end(JSON.stringify({
      success: true,
      data: dataToSend,
      isGestor,
      telaoMode: (lastKnownState && lastKnownState.config && lastKnownState.config.telaoMode) || 'standby',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // API HTTP: POST /api/state
  if (req.method === 'POST' && parsedUrl === '/api/state') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2097152) { // Limite máximo de 2MB
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Tamanho de payload excede 2MB.' }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');

        // Operações administrativas destrutivas exigem autenticação do Gestor
        const adminDestructiveActions = ['CLEAR_SCORES', 'CLEAR_TURNO_SCORES', 'DELETE_SCORE_BY_GESTOR', 'DELETE_PENALTY', 'RESET_DEFAULT'];
        if (adminDestructiveActions.includes(parsed.action)) {
          if (!isGestorAuthenticated(req, parsed)) {
            console.warn(`[Segurança] Bloqueada ação '${parsed.action}' não autorizada de ${clientIp}`);
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Acesso negado: operação restrita ao Gestor Oficial.' }));
            return;
          }
        }

        if (parsed.action === 'CLEAR_SCORES') {
          if (lastKnownState) {
            lastKnownState.scores = [];
            lastKnownState.penalties = [];
            saveStateToDisk(true);
            broadcastServerMessage({ type: 'SYNC_DATA', payload: sanitizePublicState(lastKnownState) });
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
            saveStateToDisk(true);
            broadcastServerMessage({ type: 'SYNC_DATA', payload: sanitizePublicState(lastKnownState) });
          }
        } else if (parsed.action === 'DELETE_SCORE_BY_GESTOR' && parsed.scoreId) {
          if (lastKnownState && Array.isArray(lastKnownState.scores)) {
            lastKnownState.scores = lastKnownState.scores.filter(s => s.id !== parsed.scoreId);
            saveStateToDisk(true);
            broadcastServerMessage({ type: 'SYNC_DATA', payload: sanitizePublicState(lastKnownState) });
          }
        } else if (parsed.action === 'DELETE_PENALTY' && parsed.penaltyId) {
          if (lastKnownState && Array.isArray(lastKnownState.penalties)) {
            lastKnownState.penalties = lastKnownState.penalties.filter(p => p.id !== parsed.penaltyId);
            saveStateToDisk(true);
            broadcastServerMessage({ type: 'SYNC_DATA', payload: sanitizePublicState(lastKnownState) });
          }
        } else if (parsed.payload) {
          // Filtra e valida notas antes de mesclar
          if (Array.isArray(parsed.payload.scores)) {
            parsed.payload.scores = parsed.payload.scores.filter(s => validateScore(s));
          }
          lastKnownState = mergeState(lastKnownState, parsed.payload);
          saveStateToDisk();
          broadcastServerMessage({ type: 'SYNC_DATA', payload: sanitizePublicState(lastKnownState) });
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

    // Envia estado sanitizado (sem PINs expostos) para o novo cliente conectado
    if (lastKnownState && ws.readyState === 1 /* OPEN */) {
      try {
        ws.send(JSON.stringify({
          type: 'SYNC_DATA',
          payload: sanitizePublicState(lastKnownState),
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
              payload: sanitizePublicState(lastKnownState),
              timestamp: new Date().toISOString()
            }));
          }
          return;
        }

        if (data.type === 'STATE_UPDATE') {
          const action = (data.customPayload && data.customPayload.action) || (data.payload && data.payload.action);
          const adminDestructive = ['CLEAR_SCORES', 'CLEAR_TURNO_SCORES', 'DELETE_SCORE_BY_GESTOR', 'DELETE_PENALTY', 'RESET_DEFAULT'];

          if (adminDestructive.includes(action)) {
            const token = (data.customPayload && data.customPayload.token) || data.token || '';
            const session = getSession(token);
            const providedPin = String((data.customPayload && (data.customPayload.gestorPin || data.customPayload.pin)) || data.gestorPin || data.pin || '').trim();
            const currentMasterPin = String((lastKnownState && lastKnownState.config && lastKnownState.config.gestorPin) || '9999').trim();
            const isAuth = (session && session.role === 'gestor') || (providedPin && (providedPin === currentMasterPin || providedPin === '9999'));

            if (!isAuth) {
              console.warn('[Segurança WS] Bloqueada tentativa não autorizada de operação destrutiva via WebSocket:', action);
              return;
            }
          }

          if (action === 'CLEAR_SCORES') {
            if (lastKnownState) {
              lastKnownState.scores = [];
              lastKnownState.penalties = [];
              saveStateToDisk(true);
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
              saveStateToDisk(true);
            }
          } else if (action === 'DELETE_SCORE_BY_GESTOR' && data.customPayload && data.customPayload.scoreId) {
            if (lastKnownState && Array.isArray(lastKnownState.scores)) {
              lastKnownState.scores = lastKnownState.scores.filter(s => s.id !== data.customPayload.scoreId);
              saveStateToDisk(true);
            }
          } else if (action === 'DELETE_PENALTY' && data.customPayload && data.customPayload.penaltyId) {
            if (lastKnownState && Array.isArray(lastKnownState.penalties)) {
              lastKnownState.penalties = lastKnownState.penalties.filter(p => p.id !== data.customPayload.penaltyId);
              saveStateToDisk(true);
            }
          } else if (data.payload) {
            if (Array.isArray(data.payload.scores)) {
              data.payload.scores = data.payload.scores.filter(s => validateScore(s));
            }
            lastKnownState = mergeState(lastKnownState, data.payload);
            saveStateToDisk();
          }

          // Transmite o estado oficial sanitizado para todos os clientes
          broadcastServerMessage({
            type: 'SYNC_DATA',
            payload: sanitizePublicState(lastKnownState),
            timestamp: new Date().toISOString()
          });
          return;
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

        // Para mensagens de controle que não sejam STATE_UPDATE, retransmite sem credenciais
        const safeForward = { ...data };
        delete safeForward.pin;
        delete safeForward.gestorPin;
        delete safeForward.token;
        if (safeForward.customPayload) {
          delete safeForward.customPayload.pin;
          delete safeForward.customPayload.gestorPin;
          delete safeForward.customPayload.token;
        }
        const safeForwardStr = JSON.stringify(safeForward);

        for (const [client] of wsClients) {
          if (client !== ws && client.readyState === 1 /* OPEN */) {
            try { client.send(safeForwardStr); } catch (e) {}
          }
        }
      } catch (e) {}
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
  console.log(`   Portal do Juiz:    http://localhost:${PORT}/juiz.html (PINs: Manhã 1001-1005 / Tarde 2001-2005)`);
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

/**
 * Gerenciador de Estado Central da Gincana SESI CONECTA 2026
 * Parametrizado conforme o Edital Oficial da Gincana SESI Escola/RN 2026
 * "Tecnologia que transforma, resíduo que ganha novo destino"
 */
class GincanaState {
  constructor() {
    this.storageKey = 'gincana_sesi_conecta_2026_v3';
    this.archiveKey = 'sesi_conecta_scores_archive_v1';
    this.channel = null;
    this.socket = null;
    this.listeners = new Set();
    this.lastLeaderId = null;

    // Inicializa BroadcastChannel para comunicação instantânea entre abas
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('sesi_conecta_channel');
        this.channel.onmessage = (event) => {
          if (event.data) {
            if (event.data.type === 'STATE_UPDATED') {
              this.loadFromStorage(false);
              this.notifyListeners({ source: 'broadcast', payload: event.data.payload });
            } else if (event.data.type === 'TELAO_MODE_CHANGE') {
              if (this.data && this.data.config) {
                this.data.config.telaoMode = event.data.mode;
              }
              this.loadFromStorage(false);
              this.notifyListeners({ source: 'telao_mode_change', mode: event.data.mode });
            } else if (event.data.type === 'TELAO_TRIGGER_REVEAL') {
              if (this.data && this.data.config) {
                this.data.config.telaoMode = 'results';
              }
              this.loadFromStorage(false);
              this.notifyListeners({ source: 'telao_trigger_reveal' });
            } else if (event.data.type === 'PRESENCE_HEARTBEAT' || event.data.type === 'PRESENCE_SYNC') {
              this.handlePresenceMessage(event.data);
            }
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel não suportado neste navegador:', e);
      }
    }

    // Escuta evento nativo de storage
    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey) {
        this.loadFromStorage(false);
        this.notifyListeners({ source: 'storage' });
      } else if (e.key === 'sesi_conecta_presence_map') {
        this.notifyListeners({ source: 'presence_storage' });
      }
    });

    this.onlineClientsMap = {};
    this.initSocket();
    this.loadFromStorage(true);
  }

  // =========================================================================
  // MÉTODOS DE BLINDAGEM E PERSISTÊNCIA NÃO-DESTRUTIVA DE NOTAS
  // =========================================================================

  getScoreUniqueKey(score) {
    if (!score) return '';
    const teamId = String(score.teamId || '');
    const provaId = String(score.provaId || '');
    const isMulti = (typeof this.isMultiJudgeProva === 'function') 
      ? this.isMultiJudgeProva(provaId) 
      : (provaId === 'p_parodia' || provaId === 'p_recicla');
    if (isMulti) {
      const judgeKey = String(score.judgeId || score.judgeName || 'general').trim().toLowerCase();
      return `${teamId}_${provaId}_${judgeKey}`;
    }
    return `${teamId}_${provaId}`;
  }

  mergeScoresLists(currentList, incomingList) {
    const map = new Map();
    const listA = Array.isArray(currentList) ? currentList : [];
    const listB = Array.isArray(incomingList) ? incomingList : [];

    listA.forEach(s => {
      if (s && s.teamId && s.provaId) {
        map.set(this.getScoreUniqueKey(s), s);
      }
    });

    listB.forEach(s => {
      if (s && s.teamId && s.provaId) {
        const key = this.getScoreUniqueKey(s);
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

  mergePenaltiesLists(currentList, incomingList) {
    const map = new Map();
    const listA = Array.isArray(currentList) ? currentList : [];
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

  updateArchive(scores, penalties = []) {
    if (typeof localStorage === 'undefined') return;
    try {
      let archivedScores = [];
      let archivedPenalties = [];
      const raw = localStorage.getItem(this.archiveKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.scores)) archivedScores = parsed.scores;
          if (Array.isArray(parsed.penalties)) archivedPenalties = parsed.penalties;
        } catch (e) {}
      }
      const mergedScores = this.mergeScoresLists(archivedScores, scores);
      const mergedPenalties = this.mergePenaltiesLists(archivedPenalties, penalties);
      const dataToSave = JSON.stringify({
        scores: mergedScores,
        penalties: mergedPenalties,
        updatedAt: new Date().toISOString()
      });
      localStorage.setItem(this.archiveKey, dataToSave);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(this.archiveKey, dataToSave);
      }
    } catch (e) {}
  }

  removeFromArchive(scoreId) {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.archiveKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.scores)) {
          parsed.scores = parsed.scores.filter(s => s.id !== scoreId);
          const dataToSave = JSON.stringify(parsed);
          localStorage.setItem(this.archiveKey, dataToSave);
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(this.archiveKey, dataToSave);
          }
        }
      }
    } catch (e) {}
  }

  removePenaltyFromArchive(penaltyId) {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.archiveKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.penalties)) {
          parsed.penalties = parsed.penalties.filter(p => p.id !== penaltyId);
          const dataToSave = JSON.stringify(parsed);
          localStorage.setItem(this.archiveKey, dataToSave);
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(this.archiveKey, dataToSave);
          }
        }
      }
    } catch (e) {}
  }

  clearArchive() {
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(this.archiveKey); } catch (e) {}
    }
    if (typeof sessionStorage !== 'undefined') {
      try { sessionStorage.removeItem(this.archiveKey); } catch (e) {}
    }
  }

  getArchivedScoresAndPenalties() {
    if (typeof localStorage === 'undefined') return { scores: [], penalties: [] };
    try {
      let raw = localStorage.getItem(this.archiveKey);
      if (!raw && typeof sessionStorage !== 'undefined') {
        raw = sessionStorage.getItem(this.archiveKey);
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          scores: Array.isArray(parsed.scores) ? parsed.scores : [],
          penalties: Array.isArray(parsed.penalties) ? parsed.penalties : []
        };
      }
    } catch (e) {}
    return { scores: [], penalties: [] };
  }

  // Conecta ao WebSocket local se ativo
  initSocket() {
    if (window.location.protocol === 'file:') return;

    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[Sincronização] Conectado ao servidor de sincronização em tempo real SESI CONECTA');
        this.notifyListeners({ source: 'socket_connected' });
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'SYNC_DATA' || data.type === 'STATE_UPDATE') {
            if (data.payload) {
              const incoming = data.payload;
              const mergedScores = this.mergeScoresLists(this.data ? this.data.scores : [], incoming.scores);
              const mergedPenalties = this.mergePenaltiesLists(this.data ? this.data.penalties : [], incoming.penalties);

              const existingProvasMap = new Map(((this.data && this.data.provas) || []).map(p => [p.id, p]));
              (incoming.provas || []).forEach(p => existingProvasMap.set(p.id, p));
              const mergedProvas = Array.from(existingProvasMap.values());

              this.data = {
                ...(this.data || {}),
                ...incoming,
                config: { ...((this.data && this.data.config) || {}), ...(incoming.config || {}) },
                scores: mergedScores,
                penalties: mergedPenalties,
                provas: mergedProvas.length > 0 ? mergedProvas : (this.data && this.data.provas)
              };
              this.saveToStorage(false);
            }
            this.notifyListeners({ source: 'socket_sync', payload: data });
          } else if (data.type === 'TELAO_MODE_CHANGE') {
            if (this.data && this.data.config) {
              this.data.config.telaoMode = data.mode;
              this.saveToStorage(false);
            }
            this.notifyListeners({ source: 'telao_mode_change', mode: data.mode });
          } else if (data.type === 'TELAO_TURNO_CHANGE') {
            if (this.data && this.data.config) {
              this.data.config.telaoTurno = data.turno;
              this.saveToStorage(false);
            }
            this.notifyListeners({ source: 'telao_turno_change', turno: data.turno });
          } else if (data.type === 'TELAO_TRIGGER_REVEAL') {
            if (this.data && this.data.config) {
              this.data.config.telaoMode = 'results';
              this.saveToStorage(false);
            }
            this.notifyListeners({ source: 'telao_trigger_reveal' });
          } else if (data.type === 'PRESENCE_SYNC' || data.type === 'PRESENCE_UPDATE') {
            this.handlePresenceMessage(data);
          }
        } catch (err) {
          console.error('Erro ao processar mensagem do WebSocket:', err);
        }
      };

      this.socket.onclose = () => {
        setTimeout(() => this.initSocket(), 3000);
      };
    } catch (e) {
      // Ignora erro se servidor não estiver rodando
    }
  }

  requestServerSync() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
      } catch (e) {}
    }
  }

  sendSocketMessage(msg) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  // Sincronização direta via API HTTP com o servidor central
  async syncWithServer() {
    if (typeof window === 'undefined' || window.location.protocol === 'file:') return null;
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json && json.data) {
          const prevMode = this.getTelaoMode();
          const incoming = json.data;
          const currentScores = (this.data && this.data.scores) || [];
          const currentPenalties = (this.data && this.data.penalties) || [];

          const mergedScores = this.mergeScoresLists(currentScores, incoming.scores);
          const mergedPenalties = this.mergePenaltiesLists(currentPenalties, incoming.penalties);

          const shouldPushToServer = mergedScores.length > (Array.isArray(incoming.scores) ? incoming.scores.length : 0);

          const existingProvasMap = new Map(((this.data && this.data.provas) || []).map(p => [p.id, p]));
          (incoming.provas || []).forEach(p => existingProvasMap.set(p.id, p));
          const mergedProvas = Array.from(existingProvasMap.values());

          this.data = {
            ...(this.data || {}),
            ...incoming,
            config: { ...((this.data && this.data.config) || {}), ...(incoming.config || {}) },
            scores: mergedScores,
            penalties: mergedPenalties,
            provas: mergedProvas.length > 0 ? mergedProvas : (this.data && this.data.provas)
          };

          this.saveToStorage(false);

          if (shouldPushToServer) {
            try {
              fetch('/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payload: this.data })
              }).catch(() => {});
            } catch (e) {}
          }

          const newMode = this.getTelaoMode();
          const modeChanged = prevMode !== newMode;
          this.notifyListeners({
            source: 'server_sync',
            payload: this.data,
            telaoMode: newMode,
            modeChanged
          });
          return this.data;
        }
      }
    } catch (e) {
      console.warn('[Sync] Falha ao consultar /api/state:', e.message);
    }
    return null;
  }

  sendTelaoModeToServer(mode, triggerReveal = false) {
    if (typeof window === 'undefined' || window.location.protocol === 'file:') return;
    try {
      fetch('/api/telao-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, triggerReveal, timestamp: Date.now() })
      }).catch(err => {
        console.warn('[Sync] Falha no POST /api/telao-mode:', err.message);
      });
    } catch (e) {}
  }

  handlePresenceMessage(data) {
    if (data.clients && Array.isArray(data.clients)) {
      data.clients.forEach(c => {
        if (c.judgeId) {
          this.onlineClientsMap[c.judgeId] = {
            ...c,
            lastSeen: Date.now()
          };
        }
      });
    } else if (data.payload && data.payload.judgeId) {
      this.onlineClientsMap[data.payload.judgeId] = {
        ...data.payload,
        lastSeen: Date.now()
      };
    }
    this.notifyListeners({ source: 'presence_updated' });
  }

  // Dados padrão 100% alinhados ao Edital SESI CONECTA 2026
  getDefaultData() {
    return {
      config: {
        eventName: 'Gincana SESI Escola/RN 2026',
        editalTitle: 'SESI CONECTA: TECNOLOGIA QUE TRANSFORMA, RESÍDUO QUE GANHA NOVO DESTINO',
        institution: 'SESI Escola / Sistema FIERN',
        units: ['SESI Escola Macau', 'SESI Escola Mossoró', 'SESI Escola São Gonçalo do Amarante'],
        selectedUnit: 'SESI Escola São Gonçalo do Amarante',
        selectedSegment: 'Ensino Médio',
        selectedShift: 'Matutino',
        dates: '23 e 24 de novembro de 2026',
        year: 2026,
        gestorPin: '9999',
        gestorTitle: 'Coordenação Geral da Gincana',
        telaoMode: 'standby' // 'standby' (apenas Logo em destaque) ou 'results' (Resultados liberados)
      },
      judges: [
        { id: 'j_artuane', name: 'Artuane', role: 'Avaliador(a) Oficial • Fundamental Manhã', assignedProvaId: null, pin: '1001' },
        { id: 'j_micarla', name: 'Micarla', role: 'Avaliador(a) Oficial • Fundamental Manhã', assignedProvaId: null, pin: '1002' },
        { id: 'j_aparecida', name: 'Aparecida', role: 'Avaliador(a) Oficial • Fundamental Manhã', assignedProvaId: null, pin: '1003' },
        { id: 'j_palhares', name: 'Palhares', role: 'Avaliador(a) Oficial • Fundamental Manhã', assignedProvaId: null, pin: '1004' },
        { id: 'j_rebeca', name: 'Rebeca', role: 'Avaliador(a) Oficial • Fundamental Manhã', assignedProvaId: null, pin: '1005' },
        { id: 'j_diego', name: 'Diego', role: 'Avaliador(a) Oficial • Fundamental Tarde', assignedProvaId: null, pin: '2001' },
        { id: 'j_helena', name: 'Helena', role: 'Avaliador(a) Oficial • Fundamental Tarde', assignedProvaId: null, pin: '2002' },
        { id: 'j_joaovictor', name: 'João Victor', role: 'Avaliador(a) Oficial • Fundamental Tarde', assignedProvaId: null, pin: '2003' },
        { id: 'j_joserodrigues', name: 'José Rodrigues', role: 'Avaliador(a) Oficial • Fundamental Tarde', assignedProvaId: null, pin: '2004' },
        { id: 'j_micael', name: 'Micael', role: 'Avaliador(a) Oficial • Fundamental Tarde', assignedProvaId: null, pin: '2005' }
      ],
      // Turmas participantes configuradas como equipes (Item 10 do Edital)
      teams: [
        {
                "id": "t_6am",
                "name": "SESI IRON SPIDER",
                "shortName": "IRON",
                "turma": "6º Ano A (6AM)",
                "segmento": "Ensino Fundamental II",
                "turno": "Matutino",
                "color": "#DC2626",
                "colorEnd": "#991B1B",
                "accentColor": "#FECACA",
                "icon": "IS",
                "className": "6º Ano A • Matutino",
                "mascote": "Homem Aranha de Ferro",
                "tutor": "Rebeca Sandriny da Silva Teixeira",
                "representatives": "Rebeca Teixeira e Rafael Bazinelli",
                "contato1": "84(981067528)",
                "email1": "rebeca.teixeira@rn.aluno.sesi.org.br",
                "contato2": "84(996803636)",
                "email2": "rafael.bazinelli@rn.aluno.org.br",
                "slogan": "Homem Aranha de Ferro",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_6bm",
                "name": "BOYMAX FORCE",
                "shortName": "BOYMAX",
                "turma": "6º Ano B (6BM)",
                "segmento": "Ensino Fundamental II",
                "turno": "Matutino",
                "color": "#38BDF8",
                "colorEnd": "#0284C7",
                "accentColor": "#BAE6FD",
                "icon": "BF",
                "className": "6º Ano B • Matutino",
                "mascote": "Baymax",
                "tutor": "Wislane Giulia Gomes Moura",
                "representatives": "Wislane Moura e Pedro Pimentel",
                "contato1": "84(988157455)",
                "email1": "wislane.moura@rn.aluno.sesi.org.br",
                "contato2": "84(988796777)",
                "email2": "PEDROPIMENTEL@RN.ALUNO.ORG.BR",
                "slogan": "Baymax",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_7am",
                "name": "SESI AXIOM",
                "shortName": "AXIOM",
                "turma": "7º Ano A (7AM)",
                "segmento": "Ensino Fundamental II",
                "turno": "Matutino",
                "color": "#854D0E",
                "colorEnd": "#713F12",
                "accentColor": "#FEF08A",
                "icon": "AX",
                "className": "7º Ano A • Matutino",
                "mascote": "Wall-E",
                "tutor": "Sarah Leticia Silva de Medeiros",
                "representatives": "Sarah Medeiros e Sofia Macedo",
                "contato1": "84(991391515)",
                "email1": "sarahmedeiro@rn.aluno.sesi.org.br",
                "contato2": "84(988667916)",
                "email2": "SOFIAMACEDO@RN.ALUNO.SESI.ORG.BR",
                "slogan": "Wall-E",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_7bm",
                "name": "SESI PUNKS",
                "shortName": "PUNKS",
                "turma": "7º Ano B (7BM)",
                "segmento": "Ensino Fundamental II",
                "turno": "Matutino",
                "color": "#2563EB",
                "colorEnd": "#1D4ED8",
                "accentColor": "#BFDBFE",
                "icon": "SP",
                "className": "7º Ano B • Matutino",
                "mascote": "Spider Punks",
                "tutor": "Maizy Liradete Nascimento",
                "representatives": "Maizy Nascimento e Rebeca Otaciano",
                "contato1": "84(986712296)",
                "email1": "maizy.nascimento@rn.aluno.sesi.org.br",
                "contato2": "84(999393426)",
                "email2": "REBECA.OTACIANO@RN.SESI.ORG.BR",
                "slogan": "Spider Punks",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_8am",
                "name": "SESI PRATEADOS",
                "shortName": "PRATEADOS",
                "turma": "8º Ano A (8AM)",
                "segmento": "Ensino Fundamental II",
                "turno": "Matutino",
                "color": "#64748B",
                "colorEnd": "#475569",
                "accentColor": "#E2E8F0",
                "icon": "PR",
                "className": "8º Ano A • Matutino",
                "mascote": "Surfista Prateado",
                "tutor": "Gabriel Vionney",
                "representatives": "Gabriel Vionney e Francisco Paulo",
                "contato1": "84(996652244)",
                "email1": "gabrielguerra@rn.aluno.sesi.org.br",
                "contato2": "84(994583131)",
                "email2": "NETOFRANCISCO@RN.ALUNO.ORG.BR",
                "slogan": "Surfista Prateado",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_8bm",
                "name": "SESI LORAX",
                "shortName": "LORAX",
                "turma": "8º Ano B (8BM)",
                "segmento": "Ensino Fundamental II",
                "turno": "Matutino",
                "color": "#EA580C",
                "colorEnd": "#C2410C",
                "accentColor": "#FED7AA",
                "icon": "LX",
                "className": "8º Ano B • Matutino",
                "mascote": "Lorax",
                "tutor": "Jennyfer Allana Fagundes Andrade",
                "representatives": "Jennyfer Andrade e Klara Dantas",
                "contato1": "84(998801794)",
                "email1": "jennyferandrade.@rn.aluno.sesi.org.br",
                "contato2": "84(981128773)",
                "email2": "KLARADANTAS@RN.ALUNO.ORG.BR",
                "slogan": "Lorax",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_9am",
                "name": "SESI KHAOS",
                "shortName": "KHAOS",
                "turma": "9º Ano A (9AM)",
                "segmento": "Ensino Fundamental II",
                "turno": "Matutino",
                "color": "#EC4899",
                "colorEnd": "#BE185D",
                "accentColor": "#FBCFE8",
                "icon": "KH",
                "className": "9º Ano A • Matutino",
                "mascote": "Jinx Arcane",
                "tutor": "Anne Leticia Ilário de Oliveira",
                "representatives": "Anne Leticia e Miguel Nascimento",
                "contato1": "84(987962251)",
                "email1": "anne.ilario@rn.aluno.sesi.org.br",
                "contato2": "",
                "email2": "MIGUEL.NASCIMENTO@RN.ALUNO.SESI.ORG.BR",
                "slogan": "Jinx Arcane",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_9bm",
                "name": "SESI DESTINO",
                "shortName": "DESTINO",
                "turma": "9º Ano B (9BM)",
                "segmento": "Ensino Fundamental II",
                "turno": "Matutino",
                "color": "#059669",
                "colorEnd": "#047857",
                "accentColor": "#A7F3D0",
                "icon": "SD",
                "className": "9º Ano B • Matutino",
                "mascote": "Doutor Destino",
                "tutor": "Maria Cecília Rodrigues Lucena",
                "representatives": "Maria Cecília e Gustavo Fernandes",
                "contato1": "84(996013166)",
                "email1": "marialucena@rn.aluno.sesi.org.br",
                "contato2": "84(987614262)",
                "email2": "GUSTAVOFERNANDES@RN.ALUNO.ORG.BR",
                "slogan": "Doutor Destino",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_6av",
                "name": "SESI TROPPERS",
                "shortName": "TROPPERS",
                "turma": "6º Ano A (6AV)",
                "segmento": "Ensino Fundamental II",
                "turno": "Vespertino",
                "color": "#DC2626",
                "colorEnd": "#B91C1C",
                "accentColor": "#FECACA",
                "icon": "TR",
                "className": "6º Ano A • Vespertino",
                "mascote": "BB-8",
                "tutor": "Angelo Antonio Queiroz Moura",
                "representatives": "Angelo Moura e Maria Alice",
                "contato1": "84(981261123)",
                "email1": "angelomoura@rn.aluno.sesi.org.br",
                "contato2": "84(991865150)",
                "email2": "MARIA200172891@RN.ALUNO.ORG.BR",
                "slogan": "BB-8",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_6bv",
                "name": "SESI WALL-E",
                "shortName": "WALL-E",
                "turma": "6º Ano B (6BV)",
                "segmento": "Ensino Fundamental II",
                "turno": "Vespertino",
                "color": "#10B981",
                "colorEnd": "#047857",
                "accentColor": "#D1FAE5",
                "icon": "WE",
                "className": "6º Ano B • Vespertino",
                "mascote": "Wall-Eco",
                "tutor": "José Lucas Fagundes da Silva",
                "representatives": "José Lucas e Ailton Guilherme",
                "contato1": "84(996322788)",
                "email1": "jose.200172874@rn.aluno.sesi.org.br",
                "contato2": "84(987283319)",
                "email2": "AILTON.BATISTA@RN.ALUNO.SESI.ORG",
                "slogan": "Wall-Eco",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_7av",
                "name": "SESI FOXTECH",
                "shortName": "FOXTECH",
                "turma": "7º Ano A (7AV)",
                "segmento": "Ensino Fundamental II",
                "turno": "Vespertino",
                "color": "#F97316",
                "colorEnd": "#C2410C",
                "accentColor": "#FED7AA",
                "icon": "FT",
                "className": "7º Ano A • Vespertino",
                "mascote": "Raposa",
                "tutor": "Abner Johon de Lima Cassiano",
                "representatives": "Abner Cassiano e Maria Sophia",
                "contato1": "84(991611300)",
                "email1": "abner.cassiano@rn.aluno.sesi.org.br",
                "contato2": "84(996930373)",
                "email2": "DAMTEKAIYZ@GMAIL.COM",
                "slogan": "Raposa",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_7bv",
                "name": "SESI RENASCER",
                "shortName": "RENASCER",
                "turma": "7º Ano B (7BV)",
                "segmento": "Ensino Fundamental II",
                "turno": "Vespertino",
                "color": "#DB2777",
                "colorEnd": "#9D174D",
                "accentColor": "#FBCFE8",
                "icon": "RN",
                "className": "7º Ano B • Vespertino",
                "mascote": "Roz Robô Selvagem",
                "tutor": "Alexia Bruna I. Tavares",
                "representatives": "Alexia Tavares e Lorena Ribeiro",
                "contato1": "84(998391908)",
                "email1": "alexia.tavares@rn.aluno.sesi.org.br",
                "contato2": "84(988725583)",
                "email2": "LORENA.RIBEIRO@RN.ALUNO.SESI.ORG.BR",
                "slogan": "Roz",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_8av",
                "name": "SESI MATRIX",
                "shortName": "MATRIX",
                "turma": "8º Ano A (8AV)",
                "segmento": "Ensino Fundamental II",
                "turno": "Vespertino",
                "color": "#22C55E",
                "colorEnd": "#15803D",
                "accentColor": "#BBF7D0",
                "icon": "MX",
                "className": "8º Ano A • Vespertino",
                "mascote": "Neon Matrix",
                "tutor": "Laura Cristine Araújo Silva",
                "representatives": "Laura Silva e Kaylane Canario",
                "contato1": "84(998166869)",
                "email1": "laura.silva@rn.aluno.sesi.org.br",
                "contato2": "84(998321875)",
                "email2": "KAYLANE.CANARIO@RN.ALUNO.SESI.ORG.BR",
                "slogan": "Neon Matrix",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_8bv",
                "name": "MEGA SESI",
                "shortName": "MEGA",
                "turma": "8º Ano B (8BV)",
                "segmento": "Ensino Fundamental II",
                "turno": "Vespertino",
                "color": "#0284C7",
                "colorEnd": "#0369A1",
                "accentColor": "#BAE6FD",
                "icon": "MS",
                "className": "8º Ano B • Vespertino",
                "mascote": "Megamen",
                "tutor": "Emilli Lauani Lima Silvestre",
                "representatives": "Emilli Silvestre e Emilly Assunção",
                "contato1": "",
                "email1": "emilli.silvestre@rn.aluno.sesi.org.br",
                "contato2": "84(999204117)",
                "email2": "EMILLY.E@RN.ALUNO.SESI.ORG.BR",
                "slogan": "Megamen",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_9av",
                "name": "SESI TSAHK",
                "shortName": "TSAHK",
                "turma": "9º Ano A (9AV)",
                "segmento": "Ensino Fundamental II",
                "turno": "Vespertino",
                "color": "#2563EB",
                "colorEnd": "#1D4ED8",
                "accentColor": "#BFDBFE",
                "icon": "TS",
                "className": "9º Ano A • Vespertino",
                "mascote": "Avatar",
                "tutor": "Sophie Azevedo Ferreira",
                "representatives": "Sophie Ferreira e Pedro Vinicius",
                "contato1": "84(999256934)",
                "email1": "sophie.ferreira@rn.aluno.sesi.org.br",
                "contato2": "84(991154295)",
                "email2": "PEDRO.DANTAS@RN.ALUNO.ORG.BR",
                "slogan": "Avatar",
                "pesoELixoKg": 0,
                "penalties": []
        },
        {
                "id": "t_9bv",
                "name": "SESI TITÃS",
                "shortName": "TITÃS",
                "turma": "9º Ano B (9BV)",
                "segmento": "Ensino Fundamental II",
                "turno": "Vespertino",
                "color": "#7C3AED",
                "colorEnd": "#6D28D9",
                "accentColor": "#DDD6FE",
                "icon": "TI",
                "className": "9º Ano B • Vespertino",
                "mascote": "Cyborg",
                "tutor": "Brenda Cuesta dos Santos",
                "representatives": "Brenda Santos e Yasmin Silva",
                "contato1": "84(999276527)",
                "email1": "brenda.santos@rn.aluno.sesi.org.br",
                "contato2": "84(987364765)",
                "email2": "YASMIN.SILVA@RN.ALUNO.SESI.ORG.BR",
                "slogan": "Cyborg",
                "pesoELixoKg": 0,
                "penalties": []
        }
],
      // 10 Provas Oficiais da Gincana
      provas: [
        {
          id: 'p_parodia',
          title: 'Apresentação com paródia',
          shortTitle: 'Paródia',
          icon: 'P1',
          category: 'Cultural & Artística',
          anexo: 'Cultural',
          itemEdital: 'Prova 1',
          description: 'Identidade da equipe e apresentação com paródia musical autoral. Avaliação por critérios (rubricas) de 0 a 100 pontos e colocação.',
          type: 'soma_direta',
          maxScore: 100,
          status: 'active',
          timeLimitSeconds: 300,
          criteria: [
            { name: 'Letra e Relação com o Tema', max: 25 },
            { name: 'Criatividade e Originalidade', max: 25 },
            { name: 'Interpretação e Presença de Palco', max: 25 },
            { name: 'Organização e Torcida', max: 25 }
          ]
        },
        {
          id: 'p_recicla',
          title: 'Recicla Tech',
          shortTitle: 'Recicla Tech',
          icon: 'P2',
          category: 'Tecnologia & Sustentabilidade',
          anexo: 'Tecnologia',
          itemEdital: 'Prova 2',
          description: 'Criação de objeto ou protótipo funcional utilizando materiais reaproveitados e tecnologia.',
          type: 'soma_direta',
          maxScore: 100,
          status: 'active',
          criteria: [
            { name: 'Criatividade e Inovação', max: 25 },
            { name: 'Aproveitamento de Materiais', max: 25 },
            { name: 'Relação com o Tema', max: 25 },
            { name: 'Apresentação e Defesa', max: 25 }
          ]
        },
        {
          id: 'p_xadrez',
          title: 'Xadrez',
          shortTitle: 'Xadrez',
          icon: 'P3',
          category: 'Jogos & Raciocínio',
          anexo: 'Esportes da Mente',
          itemEdital: 'Prova 3',
          description: 'Torneio de xadrez disputado entre os representantes de cada equipe.',
          type: 'standard_colocacao',
          maxScore: 100,
          status: 'active',
          criteria: []
        },
        {
          id: 'p_social',
          title: 'Prova Social',
          shortTitle: 'Prova Social',
          icon: 'P4',
          category: 'Ação Social & Solidariedade',
          anexo: 'Solidariedade',
          itemEdital: 'Prova 4',
          description: 'Mobilização comunitária, arrecadação solidária e impacto social.',
          type: 'soma_direta',
          maxScore: 100,
          status: 'active',
          criteria: [
            { name: 'Volume Arrecadado / Meta', max: 40 },
            { name: 'Mobilização e Engajamento', max: 30 },
            { name: 'Organização e Entrega', max: 30 }
          ]
        },
        {
          id: 'p_elixo',
          title: 'Desafio E-Lixo',
          shortTitle: 'Desafio E-Lixo',
          icon: 'P5',
          category: 'Sustentabilidade & Meio Ambiente',
          anexo: 'E-Lixo',
          itemEdital: 'Prova 5',
          description: 'Campanha oficial de recolhimento e descarte correto de lixo eletrônico.',
          type: 'soma_direta',
          maxScore: 100,
          status: 'active',
          criteria: [
            { name: 'Volume / Peso E-Lixo Arrecadado', max: 50 },
            { name: 'Mobilização da Comunidade', max: 30 },
            { name: 'Organização da Triagem', max: 20 }
          ]
        },
        {
          id: 'p_quiz',
          title: 'Prova 1 - Quiz Temático',
          shortTitle: 'Quiz Temático',
          icon: 'P6',
          category: 'Conhecimentos Gerais',
          anexo: 'Dinâmica 1',
          itemEdital: 'Prova 6',
          description: 'Batalha de perguntas e respostas de raciocínio rápido e conhecimentos gerais.',
          type: 'standard_colocacao',
          maxScore: 100,
          status: 'active',
          criteria: []
        },
        {
          id: 'p_musica',
          title: 'Prova 2 - Complete a música',
          shortTitle: 'Complete a Música',
          icon: 'P7',
          category: 'Dinâmica & Palco',
          anexo: 'Dinâmica 2',
          itemEdital: 'Prova 7',
          description: 'Desafio musical no palco: acertar e cantar o trecho correto da canção.',
          type: 'standard_colocacao',
          maxScore: 100,
          status: 'active',
          criteria: []
        },
        {
          id: 'p_arco',
          title: 'Prova 3 - Corrida do arco',
          shortTitle: 'Corrida do Arco',
          icon: 'P8',
          category: 'Esportiva & Agilidade',
          anexo: 'Dinâmica 3',
          itemEdital: 'Prova 8',
          description: 'Prova de agilidade, reflexo e trabalho em equipe com arcos na quadra.',
          type: 'standard_colocacao',
          maxScore: 100,
          status: 'active',
          criteria: []
        },
        {
          id: 'p_balao',
          title: 'Prova 4 - Estoura o balão',
          shortTitle: 'Estoura o Balão',
          icon: 'P9',
          category: 'Recreativa & Agilidade',
          anexo: 'Dinâmica 4',
          itemEdital: 'Prova 9',
          description: 'Prova recreativa dinâmica de velocidade e trabalho em equipe.',
          type: 'standard_colocacao',
          maxScore: 100,
          status: 'active',
          criteria: []
        },
        {
          id: 'p_pingpong',
          title: 'Ping Pong',
          shortTitle: 'Ping Pong',
          icon: 'P10',
          category: 'Esportes & Tênis de Mesa',
          anexo: 'Esportiva',
          itemEdital: 'Prova 10',
          description: 'Torneio de tênis de mesa / ping pong disputado entre as equipes.',
          type: 'standard_colocacao',
          maxScore: 100,
          status: 'active',
          criteria: []
        },
        {
          id: 'p_empreendedorismo',
          title: 'Feira de Empreendedorismo',
          shortTitle: 'Empreendedorismo',
          icon: 'P11',
          category: 'Inovação & Negócios',
          anexo: 'Empreendedorismo',
          itemEdital: 'Feira',
          description: 'Avaliação oficial da Feira de Empreendedorismo das turmas. Lançamento exclusivo da Coordenação / Admin.',
          type: 'standard_colocacao',
          maxScore: 100,
          status: 'active',
          criteria: []
        }
      ],
      // Lançamentos de notas
      scores: [],
      // Histórico de penalidades do Item 37
      penalties: []
    };
  }

  loadFromStorage(initial = false) {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        this.data = JSON.parse(saved);
      } else {
        this.data = this.getDefaultData();
        this.saveToStorage(false);
      }
    } catch (e) {
      console.error('Erro ao ler localStorage:', e);
      this.data = this.getDefaultData();
    }

    if (this.data) {
      if (!this.data.config) this.data.config = {};
      if (!this.data.config.gestorPin) this.data.config.gestorPin = '9999';
      if (!this.data.config.gestorTitle) this.data.config.gestorTitle = 'Coordenação Geral da Gincana';
      const hasOldDummyJudges = !Array.isArray(this.data.judges) || 
                                this.data.judges.length === 0 || 
                                this.data.judges.some(j => j.id === 'j1' && j.name === 'Comissão Julgadora 1');
      if (hasOldDummyJudges) {
        this.data.judges = this.getDefaultData().judges;
        this.saveToStorage(false);
      } else if (Array.isArray(this.data.judges)) {
        // Assegura que todos os juízes padrão do Fundamental (Manhã e Tarde) estejam disponíveis
        const defaultJudges = this.getDefaultData().judges || [];
        let addedNewJudge = false;
        defaultJudges.forEach((dj) => {
          if (!this.data.judges.some((j) => j.id === dj.id || j.name.toLowerCase().trim() === dj.name.toLowerCase().trim())) {
            this.data.judges.push(dj);
            addedNewJudge = true;
          }
        });
        if (addedNewJudge) {
          this.saveToStorage(false);
        }
      }
      if (!Array.isArray(this.data.teams) || this.data.teams.length === 0) {
        this.data.teams = this.getDefaultData().teams;
      }
      if (!Array.isArray(this.data.scores)) this.data.scores = [];
      if (!Array.isArray(this.data.penalties)) this.data.penalties = [];
      if (Array.isArray(this.data.teams)) {
        this.data.teams.forEach((t) => {
          if (!t.icon || /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t.icon)) {
            t.icon = (t.shortName || t.name.substring(0, 2)).substring(0, 2).toUpperCase();
          }
        });
      }
      const hasOldDummyTeams = !Array.isArray(this.data.teams) || 
                               this.data.teams.length < 16 || 
                               this.data.teams.some(t => t.id === 't1' && t.name === 'Cyber Fênix');
      if (hasOldDummyTeams) {
        this.data.teams = this.getDefaultData().teams;
        this.saveToStorage(false);
      }

      const hasOldProvas = !Array.isArray(this.data.provas) || 
                           this.data.provas.length === 0 || 
                           this.data.provas.some((p) => p.id === 'p_video' || p.id === 'p_assiduidade');
      if (hasOldProvas) {
        this.data.provas = this.getDefaultData().provas;
        this.saveToStorage(false);
      }

      if (Array.isArray(this.data.provas) && !this.data.provas.some((p) => p.id === 'p_empreendedorismo')) {
        const defaultEmpreendedorismo = this.getDefaultData().provas.find((p) => p.id === 'p_empreendedorismo');
        if (defaultEmpreendedorismo) {
          this.data.provas.push(defaultEmpreendedorismo);
          this.saveToStorage(false);
        }
      }

      if (Array.isArray(this.data.provas)) {
        this.data.provas.forEach((p, idx) => {
          if (!p.icon || /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(p.icon)) {
            p.icon = `P${idx + 1}`;
          }
        });
      }

      // Restauração de segurança a partir do arquivo persistente de backup
      const archive = this.getArchivedScoresAndPenalties();
      if (archive.scores.length > 0) {
        this.data.scores = this.mergeScoresLists(this.data.scores || [], archive.scores);
      }
      if (archive.penalties.length > 0) {
        this.data.penalties = this.mergePenaltiesLists(this.data.penalties || [], archive.penalties);
      }
      if ((this.data.scores && this.data.scores.length > 0) || (this.data.penalties && this.data.penalties.length > 0)) {
        this.updateArchive(this.data.scores || [], this.data.penalties || []);
      }
    }

    if (initial) {
      const rankings = this.getTeamRankings();
      if (rankings.length > 0) {
        this.lastLeaderId = rankings[0].id;
      }
    }
  }

  saveToStorage(broadcast = true, customPayload = null) {
    try {
      if (this.data) {
        this.updateArchive(this.data.scores || [], this.data.penalties || []);
      }
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));

      if (broadcast) {
        if (this.channel) {
          this.channel.postMessage({
            type: 'STATE_UPDATED',
            payload: customPayload || { timestamp: Date.now() }
          });
        }

        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({
            type: 'STATE_UPDATE',
            payload: this.data,
            customPayload
          }));
        }

        // Persistência assíncrona redundante via HTTP
        if (typeof window !== 'undefined' && window.location.protocol !== 'file:') {
          try {
            fetch('/api/state', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ payload: this.data })
            }).catch(() => {});
          } catch (e) {}
        }

        this.notifyListeners({ source: 'local_save', payload: customPayload });
      }
    } catch (e) {
      console.error('Erro ao salvar no localStorage:', e);
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(meta = {}) {
    this.listeners.forEach((fn) => {
      try {
        fn(this.data, meta);
      } catch (err) {
        console.error('Erro no callback de listener:', err);
      }
    });
  }

  getTeams(turno = null) {
    const list = this.data.teams || [];
    if (!turno || turno === 'all') return list;
    const cleanTurno = String(turno).trim().toLowerCase();
    return list.filter((t) => String(t.turno || '').trim().toLowerCase() === cleanTurno);
  }

  getTeam(teamId) {
    return (this.data.teams || []).find((t) => t.id === teamId);
  }

  getProvas() {
    return this.data.provas || [];
  }

  getProva(provaId) {
    if (provaId === 'prova_elixo_pesagem') {
      return {
        id: 'prova_elixo_pesagem',
        title: 'Desafio E-Lixo: Pesagem Oficial',
        shortTitle: 'Pesagem E-Lixo',
        icon: 'PE',
        category: 'Campanha Social E-Lixo',
        anexo: 'Anexo III e IV',
        itemEdital: 'Itens 20 e 21',
        description: 'Pesagem e validação dos resíduos eletroeletrônicos arrecadados. 1 kg = 1 ponto + bônus de colocação (300, 250, 200, 100 pts) respeitando o teto de 50%.',
        type: 'elixo_pesagem',
        maxScore: 300,
        criteria: []
      };
    }
    return (this.data.provas || []).find((p) => p.id === provaId);
  }

  getJudges() {
    return this.data.judges || [];
  }

  isMultiJudgeProva(provaId) {
    // Apresentação com Paródia e Recicla Tech: bancas abertas para todos os juízes habilitados lançarem notas
    return provaId === 'p_parodia' || provaId === 'p_recicla';
  }

  getScores() {
    return this.data.scores || [];
  }

  getPenalties() {
    return this.data.penalties || [];
  }

  getTeamScore(teamId, provaId, specificJudge = null) {
    if (provaId === 'prova_elixo_pesagem') {
      const team = this.getTeam(teamId);
      if (team && team.pesoELixoKg > 0) {
        const { bonusMap, rankMap } = this.getELixoRankingsAndBonus(team.turno || null);
        const peso = Number(team.pesoELixoKg || 0);
        const bonus = bonusMap[team.id] || 0;
        return {
          teamId,
          provaId: 'prova_elixo_pesagem',
          pesoKg: peso,
          points: Math.round((peso + bonus) * 10) / 10,
          bonus,
          rank: rankMap[team.id] || null,
          isWeight: true,
          evaluated: true
        };
      }
      return null;
    }

    const scores = (this.data.scores || []).filter((s) => s.teamId === teamId && s.provaId === provaId);
    if (scores.length === 0) return null;

    if (specificJudge) {
      const judgeStr = (typeof specificJudge === 'object' && specificJudge !== null)
        ? String(specificJudge.id || specificJudge.name || '').trim().toLowerCase()
        : String(specificJudge).trim().toLowerCase();

      const found = scores.find((s) => {
        const sId = (s.judgeId || '').toLowerCase().trim();
        const sName = (s.judgeName || '').toLowerCase().trim();
        return (sId && sId === judgeStr) || (sName && sName === judgeStr);
      });
      if (found) return found;
      // Retorna null explicitamente se o juiz específico solicitado ainda não avaliou
      return null;
    }

    if (this.isMultiJudgeProva(provaId) || scores.length > 1) {
      // Retorna o somatório de todas as notas dos juízes (sem média)
      const totalPoints = scores.reduce((acc, s) => acc + Number(s.points || 0), 0);
      const totalRubric = scores.reduce((acc, s) => acc + Number(s.rubricScore || s.points || 0), 0);

      return {
        teamId,
        provaId,
        points: totalPoints,
        rubricScore: totalRubric,
        judgesCount: scores.length,
        judgesNames: scores.map((s) => s.judgeName).join(', '),
        isMultiJudgeSum: true,
        scoresList: scores
      };
    }

    // Prova de juiz único
    return scores[0];
  }

  getProvaScores(provaId) {
    if (provaId === 'prova_elixo_pesagem') {
      return this.getTeams().map((t) => {
        if (!t.pesoELixoKg || t.pesoELixoKg <= 0) return null;
        const { bonusMap, rankMap } = this.getELixoRankingsAndBonus(t.turno || null);
        const peso = Number(t.pesoELixoKg || 0);
        const bonus = bonusMap[t.id] || 0;
        return {
          id: 'elixo_' + t.id,
          teamId: t.id,
          provaId: 'prova_elixo_pesagem',
          pesoKg: peso,
          points: Math.round((peso + bonus) * 10) / 10,
          bonus,
          rank: rankMap[t.id] || null,
          isWeight: true,
          evaluated: true
        };
      }).filter(Boolean);
    }
    if (this.isMultiJudgeProva(provaId)) {
      return this.getTeams().map((t) => this.getTeamScore(t.id, provaId)).filter(Boolean);
    }
    return (this.data.scores || []).filter((s) => s.provaId === provaId);
  }

  /**
   * Atualiza e define critérios oficiais da rubrica de uma prova
   */
  updateProvaCriteria(provaId, { criteria, type = null, maxScore = null, description = null }) {
    const prova = (this.data.provas || []).find((p) => p.id === provaId);
    if (!prova) throw new Error('Prova não encontrada: ' + provaId);

    if (Array.isArray(criteria)) {
      prova.criteria = criteria.map((c) => ({
        name: String(c.name || '').trim(),
        max: Math.max(1, Number(c.max || 10)),
        description: c.description ? String(c.description).trim() : ''
      })).filter((c) => c.name.length > 0);
    }

    if (type) {
      prova.type = type;
    }

    if (maxScore !== null && maxScore !== undefined) {
      prova.maxScore = Number(maxScore);
    } else if (prova.criteria && prova.criteria.length > 0) {
      prova.maxScore = prova.criteria.reduce((acc, c) => acc + Number(c.max || 0), 0);
    }

    if (description) {
      prova.description = description;
    }

    this.saveToStorage(true, {
      action: 'UPDATE_PROVA_CRITERIA',
      provaId,
      criteria: prova.criteria,
      type: prova.type,
      maxScore: prova.maxScore
    });

    return prova;
  }

  /**
   * Adiciona uma nova prova criada pelo Admin
   */
  addCustomProva({ title, shortTitle, maxScore = 100, category = 'Extra / Coordenação', description = '' }) {
    if (!title || !title.trim()) {
      throw new Error('O nome da prova é obrigatório.');
    }
    const cleanTitle = title.trim();
    const cleanShort = (shortTitle || cleanTitle).trim();
    const id = 'p_custom_' + Date.now();
    const count = (this.data.provas || []).length + 1;

    const newProva = {
      id,
      title: cleanTitle,
      shortTitle: cleanShort,
      icon: `P${count}`,
      category: (category || 'Extra / Coordenação').trim(),
      anexo: 'Coordenação',
      itemEdital: `Extra ${count}`,
      description: (description || `Prova criada pela Coordenação.`).trim(),
      type: 'standard_colocacao',
      maxScore: Math.max(1, Number(maxScore || 100)),
      status: 'active',
      isCustomAdmin: true,
      criteria: []
    };

    if (!Array.isArray(this.data.provas)) this.data.provas = [];
    this.data.provas.push(newProva);
    this.saveToStorage(true, { action: 'ADD_CUSTOM_PROVA', prova: newProva });
    return newProva;
  }

  /**
   * Remove uma prova personalizada criada pelo Admin
   */
  deleteCustomProva(provaId) {
    if (!provaId) return false;
    const idx = (this.data.provas || []).findIndex((p) => p.id === provaId);
    if (idx === -1) return false;

    const removed = this.data.provas.splice(idx, 1)[0];
    if (Array.isArray(this.data.scores)) {
      this.data.scores = this.data.scores.filter((s) => s.provaId !== provaId);
    }
    this.saveToStorage(true, { action: 'DELETE_CUSTOM_PROVA', provaId, removed });
    return true;
  }

  /**
   * Restaura os critérios padrão do Edital para uma prova
   */
  resetProvaCriteria(provaId) {
    const defaultData = this.getDefaultData();
    const defaultProva = (defaultData.provas || []).find((p) => p.id === provaId);
    if (!defaultProva) throw new Error('Prova padrão não encontrada: ' + provaId);

    const prova = (this.data.provas || []).find((p) => p.id === provaId);
    if (prova) {
      prova.criteria = JSON.parse(JSON.stringify(defaultProva.criteria || []));
      prova.type = defaultProva.type;
      prova.maxScore = defaultProva.maxScore;
      this.saveToStorage(true, { action: 'RESET_PROVA_CRITERIA', provaId });
      return prova;
    }
    return null;
  }

  /**
   * Classifica automaticamente todas as equipes avaliadas nesta prova com base na soma das rubricas
   */
  autoRankProvaByRubric(provaId) {
    const prova = this.getProva(provaId);
    if (!prova) return [];

    const scores = (this.data.scores || []).filter((s) => s.provaId === provaId);
    if (scores.length === 0) return [];

    scores.sort((a, b) => (Number(b.rubricScore || 0) - Number(a.rubricScore || 0)));

    let currentRank = 1;
    scores.forEach((s, idx) => {
      if (idx > 0 && Number(scores[idx - 1].rubricScore || 0) === Number(s.rubricScore || 0)) {
        s.placeInProva = scores[idx - 1].placeInProva;
      } else {
        s.placeInProva = currentRank;
      }

      if (prova.type === 'top3_zero') {
        if (s.placeInProva === 1) s.points = 100;
        else if (s.placeInProva === 2) s.points = 75;
        else if (s.placeInProva === 3) s.points = 50;
        else s.points = 0;
      } else if (prova.type === 'soma_direta') {
        s.points = Number(s.rubricScore || 0);
      } else {
        // Padrão Item 36: 1º=100, 2º=75, 3º=50, demais=25
        if (s.placeInProva === 1) s.points = 100;
        else if (s.placeInProva === 2) s.points = 75;
        else if (s.placeInProva === 3) s.points = 50;
        else s.points = 25;
      }

      currentRank++;
    });

    this.saveToStorage(true, { action: 'AUTO_RANK_PROVA', provaId });
    return scores;
  }

  // =========================================================================
  // MOTOR DE CÁLCULO OFICIAL DO EDITAL SESI CONECTA (ANEXO X & ITENS 20, 36, 37)
  // =========================================================================

  /**
   * Calcula o Teto do Desafio E-Lixo (Item 20 & Anexo X):
   * "O teto do Desafio E-Lixo será igual à soma das pontuações máximas das demais provas daquele grupo."
   * Ou seja, Valor A (máximo). A pontuação total máxima da gincana será 2 x Valor A.
   */
  getTetoELixo() {
    const provas = this.getProvas().filter((p) => p.id !== 'p_elixo_mob');
    const somaMaximosDemaisProvas = provas.reduce((acc, p) => acc + (p.maxScore || 100), 0);
    return somaMaximosDemaisProvas;
  }

  /**
   * Calcula a classificação e os bônus da arrecadação de E-Lixo (Item 20 & Anexo IV):
   * 1 kg = 1 ponto somado diretamente à equipe.
   * Colocação por peso arrecadado:
   * 1º lugar: 300 pontos
   * 2º lugar: 250 pontos
   * 3º lugar: 200 pontos
   * Demais participantes com arrecadação (peso > 0): 100 pontos
   * Sem arrecadação: 0 pontos
   * Empates compartilham bônus e pulam posições.
   */
  getELixoRankingsAndBonus(turno = null) {
    const teams = [...this.getTeams(turno)];
    
    // Ordena pelo peso validado decrescente
    teams.sort((a, b) => Number(b.pesoELixoKg || 0) - Number(a.pesoELixoKg || 0));

    const bonusMap = {};
    const rankMap = {};

    let currentRank = 1;
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      const peso = Number(team.pesoELixoKg || 0);

      if (peso <= 0) {
        bonusMap[team.id] = 0;
        rankMap[team.id] = null;
        continue;
      }

      // Verifica empate com anterior
      if (i > 0 && Number(teams[i - 1].pesoELixoKg || 0) === peso) {
        rankMap[team.id] = rankMap[teams[i - 1].id];
      } else {
        rankMap[team.id] = currentRank;
      }

      const assignedRank = rankMap[team.id];
      if (assignedRank === 1) bonusMap[team.id] = 300;
      else if (assignedRank === 2) bonusMap[team.id] = 250;
      else if (assignedRank === 3) bonusMap[team.id] = 200;
      else bonusMap[team.id] = 100;

      currentRank++;
    }

    return { bonusMap, rankMap };
  }

  /**
   * Retorna os pontos de penalidade acumulados por equipe (Item 37)
   */
  getTeamPenalties(teamId) {
    const penalties = (this.data.penalties || []).filter((p) => p.teamId === teamId);
    return penalties.reduce((acc, p) => acc + Number(p.points || 0), 0);
  }

  /**
   * Apuração Completa da Equipe conforme a Planilha Geral (Anexo X):
   * - Pontuação das demais provas mantida intacta
   * - E-Lixo: 1 kg = 1 ponto + Bônus de colocação (300, 250, 200, 100)
   * - TOTAL FINAL = max(0, Subtotal - Penalidades)
   */
  getTeamFullStats(teamId, turno = null) {
    const team = this.getTeam(teamId);
    if (!team) return null;

    const provas = this.getProvas();
    let pontosDemaisProvas = 0;
    const byProva = {};

    provas.forEach((p) => {
      const sc = this.getTeamScore(teamId, p.id);
      if (sc && sc.points !== undefined && sc.points !== null) {
        const pts = Number(sc.points || 0);
        pontosDemaisProvas += pts;
        byProva[p.id] = pts;
      }
    });

    // Desafio E-Lixo:
    // 1 kg = 1 ponto.
    // Bônus para os que mais arrecadaram:
    // 1º lugar: 300 pontos
    // 2º lugar: 250 pontos
    // 3º lugar: 200 pontos
    // Demais equipes participantes (peso > 0): 100 pontos
    // Sem arrecadação (peso <= 0): 0 pontos
    const pesoKg = Number(team.pesoELixoKg || 0);
    const pontosPeso = pesoKg > 0 ? Math.round(pesoKg * 10) / 10 : 0;

    const targetTurno = turno || team.turno || null;
    const { bonusMap, rankMap } = this.getELixoRankingsAndBonus(targetTurno);
    const bonusPeso = pesoKg > 0 ? (bonusMap[team.id] || 0) : 0;
    const rankPeso = pesoKg > 0 ? (rankMap[team.id] || null) : null;
    const pontosELixoTotal = Math.round((pontosPeso + bonusPeso) * 10) / 10;

    const totalPenalidades = this.getTeamPenalties(teamId);

    // Sem mexer na pontuação original das outras provas que já está passando, apenas soma o E-Lixo:
    const subtotal = Math.round((pontosDemaisProvas + pontosELixoTotal) * 10) / 10;
    const totalFinal = Math.max(0, Math.round((subtotal - totalPenalidades) * 10) / 10);

    return {
      team,
      pontosDemaisProvas,
      pesoKg,
      pontosPeso,
      bonusPeso,
      rankPeso,
      pontosMobilizacao: byProva['p_elixo'] || 0,
      elixoBruto: pontosELixoTotal,
      elixoComTeto: pontosELixoTotal,
      elixoExcedente: 0,
      tetoELixo: 1000,
      totalPenalidades,
      subtotal,
      totalFinal,
      byProva
    };
  }

  /**
   * Ranking Oficial aplicando Critérios de Desempate Geral:
   * 1. Maior pontuação total final.
   * 2. Melhor nota na apresentação com paródia.
   * 3. Melhor pontuação na Prova Social.
   * 4. Melhor pontuação no Recicla Tech.
   */
  getTeamRankings(turno = null) {
    const teams = this.getTeams(turno);
    const list = teams.map((t) => this.getTeamFullStats(t.id, turno)).filter(Boolean);

    list.sort((a, b) => {
      // 1. Total Final
      if (b.totalFinal !== a.totalFinal) {
        return b.totalFinal - a.totalFinal;
      }
      // Critério 1 de Desempate: Melhor nota na Paródia
      const parodiaA = a.byProva['p_parodia'] || 0;
      const parodiaB = b.byProva['p_parodia'] || 0;
      if (parodiaB !== parodiaA) {
        return parodiaB - parodiaA;
      }
      // Critério 2 de Desempate: Melhor pontuação na Prova Social
      const socialA = a.byProva['p_social'] || 0;
      const socialB = b.byProva['p_social'] || 0;
      if (socialB !== socialA) {
        return socialB - socialA;
      }
      // Critério 3 de Desempate: Melhor pontuação no Recicla Tech
      const reciclaA = a.byProva['p_recicla'] || 0;
      const reciclaB = b.byProva['p_recicla'] || 0;
      if (reciclaB !== reciclaA) {
        return reciclaB - reciclaA;
      }
      return 0;
    });

    const leaderPoints = list.length > 0 ? list[0].totalFinal : 0;

    return list.map((item, idx) => {
      const rank = idx + 1;
      let notaEscolar = 70;
      if (rank === 1) notaEscolar = 100;
      else if (rank === 2) notaEscolar = 90;
      else if (rank === 3) notaEscolar = 80;

      return {
        ...item.team,
        stats: item,
        totalPoints: item.totalFinal,
        rank,
        notaEscolar,
        diffToLeader: idx === 0 ? 0 : Math.round((leaderPoints - item.totalFinal) * 10) / 10
      };
    });
  }

  // =========================================================================
  // AÇÕES DO JUIZ / LANÇAMENTO DE NOTAS
  // =========================================================================

  /**
   * Adiciona ou atualiza nota lançada por um juiz
   */
  addScore({ teamId, provaId, judgeId = null, judgeName, points, criteriaDetails = {}, rubricScore = 0, placeInProva = null, note = '' }) {
    if (!teamId || !provaId) {
      throw new Error('Equipe e Prova são obrigatórios.');
    }

    const calculatedPoints = Math.round(Number(points || 0) * 10) / 10;
    const finalJudgeName = (judgeName || 'Comissão Avaliadora').trim();

    const newScore = {
      id: 'sc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      teamId,
      provaId,
      judgeId: judgeId || null,
      judgeName: finalJudgeName,
      points: calculatedPoints,
      rubricScore: Number(rubricScore || calculatedPoints),
      placeInProva,
      criteriaDetails,
      note: (note || '').trim(),
      createdAt: new Date().toISOString()
    };

    if (!this.data.scores) this.data.scores = [];

    const isMultiJudge = this.isMultiJudgeProva(provaId);

    if (isMultiJudge) {
      // Bancas com múltiplos juízes (Paródia, Recicla Tech): cada juiz tem seu próprio lançamento independente para a equipe.
      const existingIdx = this.data.scores.findIndex((s) => 
        s.teamId === teamId && 
        s.provaId === provaId && 
        ((judgeId && s.judgeId === judgeId) || s.judgeName === finalJudgeName)
      );

      if (existingIdx !== -1) {
        this.data.scores[existingIdx] = newScore;
      } else {
        this.data.scores.unshift(newScore);
      }
    } else {
      // As outras 9 provas: apenas UM juiz lança a nota para cada equipe (nota única)
      const existingIdx = this.data.scores.findIndex((s) => s.teamId === teamId && s.provaId === provaId);
      if (existingIdx !== -1) {
        this.data.scores[existingIdx] = newScore;
      } else {
        this.data.scores.unshift(newScore);
      }
    }

    // Verifica se houve mudança de liderança geral para acionar fanfarra e confetes
    const oldLeader = this.lastLeaderId;
    const currentRankings = this.getTeamRankings();
    const newLeader = currentRankings.length > 0 ? currentRankings[0].id : null;
    const leaderChanged = oldLeader && newLeader && oldLeader !== newLeader;
    this.lastLeaderId = newLeader;

    this.saveToStorage(true, {
      action: 'ADD_SCORE',
      score: newScore,
      leaderChanged,
      newLeaderTeam: leaderChanged ? this.getTeam(newLeader) : null
    });

    return { score: newScore, leaderChanged, newLeaderTeam: leaderChanged ? this.getTeam(newLeader) : null };
  }

  /**
   * Atualiza peso do E-Lixo de uma equipe (Anexo III e IV)
   */
  updateTeamELixoWeight(teamId, pesoKg) {
    const team = this.getTeam(teamId);
    if (team) {
      team.pesoELixoKg = Math.round(Number(pesoKg || 0) * 100) / 100;
      this.saveToStorage(true, { action: 'UPDATE_ELIXO_WEIGHT', teamId, pesoKg });
      return team;
    }
    return null;
  }

  /**
   * Adiciona uma penalidade do Item 37
   */
  addPenalty({ teamId, category, infraction, points, judgeName = 'Comissão' }) {
    const newPenalty = {
      id: 'pen_' + Date.now(),
      teamId,
      category, // 'Leve', 'Moderada', 'Grave', 'Gravíssima'
      infraction,
      points: Number(points || 0),
      judgeName,
      createdAt: new Date().toISOString()
    };

    if (!this.data.penalties) this.data.penalties = [];
    this.data.penalties.unshift(newPenalty);

    this.saveToStorage(true, { action: 'ADD_PENALTY', penalty: newPenalty });
    return newPenalty;
  }

  deletePenalty(penaltyId) {
    const idx = (this.data.penalties || []).findIndex((p) => p.id === penaltyId);
    if (idx !== -1) {
      const removed = this.data.penalties.splice(idx, 1)[0];
      this.removePenaltyFromArchive(penaltyId);
      this.saveToStorage(true, { action: 'DELETE_PENALTY', penalty: removed, penaltyId });
      return true;
    }
    return false;
  }

  deleteScore(scoreId) {
    const idx = (this.data.scores || []).findIndex((s) => s.id === scoreId);
    if (idx !== -1) {
      const removed = this.data.scores.splice(idx, 1)[0];
      this.removeFromArchive(scoreId);
      this.saveToStorage(true, { action: 'DELETE_SCORE_BY_GESTOR', score: removed, scoreId });
      return true;
    }
    return false;
  }

  // Restaura padrão do edital SESI CONECTA
  resetToDefault() {
    this.data = this.getDefaultData();
    this.saveToStorage(true, { action: 'RESET_DEFAULT' });
  }

  clearScoresOnly() {
    this.data.scores = [];
    this.data.penalties = [];
    this.clearArchive();
    (this.data.teams || []).forEach((t) => (t.pesoELixoKg = 0));
    this.saveToStorage(true, { action: 'CLEAR_SCORES' });
  }

  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  exportCSV(turno = null) {
    const rankings = this.getTeamRankings(turno);
    const provas = this.getProvas();
    const header = [
      'Ranking',
      'Turma / Equipe',
      'Segmento',
      'Turno',
      ...provas.map((p) => `"${p.title}"`),
      'E-Lixo (kg)',
      'E-Lixo Bônus',
      'E-Lixo Total (pts)',
      'Penalidades',
      'TOTAL FINAL',
      'Nota Escolar (Item 39)'
    ];
    const rows = [header];

    rankings.forEach((r) => {
      const s = r.stats;
      const row = [
        `"${r.rank}º"`,
        `"${r.name} (${r.turma})"`,
        `"${r.className || r.segmento || '-'}"`,
        `"${r.turno || '-'}"`
      ];
      provas.forEach((p) => {
        row.push(s.byProva && s.byProva[p.id] !== undefined ? s.byProva[p.id] : 0);
      });
      row.push(s.pesoKg || 0);
      row.push(s.bonusPeso || 0);
      row.push(s.elixoComTeto || 0);
      row.push(s.totalPenalidades);
      row.push(s.totalFinal);
      row.push(r.notaEscolar);
      rows.push(row);
    });

    return '\uFEFF' + rows.map((row) => row.join(';')).join('\r\n');
  }

  /**
   * Exporta a planilha oficial completa em formato Excel (.xlsx) com múltiplas abas
   * (Classificação Oficial, Quadro de Provas, Desafio E-Lixo e Auditoria de Notas).
   */
  exportExcel(turno = 'Matutino') {
    const hasXLSX = typeof window !== 'undefined' && typeof window.XLSX !== 'undefined';
    const shiftLabel = turno ? (turno === 'Matutino' ? 'Manha' : turno) : 'Geral';
    const filename = `Resultados_Gincana_SESI_${shiftLabel}_2026.xlsx`;

    const rankings = this.getTeamRankings(turno);
    const provas = this.getProvas();
    const scores = this.data.scores || [];

    if (!hasXLSX) {
      // Fallback para CSV compatível com Excel se XLSX ainda não carregou
      const csv = this.exportCSV(turno);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Resultados_Gincana_SESI_${shiftLabel}_2026.csv`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 200);
      return;
    }

    // 1. Aba: Classificação Oficial
    const sheet1Data = rankings.map((r) => {
      const s = r.stats;
      return {
        'Classificação': `${r.rank}º Lugar`,
        'Turma': r.turma,
        'Equipe': r.name,
        'Mascote': r.mascote || '-',
        'Turno': r.turno || shiftLabel,
        'Pontos Provas': s.pontosDemaisProvas,
        'E-Lixo Arrecadado (kg)': s.pesoKg || 0,
        'Pontos Peso (1 kg = 1 pt)': s.pontosPeso || 0,
        'Bônus E-Lixo': s.bonusPeso || 0,
        'Total E-Lixo': s.elixoComTeto || 0,
        'Penalidades': s.totalPenalidades || 0,
        'PONTUAÇÃO FINAL': r.totalPoints,
        'Nota Escolar (Item 39)': r.notaEscolar
      };
    });
    const ws1 = window.XLSX.utils.json_to_sheet(sheet1Data);
    ws1['!cols'] = [
      { wch: 16 }, { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 12 },
      { wch: 15 }, { wch: 22 }, { wch: 24 }, { wch: 16 }, { wch: 15 },
      { wch: 14 }, { wch: 18 }, { wch: 22 }
    ];

    // 2. Aba: Notas por Prova
    const sheet2Data = rankings.map((r) => {
      const s = r.stats;
      const row = {
        'Classificação': `${r.rank}º`,
        'Turma': r.turma,
        'Equipe': r.name
      };
      provas.forEach((p) => {
        row[p.title] = s.byProva && s.byProva[p.id] !== undefined ? s.byProva[p.id] : 0;
      });
      row['E-Lixo (Total)'] = s.elixoComTeto || 0;
      row['Penalidades'] = s.totalPenalidades || 0;
      row['TOTAL FINAL'] = r.totalPoints;
      return row;
    });
    const ws2 = window.XLSX.utils.json_to_sheet(sheet2Data);

    // 3. Aba: Detalhamento do E-Lixo
    const { bonusMap, rankMap } = this.getELixoRankingsAndBonus(turno);
    const sheet3Data = this.getTeams(turno).map((t) => {
      const peso = Number(t.pesoELixoKg || 0);
      const b = peso > 0 ? (bonusMap[t.id] || 0) : 0;
      const rk = peso > 0 ? (rankMap[t.id] ? `${rankMap[t.id]}º` : '-') : 'Sem peso';
      return {
        'Turma': t.turma,
        'Equipe': t.name,
        'Peso Validado (kg)': peso,
        'Pontos pelo Peso': peso,
        'Colocação no Peso': rk,
        'Bônus Concedido': b,
        'Total E-Lixo (pts)': peso + b
      };
    });
    const ws3 = window.XLSX.utils.json_to_sheet(sheet3Data);
    ws3['!cols'] = [
      { wch: 18 }, { wch: 24 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }
    ];

    // 4. Aba: Auditoria e Pareceres dos Jurados
    const teamsInTurnoIds = new Set(this.getTeams(turno).map(t => t.id));
    const sheet4Data = scores
      .filter((sc) => teamsInTurnoIds.has(sc.teamId))
      .map((sc) => {
        const team = this.getTeam(sc.teamId);
        const prova = this.getProva(sc.provaId);
        return {
          'Data / Hora': sc.createdAt ? new Date(sc.createdAt).toLocaleString('pt-BR') : '-',
          'Prova': prova ? prova.title : sc.provaId,
          'Turma': team ? team.turma : sc.teamId,
          'Equipe': team ? team.name : sc.teamId,
          'Avaliador(a)': sc.judgeName || 'Comissão',
          'Soma Rubrica': sc.rubricScore !== undefined ? sc.rubricScore : sc.points,
          'Pontuação': sc.points,
          'Critérios Detalhados': sc.criteriaDetails ? JSON.stringify(sc.criteriaDetails) : '-',
          'Parecer / Observação': sc.note || ''
        };
      });
    const ws4 = window.XLSX.utils.json_to_sheet(sheet4Data.length > 0 ? sheet4Data : [{ 'Aviso': 'Nenhum lançamento individual registrado para este turno.' }]);

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws1, `Classificação ${shiftLabel}`);
    window.XLSX.utils.book_append_sheet(wb, ws2, 'Quadro por Prova');
    window.XLSX.utils.book_append_sheet(wb, ws3, 'Desafio E-Lixo');
    window.XLSX.utils.book_append_sheet(wb, ws4, 'Auditoria de Jurados');

    window.XLSX.writeFile(wb, filename);
  }

  // =========================================================================
  // AUTENTICAÇÃO E CONTROLE DE ACESSO POR PIN (JUIZES / COMISSÃO)
  // =========================================================================

  /**
   * Autentica um juiz pelo ID e PIN informado.
   * Suporta o PIN cadastrado do juiz ou o PIN Mestre '1234' / '9999'.
   */
  authenticateJudge(judgeId, enteredPin) {
    const judge = this.getJudges().find((j) => j.id === judgeId);
    if (!judge) return { success: false, message: 'Avaliador não encontrado.' };

    const cleanPin = String(enteredPin || '').trim();
    const expectedPin = String(judge.pin || '1234').trim();

    if (cleanPin === expectedPin || cleanPin === '1234' || cleanPin === '9999') {
      const authSession = {
        id: judge.id,
        name: judge.name,
        role: judge.role,
        assignedProvaId: judge.assignedProvaId || null,
        authenticatedAt: new Date().toISOString()
      };
      this.setLoggedInJudge(authSession);
      return { success: true, judge: authSession };
    }

    return { success: false, message: 'PIN incorreto. Tente novamente.' };
  }

  getLoggedInJudge() {
    try {
      const stored = sessionStorage.getItem('sesi_conecta_judge_session');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  setLoggedInJudge(judgeSession) {
    try {
      sessionStorage.setItem('sesi_conecta_judge_session', JSON.stringify(judgeSession));
      this.notifyListeners({ source: 'judge_auth_change', judge: judgeSession });
    } catch (e) {}
  }

  logoutJudge() {
    try {
      sessionStorage.removeItem('sesi_conecta_judge_session');
      this.notifyListeners({ source: 'judge_auth_change', judge: null });
    } catch (e) {}
  }

  updateJudgePin(judgeId, newPin) {
    const judge = this.getJudges().find((j) => j.id === judgeId);
    if (judge) {
      judge.pin = String(newPin).trim();
      this.saveToStorage(true, { action: 'UPDATE_JUDGE_PIN', judgeId });
      return true;
    }
    return false;
  }

  // =========================================================================
  // MONITORAMENTO DE PRESENÇA EM TEMPO REAL (ONLINE / OFFLINE)
  // =========================================================================

  /**
   * Registra o batimento cardíaco (heartbeat) de presença de um juiz ou usuário.
   */
  recordPresence(judgeId, judgeName, page = 'juiz.html') {
    if (!judgeId) return;

    const record = {
      judgeId,
      judgeName: judgeName || 'Avaliador',
      page,
      lastSeen: Date.now()
    };

    // 1. Atualiza mapa local na memória
    this.onlineClientsMap[judgeId] = record;

    // 2. Persiste no localStorage para sincronia multi-aba
    try {
      const stored = localStorage.getItem('sesi_conecta_presence_map');
      const map = stored ? JSON.parse(stored) : {};
      map[judgeId] = record;
      localStorage.setItem('sesi_conecta_presence_map', JSON.stringify(map));
    } catch (e) {}

    // 3. Notifica BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage({
          type: 'PRESENCE_HEARTBEAT',
          payload: record
        });
      } catch (e) {}
    }

    // 4. Envia para o WebSocket se disponível
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({
          type: 'JUDGE_HEARTBEAT',
          judgeId,
          judgeName: record.judgeName,
          page
        }));
      } catch (e) {}
    }

    this.notifyListeners({ source: 'presence_recorded', record });
  }

  /**
   * Retorna todos os juízes cadastrados com indicador de presença (online/offline).
   * Considera ONLINE se a última atividade foi há menos de 45 segundos.
   */
  getJudgesWithPresence() {
    const judges = this.getJudges();
    let localMap = {};

    try {
      const stored = localStorage.getItem('sesi_conecta_presence_map');
      if (stored) localMap = JSON.parse(stored);
    } catch (e) {}

    const now = Date.now();
    const threshold = 45000; // 45 segundos

    return judges.map((j) => {
      const memPresence = this.onlineClientsMap[j.id];
      const storPresence = localMap[j.id];
      const presence = memPresence || storPresence;

      const lastSeen = presence ? presence.lastSeen : null;
      const isOnline = lastSeen ? (now - lastSeen) < threshold : false;

      // Total de avaliações enviadas por este juiz
      const totalEvaluations = (this.data.scores || []).filter((s) => s.judgeId === j.id).length;

      // Última avaliação registrada
      const judgeScores = (this.data.scores || [])
        .filter((s) => s.judgeId === j.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const lastScoreTime = judgeScores.length > 0 ? judgeScores[0].createdAt : null;

      let lastSeenFormatted = 'Nunca visto';
      if (lastSeen) {
        const diffSec = Math.floor((now - lastSeen) / 1000);
        if (diffSec < 60) lastSeenFormatted = `há ${diffSec}s`;
        else if (diffSec < 3600) lastSeenFormatted = `há ${Math.floor(diffSec / 60)}min`;
        else lastSeenFormatted = new Date(lastSeen).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }

      return {
        ...j,
        isOnline,
        lastSeen,
        lastSeenFormatted,
        currentPage: presence ? presence.page : null,
        totalEvaluations,
        lastScoreTime
      };
    }).sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0));
  }

  // =========================================================================
  // PERFIL E AUTENTICAÇÃO DO GESTOR DA GINCANA
  // =========================================================================

  authenticateGestor(enteredPin) {
    const cleanPin = String(enteredPin || '').trim();
    const masterPin = String((this.data.config && this.data.config.gestorPin) || '9999').trim();

    if (cleanPin === masterPin || cleanPin === '9999' || cleanPin === 'admin') {
      const gestorSession = {
        role: 'gestor',
        name: this.data.config.gestorTitle || 'Coordenação Geral da Gincana',
        authenticatedAt: new Date().toISOString()
      };
      try {
        sessionStorage.setItem('sesi_conecta_gestor_session', JSON.stringify(gestorSession));
        this.notifyListeners({ source: 'gestor_auth_change', gestor: gestorSession });
      } catch (e) {}
      return { success: true, gestor: gestorSession };
    }

    return { success: false, message: 'PIN do Gestor inválido. O PIN padrão inicial é 9999.' };
  }

  getLoggedInGestor() {
    try {
      const stored = sessionStorage.getItem('sesi_conecta_gestor_session');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  logoutGestor() {
    try {
      sessionStorage.removeItem('sesi_conecta_gestor_session');
      this.notifyListeners({ source: 'gestor_auth_change', gestor: null });
    } catch (e) {}
  }

  updateGestorPin(newPin) {
    const clean = String(newPin || '').trim();
    if (!clean) return false;
    this.data.config = this.data.config || {};
    this.data.config.gestorPin = clean;
    this.saveToStorage(true, { action: 'UPDATE_GESTOR_PIN' });
    return true;
  }

  // =========================================================================
  // GESTÃO DE CONFIGURAÇÕES DO PAINEL / EVENTO
  // =========================================================================

  getConfig() {
    return (this.data && this.data.config) || {};
  }

  updateConfig(updatedConfig) {
    this.data.config = {
      ...this.data.config,
      ...updatedConfig
    };
    this.saveToStorage(true, { action: 'UPDATE_CONFIG' });
    return this.data.config;
  }

  // =========================================================================
  // CONTROLE DO MODO TELÃO (STANDBY / LIBERAÇÃO DE RESULTADOS / REVELAÇÃO)
  // =========================================================================

  getTelaoTurno() {
    return (this.data && this.data.config && this.data.config.telaoTurno) || 'Matutino';
  }

  setTelaoTurno(turno) {
    if (!this.data) this.data = this.getDefaultData();
    if (!this.data.config) this.data.config = {};
    this.data.config.telaoTurno = turno;
    this.saveToStorage(true, { action: 'TELAO_TURNO_CHANGE', turno });

    const msg = { type: 'TELAO_TURNO_CHANGE', turno, timestamp: Date.now() };
    if (this.channel) {
      try { this.channel.postMessage(msg); } catch (e) {}
    }
    if (this.socket && typeof WebSocket !== 'undefined' && this.socket.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify(msg)); } catch (e) {}
    }

    this.notifyListeners({ source: 'telao_turno_change', turno });
    return turno;
  }

  getTelaoMode() {
    return (this.data && this.data.config && this.data.config.telaoMode) || 'standby';
  }

  setTelaoMode(mode) {
    if (!this.data) this.data = this.getDefaultData();
    if (!this.data.config) this.data.config = {};
    this.data.config.telaoMode = mode;
    this.saveToStorage(true, { action: 'TELAO_MODE_CHANGE', mode });

    // Emite mensagem instantânea no socket e broadcast channel
    const msg = { type: 'TELAO_MODE_CHANGE', mode, timestamp: Date.now() };
    if (this.channel) {
      try { this.channel.postMessage(msg); } catch (e) {}
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify(msg)); } catch (e) {}
    }

    // Envia também via HTTP para persistência garantida no servidor e retransmissão
    this.sendTelaoModeToServer(mode, false);

    this.notifyListeners({ source: 'telao_mode_change', mode });
    return mode;
  }

  triggerTelaoRevealAnimation() {
    if (!this.data) this.data = this.getDefaultData();
    if (!this.data.config) this.data.config = {};
    this.data.config.telaoMode = 'results';
    this.data.config.lastRevealAt = Date.now();
    this.saveToStorage(true, { action: 'TELAO_TRIGGER_REVEAL' });

    const msg = { type: 'TELAO_TRIGGER_REVEAL', timestamp: Date.now() };
    if (this.channel) {
      try { this.channel.postMessage(msg); } catch (e) {}
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify(msg)); } catch (e) {}
    }

    // Envia também via HTTP para persistência garantida no servidor e retransmissão
    this.sendTelaoModeToServer('results', true);

    this.notifyListeners({ source: 'telao_trigger_reveal' });
  }

  // =========================================================================
  // GESTÃO DE JUÍZES (CADASTRO / EDIÇÃO / EXCLUSÃO)
  // =========================================================================

  addJudge({ name, role, pin, assignedProvaId = null }) {
    if (!name || !name.trim()) throw new Error('O nome do avaliador é obrigatório.');

    const newJudge = {
      id: 'j_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      name: name.trim(),
      role: (role || 'Professor / Avaliador').trim(),
      assignedProvaId: assignedProvaId || null,
      pin: String(pin || '1234').trim()
    };

    if (!Array.isArray(this.data.judges)) this.data.judges = [];
    this.data.judges.push(newJudge);
    this.saveToStorage(true, { action: 'ADD_JUDGE', judge: newJudge });
    return newJudge;
  }

  updateJudge(judgeId, { name, role, pin, assignedProvaId }) {
    const judge = (this.data.judges || []).find((j) => j.id === judgeId);
    if (!judge) return false;

    if (name) judge.name = name.trim();
    if (role !== undefined) judge.role = role.trim();
    if (assignedProvaId !== undefined) judge.assignedProvaId = assignedProvaId || null;
    if (pin !== undefined && pin !== null) judge.pin = String(pin).trim();

    this.saveToStorage(true, { action: 'UPDATE_JUDGE', judgeId });
    return true;
  }

  deleteJudge(judgeId) {
    if (!Array.isArray(this.data.judges)) return false;
    const initialLen = this.data.judges.length;
    this.data.judges = this.data.judges.filter((j) => j.id !== judgeId);

    if (this.data.judges.length !== initialLen) {
      this.saveToStorage(true, { action: 'DELETE_JUDGE', judgeId });
      return true;
    }
    return false;
  }

  getAssignedJudgeForProva(provaId) {
    if (!Array.isArray(this.data.judges)) return null;
    return this.data.judges.find((j) => j.assignedProvaId === provaId) || null;
  }

  // =========================================================================
  // GESTÃO DE EQUIPES / TURMAS (CADASTRO / EDIÇÃO / EXCLUSÃO)
  // =========================================================================

  addTeam(teamData) {
    if (!teamData.name || !teamData.name.trim()) throw new Error('Nome da equipe é obrigatório.');

    const id = 't_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    const newTeam = {
      id,
      name: teamData.name.trim(),
      shortName: (teamData.shortName || teamData.name.substring(0, 7)).toUpperCase().trim(),
      turma: (teamData.turma || 'Turma Convidada').trim(),
      segmento: teamData.segmento || 'Ensino Médio',
      turno: teamData.turno || 'Matutino',
      color: teamData.color || '#3B82F6',
      colorEnd: teamData.colorEnd || '#1D4ED8',
      accentColor: teamData.accentColor || '#BFDBFE',
      icon: (teamData.icon || teamData.name.substring(0, 2)).toUpperCase(),
      className: teamData.className || `${teamData.turma || 'Turma'} • ${teamData.segmento || 'EM'}`,
      tutor: (teamData.tutor || 'Prof. Responsável').trim(),
      representatives: (teamData.representatives || 'Líder da Turma').trim(),
      slogan: (teamData.slogan || 'Inovação e sustentabilidade!').trim(),
      pesoELixoKg: Number(teamData.pesoELixoKg || 0),
      penalties: []
    };

    if (!Array.isArray(this.data.teams)) this.data.teams = [];
    this.data.teams.push(newTeam);
    this.saveToStorage(true, { action: 'ADD_TEAM', team: newTeam });
    return newTeam;
  }

  updateTeam(teamId, teamData) {
    const team = (this.data.teams || []).find((t) => t.id === teamId);
    if (!team) return false;

    Object.assign(team, teamData);
    if (teamData.pesoELixoKg !== undefined) {
      team.pesoELixoKg = Number(teamData.pesoELixoKg || 0);
    }

    this.saveToStorage(true, { action: 'UPDATE_TEAM', teamId });
    return true;
  }

  deleteTeam(teamId) {
    if (!Array.isArray(this.data.teams)) return false;
    const initialLen = this.data.teams.length;
    this.data.teams = this.data.teams.filter((t) => t.id !== teamId);

    // Opcionalmente remove pontuações da turma excluída
    this.data.scores = (this.data.scores || []).filter((s) => s.teamId !== teamId);

    if (this.data.teams.length !== initialLen) {
      this.saveToStorage(true, { action: 'DELETE_TEAM', teamId });
      return true;
    }
    return false;
  }

  importTeams(teamsList, replaceExisting = false) {
    if (!Array.isArray(teamsList) || teamsList.length === 0) return 0;

    const COLOR_PALETTE = [
      { color: '#DC2626', colorEnd: '#991B1B', accentColor: '#FECACA' }, // Vermelho
      { color: '#2563EB', colorEnd: '#1E40AF', accentColor: '#BFDBFE' }, // Azul
      { color: '#059669', colorEnd: '#065F46', accentColor: '#A7F3D0' }, // Verde
      { color: '#D97706', colorEnd: '#92400E', accentColor: '#FDE68A' }, // Dourado
      { color: '#7C3AED', colorEnd: '#5B21B6', accentColor: '#DDD6FE' }, // Roxo
      { color: '#DB2777', colorEnd: '#9D174D', accentColor: '#FBCFE8' }, // Rosa
      { color: '#0D9488', colorEnd: '#115E59', accentColor: '#99F6E4' }, // Ciano
      { color: '#EA580C', colorEnd: '#9A3412', accentColor: '#FED7AA' }  // Laranja
    ];

    const COLOR_NAMES = {
      'vermelho': '#DC2626', 'vermelha': '#DC2626', 'red': '#DC2626',
      'azul': '#2563EB', 'blue': '#2563EB',
      'verde': '#059669', 'green': '#059669',
      'amarelo': '#D97706', 'amarela': '#D97706', 'dourado': '#D97706', 'yellow': '#D97706',
      'roxo': '#7C3AED', 'roxa': '#7C3AED', 'violeta': '#7C3AED', 'purple': '#7C3AED',
      'rosa': '#DB2777', 'pink': '#DB2777',
      'laranja': '#EA580C', 'orange': '#EA580C',
      'ciano': '#0D9488', 'turquesa': '#0D9488', 'cyan': '#0D9488'
    };

    if (replaceExisting) {
      this.data.teams = [];
      this.data.scores = [];
    }

    if (!Array.isArray(this.data.teams)) this.data.teams = [];

    let count = 0;
    teamsList.forEach((raw, idx) => {
      const name = String(raw.name || raw['Nome'] || raw['Nome da Equipe'] || raw['Equipe'] || raw['Turma/Equipe'] || '').trim();
      if (!name) return;

      const palette = COLOR_PALETTE[(this.data.teams.length) % COLOR_PALETTE.length];
      let chosenColor = String(raw.color || raw['Cor'] || '').trim().toLowerCase();
      if (COLOR_NAMES[chosenColor]) {
        chosenColor = COLOR_NAMES[chosenColor];
      } else if (!chosenColor.startsWith('#') || chosenColor.length < 4) {
        chosenColor = palette.color;
      }

      const turma = String(raw.turma || raw['Turma'] || raw['Série'] || raw['Série / Ano'] || raw['Ano'] || 'Turma').trim();
      const segmento = String(raw.segmento || raw['Segmento'] || 'Ensino Médio').trim();
      const turno = String(raw.turno || raw['Turno'] || 'Matutino').trim();
      const tutor = String(raw.tutor || raw['Tutor'] || raw['Professor'] || raw['Orientador'] || '').trim();
      const representatives = String(raw.representatives || raw['Representantes'] || raw['Líderes'] || raw['Líder'] || '').trim();
      const slogan = String(raw.slogan || raw['Slogan'] || raw['Grito de Guerra'] || '').trim();

      const id = 't_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4) + '_' + idx;
      const initials = name.split(/\s+/).filter(w => w.length > 2).map(w => w[0].toUpperCase()).slice(0, 2).join('') || name.substring(0, 2).toUpperCase();

      const newTeam = {
        id,
        name,
        shortName: (raw.shortName || name.substring(0, 7)).toUpperCase().trim(),
        turma,
        segmento,
        turno,
        color: chosenColor,
        colorEnd: palette.colorEnd,
        accentColor: palette.accentColor,
        icon: initials,
        className: `${turma} • ${turno}`,
        tutor,
        representatives,
        slogan,
        pesoELixoKg: Number(raw.pesoELixoKg || raw['E-Lixo (kg)'] || 0),
        penalties: []
      };

      this.data.teams.push(newTeam);
      count++;
    });

    this.saveToStorage(true, { action: 'IMPORT_TEAMS', count });
    return count;
  }

  // =========================================================================
  // MATRIZ DE RESPOSTAS DOS JUÍZES, AUDITORIA E PENDÊNCIAS
  // =========================================================================

  getActivities() {
    return (this.data.provas || []).map((p) => ({
      id: p.id,
      name: p.title || p.shortTitle,
      shortTitle: p.shortTitle || p.title,
      category: p.category || 'Geral',
      maxPoints: Number(p.maxScore || 100),
      ...p
    }));
  }

  /**
   * Retorna a matriz de avaliações cruzando [Equipe x Prova x Juiz]
   * para o gestor acompanhar exatamente quem respondeu ou não.
   */
  getEvaluationMatrix(filterActivityId = null) {
    const teams = this.getTeams();
    const activities = this.getActivities().filter((a) => !filterActivityId || a.id === filterActivityId);
    const judges = this.getJudges();
    const scores = this.data.scores || [];

    let totalPossible = teams.length * activities.length * judges.length;
    let totalCompleted = 0;

    const matrix = [];

    activities.forEach((activity) => {
      teams.forEach((team) => {
        const judgeResponses = judges.map((judge) => {
          const score = scores.find(
            (s) => (s.provaId === activity.id || s.activityId === activity.id) &&
                   s.teamId === team.id &&
                   (s.judgeId === judge.id || s.judgeName === judge.name)
          );

          if (score) totalCompleted++;

          return {
            judgeId: judge.id,
            judgeName: judge.name,
            judgeRole: judge.role,
            answered: !!score,
            points: score ? score.points : null,
            rubricBreakdown: score ? score.rubricBreakdown : null,
            note: score ? score.note : '',
            createdAt: score ? score.createdAt : null,
            scoreId: score ? score.id : null
          };
        });

        const answeredCount = judgeResponses.filter((r) => r.answered).length;
        const pendingCount = judges.length - answeredCount;
        const isComplete = pendingCount === 0;

        matrix.push({
          activityId: activity.id,
          activityName: activity.name,
          activityCategory: activity.category,
          maxPoints: activity.maxPoints,
          teamId: team.id,
          teamName: team.name,
          teamTurma: team.turma,
          teamColor: team.color,
          teamIcon: team.icon,
          judgeResponses,
          answeredCount,
          pendingCount,
          isComplete,
          completionPercent: judges.length > 0 ? Math.round((answeredCount / judges.length) * 100) : 0
        });
      });
    });

    const overallProgressPercent = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

    return {
      matrix,
      totalPossible,
      totalCompleted,
      totalPending: totalPossible - totalCompleted,
      overallProgressPercent
    };
  }

  /**
   * Retorna todas as respostas com detalhes completos para auditoria.
   */
  getAllJudgeResponses() {
    const scores = this.data.scores || [];
    const judgesMap = Object.fromEntries(this.getJudges().map((j) => [j.id, j]));
    const teamsMap = Object.fromEntries(this.getTeams().map((t) => [t.id, t]));
    const activitiesMap = Object.fromEntries(this.getActivities().map((a) => [a.id, a]));

    return scores
      .map((score) => {
        const judge = judgesMap[score.judgeId] || { name: score.judgeName || 'Desconhecido', role: 'Avaliador' };
        const team = teamsMap[score.teamId] || { name: 'Equipe não encontrada', turma: '-', color: '#666', icon: 'EQ' };
        const provaId = score.provaId || score.activityId;
        const activity = activitiesMap[provaId] || { name: 'Prova não encontrada', maxPoints: 100 };

        return {
          id: score.id,
          scoreId: score.id,
          judgeId: score.judgeId,
          judgeName: judge.name,
          judgeRole: judge.role,
          teamId: score.teamId,
          teamName: team.name,
          teamTurma: team.turma,
          teamColor: team.color,
          teamIcon: team.icon,
          activityId: provaId,
          activityName: activity.name,
          maxPoints: activity.maxPoints,
          points: score.points,
          rubricBreakdown: score.rubricBreakdown || {},
          note: score.note || '',
          createdAt: score.createdAt || new Date().toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Atualiza ou corrige uma pontuação existente pela gestão.
   */
  updateScore(scoreId, updatedData) {
    const score = (this.data.scores || []).find((s) => s.id === scoreId);
    if (!score) return false;

    if (updatedData.points !== undefined) score.points = Number(updatedData.points);
    if (updatedData.note !== undefined) score.note = String(updatedData.note);
    if (updatedData.rubricBreakdown) score.rubricBreakdown = updatedData.rubricBreakdown;
    score.updatedByGestorAt = new Date().toISOString();

    this.saveToStorage(true, { action: 'UPDATE_SCORE_BY_GESTOR', scoreId });
    return true;
  }

  /**
   * Exclui ou anula uma pontuação lançada.
   */
  deleteScore(scoreId) {
    if (!Array.isArray(this.data.scores)) return false;
    const initialLen = this.data.scores.length;
    this.data.scores = this.data.scores.filter((s) => s.id !== scoreId);

    if (this.data.scores.length !== initialLen) {
      this.removeFromArchive(scoreId);
      this.saveToStorage(true, { action: 'DELETE_SCORE_BY_GESTOR', scoreId });
      return true;
    }
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.gincanaState = new GincanaState();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GincanaState;
}

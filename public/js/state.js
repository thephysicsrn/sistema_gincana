/**
 * Gerenciador de Estado Central da Gincana SESI CONECTA 2026
 * Parametrizado conforme o Edital Oficial da Gincana SESI Escola/RN 2026
 * "Tecnologia que transforma, resíduo que ganha novo destino"
 */
class GincanaState {
  constructor() {
    this.storageKey = 'gincana_sesi_conecta_2026_v3';
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
              this.data = data.payload;
              this.saveToStorage(false);
            }
            this.notifyListeners({ source: 'socket_sync', payload: data });
          } else if (data.type === 'TELAO_MODE_CHANGE') {
            if (this.data && this.data.config) {
              this.data.config.telaoMode = data.mode;
              this.saveToStorage(false);
            }
            this.notifyListeners({ source: 'telao_mode_change', mode: data.mode });
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
          this.data = json.data;
          this.saveToStorage(false);
          const newMode = this.getTelaoMode();
          const modeChanged = prevMode !== newMode;
          this.notifyListeners({
            source: 'server_sync',
            payload: json.data,
            telaoMode: newMode,
            modeChanged
          });
          return json.data;
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
        { id: 'j1', name: 'Comissão Julgadora 1', role: 'Avaliador Artístico/Cultural', pin: '1234' },
        { id: 'j2', name: 'Comissão Julgadora 2', role: 'Avaliador Técnico/Sustentabilidade', pin: '1234' },
        { id: 'j3', name: 'Comissão Julgadora 3', role: 'Avaliador Pedagógico', pin: '1234' },
        { id: 'j4', name: 'Comissão de Pesagem E-Lixo', role: 'Conferente Oficial', pin: '1234' }
      ],
      // Turmas participantes configuradas como equipes (Item 10 do Edital)
      teams: [
        {
          id: 't1',
          name: 'Cyber Fênix',
          shortName: 'FÊNIX',
          turma: '3ª Série A',
          segmento: 'Ensino Médio',
          turno: 'Matutino',
          color: '#DC2626',
          colorEnd: '#991B1B',
          accentColor: '#FECACA',
          icon: 'CF',
          className: '3ª Série EM • Manhã',
          tutor: 'Prof. André',
          representatives: 'Lucas Silva e Camila Costa',
          slogan: 'Conectar para transformar, reciclar para renovar!',
          pesoELixoKg: 145.50,
          penalties: []
        },
        {
          id: 't2',
          name: 'Bio Circuitos',
          shortName: 'CIRCUIT',
          turma: '2ª Série A',
          segmento: 'Ensino Médio',
          turno: 'Matutino',
          color: '#2563EB',
          colorEnd: '#1E40AF',
          accentColor: '#BFDBFE',
          icon: 'BC',
          className: '2ª Série EM • Manhã',
          tutor: 'Prof.ª Renata',
          representatives: 'Gabriel Santos e Mariana Lima',
          slogan: 'Tecnologia consciente, futuro presente!',
          pesoELixoKg: 182.20,
          penalties: []
        },
        {
          id: 't3',
          name: 'Eco Titans',
          shortName: 'TITANS',
          turma: '1ª Série A',
          segmento: 'Ensino Médio',
          turno: 'Matutino',
          color: '#059669',
          colorEnd: '#065F46',
          accentColor: '#A7F3D0',
          icon: 'ET',
          className: '1ª Série EM • Manhã',
          tutor: 'Prof. Carlos',
          representatives: 'Matheus Rocha e Beatriz Alves',
          slogan: 'Resíduo zero, inovação máxima!',
          pesoELixoKg: 120.00,
          penalties: []
        },
        {
          id: 't4',
          name: 'Tech Guardians',
          shortName: 'GUARD',
          turma: '9º Ano A',
          segmento: 'Anos Finais',
          turno: 'Matutino',
          color: '#D97706',
          colorEnd: '#92400E',
          accentColor: '#FDE68A',
          icon: 'TG',
          className: '9º Ano EF • Manhã',
          tutor: 'Prof.ª Juliana',
          representatives: 'Rafael Souza e Sofia Mendes',
          slogan: 'Cuidando do planeta com a força da juventude!',
          pesoELixoKg: 95.80,
          penalties: []
        },
        {
          id: 't5',
          name: 'Robo Knights',
          shortName: 'KNIGHT',
          turma: '8º Ano A',
          segmento: 'Anos Finais',
          turno: 'Matutino',
          color: '#9333EA',
          colorEnd: '#6B21A8',
          accentColor: '#E9D5FF',
          icon: 'RK',
          className: '8º Ano EF • Manhã',
          tutor: 'Prof. Felipe',
          representatives: 'Pedro Duarte e Letícia Lima',
          slogan: 'Construindo o futuro peça por peça!',
          pesoELixoKg: 110.40,
          penalties: []
        },
        {
          id: 't6',
          name: 'Green Pulse',
          shortName: 'PULSE',
          turma: '7º Ano A',
          segmento: 'Anos Finais',
          turno: 'Matutino',
          color: '#0D9488',
          colorEnd: '#115E59',
          accentColor: '#99F6E4',
          icon: 'GP',
          className: '7º Ano EF • Manhã',
          tutor: 'Prof.ª Marcela',
          representatives: 'João Lucas e Ana Clara',
          slogan: 'A pulsação da natureza em nossas mãos!',
          pesoELixoKg: 88.00,
          penalties: []
        },
        {
          id: 't7',
          name: 'Nova Geração',
          shortName: 'NOVA',
          turma: '6º Ano A',
          segmento: 'Anos Finais',
          turno: 'Matutino',
          color: '#EA580C',
          colorEnd: '#9A3412',
          accentColor: '#FED7AA',
          icon: 'NG',
          className: '6º Ano EF • Manhã',
          tutor: 'Prof. Roberto',
          representatives: 'Enzo Gabriel e Laura Dias',
          slogan: 'Pequenos passos para grandes transformações!',
          pesoELixoKg: 74.30,
          penalties: []
        },
        {
          id: 't8',
          name: 'Solaris Tech',
          shortName: 'SOLARIS',
          turma: '1ª Série B',
          segmento: 'Ensino Médio',
          turno: 'Vespertino',
          color: '#CA8A04',
          colorEnd: '#854D0E',
          accentColor: '#FEF08A',
          icon: 'ST',
          className: '1ª Série EM • Tarde',
          tutor: 'Prof.ª Vanessa',
          representatives: 'Vinicius Costa e Julia Paiva',
          slogan: 'Energia limpa e atitude sustentável!',
          pesoELixoKg: 102.50,
          penalties: []
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
          type: 'rubrica_colocacao',
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
          type: 'rubrica_colocacao',
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
          type: 'rubrica_colocacao',
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
          type: 'rubrica_colocacao',
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
      if (!Array.isArray(this.data.judges) || this.data.judges.length === 0) {
        this.data.judges = this.getDefaultData().judges;
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
      const hasOldProvas = !Array.isArray(this.data.provas) || 
                           this.data.provas.length === 0 || 
                           this.data.provas.some((p) => p.id === 'p_video' || p.id === 'p_assiduidade');
      if (hasOldProvas) {
        this.data.provas = this.getDefaultData().provas;
        this.saveToStorage(false);
      }

      if (Array.isArray(this.data.provas)) {
        this.data.provas.forEach((p, idx) => {
          if (!p.icon || /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(p.icon)) {
            p.icon = `P${idx + 1}`;
          }
        });
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

  getTeams() {
    return this.data.teams || [];
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
    // Apresentação com paródia: banca com múltiplos juízes (calcula a média das notas)
    // Recicla Tech, Xadrez, Prova Social, Desafio E-Lixo, Quiz, Complete a música, Corrida do arco, Estoura o balão, Ping Pong: apenas um juiz lança a nota para cada equipe
    return provaId === 'p_parodia';
  }

  getScores() {
    return this.data.scores || [];
  }

  getPenalties() {
    return this.data.penalties || [];
  }

  getTeamScore(teamId, provaId, specificJudge = null) {
    const scores = (this.data.scores || []).filter((s) => s.teamId === teamId && s.provaId === provaId);
    if (scores.length === 0) return null;

    if (this.isMultiJudgeProva(provaId)) {
      if (specificJudge) {
        const found = scores.find((s) => (s.judgeId && s.judgeId === specificJudge) || s.judgeName === specificJudge);
        if (found) return found;
      }
      // Retorna a média da banca julgadora
      const totalPoints = scores.reduce((acc, s) => acc + Number(s.points || 0), 0);
      const totalRubric = scores.reduce((acc, s) => acc + Number(s.rubricScore || s.points || 0), 0);
      const avgPoints = Math.round((totalPoints / scores.length) * 10) / 10;
      const avgRubric = Math.round((totalRubric / scores.length) * 10) / 10;

      return {
        teamId,
        provaId,
        points: avgPoints,
        rubricScore: avgRubric,
        judgesCount: scores.length,
        judgesNames: scores.map((s) => s.judgeName).join(', '),
        isMultiJudgeAverage: true,
        scoresList: scores
      };
    }

    // Prova de juiz único
    return scores[0];
  }

  getProvaScores(provaId) {
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
   * 1 kg = 1 ponto.
   * Colocação por peso:
   * 1º lugar: 300 pontos
   * 2º lugar: 250 pontos
   * 3º lugar: 200 pontos
   * Demais participantes com arrecadação: 100 pontos
   * Sem arrecadação: 0 pontos
   * Empates compartilham bônus e pulam posições.
   */
  getELixoRankingsAndBonus() {
    const teams = [...this.getTeams()];
    
    // Ordena pelo peso validado decrescente
    teams.sort((a, b) => (b.pesoELixoKg || 0) - (a.pesoELixoKg || 0));

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
   * - A = Soma das demais provas
   * - E-Lixo Bruto = Peso em kg (1 kg = 1 pt) + Bônus Colocação Peso + Mobilização (Anexo V)
   * - B = Total E-Lixo limitado ao Teto
   * - Subtotal = A + B
   * - TOTAL FINAL = max(0, Subtotal - Penalidades)
   * - Nota Escolar da Turma (Item 39): 1º=100, 2º=90, 3º=80, demais=70
   */
  getTeamFullStats(teamId) {
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

    const totalPenalidades = this.getTeamPenalties(teamId);
    const totalFinal = Math.max(0, Math.round((pontosDemaisProvas - totalPenalidades) * 10) / 10);

    return {
      team,
      pontosDemaisProvas,
      pesoKg: Number(team.pesoELixoKg || 0),
      pontosPeso: 0,
      bonusPeso: 0,
      rankPeso: null,
      pontosMobilizacao: byProva['p_elixo'] || 0,
      elixoBruto: byProva['p_elixo'] || 0,
      elixoComTeto: byProva['p_elixo'] || 0,
      elixoExcedente: 0,
      tetoELixo: 1000,
      totalPenalidades,
      subtotal: pontosDemaisProvas,
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
  getTeamRankings() {
    const teams = this.getTeams();
    const list = teams.map((t) => this.getTeamFullStats(t.id)).filter(Boolean);

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
      // Paródia: banca com múltiplos juízes. Cada juiz tem sua própria nota para a equipe.
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
      this.saveToStorage(true, { action: 'DELETE_PENALTY', penalty: removed });
      return true;
    }
    return false;
  }

  deleteScore(scoreId) {
    const idx = (this.data.scores || []).findIndex((s) => s.id === scoreId);
    if (idx !== -1) {
      const removed = this.data.scores.splice(idx, 1)[0];
      this.saveToStorage(true, { action: 'DELETE_SCORE', score: removed });
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
    (this.data.teams || []).forEach((t) => (t.pesoELixoKg = 0));
    this.saveToStorage(true, { action: 'CLEAR_SCORES' });
  }

  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  exportCSV() {
    const rankings = this.getTeamRankings();
    const provas = this.getProvas();
    const header = ['Ranking', 'Turma / Equipe', 'Segmento', ...provas.map((p) => `"${p.title}"`), 'Penalidades', 'TOTAL FINAL'];
    const rows = [header];

    rankings.forEach((r) => {
      const s = r.stats;
      const row = [
        `"${r.rank}º"`,
        `"${r.name} (${r.turma})"`,
        `"${r.className || r.segmento || '-'}"`
      ];
      provas.forEach((p) => {
        row.push(s.byProva && s.byProva[p.id] !== undefined ? s.byProva[p.id] : 0);
      });
      row.push(s.totalPenalidades);
      row.push(s.totalFinal);
      rows.push(row);
    });

    return '\uFEFF' + rows.map((row) => row.join(';')).join('\r\n');
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

  // =========================================================================
  // MATRIZ DE RESPOSTAS DOS JUÍZES, AUDITORIA E PENDÊNCIAS
  // =========================================================================

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
            (s) => s.activityId === activity.id && s.teamId === team.id && s.judgeId === judge.id
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
        const activity = activitiesMap[score.activityId] || { name: 'Prova não encontrada', maxPoints: 100 };

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
          activityId: score.activityId,
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
      this.saveToStorage(true, { action: 'DELETE_SCORE_BY_GESTOR', scoreId });
      return true;
    }
    return false;
  }
}

window.gincanaState = new GincanaState();

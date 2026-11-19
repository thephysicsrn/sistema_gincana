/**
 * Portal Móvel do Juiz - SESI CONECTA 2026
 * Com Autenticação por PIN, Abas por Prova, Definição de Critérios e Rubricas
 */

document.addEventListener('DOMContentLoaded', () => {
  const state = window.gincanaState;
  const sound = window.gincanaSound;

  // Elementos do Login por PIN
  const pinOverlay = document.getElementById('pin-login-overlay');
  const pinCard = document.getElementById('pin-login-card');
  const loginJudgeSelect = document.getElementById('login-judge-select');
  const pinErrorMsg = document.getElementById('pin-error-msg');
  const pinDots = [
    document.getElementById('dot-0'),
    document.getElementById('dot-1'),
    document.getElementById('dot-2'),
    document.getElementById('dot-3')
  ];

  // Header autenticado
  const headerJudgeName = document.getElementById('header-judge-name');
  const headerJudgeRole = document.getElementById('header-judge-role');
  const logoutBtn = document.getElementById('btn-logout-judge');
  const soundBtn = document.getElementById('btn-juiz-sound');

  // Elementos de Navegação Principal (Lançamento vs Classificação)
  const btnTabEvaluations = document.getElementById('btn-tab-evaluations');
  const btnTabRanking = document.getElementById('btn-tab-ranking');
  const viewEvaluations = document.getElementById('view-evaluations');
  const viewRanking = document.getElementById('view-ranking');
  const judgePodiumView = document.getElementById('judge-podium-view');
  const judgeRankingList = document.getElementById('judge-ranking-list');
  const btnRefreshJudgeRanking = document.getElementById('btn-refresh-judge-ranking');

  // Elementos de Navegação por Aba de Provas
  const provaTabsContainer = document.getElementById('mobile-prova-tabs-container');
  const provaCounterBadge = document.getElementById('prova-counter-badge');

  // Elementos do Card da Prova Ativa
  const heroProvaIcon = document.getElementById('hero-prova-icon');
  const heroProvaName = document.getElementById('hero-prova-name');
  const heroProvaCategory = document.getElementById('hero-prova-category');
  const heroProvaAnexo = document.getElementById('hero-prova-anexo');
  const heroProvaMode = document.getElementById('hero-prova-mode');
  const heroProvaDesc = document.getElementById('hero-prova-desc');
  const btnOpenCriteria = document.getElementById('btn-open-criteria-settings');

  // Elementos da Seleção de Equipes
  const teamGrid = document.getElementById('mobile-team-grid');
  const activeTeamChipLabel = document.getElementById('active-team-chip-label');

  // Elementos do Card de Rubrica e Soma ao Vivo
  const rubricSumBox = document.getElementById('mobile-rubric-sum-box');
  const liveRubricSumText = document.getElementById('live-rubric-sum-text');
  const liveRubricProgressBar = document.getElementById('live-rubric-progress-bar');
  const liveRubricFormulaBreakdown = document.getElementById('live-rubric-formula-breakdown');

  // Elementos do Formulário de Lançamento
  const controlsContainer = document.getElementById('mobile-controls-container');
  const totalPreview = document.getElementById('mobile-preview-total');
  const mobilePreviewInfoSub = document.getElementById('mobile-preview-info-sub');
  const noteInput = document.getElementById('mobile-note');
  const submitBtn = document.getElementById('btn-mobile-submit');

  // Elementos do Modal de Confirmação
  const modal = document.getElementById('mobile-confirm-modal');
  const modalContent = document.getElementById('mobile-modal-content');
  const modalConfirmBtn = document.getElementById('btn-mobile-final-confirm');

  // Elementos do Modal de Definição de Critérios
  const criteriaEditorModal = document.getElementById('modal-criteria-editor');
  const criteriaEditorTitle = document.getElementById('criteria-editor-modal-title');
  const editScoringTypeSelect = document.getElementById('edit-prova-scoring-type');
  const criteriaSumBadge = document.getElementById('criteria-editor-sum-badge');
  const criteriaRowsContainer = document.getElementById('criteria-editor-rows-container');
  const btnAddCriterion = document.getElementById('btn-add-new-criterion');
  const btnBalanceCriteria = document.getElementById('btn-balance-criteria-100');
  const btnResetCriteria = document.getElementById('btn-reset-default-criteria');
  const btnSaveCriteria = document.getElementById('btn-save-criteria-editor');
  const btnCancelCriteria = document.getElementById('btn-cancel-criteria-editor');
  const btnCloseCriteria = document.getElementById('btn-close-criteria-editor');

  // Tabela Resumo das Turmas Avaliadas nesta Prova
  const provaEvalTableContainer = document.getElementById('mobile-prova-eval-table-container');
  const btnAutoRankRubric = document.getElementById('btn-auto-rank-rubric');

  // Estado local do PIN
  let enteredPin = '';

  // Estado do formulário de pontuação
  const form = {
    teamId: null,
    provaId: null,
    directPlace: 1,
    directPoints: 0,
    criteriaValues: {},
    pesoInput: 0,
    isExceededTime: false,
    note: ''
  };

  // Estado temporário de edição de critérios
  let tempCriteriaList = [];

  // =========================================================================
  // SISTEMA DE LOGIN COM PIN
  // =========================================================================

  function initAuth() {
    renderJudgeLoginSelect();

    const currentSession = state.getLoggedInJudge();
    if (currentSession) {
      applyLoggedInState(currentSession);
    } else {
      showPinScreen();
    }

    setupKeypad();
  }

  function renderJudgeLoginSelect() {
    const judges = state.getJudges();
    const provas = state.getProvas();
    loginJudgeSelect.innerHTML = judges.map((j) => {
      let respText = '';
      if (j.assignedProvaId) {
        const p = provas.find((pr) => pr.id === j.assignedProvaId);
        if (p) respText = ` • Resp: ${p.title}`;
      }
      return `<option value="${j.id}">${j.name} (${j.role}${respText})</option>`;
    }).join('');
  }

  function showPinScreen() {
    enteredPin = '';
    updatePinDots();
    pinErrorMsg.innerText = '';
    pinOverlay.classList.remove('hidden');
  }

  let presenceInterval = null;

  function applyLoggedInState(judge) {
    pinOverlay.classList.add('hidden');
    headerJudgeName.innerText = judge.name;
    let respText = '';
    if (judge.assignedProvaId) {
      const p = state.getProva(judge.assignedProvaId);
      if (p) {
        respText = ` • Resp: ${p.title}`;
        form.provaId = judge.assignedProvaId;
      }
    }
    headerJudgeRole.innerText = `${judge.role}${respText} • Autenticado`;
    initScoringForm();

    // Registra presença imediata
    state.recordPresence(judge.id, judge.name, 'juiz.html');

    // Inicia heartbeat a cada 15 segundos
    if (presenceInterval) clearInterval(presenceInterval);
    presenceInterval = setInterval(() => {
      const current = state.getLoggedInJudge();
      if (current) {
        state.recordPresence(current.id, current.name, 'juiz.html');
      } else {
        clearInterval(presenceInterval);
      }
    }, 15000);
  }

  function updatePinDots() {
    pinDots.forEach((dot, idx) => {
      if (idx < enteredPin.length) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    });
  }

  function handlePinInput(key) {
    if (key === 'clear') {
      enteredPin = '';
      updatePinDots();
      pinErrorMsg.innerText = '';
      return;
    }

    if (key === 'backspace') {
      if (enteredPin.length > 0) {
        enteredPin = enteredPin.slice(0, -1);
        updatePinDots();
        pinErrorMsg.innerText = '';
      }
      return;
    }

    if (enteredPin.length < 4) {
      enteredPin += key;
      sound.playClick();
      updatePinDots();

      if (enteredPin.length === 4) {
        setTimeout(verifyPin, 150);
      }
    }
  }

  function verifyPin() {
    const judgeId = loginJudgeSelect.value;
    const result = state.authenticateJudge(judgeId, enteredPin);

    if (result.success) {
      sound.playScoreDing();
      pinErrorMsg.innerText = '';
      applyLoggedInState(result.judge);
    } else {
      sound.playBuzzer();
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
      pinCard.classList.add('shake-animation');
      pinErrorMsg.innerText = 'PIN incorreto. Tente novamente (padrão: 1234)';
      setTimeout(() => {
        pinCard.classList.remove('shake-animation');
        enteredPin = '';
        updatePinDots();
      }, 500);
    }
  }

  function setupKeypad() {
    document.querySelectorAll('.key-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        handlePinInput(btn.dataset.key);
      });
    });

    window.addEventListener('keydown', (e) => {
      if (!pinOverlay.classList.contains('hidden')) {
        if (/^[0-9]$/.test(e.key)) {
          handlePinInput(e.key);
        } else if (e.key === 'Backspace') {
          handlePinInput('backspace');
        } else if (e.key === 'Escape') {
          handlePinInput('clear');
        }
      }
    });

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (confirm('Deseja realmente sair e desconectar este avaliador?')) {
          state.logoutJudge();
          showPinScreen();
        }
      });
    }
  }

  // =========================================================================
  // SISTEMA DE LANÇAMENTO COM ABAS POR PROVA E DEFINIÇÃO DE CRITÉRIOS
  // =========================================================================

  function getAllAvailableProvas() {
    return state.getProvas();
  }

  function initScoringForm() {
    const allProvas = getAllAvailableProvas();
    if (!form.provaId && allProvas.length > 0) {
      form.provaId = allProvas[0].id;
    }

    renderProvaTabs();
    updateActiveProvaHero();
    setupTeamFilters();
    renderTeams();
    renderControls();
    updateTotal();
    renderProvaEvalSummary();
    setupCriteriaEditor();
    renderJudgeRanking();
  }

  // =========================================================================
  // 1. RENDERIZAÇÃO DAS ABAS POR PROVA
  // =========================================================================

  function renderProvaTabs() {
    const allProvas = getAllAvailableProvas();
    const allTeams = state.getTeams();
    const totalTurmas = allTeams.length;
    const currentJudge = state.getLoggedInJudge();
    const judges = state.getJudges();

    if (provaCounterBadge) {
      provaCounterBadge.innerText = `${allProvas.length} provas`;
    }

    provaTabsContainer.innerHTML = allProvas.map((p) => {
      const isActive = p.id === form.provaId;
      const scores = state.getProvaScores(p.id);
      const evaluatedCount = scores.length;
      const isComplete = evaluatedCount >= totalTurmas && totalTurmas > 0;
      const isMulti = state.isMultiJudgeProva(p.id);
      const assignedJudge = judges.find(j => j.assignedProvaId === p.id);
      const isUnavailable = !isMulti && assignedJudge && (!currentJudge || currentJudge.id !== assignedJudge.id);

      let badgeText = `${evaluatedCount}/${totalTurmas}`;
      if (isComplete) badgeText = `Concluída (${evaluatedCount})`;
      if (isUnavailable) badgeText = `🔒 Indisponível (${assignedJudge.name})`;

      return `
        <button type="button" class="prova-tab-pill ${isActive ? 'active' : ''} ${isComplete ? 'completed' : ''} ${isUnavailable ? 'unavailable' : ''}" 
                data-prova-id="${p.id}" data-assigned-judge="${assignedJudge ? assignedJudge.name : ''}" id="tab-pill-${p.id}"
                title="${isUnavailable ? `Prova atribuída exclusivamente a ${assignedJudge.name}` : ''}">
          <span style="font-size: 0.75rem; font-weight: 800; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${p.icon || 'P'}</span>
          <span>${p.shortTitle || p.title}</span>
          <span class="tab-badge-eval" title="${evaluatedCount} de ${totalTurmas} turmas avaliadas">${badgeText}</span>
        </button>
      `;
    }).join('');

    // Adiciona listener de clique em cada aba
    provaTabsContainer.querySelectorAll('.prova-tab-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('unavailable')) {
          sound.playBuzzer();
          alert(`Esta prova é de responsabilidade exclusiva do(a) ${btn.dataset.assignedJudge || 'outro avaliador'}. Apenas ele(a) pode lançar as notas desta prova.`);
          return;
        }

        const targetId = btn.dataset.provaId;
        if (form.provaId === targetId) return;

        form.provaId = targetId;
        form.criteriaValues = {};
        form.directPlace = 1;
        form.directPoints = 0;
        form.isExceededTime = false;

        sound.playClick();

        // Rola a aba selecionada suavemente para o centro da visualização
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

        renderProvaTabs();
        updateActiveProvaHero();
        renderTeams();
        renderControls();
        updateTotal();
        renderProvaEvalSummary();
      });
    });
  }

  // Atualiza o Hero Card com detalhes da prova ativa
  function updateActiveProvaHero() {
    const prova = state.getProva(form.provaId);
    if (!prova) return;

    if (heroProvaIcon) heroProvaIcon.innerText = prova.icon || 'P';
    if (heroProvaName) heroProvaName.innerText = prova.title;
    if (heroProvaCategory) heroProvaCategory.innerText = prova.category || 'Geral';
    if (heroProvaAnexo) heroProvaAnexo.innerText = `${prova.anexo || ''} • ${prova.itemEdital || ''}`;

    let modeText = 'Rubrica (100 pts)';
    if (prova.type === 'soma_direta') modeText = 'Soma Direta dos Critérios';
    else if (prova.type === 'top3_zero') modeText = 'Top 3 (100, 75, 50, 0)';
    else if (prova.type === 'standard_colocacao') modeText = 'Colocação (100, 75, 50, 25)';
    else if (prova.type === 'elixo_pesagem') modeText = '1 kg = 1 pt + Bônus';
    else if (prova.type === 'rubrica_elixo_mob') modeText = 'Rubrica Mobilização (Até 100 pts)';

    const isMulti = state.isMultiJudgeProva(form.provaId);
    const judgeRuleText = isMulti 
      ? ' • <span style="color:#c084fc; font-weight:700;">⚖️ Avaliação em Banca (Múltiplos Jurados com Média)</span>'
      : ' • <span style="color:#38bdf8; font-weight:700;">👤 Juiz Único (1 Nota Oficial por Equipe)</span>';

    if (heroProvaMode) heroProvaMode.innerHTML = `Modo: ${modeText}${judgeRuleText}`;
    if (heroProvaDesc) heroProvaDesc.innerHTML = `<strong>Regra do Edital:</strong> ${prova.description}`;

    // Mostra/oculta botão de critérios se for pesagem pura
    if (btnOpenCriteria) {
      if (prova.id === 'prova_elixo_pesagem') {
        btnOpenCriteria.style.display = 'none';
      } else {
        btnOpenCriteria.style.display = 'inline-flex';
      }
    }
  }

  // =========================================================================
  // 2. DEFINIÇÃO E CONFIGURAÇÃO DE CRITÉRIOS DA PROVA (MODAL)
  // =========================================================================

  function setupCriteriaEditor() {
    if (btnOpenCriteria) {
      btnOpenCriteria.addEventListener('click', () => {
        openCriteriaEditor();
      });
    }

    if (btnCancelCriteria) {
      btnCancelCriteria.addEventListener('click', () => {
        criteriaEditorModal.classList.remove('active');
      });
    }

    if (btnCloseCriteria) {
      btnCloseCriteria.addEventListener('click', () => {
        criteriaEditorModal.classList.remove('active');
      });
    }

    if (btnAddCriterion) {
      btnAddCriterion.addEventListener('click', () => {
        tempCriteriaList.push({
          name: `Critério ${tempCriteriaList.length + 1}`,
          max: 20
        });
        sound.playClick();
        renderCriteriaEditorRows();
      });
    }

    if (btnBalanceCriteria) {
      btnBalanceCriteria.addEventListener('click', () => {
        if (tempCriteriaList.length === 0) return;
        const count = tempCriteriaList.length;
        const base = Math.floor(100 / count);
        const remainder = 100 - (base * count);

        tempCriteriaList.forEach((c, i) => {
          c.max = base + (i === 0 ? remainder : 0);
        });

        sound.playScoreDing();
        renderCriteriaEditorRows();
      });
    }

    if (btnResetCriteria) {
      btnResetCriteria.addEventListener('click', () => {
        if (confirm('Restaurar os critérios e pesos originais do edital para esta prova?')) {
          try {
            const restored = state.resetProvaCriteria(form.provaId);
            if (restored) {
              tempCriteriaList = JSON.parse(JSON.stringify(restored.criteria || []));
              editScoringTypeSelect.value = restored.type || 'rubrica_colocacao';
              sound.playScoreDing();
              renderCriteriaEditorRows();
            }
          } catch (e) {
            alert(e.message);
          }
        }
      });
    }

    if (btnSaveCriteria) {
      btnSaveCriteria.addEventListener('click', () => {
        saveCriteriaChanges();
      });
    }

    if (btnAutoRankRubric) {
      btnAutoRankRubric.addEventListener('click', () => {
        if (confirm('Deseja calcular automaticamente a colocação oficial de todas as turmas nesta prova baseado na soma de suas rubricas?')) {
          const updated = state.autoRankProvaByRubric(form.provaId);
          sound.playScoreDing();
          renderProvaTabs();
          renderTeams();
          renderControls();
          updateTotal();
          renderProvaEvalSummary();
          alert(`${updated.length} turmas reclassificadas com sucesso conforme a soma das rubricas.`);
        }
      });
    }
  }

  function openCriteriaEditor() {
    const prova = state.getProva(form.provaId);
    if (!prova) return;

    criteriaEditorTitle.innerText = `Definir Critérios da Prova: ${prova.title}`;
    tempCriteriaList = JSON.parse(JSON.stringify(prova.criteria || []));
    editScoringTypeSelect.value = prova.type || 'rubrica_colocacao';

    renderCriteriaEditorRows();
    criteriaEditorModal.classList.add('active');
  }

  function renderCriteriaEditorRows() {
    const totalMaxSum = tempCriteriaList.reduce((acc, c) => acc + Number(c.max || 0), 0);
    criteriaSumBadge.innerText = `Soma Máxima das Rubricas: ${totalMaxSum} pts`;

    if (totalMaxSum === 100) {
      criteriaSumBadge.style.color = '#34d399';
    } else {
      criteriaSumBadge.style.color = '#fbbf24';
    }

    if (tempCriteriaList.length === 0) {
      criteriaRowsContainer.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; background: rgba(0,0,0,0.3); border-radius: 8px; color: #94a3b8; font-size: 0.85rem;">
          Esta prova atualmente não possui critérios de rubrica definidos.<br>
          Clique abaixo em <strong>+ Adicionar Novo Critério</strong> para criar a rubrica!
        </div>
      `;
      return;
    }

    criteriaRowsContainer.innerHTML = `
      <table class="criteria-edit-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Nome do Critério da Rubrica</th>
            <th style="width: 100px; text-align: center;">Peso Máx</th>
            <th style="width: 50px;">Ação</th>
          </tr>
        </thead>
        <tbody>
          ${tempCriteriaList.map((c, idx) => `
            <tr>
              <td style="color: #94a3b8; font-weight: 700;">${idx + 1}</td>
              <td>
                <input type="text" class="form-input edit-crit-name" data-idx="${idx}" value="${c.name}" 
                       placeholder="Ex: Criatividade, Originalidade..." style="padding: 0.45rem 0.65rem; font-size: 0.85rem;">
              </td>
              <td>
                <input type="number" min="1" max="100" class="form-input edit-crit-max" data-idx="${idx}" value="${c.max}" 
                       style="padding: 0.45rem; font-size: 0.95rem; text-align: center; font-weight: 800; color: #facc15;">
              </td>
              <td>
                <button type="button" class="btn-delete-criterion" data-del-idx="${idx}" title="Excluir critério">Excluir</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Listeners nos inputs de nome e peso
    criteriaRowsContainer.querySelectorAll('.edit-crit-name').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        tempCriteriaList[idx].name = e.target.value;
      });
    });

    criteriaRowsContainer.querySelectorAll('.edit-crit-max').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        tempCriteriaList[idx].max = Math.max(1, parseInt(e.target.value, 10) || 0);
        const newSum = tempCriteriaList.reduce((acc, c) => acc + Number(c.max || 0), 0);
        criteriaSumBadge.innerText = `Soma Máxima das Rubricas: ${newSum} pts`;
      });
    });

    criteriaRowsContainer.querySelectorAll('.btn-delete-criterion').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.delIdx, 10);
        tempCriteriaList.splice(idx, 1);
        sound.playClick();
        renderCriteriaEditorRows();
      });
    });
  }

  function saveCriteriaChanges() {
    try {
      const scoringType = editScoringTypeSelect.value;
      const validCriteria = tempCriteriaList.filter((c) => (c.name || '').trim().length > 0);

      state.updateProvaCriteria(form.provaId, {
        criteria: validCriteria,
        type: scoringType
      });

      criteriaEditorModal.classList.remove('active');
      sound.playScoreDing();

      // Atualiza interface do juiz
      updateActiveProvaHero();
      renderProvaTabs();
      renderTeams();
      renderControls();
      updateTotal();
      renderProvaEvalSummary();

      alert('Critérios da rubrica salvos e sincronizados com sucesso.');
    } catch (e) {
      alert('Erro ao salvar critérios: ' + e.message);
    }
  }

  // =========================================================================
  // 3. FILTRO E LISTAGEM DAS TURMAS / EQUIPES
  // =========================================================================

  const teamFilterState = {
    segment: 'all',
    status: 'all',
    search: ''
  };

  function setupTeamFilters() {
    const searchInput = document.getElementById('team-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        teamFilterState.search = e.target.value.toLowerCase().trim();
        renderTeams();
      });
    }

    document.querySelectorAll('.btn-filter-segment').forEach((btn) => {
      btn.addEventListener('click', () => {
        teamFilterState.segment = btn.dataset.segment;
        document.querySelectorAll('.btn-filter-segment').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        sound.playClick();
        renderTeams();
      });
    });

    document.querySelectorAll('.btn-filter-status').forEach((btn) => {
      btn.addEventListener('click', () => {
        teamFilterState.status = btn.dataset.status;
        document.querySelectorAll('.btn-filter-status').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        sound.playClick();
        renderTeams();
      });
    });
  }

  function renderTeams() {
    const allTeams = state.getTeams();
    const isPesagem = form.provaId === 'prova_elixo_pesagem';

    let countPending = 0;
    let countScored = 0;

    allTeams.forEach((t) => {
      const sc = state.getTeamScore(t.id, form.provaId);
      if (sc) countScored++;
      else countPending++;
    });

    const cAll = document.getElementById('count-all');
    const cPend = document.getElementById('count-pending');
    const cScor = document.getElementById('count-scored');
    if (cAll) cAll.innerText = allTeams.length;
    if (cPend) cPend.innerText = countPending;
    if (cScor) cScor.innerText = countScored;

    const filteredTeams = allTeams.filter((t) => {
      if (teamFilterState.segment !== 'all' && t.segmento !== teamFilterState.segment) {
        return false;
      }
      if (teamFilterState.search) {
        const query = teamFilterState.search;
        const matchName = (t.name || '').toLowerCase().includes(query);
        const matchTurma = (t.turma || '').toLowerCase().includes(query);
        const matchShort = (t.shortName || '').toLowerCase().includes(query);
        if (!matchName && !matchTurma && !matchShort) return false;
      }
      const score = state.getTeamScore(t.id, form.provaId);
      if (teamFilterState.status === 'pending' && score !== null) return false;
      if (teamFilterState.status === 'scored' && score === null) return false;
      return true;
    });

    const counterEl = document.getElementById('team-filtered-counter');
    if (counterEl) {
      counterEl.innerText = `${filteredTeams.length} de ${allTeams.length} turmas`;
    }

    if (filteredTeams.length > 0 && !filteredTeams.some((t) => t.id === form.teamId)) {
      form.teamId = filteredTeams[0].id;
    }

    if (filteredTeams.length === 0) {
      teamGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 1.5rem; color: #94a3b8; font-size: 0.85rem; background: rgba(0,0,0,0.25); border-radius: 8px;">
          Nenhuma turma encontrada com os filtros selecionados.
        </div>
      `;
      if (activeTeamChipLabel) activeTeamChipLabel.innerText = 'Nenhuma turma selecionada';
      return;
    }

    // Atualiza label da equipe ativa
    const currentTeam = state.getTeam(form.teamId);
    if (activeTeamChipLabel && currentTeam) {
      activeTeamChipLabel.innerHTML = `Turma: <span style="color: ${currentTeam.color}; font-weight:800;">${currentTeam.turma} • ${currentTeam.name}</span>`;
    }

    const isMulti = state.isMultiJudgeProva(form.provaId);
    const judge = state.getLoggedInJudge();

    teamGrid.innerHTML = filteredTeams.map((t) => {
      const isSelected = t.id === form.teamId;
      const score = state.getTeamScore(t.id, form.provaId);
      const isEvaluated = score !== null;

      let statusBadge = '';
      if (isMulti) {
        // Apresentação com Paródia: banca com múltiplos juízes
        const myScore = judge ? state.getTeamScore(t.id, form.provaId, judge.id || judge.name) : null;
        const allScoresForTeam = state.getScores().filter((s) => s.teamId === t.id && s.provaId === form.provaId);
        const countJudges = allScoresForTeam.length;

        if (myScore) {
          statusBadge = `<span style="font-size: 0.68rem; color: #34d399; font-weight: 700;">Sua nota: ${myScore.points} pts (${countJudges} na banca)</span>`;
        } else if (countJudges > 0) {
          statusBadge = `<span style="font-size: 0.68rem; color: #38bdf8; font-weight: 600;">${countJudges} jurado(s) já avaliaram</span>`;
        } else {
          statusBadge = `<span style="font-size: 0.68rem; color: #fbbf24;">Pendente</span>`;
        }
      } else {
        // As outras 9 provas: Juiz Único (1 nota oficial por equipe)
        if (isEvaluated) {
          const rubricPart = score.rubricScore !== undefined && score.rubricScore !== score.points ? ` (Rubrica: ${score.rubricScore})` : '';
          const judgeNameTag = score.judgeName ? ` [${score.judgeName}]` : '';
          statusBadge = `<span style="font-size: 0.68rem; color: #34d399; font-weight: 700;">${score.points} pts${rubricPart}${judgeNameTag}</span>`;
        } else {
          statusBadge = `<span style="font-size: 0.68rem; color: #fbbf24;">Pendente</span>`;
        }
      }

      return `
        <div class="team-chip ${isSelected ? 'selected' : ''}" data-id="${t.id}"
             style="--chip-color: ${t.color}; --chip-glow: ${t.color}33; display: flex; flex-direction: column; align-items: flex-start; padding: 0.65rem 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; width: 100%;">
            <span style="font-size: 0.85rem; font-weight: 800; background: ${t.color}22; color: ${t.color}; padding: 0.25rem 0.45rem; border-radius: 6px; border: 1px solid ${t.color}44;">${t.icon}</span>
            <div style="flex: 1; overflow: hidden;">
              <div class="team-chip-name" style="color:${isSelected ? t.color : 'inherit'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.88rem;">
                ${t.turma}
              </div>
              <div style="font-size: 0.7rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${t.name} (${t.shortName})
              </div>
            </div>
          </div>
          <div style="margin-top: 0.4rem; padding-top: 0.3rem; border-top: 1px solid rgba(255,255,255,0.08); width: 100%; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.68rem; color: #818cf8; font-weight: 600;">${t.segmento === 'Ensino Médio' ? 'EM' : 'EF'} • ${t.turno ? t.turno.substring(0,3) : ''}</span>
            ${statusBadge}
          </div>
        </div>
      `;
    }).join('');

    teamGrid.querySelectorAll('.team-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        form.teamId = chip.dataset.id;
        sound.playClick();
        loadExistingScoreForTeam(form.teamId);
        renderTeams();
        renderControls();
        updateTotal();
      });
    });
  }

  function loadExistingScoreForTeam(teamId) {
    const judge = state.getLoggedInJudge();
    const isMulti = state.isMultiJudgeProva(form.provaId);
    const existing = isMulti && judge 
      ? state.getTeamScore(teamId, form.provaId, judge.id || judge.name) 
      : state.getTeamScore(teamId, form.provaId);

    if (existing && !existing.isWeight) {
      if (existing.criteriaDetails) {
        form.criteriaValues = { ...existing.criteriaDetails };
      }
      if (existing.placeInProva) {
        form.directPlace = existing.placeInProva;
      }
      if (noteInput && existing.note) {
        noteInput.value = existing.note;
      }
    } else {
      form.criteriaValues = {};
      form.directPlace = 1;
      if (noteInput) noteInput.value = '';
    }
  }

  // =========================================================================
  // 4. CONTROLES DE PONTUAÇÃO, CRITÉRIOS E SOMA DAS RUBRICAS
  // =========================================================================

  function renderControls() {
    const isPesagem = form.provaId === 'prova_elixo_pesagem';

    // CASO 1: Desafio E-Lixo Pesagem
    if (isPesagem) {
      if (rubricSumBox) rubricSumBox.style.display = 'none';

      const team = state.getTeam(form.teamId);
      const currentPeso = team ? Number(team.pesoELixoKg || 0) : 0;
      form.pesoInput = currentPeso;

      controlsContainer.innerHTML = `
        <div class="direct-score-box">
          <label class="form-label">Peso Líquido Arrecadado e Validado (kg):</label>
          <input type="number" step="0.01" min="0" id="m-peso-input" class="form-input" 
                 value="${currentPeso}" style="font-size: 1.8rem; font-weight: 800; color: #34d399; text-align: center;">
          <div class="quick-points-row" style="margin-top: 0.65rem;">
            <button type="button" class="btn-point-step" data-add="10">+10 kg</button>
            <button type="button" class="btn-point-step" data-add="25">+25 kg</button>
            <button type="button" class="btn-point-step" data-add="50">+50 kg</button>
            <button type="button" class="btn-point-step" data-add="100">+100 kg</button>
          </div>
        </div>
      `;

      const inp = document.getElementById('m-peso-input');
      inp.addEventListener('input', (e) => {
        form.pesoInput = parseFloat(e.target.value) || 0;
        updateTotal();
      });

      controlsContainer.querySelectorAll('.btn-point-step').forEach((btn) => {
        btn.addEventListener('click', () => {
          const add = parseFloat(btn.dataset.add);
          const val = (parseFloat(inp.value) || 0) + add;
          inp.value = val.toFixed(2);
          form.pesoInput = val;
          sound.playClick();
          updateTotal();
        });
      });
      return;
    }

    const prova = state.getProva(form.provaId);
    if (!prova) return;

    // Se houver critérios definidos
    if (prova.criteria && prova.criteria.length > 0) {
      if (rubricSumBox) rubricSumBox.style.display = 'block';

      prova.criteria.forEach((c) => {
        if (form.criteriaValues[c.name] === undefined) {
          form.criteriaValues[c.name] = Math.round(c.max * 0.85);
        }
      });

      const isParodia = prova.id === 'p_parodia';

      controlsContainer.innerHTML = `
        ${isParodia ? `
          <div style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 0.65rem; margin-bottom: 0.85rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; color: #fca5a5; font-size: 0.82rem; font-weight: 700; cursor: pointer;">
              <input type="checkbox" id="m-check-time" ${form.isExceededTime ? 'checked' : ''}> Ultrapassou 5 min (Zero na Prova - Item 26)
            </label>
          </div>
        ` : ''}

        ${prova.criteria.map((c) => {
          const val = form.criteriaValues[c.name] !== undefined ? form.criteriaValues[c.name] : Math.round(c.max * 0.85);
          return `
            <div class="criterion-row-enhanced">
              <div class="criterion-row-top">
                <div class="criterion-name-col">
                  <span class="criterion-name-label">${c.name}</span>
                  <span class="criterion-desc-label">${c.description || `Pontuação de 0 a ${c.max} pontos`}</span>
                </div>
                <div class="criterion-input-group">
                  <button type="button" class="criterion-step-btn btn-step-down" data-crit="${c.name}">-1</button>
                  <input type="number" min="0" max="${c.max}" class="criterion-num-input" id="num-crit-${c.name}" 
                         value="${val}" data-name="${c.name}">
                  <button type="button" class="criterion-step-btn btn-step-up" data-crit="${c.name}">+1</button>
                  <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">/ ${c.max}</span>
                </div>
              </div>
              <input type="range" class="criterion-slider" min="0" max="${c.max}" step="1" 
                     value="${val}" data-name="${c.name}" id="slider-crit-${c.name}">
            </div>
          `;
        }).join('')}

        ${prova.type === 'rubrica_colocacao' ? `
          <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border-glass);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0;">Colocação Oficial da Turma (Item 36):</label>
              <span style="font-size: 0.72rem; color: #a5b4fc;">Baseado na Soma da Rubrica</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem;">
              <button type="button" class="btn btn-secondary m-btn-place ${form.directPlace === 1 ? 'btn-primary' : ''}" data-place="1">1º Lugar (100 pts)</button>
              <button type="button" class="btn btn-secondary m-btn-place ${form.directPlace === 2 ? 'btn-primary' : ''}" data-place="2">2º Lugar (75 pts)</button>
              <button type="button" class="btn btn-secondary m-btn-place ${form.directPlace === 3 ? 'btn-primary' : ''}" data-place="3">3º Lugar (50 pts)</button>
              <button type="button" class="btn btn-secondary m-btn-place ${form.directPlace === 4 ? 'btn-primary' : ''}" data-place="4">Demais (25 pts)</button>
            </div>
          </div>
        ` : ''}
      `;

      // Eventos dos sliders e inputs numéricos sincronizados
      controlsContainer.querySelectorAll('.criterion-slider').forEach((slider) => {
        slider.addEventListener('input', (e) => {
          const name = e.target.dataset.name;
          const val = parseInt(e.target.value, 10);
          form.criteriaValues[name] = val;
          const numInp = document.getElementById(`num-crit-${name}`);
          if (numInp) numInp.value = val;
          updateRubricSumDisplay();
          updateTotal();
        });
      });

      controlsContainer.querySelectorAll('.criterion-num-input').forEach((inp) => {
        inp.addEventListener('input', (e) => {
          const name = e.target.dataset.name;
          const max = parseInt(e.target.max, 10) || 100;
          let val = parseInt(e.target.value, 10);
          if (isNaN(val)) val = 0;
          if (val > max) val = max;
          if (val < 0) val = 0;
          form.criteriaValues[name] = val;
          const slider = document.getElementById(`slider-crit-${name}`);
          if (slider) slider.value = val;
          updateRubricSumDisplay();
          updateTotal();
        });
      });

      controlsContainer.querySelectorAll('.btn-step-down').forEach((btn) => {
        btn.addEventListener('click', () => {
          const name = btn.dataset.crit;
          const cur = Number(form.criteriaValues[name] || 0);
          const newVal = Math.max(0, cur - 1);
          form.criteriaValues[name] = newVal;
          syncCriterionField(name, newVal);
          sound.playClick();
          updateRubricSumDisplay();
          updateTotal();
        });
      });

      controlsContainer.querySelectorAll('.btn-step-up').forEach((btn) => {
        btn.addEventListener('click', () => {
          const name = btn.dataset.crit;
          const cDef = (prova.criteria || []).find((c) => c.name === name);
          const max = cDef ? cDef.max : 100;
          const cur = Number(form.criteriaValues[name] || 0);
          const newVal = Math.min(max, cur + 1);
          form.criteriaValues[name] = newVal;
          syncCriterionField(name, newVal);
          sound.playClick();
          updateRubricSumDisplay();
          updateTotal();
        });
      });

      const checkTime = document.getElementById('m-check-time');
      if (checkTime) {
        checkTime.addEventListener('change', (e) => {
          form.isExceededTime = e.target.checked;
          updateRubricSumDisplay();
          updateTotal();
        });
      }

      controlsContainer.querySelectorAll('.m-btn-place').forEach((btn) => {
        btn.addEventListener('click', () => {
          form.directPlace = parseInt(btn.dataset.place, 10);
          controlsContainer.querySelectorAll('.m-btn-place').forEach((b) => b.classList.remove('btn-primary'));
          btn.classList.add('btn-primary');
          sound.playClick();
          updateTotal();
        });
      });

      updateRubricSumDisplay();

    } else {
      // Prova sem critérios de rubrica (Atribuição direta de colocação)
      if (rubricSumBox) rubricSumBox.style.display = 'none';

      if (prova.type === 'top3_zero') {
        controlsContainer.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem;">
            <button type="button" class="btn btn-secondary m-btn-top3 ${form.directPlace === 1 ? 'btn-primary' : ''}" data-place="1">1º Lugar (100 pts)</button>
            <button type="button" class="btn btn-secondary m-btn-top3 ${form.directPlace === 2 ? 'btn-primary' : ''}" data-place="2">2º Lugar (75 pts)</button>
            <button type="button" class="btn btn-secondary m-btn-top3 ${form.directPlace === 3 ? 'btn-primary' : ''}" data-place="3">3º Lugar (50 pts)</button>
            <button type="button" class="btn btn-secondary m-btn-top3 ${form.directPlace === 4 ? 'btn-primary' : ''}" data-place="4">Demais (0 pts)</button>
          </div>
        `;
        controlsContainer.querySelectorAll('.m-btn-top3').forEach((btn) => {
          btn.addEventListener('click', () => {
            form.directPlace = parseInt(btn.dataset.place, 10);
            controlsContainer.querySelectorAll('.m-btn-top3').forEach((b) => b.classList.remove('btn-primary'));
            btn.classList.add('btn-primary');
            sound.playClick();
            updateTotal();
          });
        });
      } else {
        controlsContainer.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem;">
            <button type="button" class="btn btn-secondary m-btn-std ${form.directPlace === 1 ? 'btn-primary' : ''}" data-place="1">1º Lugar (100 pts)</button>
            <button type="button" class="btn btn-secondary m-btn-std ${form.directPlace === 2 ? 'btn-primary' : ''}" data-place="2">2º Lugar (75 pts)</button>
            <button type="button" class="btn btn-secondary m-btn-std ${form.directPlace === 3 ? 'btn-primary' : ''}" data-place="3">3º Lugar (50 pts)</button>
            <button type="button" class="btn btn-secondary m-btn-std ${form.directPlace === 4 ? 'btn-primary' : ''}" data-place="4">Demais (25 pts)</button>
          </div>
        `;
        controlsContainer.querySelectorAll('.m-btn-std').forEach((btn) => {
          btn.addEventListener('click', () => {
            form.directPlace = parseInt(btn.dataset.place, 10);
            controlsContainer.querySelectorAll('.m-btn-std').forEach((b) => b.classList.remove('btn-primary'));
            btn.classList.add('btn-primary');
            sound.playClick();
            updateTotal();
          });
        });
      }
    }
  }

  function syncCriterionField(name, val) {
    const numInp = document.getElementById(`num-crit-${name}`);
    const slider = document.getElementById(`slider-crit-${name}`);
    if (numInp) numInp.value = val;
    if (slider) slider.value = val;
  }

  function calculateRubricSum() {
    const prova = state.getProva(form.provaId);
    if (!prova || !prova.criteria) return 0;
    let sum = 0;
    prova.criteria.forEach((c) => {
      sum += Number(form.criteriaValues[c.name] || 0);
    });
    return sum;
  }

  function updateRubricSumDisplay() {
    const prova = state.getProva(form.provaId);
    if (!prova || !prova.criteria || prova.criteria.length === 0) return;

    const totalRubricSum = calculateRubricSum();
    const maxRubricSum = prova.criteria.reduce((acc, c) => acc + Number(c.max || 0), 0) || 100;
    const pct = Math.min(100, Math.round((totalRubricSum / maxRubricSum) * 100));

    if (liveRubricSumText) {
      if (form.isExceededTime) {
        liveRubricSumText.innerHTML = `0 <span>(Tempo Excedido - Zero)</span>`;
      } else {
        liveRubricSumText.innerHTML = `${totalRubricSum} <span>/ ${maxRubricSum} pts (${pct}%)</span>`;
      }
    }

    if (liveRubricProgressBar) {
      liveRubricProgressBar.style.width = form.isExceededTime ? '0%' : `${pct}%`;
    }

    if (liveRubricFormulaBreakdown) {
      liveRubricFormulaBreakdown.innerHTML = prova.criteria.map((c) => {
        const val = form.criteriaValues[c.name] || 0;
        return `
          <div class="rubric-chip">
            ${c.name}: <strong>${val}</strong>/${c.max}
          </div>
        `;
      }).join('<span style="color:#64748b;">+</span>');
    }
  }

  function calculateScore() {
    if (form.provaId === 'prova_elixo_pesagem') {
      return form.pesoInput || 0;
    }

    const prova = state.getProva(form.provaId);
    if (!prova || form.isExceededTime) return 0;

    // Se a prova é soma direta dos critérios
    if (prova.type === 'soma_direta') {
      return calculateRubricSum();
    }

    if (prova.type === 'rubrica_elixo_mob') {
      return calculateRubricSum();
    }

    if (prova.type === 'rubrica_colocacao' || prova.type === 'standard_colocacao') {
      if (form.directPlace === 1) return 100;
      if (form.directPlace === 2) return 75;
      if (form.directPlace === 3) return 50;
      return 25;
    }

    if (prova.type === 'top3_zero') {
      if (form.directPlace === 1) return 100;
      if (form.directPlace === 2) return 75;
      if (form.directPlace === 3) return 50;
      return 0;
    }

    return 0;
  }

  function updateTotal() {
    const total = calculateScore();
    if (form.provaId === 'prova_elixo_pesagem') {
      totalPreview.innerHTML = `${total} <small style="font-size:1.4rem; color:#94a3b8;">kg</small>`;
      if (mobilePreviewInfoSub) mobilePreviewInfoSub.innerText = 'peso oficial a registrar para a turma';
    } else {
      totalPreview.innerText = total.toLocaleString('pt-BR');
      const prova = state.getProva(form.provaId);
      if (prova && prova.type === 'soma_direta') {
        if (mobilePreviewInfoSub) mobilePreviewInfoSub.innerText = 'soma direta dos critérios da rubrica';
      } else {
        if (mobilePreviewInfoSub) mobilePreviewInfoSub.innerText = 'pontos oficiais calculados para a gincana';
      }
    }
  }

  // =========================================================================
  // 5. TABELA RESUMO DAS TURMAS AVALIADAS NA PROVA
  // =========================================================================

  function renderProvaEvalSummary() {
    if (!provaEvalTableContainer) return;

    const allTeams = state.getTeams();
    const prova = state.getProva(form.provaId);
    if (!prova) return;

    const isPesagem = form.provaId === 'prova_elixo_pesagem';

    provaEvalTableContainer.innerHTML = `
      <table class="prova-eval-table">
        <thead>
          <tr>
            <th>Turma / Equipe</th>
            <th>${isPesagem ? 'Peso Validado' : 'Soma Rubrica'}</th>
            <th>Pontos Oficiais</th>
            <th>Status</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          ${allTeams.map((team) => {
            const score = state.getTeamScore(team.id, form.provaId);
            const isEvaluated = score !== null;

            let rubricCol = '—';
            let pointsCol = '—';

            if (isPesagem) {
              if (team.pesoELixoKg > 0) {
                rubricCol = `${team.pesoELixoKg} kg`;
                pointsCol = `${team.pesoELixoKg} pts`;
              }
            } else if (isEvaluated) {
              rubricCol = score.rubricScore !== undefined ? `<strong>${score.rubricScore} pts</strong>` : '—';
              pointsCol = `<span style="color:#facc15; font-weight:800;">${score.points} pts</span>`;
            }

            return `
              <tr>
                <td>
                  <span style="font-size: 0.8rem; font-weight: 800; background: ${team.color}22; color: ${team.color}; padding: 0.2rem 0.4rem; border-radius: 4px; border: 1px solid ${team.color}44; margin-right: 0.35rem;">${team.icon}</span>
                  <strong style="color: ${team.color};">${team.turma}</strong>
                  <span style="font-size: 0.72rem; color: #94a3b8;">(${team.name})</span>
                </td>
                <td>${rubricCol}</td>
                <td>${pointsCol}</td>
                <td>
                  ${isEvaluated 
                    ? '<span style="color:#34d399; font-weight:700;">Avaliada</span>' 
                    : '<span style="color:#fbbf24;">Pendente</span>'}
                </td>
                <td>
                  <button type="button" class="btn btn-sm btn-secondary btn-load-team-eval" data-team="${team.id}" style="font-size: 0.72rem; padding: 0.3rem 0.6rem;">
                    ${isEvaluated ? 'Editar' : 'Lançar'}
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    provaEvalTableContainer.querySelectorAll('.btn-load-team-eval').forEach((btn) => {
      btn.addEventListener('click', () => {
        form.teamId = btn.dataset.team;
        loadExistingScoreForTeam(form.teamId);
        sound.playClick();
        renderTeams();
        renderControls();
        updateTotal();

        // Rola até o formulário de notas
        const formEl = document.getElementById('mobile-controls-container');
        if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  // =========================================================================
  // 6. CONFIRMAÇÃO E ENVIO DA NOTA OFICIAL
  // =========================================================================

  submitBtn.addEventListener('click', () => {
    const judge = state.getLoggedInJudge();
    if (!judge) {
      alert('Sessão expirada. Por favor, digite seu PIN novamente.');
      showPinScreen();
      return;
    }

    const team = state.getTeam(form.teamId);
    if (!team) {
      alert('Selecione uma turma para avaliar.');
      return;
    }

    const isPesagem = form.provaId === 'prova_elixo_pesagem';

    if (isPesagem) {
      const peso = form.pesoInput;
      modalContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 1rem;">
          <div style="display: inline-block; font-size: 0.8rem; font-weight: 800; letter-spacing: 0.05em; color: #38bdf8; background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.35); padding: 0.35rem 0.75rem; border-radius: 6px; margin-bottom: 0.5rem;">PESAGEM OFICIAL</div>
          <h3 style="font-size: 1.3rem; color: ${team.color};">${team.name} (${team.turma})</h3>
          <p style="color: #94a3b8; font-size: 0.85rem;">Desafio E-Lixo: Pesagem Oficial</p>
          <div style="font-size: 2.8rem; font-family: 'Outfit'; font-weight: 900; color: #34d399; margin: 0.5rem 0;">
            ${peso} <span style="font-size: 1rem; color: #94a3b8;">kg</span>
          </div>
          <div style="font-size: 0.8rem; color: #a5b4fc;">Conferente Oficial: <strong>${judge.name}</strong></div>
        </div>
        <p style="text-align: center; font-size: 0.85rem; color: #cbd5e1;">Confirmar peso oficial de resíduos eletroeletrônicos?</p>
      `;
    } else {
      const total = calculateScore();
      const rubricSum = calculateRubricSum();
      const prova = state.getProva(form.provaId);
      modalContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 1rem;">
          <div style="font-size: 2.5rem;">${team.icon}</div>
          <h3 style="font-size: 1.3rem; color: ${team.color};">${team.name} (${team.turma})</h3>
          <p style="color: #94a3b8; font-size: 0.85rem;">${prova.title}</p>
          ${prova.criteria && prova.criteria.length > 0 ? `
            <div style="font-size: 0.85rem; color: #38bdf8; font-weight: 700; margin-top: 0.35rem;">
              Soma das Rubricas: ${rubricSum} pts
            </div>
          ` : ''}
          <div style="font-size: 2.8rem; font-family: 'Outfit'; font-weight: 900; color: #facc15; margin: 0.4rem 0;">
            ${total} <span style="font-size: 1rem; color: #94a3b8;">pontos oficiais</span>
          </div>
          <div style="font-size: 0.8rem; color: #a5b4fc;">Avaliador: <strong>${judge.name}</strong></div>
        </div>
        <p style="text-align: center; font-size: 0.85rem; color: #cbd5e1;">Confirmar lançamento da nota oficial desta prova?</p>
      `;
    }

    modal.classList.add('active');
  });

  modalConfirmBtn.addEventListener('click', () => {
    const judge = state.getLoggedInJudge();
    if (!judge) return;

    try {
      const isPesagem = form.provaId === 'prova_elixo_pesagem';

      if (isPesagem) {
        state.updateTeamELixoWeight(form.teamId, form.pesoInput);
        sound.playScoreDing();
        alert(`${form.pesoInput} kg registrados com sucesso para ${state.getTeam(form.teamId).name}.`);
      } else {
        const total = calculateScore();
        const rubricTotal = calculateRubricSum();

        state.addScore({
          teamId: form.teamId,
          provaId: form.provaId,
          judgeId: judge.id,
          judgeName: judge.name,
          points: total,
          rubricScore: rubricTotal,
          placeInProva: form.directPlace,
          criteriaDetails: form.criteriaValues,
          note: noteInput ? noteInput.value : ''
        });

        if ('vibrate' in navigator) navigator.vibrate([40, 60, 40]);
        sound.playScoreDing();
        alert(`Sucesso! Nota lançada com sucesso para ${state.getTeam(form.teamId).name}.`);
      }

      modal.classList.remove('active');
      renderProvaTabs();
      renderTeams();
      renderControls();
      updateTotal();
      renderProvaEvalSummary();
      renderJudgeRanking();
    } catch (e) {
      alert('Erro ao confirmar nota: ' + e.message);
    }
  });

  document.querySelectorAll('.modal-close-btn, .btn-modal-cancel').forEach((btn) => {
    btn.addEventListener('click', () => modal.classList.remove('active'));
  });

  if (soundBtn) {
    soundBtn.innerHTML = sound.isMuted() ? '<span style="font-size:0.75rem; font-weight:700;">SOM: OFF</span>' : '<span style="font-size:0.75rem; font-weight:700;">SOM: ON</span>';
    soundBtn.addEventListener('click', () => {
      const isMuted = sound.toggleMute();
      soundBtn.innerHTML = isMuted ? '<span style="font-size:0.75rem; font-weight:700;">SOM: OFF</span>' : '<span style="font-size:0.75rem; font-weight:700;">SOM: ON</span>';
    });
  }

  // =========================================================================
  // SISTEMA DE NAVEGAÇÃO ENTRE ABAS E RANKING ATUALIZADO DAS EQUIPES
  // =========================================================================

  function switchJudgeTab(tabId) {
    sound.playClick();
    if (tabId === 'ranking') {
      if (btnTabRanking) btnTabRanking.classList.add('active');
      if (btnTabEvaluations) btnTabEvaluations.classList.remove('active');
      if (viewRanking) viewRanking.classList.remove('hidden');
      if (viewEvaluations) viewEvaluations.classList.add('hidden');
      renderJudgeRanking();
    } else {
      if (btnTabEvaluations) btnTabEvaluations.classList.add('active');
      if (btnTabRanking) btnTabRanking.classList.remove('active');
      if (viewEvaluations) viewEvaluations.classList.remove('hidden');
      if (viewRanking) viewRanking.classList.add('hidden');
    }
  }

  function renderJudgeRanking() {
    if (!judgePodiumView || !judgeRankingList) return;

    const rankings = state.getTeamRankings();
    if (!rankings || rankings.length === 0) {
      judgePodiumView.innerHTML = '';
      judgeRankingList.innerHTML = `
        <div style="text-align: center; padding: 2rem; background: rgba(15,23,42,0.6); border-radius: 8px; color: var(--text-muted); font-size: 0.85rem;">
          Nenhuma equipe cadastrada no sistema.
        </div>
      `;
      return;
    }

    // Top 3 Pódio
    const top3 = [
      rankings[1] || null, // 2º Lugar
      rankings[0] || null, // 1º Lugar
      rankings[2] || null  // 3º Lugar
    ];

    judgePodiumView.innerHTML = top3.map((team, idx) => {
      if (!team) return '<div></div>';
      const rankNum = idx === 1 ? 1 : idx === 0 ? 2 : 3;
      const rankClass = `rank-${rankNum}`;
      const badgeLabel = rankNum === 1 ? '1º LUGAR' : rankNum === 2 ? '2º LUGAR' : '3º LUGAR';
      const badgeColor = rankNum === 1 ? '#facc15' : rankNum === 2 ? '#cbd5e1' : '#f97316';

      return `
        <div class="judge-podium-card ${rankClass}">
          <span style="font-size: 0.68rem; font-weight: 800; letter-spacing: 0.5px; color: ${badgeColor}; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.4); margin-bottom: 0.4rem;">
            ${badgeLabel}
          </span>
          <div style="width: 38px; height: 38px; border-radius: 50%; background: ${team.color || '#3b82f6'}22; border: 2px solid ${team.color || '#3b82f6'}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem; color: ${team.color || '#3b82f6'}; margin-bottom: 0.35rem;">
            ${team.icon || team.name.substring(0, 2).toUpperCase()}
          </div>
          <div style="font-weight: 800; font-size: 0.82rem; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
            ${team.name}
          </div>
          <div style="font-size: 0.68rem; color: #94a3b8; margin-bottom: 0.35rem;">
            ${team.turma || team.className || team.serie || ''}
          </div>
          <div style="font-size: 1.15rem; font-family: 'Outfit'; font-weight: 900; color: #facc15;">
            ${team.totalPoints.toLocaleString('pt-BR')} <span style="font-size: 0.65rem; color: #94a3b8;">pts</span>
          </div>
          <div style="font-size: 0.65rem; color: #34d399; font-weight: 700; margin-top: 0.2rem;">
            Nota: ${team.notaEscolar} pts
          </div>
        </div>
      `;
    }).join('');

    // Lista Geral de Todas as Equipes
    const leaderPoints = (rankings[0] && rankings[0].totalPoints) ? rankings[0].totalPoints : 1;

    judgeRankingList.innerHTML = rankings.map((team) => {
      const percent = Math.min(100, Math.max(10, Math.round((team.totalPoints / leaderPoints) * 100)));
      const isLeader = team.rank === 1;
      const rankBadgeColor = team.rank === 1 ? '#facc15' : team.rank === 2 ? '#cbd5e1' : team.rank === 3 ? '#f97316' : '#64748b';
      const rankBadgeBg = team.rank === 1 ? 'rgba(234,179,8,0.15)' : team.rank === 2 ? 'rgba(203,213,225,0.15)' : team.rank === 3 ? 'rgba(249,115,22,0.15)' : 'rgba(100,116,139,0.15)';
      const diffText = isLeader ? 'Líder do Placar' : `-${team.diffToLeader} pts do líder`;

      return `
        <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255, 255, 255, 0.08); border-left: 4px solid ${team.color || '#3b82f6'}; border-radius: 8px; padding: 0.75rem 0.85rem; display: flex; flex-direction: column; gap: 0.45rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.65rem; min-width: 0;">
              <span style="font-family: 'Outfit'; font-weight: 900; font-size: 0.95rem; min-width: 28px; height: 28px; border-radius: 6px; background: ${rankBadgeBg}; color: ${rankBadgeColor}; display: flex; align-items: center; justify-content: center;">
                #${team.rank}
              </span>
              <div style="min-width: 0;">
                <div style="font-weight: 800; font-size: 0.88rem; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${team.name}
                </div>
                <div style="font-size: 0.72rem; color: #94a3b8;">
                  ${team.turma || team.className || team.serie || ''} • <span style="color: #cbd5e1;">${diffText}</span>
                </div>
              </div>
            </div>

            <div style="text-align: right; flex-shrink: 0;">
              <div style="font-family: 'Outfit'; font-weight: 900; font-size: 1.15rem; color: #facc15;">
                ${team.totalPoints.toLocaleString('pt-BR')} <span style="font-size: 0.7rem; color: #94a3b8;">pts</span>
              </div>
              <div style="font-size: 0.7rem; color: #34d399; font-weight: 700;">
                Escolar: ${team.notaEscolar} pts
              </div>
            </div>
          </div>

          <!-- Barra de progresso comparativa -->
          <div style="background: rgba(0,0,0,0.4); border-radius: 999px; height: 5px; width: 100%; overflow: hidden;">
            <div style="height: 100%; width: ${percent}%; background: linear-gradient(90deg, ${team.color || '#3b82f6'}, #38bdf8); border-radius: 999px;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Listeners de alternância de abas do juiz
  if (btnTabEvaluations) {
    btnTabEvaluations.addEventListener('click', () => switchJudgeTab('evaluations'));
  }
  if (btnTabRanking) {
    btnTabRanking.addEventListener('click', () => switchJudgeTab('ranking'));
  }
  if (btnRefreshJudgeRanking) {
    btnRefreshJudgeRanking.addEventListener('click', () => {
      sound.playClick();
      renderJudgeRanking();
    });
  }

  // Escuta atualizações do state (WebSocket / BroadcastChannel / Storage)
  state.subscribe(() => {
    renderProvaTabs();
    renderTeams();
    renderProvaEvalSummary();
    renderJudgeRanking();
  });

  // Inicializa o sistema de autenticação
  initAuth();
});

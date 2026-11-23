/**
 * Painel da Coordenação Geral da Gincana - SESI CONECTA 2026
 * Controlador para acompanhamento das respostas dos juízes, presença online/offline,
 * matriz de pendências, alteração de PINs, cadastro de equipes e configuração do painel.
 * Padrão Corporativo e Institucional (sem emoticons).
 */

document.addEventListener('DOMContentLoaded', () => {
  const state = window.gincanaState;
  const sound = window.gincanaSound;

  // Elementos de Autenticação do Gestor
  const pinOverlay = document.getElementById('gestor-pin-overlay');
  const pinErrorMsg = document.getElementById('gestor-pin-error');
  const pinDots = [
    document.getElementById('gdot-0'),
    document.getElementById('gdot-1'),
    document.getElementById('gdot-2'),
    document.getElementById('gdot-3')
  ];
  let enteredPin = '';

  // Elementos do Cabeçalho e Navegação
  const headerEventTitle = document.getElementById('header-event-title');
  const headerUnitSubtitle = document.getElementById('header-unit-subtitle');
  const btnLogout = document.getElementById('btn-gestor-logout');
  const tabButtons = document.querySelectorAll('.gestor-tab-btn');
  const tabContents = document.querySelectorAll('.gestor-tab-content');
  let currentActiveTab = 'tab-telao-control';

  // Elementos de Controle de Transmissão do Telão
  const telaoStatusBadge = document.getElementById('telao-status-badge');
  const btnTelaoSetStandby = document.getElementById('btn-telao-set-standby');
  const btnTelaoReleaseResults = document.getElementById('btn-telao-release-results');
  const btnTelaoReleaseDirect = document.getElementById('btn-telao-release-direct');
  const btnTelaoTriggerReveal = document.getElementById('btn-telao-trigger-reveal');

  // Métricas
  const metricOnlineCount = document.getElementById('metric-online-count');
  const metricTotalJudges = document.getElementById('metric-total-judges');
  const metricProgressPercent = document.getElementById('metric-progress-percent');
  const metricEvalFraction = document.getElementById('metric-eval-fraction');
  const metricTotalTeams = document.getElementById('metric-total-teams');
  const metricWsStatus = document.getElementById('metric-ws-status');

  // Aba 1: Presença
  const judgesPresenceGrid = document.getElementById('judges-presence-grid');
  const btnRefreshPresence = document.getElementById('btn-refresh-presence');

  // Aba 2: Matriz
  const matrixFilterProva = document.getElementById('matrix-filter-prova');
  const matrixFilterStatus = document.getElementById('matrix-filter-status');
  const matrixProgressText = document.getElementById('matrix-progress-text');
  const matrixProgressBar = document.getElementById('matrix-progress-bar');
  const matrixTableBody = document.getElementById('matrix-table-body');
  const matrixJudgesHeaderCols = document.getElementById('matrix-judges-header-cols');

  // Aba 3: Auditoria
  const auditScoresContainer = document.getElementById('audit-scores-container');
  const auditSearchInput = document.getElementById('audit-search-input');
  const btnExportAuditCsv = document.getElementById('btn-export-audit-csv');

  // Aba 4: Gestão de Juízes & PINs
  const judgesListContainer = document.getElementById('judges-list-container');
  const btnOpenAddJudgeModal = document.getElementById('btn-open-add-judge-modal');
  const formUpdateGestorPin = document.getElementById('form-update-gestor-pin');
  const inputNewGestorPin = document.getElementById('input-new-gestor-pin');
  const inputConfirmGestorPin = document.getElementById('input-confirm-gestor-pin');

  // Aba 5: Gestão de Equipes
  const teamsCardsGrid = document.getElementById('teams-cards-grid');
  const btnOpenAddTeamModal = document.getElementById('btn-open-add-team-modal');

  // Aba 6: Configurações do Painel
  const formPanelConfig = document.getElementById('form-panel-config');
  const cfgEventName = document.getElementById('cfg-event-name');
  const cfgInstitution = document.getElementById('cfg-institution');
  const cfgEditalTitle = document.getElementById('cfg-edital-title');
  const cfgSelectedUnit = document.getElementById('cfg-selected-unit');
  const cfgSelectedSegment = document.getElementById('cfg-selected-segment');
  const cfgSelectedShift = document.getElementById('cfg-selected-shift');
  const cfgDates = document.getElementById('cfg-dates');
  const cfgYear = document.getElementById('cfg-year');
  const btnClearScores = document.getElementById('btn-gestor-clear-scores');
  const btnResetAll = document.getElementById('btn-gestor-reset-all');

  // Modais
  const modalJudgeCrud = document.getElementById('modal-judge-crud');
  const formJudgeCrud = document.getElementById('form-judge-crud');
  const modalJudgeTitle = document.getElementById('modal-judge-title');
  const crudJudgeId = document.getElementById('crud-judge-id');
  const crudJudgeName = document.getElementById('crud-judge-name');
  const crudJudgeRole = document.getElementById('crud-judge-role');
  const crudJudgeProva = document.getElementById('crud-judge-prova');
  const crudJudgePin = document.getElementById('crud-judge-pin');
  const btnCloseJudgeModal = document.getElementById('btn-close-judge-modal');

  const modalChangeJudgePin = document.getElementById('modal-change-judge-pin');
  const formChangeJudgePin = document.getElementById('form-change-judge-pin');
  const changePinJudgeId = document.getElementById('change-pin-judge-id');
  const modalChangePinJudgeName = document.getElementById('modal-change-pin-judge-name');
  const inputSingleJudgePin = document.getElementById('input-single-judge-pin');
  const btnCloseChangePinModal = document.getElementById('btn-close-change-pin-modal');

  const modalTeamCrud = document.getElementById('modal-team-crud');
  const formTeamCrud = document.getElementById('form-team-crud');
  const modalTeamTitle = document.getElementById('modal-team-title');
  const crudTeamId = document.getElementById('crud-team-id');
  const crudTeamName = document.getElementById('crud-team-name');
  const crudTeamIcon = document.getElementById('crud-team-icon');
  const crudTeamTurma = document.getElementById('crud-team-turma');
  const crudTeamSegmento = document.getElementById('crud-team-segmento');
  const crudTeamColor = document.getElementById('crud-team-color');
  const crudTeamColorEnd = document.getElementById('crud-team-color-end');
  const crudTeamTutor = document.getElementById('crud-team-tutor');
  const crudTeamPeso = document.getElementById('crud-team-peso');
  const crudTeamSlogan = document.getElementById('crud-team-slogan');
  const btnCloseTeamModal = document.getElementById('btn-close-team-modal');

  const modalEditScore = document.getElementById('modal-edit-score');
  const formEditScore = document.getElementById('form-edit-score');
  const editScoreId = document.getElementById('edit-score-id');
  const editScoreSubtitle = document.getElementById('edit-score-subtitle');
  const editScorePoints = document.getElementById('edit-score-points');
  const editScoreNote = document.getElementById('edit-score-note');
  const btnCloseEditScoreModal = document.getElementById('btn-close-edit-score-modal');

  // =========================================================================
  // 1. AUTENTICAÇÃO DO GESTOR COM PIN MASTER
  // =========================================================================

  function initAuth() {
    const session = state.getLoggedInGestor();
    if (session) {
      applyLoggedInState();
    } else {
      showPinScreen();
    }
    setupKeypad();
  }

  function showPinScreen() {
    enteredPin = '';
    updatePinDots();
    pinErrorMsg.innerText = '';
    pinOverlay.classList.remove('hidden');
  }

  function applyLoggedInState() {
    pinOverlay.classList.add('hidden');
    updateHeaderInfo();
    renderAll();
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
      updatePinDots();

      if (enteredPin.length === 4) {
        setTimeout(verifyPin, 150);
      }
    }
  }

  function verifyPin() {
    const result = state.authenticateGestor(enteredPin);
    if (result.success) {
      sound.playScoreDing();
      pinErrorMsg.innerText = '';
      applyLoggedInState();
    } else {
      sound.playBuzzer();
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
      pinErrorMsg.innerText = result.message || 'PIN da Coordenação incorreto.';
      setTimeout(() => {
        enteredPin = '';
        updatePinDots();
      }, 500);
    }
  }

  function setupKeypad() {
    document.querySelectorAll('.pin-keypad .key-btn').forEach((btn) => {
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
        } else if (e.key === 'Enter' && enteredPin.length >= 4) {
          verifyPin();
        }
      }
    });

    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        if (confirm('Deseja realmente encerrar a sessão administrativa?')) {
          state.logoutGestor();
          showPinScreen();
        }
      });
    }
  }

  // =========================================================================
  // 2. NAVEGAÇÃO ENTRE ABAS DO GESTOR
  // =========================================================================

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.add('hidden'));

      btn.classList.add('active');
      currentActiveTab = btn.dataset.tab;
      const target = document.getElementById(currentActiveTab);
      if (target) target.classList.remove('hidden');

      renderCurrentTab();
    });
  });

  function renderCurrentTab() {
    updateHeaderInfo();
    updateMetrics();

    switch (currentActiveTab) {
      case 'tab-telao-control':
        updateTelaoStatusBadge();
        break;
      case 'tab-admin-lancamentos':
        renderAdminLancamentos();
        break;
      case 'tab-online-judges':
        renderOnlineJudges();
        break;
      case 'tab-matrix':
        renderMatrix();
        break;
      case 'tab-audit':
        renderAudit();
        break;
      case 'tab-judges-crud':
        renderJudgesCrud();
        break;
      case 'tab-teams-crud':
        renderTeamsCrud();
        break;
      case 'tab-config':
        renderConfigForm();
        break;
    }
  }

  function renderAll() {
    updateHeaderInfo();
    updateMetrics();
    renderOnlineJudges();
    populateMatrixProvaFilter();
    renderAdminLancamentos();
    renderMatrix();
    renderAudit();
    renderJudgesCrud();
    renderTeamsCrud();
    renderConfigForm();
  }

  // =========================================================================
  // 3. ATUALIZAÇÃO DO CABEÇALHO E MÉTRICAS
  // =========================================================================

  function updateHeaderInfo() {
    const config = state.getConfig();
    if (headerEventTitle) headerEventTitle.innerText = config.eventName || 'Gincana SESI 2026';
    if (headerUnitSubtitle) {
      headerUnitSubtitle.innerText = `${config.gestorTitle || 'Coordenação Geral'} • ${config.selectedUnit || 'SESI Escola'}`;
    }
    updateTelaoStatusBadge();
  }

  function updateGestorTelaoTurnoButtons() {
    const btnMat = document.getElementById('btn-gestor-turno-matutino');
    const btnVesp = document.getElementById('btn-gestor-turno-vespertino');
    if (!btnMat || !btnVesp) return;
    const currentTurno = (state && typeof state.getTelaoTurno === 'function') ? state.getTelaoTurno() : 'Matutino';

    if (currentTurno === 'Matutino') {
      btnMat.classList.add('active');
      btnMat.style.background = 'linear-gradient(135deg, #2563eb, #7c3aed)';
      btnMat.style.color = '#ffffff';
      btnVesp.classList.remove('active');
      btnVesp.style.background = 'transparent';
      btnVesp.style.color = '#94a3b8';
    } else {
      btnVesp.classList.add('active');
      btnVesp.style.background = 'linear-gradient(135deg, #2563eb, #7c3aed)';
      btnVesp.style.color = '#ffffff';
      btnMat.classList.remove('active');
      btnMat.style.background = 'transparent';
      btnMat.style.color = '#94a3b8';
    }
  }

  function updateTelaoStatusBadge() {
    if (!telaoStatusBadge) return;
    const mode = state.getTelaoMode();
    const turno = (state && typeof state.getTelaoTurno === 'function') ? state.getTelaoTurno() : 'Matutino';
    updateGestorTelaoTurnoButtons();
    if (mode === 'standby') {
      telaoStatusBadge.className = 'broadcast-status-badge broadcast-standby';
      telaoStatusBadge.innerHTML = `<span class="dot-offline" style="background:#fbbf24;"></span> MODO ESPERA (LOGO SESI NO TELÃO • GINCANA ${turno.toUpperCase()})`;
    } else {
      telaoStatusBadge.className = 'broadcast-status-badge broadcast-live';
      telaoStatusBadge.innerHTML = `<span class="pulse-online"></span> TRANSMISSÃO ATIVA (RESULTADOS LIBERADOS • GINCANA ${turno.toUpperCase()})`;
    }
  }

  const btnGestorMat = document.getElementById('btn-gestor-turno-matutino');
  const btnGestorVesp = document.getElementById('btn-gestor-turno-vespertino');
  if (btnGestorMat) {
    btnGestorMat.addEventListener('click', () => {
      state.setTelaoTurno('Matutino');
      updateTelaoStatusBadge();
      sound.playClick();
      showToast('Telão da Quadra alterado para: Gincana Matutino (8 turmas)', 'toast-info');
    });
  }
  if (btnGestorVesp) {
    btnGestorVesp.addEventListener('click', () => {
      state.setTelaoTurno('Vespertino');
      updateTelaoStatusBadge();
      sound.playClick();
      showToast('Telão da Quadra alterado para: Gincana Vespertino (8 turmas)', 'toast-info');
    });
  }

  // Utilitário de Notificações Toast Não-Bloqueantes
  const toastContainer = document.getElementById('toast-container');
  function showToast(message, type = 'toast-info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Controles de Transmissão do Telão
  if (btnTelaoSetStandby) {
    btnTelaoSetStandby.addEventListener('click', () => {
      state.setTelaoMode('standby');
      updateTelaoStatusBadge();
      sound.playClick();
      showToast('Modo Espera ativado: O Telão da quadra agora exibe a Logo SESI.', 'toast-warning');
    });
  }

  if (btnTelaoReleaseResults) {
    btnTelaoReleaseResults.addEventListener('click', () => {
      state.triggerTelaoRevealAnimation();
      updateTelaoStatusBadge();
      sound.playFanfare();
      showToast('Cerimônia de Premiação disparada no Telão com animação!', 'toast-success');
    });
  }

  if (btnTelaoReleaseDirect) {
    btnTelaoReleaseDirect.addEventListener('click', () => {
      state.setTelaoMode('results');
      updateTelaoStatusBadge();
      sound.playSuccess();
      showToast('Ranking Deslizante Contínuo liberado no Telão!', 'toast-success');
    });
  }

  if (btnTelaoTriggerReveal) {
    btnTelaoTriggerReveal.addEventListener('click', () => {
      state.triggerTelaoRevealAnimation();
      updateTelaoStatusBadge();
      sound.playDrumRoll(2.5);
      showToast('Animação da Cerimônia reexecutada no Telão!', 'toast-info');
    });
  }

  function updateMetrics() {
    const judgesWithPres = state.getJudgesWithPresence();
    const onlineCount = judgesWithPres.filter((j) => j.isOnline).length;
    const totalJudges = judgesWithPres.length;

    metricOnlineCount.innerText = onlineCount;
    metricTotalJudges.innerText = `/ ${totalJudges} avaliadores`;

    const matrixData = state.getEvaluationMatrix();
    metricProgressPercent.innerText = `${matrixData.overallProgressPercent}%`;
    metricEvalFraction.innerText = `(${matrixData.totalCompleted} de ${matrixData.totalPossible} notas)`;

    const teams = state.getTeams();
    metricTotalTeams.innerText = teams.length;

    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      metricWsStatus.innerHTML = '<span class="pulse-online"></span> Conectado (Porta 3000)';
      metricWsStatus.style.color = '#10b981';
    } else {
      metricWsStatus.innerHTML = '<span class="dot-offline"></span> Modo Local / Storage';
      metricWsStatus.style.color = '#94a3b8';
    }
  }

  // =========================================================================
  // 3.5. LANÇAMENTOS DO ADMIN (E-LIXO, XADREZ E PING PONG)
  // =========================================================================
  let adminCurrentSubtab = 'elixo';
  let adminTurnoElixo = 'Matutino';
  let adminTurnoXadrez = 'Matutino';
  let adminTurnoPingPong = 'Matutino';
  let adminTurnoEmpreendedorismo = 'Matutino';
  let adminSubtabsInitialized = false;

  function setupAdminLancamentosSubtabs() {
    if (adminSubtabsInitialized) return;
    adminSubtabsInitialized = true;

    // Subabas: E-Lixo, Xadrez, Ping Pong, Feira de Empreendedorismo
    const subtabButtons = document.querySelectorAll('.btn-admin-subtab');
    subtabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const sub = btn.dataset.subtab;
        adminCurrentSubtab = sub;
        subtabButtons.forEach((b) => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = '#94a3b8';
        });
        btn.classList.add('active');
        btn.style.background = 'rgba(245, 158, 11, 0.2)';
        btn.style.color = '#f59e0b';

        const cElixo = document.getElementById('admin-subcontent-elixo');
        const cXadrez = document.getElementById('admin-subcontent-xadrez');
        const cPingpong = document.getElementById('admin-subcontent-pingpong');
        const cEmpreend = document.getElementById('admin-subcontent-empreendedorismo');
        if (cElixo) cElixo.style.display = sub === 'elixo' ? 'block' : 'none';
        if (cXadrez) cXadrez.style.display = sub === 'xadrez' ? 'block' : 'none';
        if (cPingpong) cPingpong.style.display = sub === 'pingpong' ? 'block' : 'none';
        if (cEmpreend) cEmpreend.style.display = sub === 'empreendedorismo' ? 'block' : 'none';

        if (window.sound && typeof sound.playClick === 'function') sound.playClick();
        renderAdminLancamentos();
      });
    });

    // Seletor de Turno para E-Lixo
    document.querySelectorAll('.btn-admin-turno-elixo').forEach((btn) => {
      btn.addEventListener('click', () => {
        adminTurnoElixo = btn.dataset.turno;
        document.querySelectorAll('.btn-admin-turno-elixo').forEach((b) => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = '#94a3b8';
        });
        btn.classList.add('active');
        btn.style.background = 'linear-gradient(135deg, #2563eb, #7c3aed)';
        btn.style.color = '#fff';
        if (window.sound && typeof sound.playClick === 'function') sound.playClick();
        renderAdminElixo();
      });
    });

    // Seletor de Turno para Xadrez
    document.querySelectorAll('.btn-admin-turno-xadrez').forEach((btn) => {
      btn.addEventListener('click', () => {
        adminTurnoXadrez = btn.dataset.turno;
        document.querySelectorAll('.btn-admin-turno-xadrez').forEach((b) => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = '#94a3b8';
        });
        btn.classList.add('active');
        btn.style.background = 'linear-gradient(135deg, #2563eb, #7c3aed)';
        btn.style.color = '#fff';
        if (window.sound && typeof sound.playClick === 'function') sound.playClick();
        renderAdminXadrez();
      });
    });

    // Seletor de Turno para Ping Pong
    document.querySelectorAll('.btn-admin-turno-pingpong').forEach((btn) => {
      btn.addEventListener('click', () => {
        adminTurnoPingPong = btn.dataset.turno;
        document.querySelectorAll('.btn-admin-turno-pingpong').forEach((b) => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = '#94a3b8';
        });
        btn.classList.add('active');
        btn.style.background = 'linear-gradient(135deg, #2563eb, #7c3aed)';
        btn.style.color = '#fff';
        if (window.sound && typeof sound.playClick === 'function') sound.playClick();
        renderAdminPingPong();
      });
    });

    // Seletor de Turno para Feira de Empreendedorismo
    document.querySelectorAll('.btn-admin-turno-empreendedorismo').forEach((btn) => {
      btn.addEventListener('click', () => {
        adminTurnoEmpreendedorismo = btn.dataset.turno;
        document.querySelectorAll('.btn-admin-turno-empreendedorismo').forEach((b) => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = '#94a3b8';
        });
        btn.classList.add('active');
        btn.style.background = 'linear-gradient(135deg, #2563eb, #7c3aed)';
        btn.style.color = '#fff';
        if (window.sound && typeof sound.playClick === 'function') sound.playClick();
        renderAdminEmpreendedorismo();
      });
    });
  }

  function renderAdminLancamentos() {
    setupAdminLancamentosSubtabs();
    if (adminCurrentSubtab === 'elixo') {
      renderAdminElixo();
    } else if (adminCurrentSubtab === 'xadrez') {
      renderAdminXadrez();
    } else if (adminCurrentSubtab === 'pingpong') {
      renderAdminPingPong();
    } else if (adminCurrentSubtab === 'empreendedorismo') {
      renderAdminEmpreendedorismo();
    }
  }

  function renderAdminElixo() {
    const container = document.getElementById('admin-elixo-grid');
    if (!container) return;
    const teams = state.getTeams().filter((t) => !adminTurnoElixo || t.turno === adminTurnoElixo);

    container.innerHTML = teams.map((team) => {
      const pesoAtual = team.pesoELixoKg || 0;
      return `
        <div class="glass-card" style="padding: 1.25rem; border-top: 3px solid #10b981; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <div style="width: 38px; height: 38px; border-radius: 8px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981; font-weight: 900; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">
                ${team.icon || team.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style="font-weight: 800; font-size: 1rem; color: #fff;">${team.name}</div>
                <div style="font-size: 0.78rem; color: #94a3b8;">${team.turma || ''} • ${team.turno || ''}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Peso Atual</div>
              <div style="font-weight: 900; font-size: 1.15rem; color: #10b981;">${pesoAtual} <span style="font-size: 0.75rem; color: #94a3b8;">kg</span></div>
            </div>
          </div>

          <div style="background: rgba(15, 23, 42, 0.5); padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #94a3b8; margin-bottom: 0.4rem; text-transform: uppercase;">
              Registrar Peso de Resíduo (kg):
            </label>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <input type="number" step="0.01" min="0" class="form-input" id="input-admin-elixo-${team.id}" value="${pesoAtual}" style="font-size: 1.1rem; font-weight: 900; text-align: center; width: 120px; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-glass-bright); color: #10b981; border-radius: 8px; padding: 0.45rem;">
              <button type="button" class="btn btn-sm btn-save-admin-elixo" data-team="${team.id}" style="flex: 1; padding: 0.55rem 0.75rem; font-weight: 800; font-size: 0.82rem; border-radius: 8px; background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
                <span>💾</span> Salvar Peso
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-save-admin-elixo').forEach((btn) => {
      btn.addEventListener('click', () => {
        const teamId = btn.dataset.team;
        const input = document.getElementById(`input-admin-elixo-${teamId}`);
        const val = parseFloat(input ? input.value : 0);
        if (isNaN(val) || val < 0) {
          alert('Informe um peso válido em kg.');
          return;
        }
        state.updateTeamELixoWeight(teamId, val);
        if (window.sound && typeof sound.playScoreDing === 'function') sound.playScoreDing();
        const team = state.getTeam(teamId);
        showToast(`Peso do E-Lixo salvo: ${val} kg para ${team ? team.name : teamId}`, 'toast-success');
        renderAdminElixo();
      });
    });
  }

  function saveScoreForAdmin(teamId, provaId, points, provaName) {
    const team = state.getTeam(teamId);
    state.addScore({
      teamId,
      provaId,
      judgeId: 'admin_central',
      judgeName: 'Coordenação / Admin',
      points: points,
      note: `Lançado oficialmente pelo Painel do Admin (${provaName})`
    });
    if (window.sound && typeof sound.playScoreDing === 'function') sound.playScoreDing();
    showToast(`Pontuação de ${provaName} salva: ${points} pts para ${team ? team.name : teamId}`, 'toast-success');
    if (provaId === 'p_xadrez') renderAdminXadrez();
    if (provaId === 'p_pingpong') renderAdminPingPong();
    if (provaId === 'p_empreendedorismo') renderAdminEmpreendedorismo();
  }

  function renderAdminTournament(provaId, provaName, containerId, currentTurno) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const teams = state.getTeams().filter((t) => !currentTurno || t.turno === currentTurno);
    const scores = state.getScores().filter((s) => s.provaId === provaId);

    container.innerHTML = teams.map((team) => {
      const scoreObj = scores.find((s) => s.teamId === team.id);
      const currentPts = scoreObj ? scoreObj.points : null;
      return `
        <div class="glass-card" style="padding: 1.25rem; border-top: 3px solid ${team.color}; display: flex; flex-direction: column; justify-content: space-between; gap: 0.85rem;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <div style="width: 36px; height: 36px; border-radius: 8px; background: ${team.color}22; border: 1px solid ${team.color}; color: ${team.color}; font-weight: 900; display: flex; align-items: center; justify-content: center; font-size: 0.85rem;">
                ${team.icon || team.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style="font-weight: 800; font-size: 1rem; color: #fff;">${team.name}</div>
                <div style="font-size: 0.78rem; color: #94a3b8;">${team.turma || ''} • ${team.turno || ''}</div>
              </div>
            </div>
            <div>
              ${currentPts !== null ? `
                <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #10b981; font-weight: 800; padding: 0.25rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">
                  ${currentPts} pts
                </span>
              ` : `
                <span style="background: rgba(148, 163, 184, 0.1); border: 1px solid rgba(148, 163, 184, 0.25); color: #94a3b8; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 6px; font-size: 0.75rem;">
                  Pendente
                </span>
              `}
            </div>
          </div>

          <div>
            <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.35rem; font-weight: 700; text-transform: uppercase;">
              Colocação Rápida:
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.35rem; margin-bottom: 0.5rem;">
              <button type="button" class="btn btn-sm btn-quick-place" data-team="${team.id}" data-pts="100" style="padding: 0.3rem 0; font-size: 0.75rem; font-weight: 800; background: ${currentPts === 100 ? '#10b981' : 'rgba(16, 185, 129, 0.15)'}; color: ${currentPts === 100 ? '#fff' : '#10b981'}; border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 6px; cursor: pointer;">1º (100)</button>
              <button type="button" class="btn btn-sm btn-quick-place" data-team="${team.id}" data-pts="75" style="padding: 0.3rem 0; font-size: 0.75rem; font-weight: 800; background: ${currentPts === 75 ? '#3b82f6' : 'rgba(59, 130, 246, 0.15)'}; color: ${currentPts === 75 ? '#fff' : '#60a5fa'}; border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 6px; cursor: pointer;">2º (75)</button>
              <button type="button" class="btn btn-sm btn-quick-place" data-team="${team.id}" data-pts="50" style="padding: 0.3rem 0; font-size: 0.75rem; font-weight: 800; background: ${currentPts === 50 ? '#f59e0b' : 'rgba(245, 158, 11, 0.15)'}; color: ${currentPts === 50 ? '#fff' : '#fbbf24'}; border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 6px; cursor: pointer;">3º (50)</button>
              <button type="button" class="btn btn-sm btn-quick-place" data-team="${team.id}" data-pts="25" style="padding: 0.3rem 0; font-size: 0.75rem; font-weight: 800; background: ${currentPts === 25 ? '#a855f7' : 'rgba(168, 85, 247, 0.15)'}; color: ${currentPts === 25 ? '#fff' : '#c084fc'}; border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 6px; cursor: pointer;">4º (25)</button>
            </div>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              <input type="number" min="0" max="100" class="form-input input-custom-score" id="input-${provaId}-${team.id}" placeholder="0" value="${currentPts !== null ? currentPts : ''}" style="width: 70px; text-align: center; font-weight: 800; font-size: 0.9rem; padding: 0.35rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-glass-bright); border-radius: 6px; color: #fff;">
              <button type="button" class="btn btn-sm btn-save-custom-score" data-team="${team.id}" style="flex: 1; padding: 0.4rem 0.6rem; font-size: 0.8rem; font-weight: 800; background: rgba(255, 255, 255, 0.1); border: 1px solid var(--border-glass-bright); color: #fff; border-radius: 6px; cursor: pointer;">
                💾 Salvar Nota
              </button>
              <button type="button" class="btn btn-sm btn-quick-place" data-team="${team.id}" data-pts="0" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; font-weight: 800; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 6px; cursor: pointer;">
                0 pts
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-quick-place').forEach((btn) => {
      btn.addEventListener('click', () => {
        const teamId = btn.dataset.team;
        const pts = Number(btn.dataset.pts);
        saveScoreForAdmin(teamId, provaId, pts, provaName);
      });
    });

    container.querySelectorAll('.btn-save-custom-score').forEach((btn) => {
      btn.addEventListener('click', () => {
        const teamId = btn.dataset.team;
        const input = document.getElementById(`input-${provaId}-${teamId}`);
        const pts = parseFloat(input ? input.value : 0);
        if (isNaN(pts) || pts < 0 || pts > 100) {
          alert('Informe uma pontuação entre 0 e 100 pontos.');
          return;
        }
        saveScoreForAdmin(teamId, provaId, pts, provaName);
      });
    });
  }

  function renderAdminXadrez() {
    renderAdminTournament('p_xadrez', 'Xadrez', 'admin-xadrez-grid', adminTurnoXadrez);
  }

  function renderAdminPingPong() {
    renderAdminTournament('p_pingpong', 'Ping Pong', 'admin-pingpong-grid', adminTurnoPingPong);
  }

  function renderAdminEmpreendedorismo() {
    renderAdminTournament('p_empreendedorismo', 'Feira de Empreendedorismo', 'admin-empreendedorismo-grid', adminTurnoEmpreendedorismo);
  }

  // =========================================================================
  // 4. ABA 1: STATUS ONLINE / OFFLINE DOS AVALIADORES
  // =========================================================================

  function renderOnlineJudges() {
    const judges = state.getJudgesWithPresence();

    if (judges.length === 0) {
      judgesPresenceGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #94a3b8;">
          Nenhum avaliador cadastrado. Acesse a aba "Avaliadores & PINs" para adicionar.
        </div>
      `;
      return;
    }

    judgesPresenceGrid.innerHTML = judges.map((j) => {
      const isOnline = j.isOnline;
      const statusBadge = isOnline
        ? `<span class="status-badge-concluido"><span class="pulse-online"></span> ONLINE</span>`
        : `<span class="status-badge-pendente" style="background: rgba(100, 116, 139, 0.15); border-color: rgba(100, 116, 139, 0.35); color: #94a3b8;"><span class="dot-offline"></span> OFFLINE</span>`;

      const lastActivityText = j.lastSeenFormatted || 'Sem atividade registrada';

      return `
        <div class="glass-card" style="padding: 1.25rem; border-left: 4px solid ${isOnline ? '#10b981' : '#475569'}; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
              <div style="font-weight: 800; font-size: 1.05rem;">
                ${j.name}
              </div>
              ${statusBadge}
            </div>

            <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.75rem;">
              ${j.role}
            </div>

            <div style="background: rgba(255, 255, 255, 0.03); border-radius: 6px; padding: 0.65rem 0.85rem; font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.35rem;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-secondary);">Última atividade:</span>
                <strong style="color: #fff;">${lastActivityText}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-secondary);">Avaliações registradas:</span>
                <strong style="color: #3b82f6;">${j.totalEvaluations} notas</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-secondary);">PIN de Acesso:</span>
                <span style="font-family: monospace; letter-spacing: 2px; color: #fbbf24; font-weight: 700;">${j.pin || '1234'}</span>
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
            <button class="btn btn-secondary btn-quick-change-pin" data-id="${j.id}" data-name="${j.name}" data-pin="${j.pin || '1234'}" style="flex: 1; font-size: 0.8rem; padding: 0.45rem;">
              Alterar PIN
            </button>
            <a href="juiz.html" target="_blank" class="btn btn-outline" style="font-size: 0.8rem; padding: 0.45rem; text-decoration: none;" title="Abrir terminal do avaliador">
              Abrir Portal
            </a>
          </div>
        </div>
      `;
    }).join('');

    // Listener para botão rápido de PIN
    document.querySelectorAll('.btn-quick-change-pin').forEach((btn) => {
      btn.addEventListener('click', () => {
        openChangeJudgePinModal(btn.dataset.id, btn.dataset.name, btn.dataset.pin);
      });
    });
  }

  if (btnRefreshPresence) {
    btnRefreshPresence.addEventListener('click', () => {
      sound.playClick();
      renderOnlineJudges();
      updateMetrics();
    });
  }

  // =========================================================================
  // 5. ABA 2: MATRIZ DE RESPOSTAS & PENDÊNCIAS
  // =========================================================================

  function populateMatrixProvaFilter() {
    const activities = state.getActivities();
    const currentVal = matrixFilterProva.value;
    matrixFilterProva.innerHTML = '<option value="ALL">Todas as Provas</option>' +
      activities.map((a) => `<option value="${a.id}">${a.name} (${a.category})</option>`).join('');
    if (currentVal) matrixFilterProva.value = currentVal;
  }

  function renderMatrix() {
    const filterActivity = matrixFilterProva.value === 'ALL' ? null : matrixFilterProva.value;
    const filterStatus = matrixFilterStatus.value;
    const matrixData = state.getEvaluationMatrix(filterActivity);
    const judges = state.getJudges();

    // Atualiza cabeçalho dinâmico com os nomes dos juízes
    matrixJudgesHeaderCols.outerHTML = `
      <th style="min-width: 320px;">
        <div style="display: flex; gap: 1rem;">
          ${judges.map((j) => `
            <div style="flex: 1; text-align: center; border-left: 1px solid rgba(255, 255, 255, 0.1); padding: 0 0.25rem;">
              <div style="font-size: 0.75rem; font-weight: 800; color: #fff;">${j.name}</div>
              <div style="font-size: 0.65rem; color: #94a3b8; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${j.role}</div>
            </div>
          `).join('')}
        </div>
      </th>
    `;

    // Atualiza barra de progresso da matriz
    matrixProgressText.innerText = `${matrixData.totalCompleted} de ${matrixData.totalPossible} respostas registradas (${matrixData.overallProgressPercent}%)`;
    matrixProgressBar.style.width = `${matrixData.overallProgressPercent}%`;

    let rows = matrixData.matrix;
    if (filterStatus === 'PENDING') {
      rows = rows.filter((r) => !r.isComplete);
    } else if (filterStatus === 'COMPLETE') {
      rows = rows.filter((r) => r.isComplete);
    }

    if (rows.length === 0) {
      matrixTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 2.5rem; color: #94a3b8;">
            Nenhum registro encontrado para os filtros selecionados.
          </td>
        </tr>
      `;
      return;
    }

    matrixTableBody.innerHTML = rows.map((row) => {
      const isComplete = row.isComplete;
      const statusBadge = isComplete
        ? `<span class="status-badge-concluido">Concluída</span>`
        : `<span class="status-badge-pendente">Pendente (${row.pendingCount})</span>`;

      return `
        <tr>
          <!-- Equipe -->
          <td>
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div style="width: 28px; height: 28px; border-radius: 4px; background: ${row.teamColor}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.75rem; color: #fff;">
                ${(row.teamName || 'EQ').substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style="font-weight: 800; color: #fff;">${row.teamName}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">${row.teamTurma}</div>
              </div>
            </div>
          </td>

          <!-- Prova -->
          <td>
            <div style="font-weight: 700; color: #e2e8f0;">${row.activityName}</div>
            <div style="font-size: 0.72rem; color: #94a3b8;">${row.activityCategory} • Máx: ${row.maxPoints} pts</div>
          </td>

          <!-- Respostas dos Juízes -->
          <td>
            <div style="display: flex; gap: 1rem;">
              ${row.judgeResponses.map((jr) => {
                if (jr.answered) {
                  return `
                    <div style="flex: 1; text-align: center; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 4px; padding: 0.35rem 0.2rem;">
                      <div style="font-weight: 900; color: #34d399; font-size: 0.95rem;">${jr.points} pts</div>
                      <div style="font-size: 0.65rem; color: #6ee7b7;">Lançado</div>
                    </div>
                  `;
                } else {
                  return `
                    <div style="flex: 1; text-align: center; background: rgba(239, 68, 68, 0.08); border: 1px dashed rgba(239, 68, 68, 0.35); border-radius: 4px; padding: 0.35rem 0.2rem;">
                      <div style="font-weight: 700; color: #f87171; font-size: 0.85rem;">Pendente</div>
                      <div style="font-size: 0.65rem; color: #fca5a5;">Aguardando</div>
                    </div>
                  `;
                }
              }).join('')}
            </div>
          </td>

          <!-- Progresso -->
          <td style="text-align: center;">
            <div style="font-weight: 800; font-size: 0.85rem; margin-bottom: 0.2rem;">${row.answeredCount}/${judges.length}</div>
            ${statusBadge}
          </td>

          <!-- Ação -->
          <td style="text-align: center;">
            <button class="btn btn-secondary btn-view-matrix-detail" data-act="${row.activityId}" data-team="${row.teamId}" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;">
              Auditar
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Listener para o botão de auditoria rápida da linha
    document.querySelectorAll('.btn-view-matrix-detail').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelector('[data-tab="tab-audit"]').click();
      });
    });
  }

  matrixFilterProva.addEventListener('change', renderMatrix);
  matrixFilterStatus.addEventListener('change', renderMatrix);

  // =========================================================================
  // 6. ABA 3: AUDITORIA DE NOTAS
  // =========================================================================

  function renderAudit() {
    const responses = state.getAllJudgeResponses();
    const query = (auditSearchInput.value || '').toLowerCase().trim();

    const filtered = responses.filter((r) => {
      if (!query) return true;
      return (
        r.teamName.toLowerCase().includes(query) ||
        r.judgeName.toLowerCase().includes(query) ||
        r.activityName.toLowerCase().includes(query) ||
        r.teamTurma.toLowerCase().includes(query) ||
        r.note.toLowerCase().includes(query)
      );
    });

    if (filtered.length === 0) {
      auditScoresContainer.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; color: #94a3b8; background: rgba(255, 255, 255, 0.02); border-radius: 6px;">
          Nenhum registro de avaliação localizado com os critérios informados.
        </div>
      `;
      return;
    }

    auditScoresContainer.innerHTML = filtered.map((r) => {
      const dateFormatted = new Date(r.createdAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Detalhamento de rubricas
      const rubricKeys = Object.keys(r.rubricBreakdown || {});
      const rubricBadges = rubricKeys.map((k) => `
        <span style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.72rem;">
          ${k}: <strong>${r.rubricBreakdown[k]} pts</strong>
        </span>
      `).join('');

      return `
        <div class="glass-card" style="padding: 1.15rem; display: flex; flex-direction: column; gap: 0.75rem; border-left: 4px solid ${r.teamColor};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <strong style="font-size: 1.05rem; color: #fff;">${r.teamName} (${r.teamTurma})</strong>
                <span style="color: var(--text-secondary); font-size: 0.8rem;">• ${r.activityName}</span>
              </div>
              <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.2rem;">
                Avaliador: <strong style="color: #60a5fa;">${r.judgeName}</strong> (${r.judgeRole}) • ${dateFormatted}
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="text-align: right;">
                <div style="font-size: 1.4rem; font-weight: 900; color: #10b981;">${r.points} <span style="font-size: 0.8rem; color: var(--text-secondary);">/ ${r.maxPoints} pts</span></div>
              </div>
              <div style="display: flex; gap: 0.4rem;">
                <button class="btn btn-secondary btn-edit-score" data-id="${r.id}" data-points="${r.points}" data-note="${encodeURIComponent(r.note)}" data-subtitle="${r.teamName} - ${r.activityName}" style="padding: 0.4rem 0.65rem; font-size: 0.78rem;">
                  Editar
                </button>
                <button class="btn btn-outline btn-delete-score" data-id="${r.id}" style="padding: 0.4rem 0.65rem; font-size: 0.78rem; border-color: #ef4444; color: #f87171;">
                  Anular
                </button>
              </div>
            </div>
          </div>

          <!-- Rubricas e Parecer -->
          ${rubricKeys.length > 0 ? `
            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center;">
              <span style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 700;">Rubricas Avaliadas:</span>
              ${rubricBadges}
            </div>
          ` : ''}

          ${r.note ? `
            <div style="background: rgba(0, 0, 0, 0.25); padding: 0.5rem 0.75rem; border-radius: 4px; font-size: 0.8rem; color: #cbd5e1; border-left: 2px solid #3b82f6;">
              Parecer Técnico: "${r.note}"
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Listeners para editar e anular
    document.querySelectorAll('.btn-edit-score').forEach((btn) => {
      btn.addEventListener('click', () => {
        openEditScoreModal(btn.dataset.id, btn.dataset.points, decodeURIComponent(btn.dataset.note), btn.dataset.subtitle);
      });
    });

    document.querySelectorAll('.btn-delete-score').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (confirm('Confirma a anulação desta pontuação? A pontuação será excluída do placar oficial.')) {
          state.deleteScore(btn.dataset.id);
          sound.playBuzzer();
          renderAudit();
          renderMatrix();
          updateMetrics();
        }
      });
    });
  }

  auditSearchInput.addEventListener('input', renderAudit);

  if (btnExportAuditCsv) {
    btnExportAuditCsv.addEventListener('click', () => {
      const csv = state.exportCSV();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `relatorio_gincana_sesi_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // =========================================================================
  // 7. ABA 4: GESTÃO DE JUÍZES E ALTERAÇÃO DE PINS
  // =========================================================================

  function renderJudgesCrud() {
    const judges = state.getJudgesWithPresence();
    const provas = state.getProvas();

    judgesListContainer.innerHTML = judges.map((j) => {
      const assigned = j.assignedProvaId ? provas.find(p => p.id === j.assignedProvaId) : null;
      const respBadge = assigned
        ? `<span class="badge" style="background: rgba(37, 99, 235, 0.2); color: #60a5fa; border: 1px solid rgba(37, 99, 235, 0.4); font-size: 0.75rem; padding: 0.15rem 0.45rem; border-radius: 4px;">📌 Resp: <strong>${assigned.title}</strong></span>`
        : `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.75rem; padding: 0.15rem 0.45rem; border-radius: 4px;">🌐 Geral / Todas</span>`;

      return `
        <div class="glass-card" style="padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <div>
            <div style="font-weight: 800; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem;">
              ${j.name}
              ${j.isOnline ? '<span class="pulse-online" title="Online"></span>' : '<span class="dot-offline" title="Offline"></span>'}
            </div>
            <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span>${j.role}</span>
              ${respBadge}
              <span>• Avaliações submetidas: <strong>${j.totalEvaluations}</strong></span>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="text-align: right;">
              <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">PIN Atual</div>
              <div style="font-family: monospace; font-size: 1.1rem; font-weight: 900; color: #fbbf24; letter-spacing: 2px;">
                ${j.pin || '1234'}
              </div>
            </div>

            <div style="display: flex; gap: 0.4rem;">
              <button class="btn btn-secondary btn-edit-judge" data-id="${j.id}" data-name="${j.name}" data-role="${j.role}" data-pin="${j.pin || '1234'}" data-assigned="${j.assignedProvaId || ''}" style="padding: 0.4rem 0.75rem; font-size: 0.8rem;">
                Editar
              </button>
              <button class="btn btn-outline btn-delete-judge" data-id="${j.id}" style="padding: 0.4rem 0.65rem; font-size: 0.8rem; border-color: #ef4444; color: #f87171;">
                Excluir
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Listeners de edição e exclusão de juiz
    document.querySelectorAll('.btn-edit-judge').forEach((btn) => {
      btn.addEventListener('click', () => {
        openJudgeModal({
          id: btn.dataset.id,
          name: btn.dataset.name,
          role: btn.dataset.role,
          pin: btn.dataset.pin,
          assignedProvaId: btn.dataset.assigned || null
        });
      });
    });

    document.querySelectorAll('.btn-delete-judge').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (confirm('Confirma a exclusão deste avaliador?')) {
          state.deleteJudge(btn.dataset.id);
          sound.playBuzzer();
          renderJudgesCrud();
          renderOnlineJudges();
          renderMatrix();
          updateMetrics();
        }
      });
    });
  }

  // Formulário para alterar o PIN Master do Gestor
  if (formUpdateGestorPin) {
    formUpdateGestorPin.addEventListener('submit', (e) => {
      e.preventDefault();
      const p1 = inputNewGestorPin.value.trim();
      const p2 = inputConfirmGestorPin.value.trim();

      if (p1.length < 4) {
        alert('O PIN deve conter no mínimo 4 dígitos numéricos.');
        return;
      }
      if (p1 !== p2) {
        alert('Os valores digitados não coincidem.');
        return;
      }

      state.updateGestorPin(p1);
      sound.playScoreDing();
      alert(`Senha Master atualizada com sucesso para: ${p1}`);
      inputNewGestorPin.value = '';
      inputConfirmGestorPin.value = '';
    });
  }

  // =========================================================================
  // 8. ABA 5: GESTÃO DE EQUIPES / TURMAS
  // =========================================================================

  // Planilha de Turmas (Download Modelo e Upload / Importação em Lote)
  const btnGestorDownloadTemplate = document.getElementById('btn-gestor-download-teams-template');
  const btnGestorTriggerImport = document.getElementById('btn-gestor-trigger-teams-import');
  const inputGestorTeamsFile = document.getElementById('input-gestor-teams-file');

  if (btnGestorDownloadTemplate) {
    btnGestorDownloadTemplate.addEventListener('click', () => {
      if (window.PlanilhaTurmas) {
        window.PlanilhaTurmas.downloadPlanilhaModelo();
      }
    });
  }

  if (btnGestorTriggerImport && inputGestorTeamsFile) {
    btnGestorTriggerImport.addEventListener('click', () => {
      inputGestorTeamsFile.value = '';
      inputGestorTeamsFile.click();
    });

    inputGestorTeamsFile.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        const parsed = await window.PlanilhaTurmas.parseFile(file);
        window.PlanilhaTurmas.showImportPreviewModal(parsed, file.name, (teamsToImport, replace) => {
          const count = state.importTeams(teamsToImport, replace);
          sound.playScoreDing();
          alert(`🎉 Sucesso! ${count} turmas foram importadas para o sistema.`);
          renderTeamsCrud();
          renderMatrix();
          updateMetrics();
        });
      } catch (err) {
        sound.playBuzzer();
        alert(err.message || 'Erro ao processar arquivo de planilha.');
      }
    });
  }

  function renderTeamsCrud() {
    const teams = state.getTeams();

    teamsCardsGrid.innerHTML = teams.map((t) => {
      return `
        <div class="glass-card" style="padding: 1.25rem; border-top: 4px solid ${t.color}; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
              <div>
                <h4 style="font-size: 1.15rem; font-weight: 900; color: #fff; margin: 0;">${t.name}</h4>
                <div style="font-size: 0.78rem; color: var(--text-secondary);">${t.turma} • ${t.segmento}</div>
              </div>
              <div style="width: 20px; height: 20px; border-radius: 4px; background: ${t.color}; border: 1px solid rgba(255, 255, 255, 0.4);" title="Identificador de Cor"></div>
            </div>

            <div style="background: rgba(255, 255, 255, 0.03); border-radius: 6px; padding: 0.65rem 0.85rem; font-size: 0.8rem; margin: 0.75rem 0; display: flex; flex-direction: column; gap: 0.35rem;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-secondary);">Professor Tutor:</span>
                <strong style="color: #fff;">${t.tutor || '-'}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-secondary);">Resíduo Eletrônico:</span>
                <strong style="color: #10b981;">${(t.pesoELixoKg || 0).toFixed(2)} kg</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-secondary);">Lema Oficial:</span>
                <span style="color: #cbd5e1; max-width: 170px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">"${t.slogan || '-'}"</span>
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
            <button class="btn btn-secondary btn-edit-team" data-id="${t.id}" style="flex: 1; font-size: 0.8rem; padding: 0.45rem;">
              Editar
            </button>
            <button class="btn btn-outline btn-delete-team" data-id="${t.id}" style="font-size: 0.8rem; padding: 0.45rem; border-color: #ef4444; color: #f87171;">
              Excluir
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Listeners para editar e excluir equipe
    document.querySelectorAll('.btn-edit-team').forEach((btn) => {
      btn.addEventListener('click', () => {
        const team = state.getTeam(btn.dataset.id);
        if (team) openTeamModal(team);
      });
    });

    document.querySelectorAll('.btn-delete-team').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (confirm('Confirma a exclusão desta equipe escolar? Os lançamentos associados também serão removidos.')) {
          state.deleteTeam(btn.dataset.id);
          sound.playBuzzer();
          renderTeamsCrud();
          renderMatrix();
          updateMetrics();
        }
      });
    });
  }

  // =========================================================================
  // 9. ABA 6: INFORMAÇÕES DO PAINEL & EDITAL
  // =========================================================================

  function renderConfigForm() {
    const config = state.getConfig();
    cfgEventName.value = config.eventName || '';
    cfgInstitution.value = config.institution || '';
    cfgEditalTitle.value = config.editalTitle || '';
    cfgSelectedUnit.value = config.selectedUnit || 'SESI Escola São Gonçalo do Amarante';
    cfgSelectedSegment.value = config.selectedSegment || 'Ensino Médio';
    cfgSelectedShift.value = config.selectedShift || 'Matutino';
    cfgDates.value = config.dates || '';
    cfgYear.value = config.year || 2026;
  }

  if (formPanelConfig) {
    formPanelConfig.addEventListener('submit', (e) => {
      e.preventDefault();
      const newConfig = {
        eventName: cfgEventName.value.trim(),
        institution: cfgInstitution.value.trim(),
        editalTitle: cfgEditalTitle.value.trim(),
        selectedUnit: cfgSelectedUnit.value,
        selectedSegment: cfgSelectedSegment.value,
        selectedShift: cfgSelectedShift.value,
        dates: cfgDates.value.trim(),
        year: parseInt(cfgYear.value, 10) || 2026
      };

      state.updateConfig(newConfig);
      sound.playScoreDing();
      updateHeaderInfo();
      alert('Parâmetros da gincana atualizados com sucesso. Sincronização propagada para todas as telas.');
    });
  }

  if (btnClearScores) {
    btnClearScores.addEventListener('click', () => {
      if (confirm('Atenção: Confirma a reinicialização de todas as notas das avaliações?')) {
        state.clearScoresOnly();
        sound.playBuzzer();
        alert('As notas foram zeradas.');
        renderAll();
      }
    });
  }

  if (btnResetAll) {
    btnResetAll.addEventListener('click', () => {
      if (confirm('Atenção: Deseja restaurar todas as configurações e turmas para os valores oficiais do Edital?')) {
        state.resetToDefaults();
        sound.playBuzzer();
        alert('Configurações redefinidas para os parâmetros oficiais do Edital SESI CONECTA.');
        renderAll();
      }
    });
  }

  // =========================================================================
  // 10. MODAIS DE CONTROLE
  // =========================================================================

  // Modal Juiz (Novo / Editar)
  function openJudgeModal(judgeData = null) {
    const provas = state.getProvas();
    const judges = state.getJudges();

    if (crudJudgeProva) {
      crudJudgeProva.innerHTML = `
        <option value="">-- Acesso Geral / Todas as Provas --</option>
        ${provas.map(p => {
          const isMulti = state.isMultiJudgeProva(p.id);
          // Procura se outro juiz já está atribuído a esta prova de juiz único
          const existingJudge = !isMulti ? judges.find(j => j.assignedProvaId === p.id && (!judgeData || j.id !== judgeData.id)) : null;

          if (existingJudge) {
            return `<option value="${p.id}" disabled style="color: #64748b; background: #0b1120;">⛔ ${p.title} (Indisponível - Juiz: ${existingJudge.name})</option>`;
          }
          return `<option value="${p.id}">${p.title} (${isMulti ? 'Banca' : 'Juiz Único'})</option>`;
        }).join('')}
      `;
    }

    if (judgeData) {
      modalJudgeTitle.innerText = 'Editar Registro de Avaliador';
      crudJudgeId.value = judgeData.id;
      crudJudgeName.value = judgeData.name;
      crudJudgeRole.value = judgeData.role;
      crudJudgePin.value = judgeData.pin || '1234';
      if (crudJudgeProva) crudJudgeProva.value = judgeData.assignedProvaId || '';
    } else {
      modalJudgeTitle.innerText = 'Cadastro de Avaliador';
      crudJudgeId.value = '';
      crudJudgeName.value = '';
      crudJudgeRole.value = 'Avaliador Oficial';
      crudJudgePin.value = '1234';
      if (crudJudgeProva) crudJudgeProva.value = '';
    }
    modalJudgeCrud.classList.remove('hidden');
  }

  if (btnOpenAddJudgeModal) btnOpenAddJudgeModal.addEventListener('click', () => openJudgeModal(null));
  if (btnCloseJudgeModal) btnCloseJudgeModal.addEventListener('click', () => modalJudgeCrud.classList.add('hidden'));

  if (formJudgeCrud) {
    formJudgeCrud.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = crudJudgeId.value;
      const name = crudJudgeName.value.trim();
      const role = crudJudgeRole.value.trim();
      const pin = crudJudgePin.value.trim();
      const assignedProvaId = crudJudgeProva ? (crudJudgeProva.value || null) : null;

      if (id) {
        state.updateJudge(id, { name, role, pin, assignedProvaId });
      } else {
        state.addJudge({ name, role, pin, assignedProvaId });
      }

      sound.playScoreDing();
      modalJudgeCrud.classList.add('hidden');
      renderJudgesCrud();
      renderOnlineJudges();
      renderMatrix();
      updateMetrics();
    });
  }

  // Modal Alterar PIN Rápido do Juiz
  function openChangeJudgePinModal(id, name, currentPin) {
    changePinJudgeId.value = id;
    modalChangePinJudgeName.innerText = `Avaliador: ${name}`;
    inputSingleJudgePin.value = currentPin || '1234';
    modalChangeJudgePin.classList.remove('hidden');
  }

  if (btnCloseChangePinModal) btnCloseChangePinModal.addEventListener('click', () => modalChangeJudgePin.classList.add('hidden'));

  if (formChangeJudgePin) {
    formChangeJudgePin.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = changePinJudgeId.value;
      const pin = inputSingleJudgePin.value.trim();

      if (!pin) {
        alert('Informe um PIN válido.');
        return;
      }

      state.updateJudgePin(id, pin);
      sound.playScoreDing();
      modalChangeJudgePin.classList.add('hidden');
      renderJudgesCrud();
      renderOnlineJudges();
      alert(`PIN do avaliador atualizado com sucesso.`);
    });
  }

  // Modal Equipe (Nova / Editar)
  function openTeamModal(team = null) {
    if (team) {
      modalTeamTitle.innerText = 'Editar Equipe / Turma';
      crudTeamId.value = team.id;
      crudTeamName.value = team.name;
      crudTeamIcon.value = team.icon || 'EQ';
      crudTeamTurma.value = team.turma;
      crudTeamSegmento.value = team.segmento || 'Ensino Médio';
      crudTeamColor.value = team.color || '#3b82f6';
      crudTeamColorEnd.value = team.colorEnd || '#1d4ed8';
      crudTeamTutor.value = team.tutor || '';
      crudTeamPeso.value = team.pesoELixoKg || 0;
      crudTeamSlogan.value = team.slogan || '';
    } else {
      modalTeamTitle.innerText = 'Cadastro de Equipe / Turma';
      crudTeamId.value = '';
      crudTeamName.value = '';
      crudTeamIcon.value = 'EQ';
      crudTeamTurma.value = '1a Série EM';
      crudTeamSegmento.value = 'Ensino Médio';
      crudTeamColor.value = '#2563eb';
      crudTeamColorEnd.value = '#1d4ed8';
      crudTeamTutor.value = '';
      crudTeamPeso.value = 0;
      crudTeamSlogan.value = '';
    }
    modalTeamCrud.classList.remove('hidden');
  }

  if (btnOpenAddTeamModal) btnOpenAddTeamModal.addEventListener('click', () => openTeamModal(null));
  if (btnCloseTeamModal) btnCloseTeamModal.addEventListener('click', () => modalTeamCrud.classList.add('hidden'));

  if (formTeamCrud) {
    formTeamCrud.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = crudTeamId.value;
      const teamData = {
        name: crudTeamName.value.trim(),
        icon: (crudTeamIcon.value.trim() || 'EQ').toUpperCase(),
        turma: crudTeamTurma.value.trim(),
        segmento: crudTeamSegmento.value,
        color: crudTeamColor.value,
        colorEnd: crudTeamColorEnd.value,
        tutor: crudTeamTutor.value.trim(),
        pesoELixoKg: parseFloat(crudTeamPeso.value) || 0,
        slogan: crudTeamSlogan.value.trim()
      };

      if (id) {
        state.updateTeam(id, teamData);
      } else {
        state.addTeam(teamData);
      }

      sound.playScoreDing();
      modalTeamCrud.classList.add('hidden');
      renderTeamsCrud();
      renderMatrix();
      updateMetrics();
    });
  }

  // Modal Editar Nota de Auditoria
  function openEditScoreModal(id, points, note, subtitle) {
    editScoreId.value = id;
    editScorePoints.value = points;
    editScoreNote.value = note || '';
    editScoreSubtitle.innerText = subtitle || 'Avaliação';
    modalEditScore.classList.remove('hidden');
  }

  if (btnCloseEditScoreModal) btnCloseEditScoreModal.addEventListener('click', () => modalEditScore.classList.add('hidden'));

  if (formEditScore) {
    formEditScore.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = editScoreId.value;
      const points = parseFloat(editScorePoints.value);
      const note = editScoreNote.value.trim();

      state.updateScore(id, { points, note });
      sound.playScoreDing();
      modalEditScore.classList.add('hidden');
      renderAudit();
      renderMatrix();
      updateMetrics();
      alert('Pontuação retificada com sucesso.');
    });
  }

  // =========================================================================
  // 11. INSCRIÇÃO PARA ATUALIZAÇÃO REATIVA EM TEMPO REAL
  // =========================================================================

  state.subscribe((event) => {
    updateMetrics();
    updateTelaoStatusBadge();
    if (currentActiveTab === 'tab-admin-lancamentos') renderAdminLancamentos();
    if (currentActiveTab === 'tab-online-judges') renderOnlineJudges();
    if (currentActiveTab === 'tab-matrix') renderMatrix();
    if (currentActiveTab === 'tab-audit') renderAudit();
  });

  // Atualização periódica da presença a cada 10 segundos
  setInterval(() => {
    if (!pinOverlay.classList.contains('hidden')) return;
    updateMetrics();
    if (currentActiveTab === 'tab-online-judges') {
      renderOnlineJudges();
    }
  }, 10000);

  // Inicializa autenticação do gestor
  initAuth();
});

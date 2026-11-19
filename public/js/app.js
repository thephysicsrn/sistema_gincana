/**
 * Gincana SESI CONECTA 2026 - Lógica da Aplicação
 * Parametrizado conforme o Edital Oficial SESI Escola/RN
 */

document.addEventListener('DOMContentLoaded', () => {
  const state = window.gincanaState;
  const sound = window.gincanaSound;
  const confetti = window.gincanaConfetti;

  // Estado local do formulário do juiz
  const judgeFormState = {
    selectedTeamId: null,
    selectedProvaId: null,
    selectedJudge: '',
    criteriaValues: {},
    directPlace: 1, // Para provas por colocação direta (1º, 2º, 3º, demais)
    directPoints: 0,
    pesoInput: 0,
    isExceededTime: false,
    note: ''
  };

  const navTabs = document.querySelectorAll('.nav-tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const toastContainer = document.getElementById('toast-container');
  const muteBtn = document.getElementById('btn-toggle-sound');

  // Navegação
  function switchTab(tabId) {
    navTabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
    tabContents.forEach((tab) => tab.classList.toggle('active', tab.id === tabId));
    sound.playClick();

    if (tabId === 'tab-placar') renderPlacar();
    else if (tabId === 'tab-juiz') renderJudgeTab();
    else if (tabId === 'tab-planilha') renderPlanilhaGeral();
    else if (tabId === 'tab-penalidades') renderPenalidades();
    else if (tabId === 'tab-provas') renderProvasManagement();
    else if (tabId === 'tab-equipes') renderTeamsManagement();
  }

  navTabs.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ==========================================
  // RENDERIZAÇÃO DO PLACAR & PÓDIO
  // ==========================================
  function renderPlacar() {
    const rankings = state.getTeamRankings();
    if (rankings.length === 0) return;

    // Pódio dos 3 Primeiros
    const podiumEl = document.getElementById('podium-view');
    if (podiumEl) {
      const top3 = [
        rankings[1] || null, // 2º
        rankings[0] || null, // 1º
        rankings[2] || null  // 3º
      ];

      podiumEl.innerHTML = top3.map((team, idx) => {
        if (!team) return '';
        const rankNum = idx === 1 ? 1 : idx === 0 ? 2 : 3;
        const rankClass = `rank-${rankNum}`;
        const medalTitle = rankNum === 1 ? '1º LUGAR' : rankNum === 2 ? '2º LUGAR' : '3º LUGAR';

        return `
          <div class="podium-card ${rankClass}" style="--team-color: ${team.color}">
            <span class="podium-badge" style="letter-spacing: 1px;">${medalTitle}</span>
            <div class="podium-team-icon" style="background: ${team.color}22; border-color: ${team.color}; font-size: 1.5rem; font-weight: 800;">
              ${team.icon || team.name.substring(0, 2).toUpperCase()}
            </div>
            <h3 class="podium-team-name" style="color: ${team.color}">${team.name}</h3>
            <p class="podium-team-class">${team.turma || team.className}</p>
            <div class="podium-score-box">
              <div class="podium-score-val">${team.totalPoints.toLocaleString('pt-BR')}</div>
              <div class="podium-score-label">Pontos Oficiais</div>
              <div style="margin-top: 0.4rem; font-size: 0.78rem; color: #a7f3d0; font-weight: 700;">
                Nota Escolar (Item 39): ${team.notaEscolar} pts
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Lista Geral
    const listEl = document.getElementById('leaderboard-list');
    if (listEl) {
      const leaderPoints = rankings[0].totalPoints || 1;

      listEl.innerHTML = rankings.map((team) => {
        const percent = Math.min(100, Math.max(15, Math.round((team.totalPoints / leaderPoints) * 100)));
        let rankBadgeClass = '';
        if (team.rank === 1) rankBadgeClass = 'gold';
        else if (team.rank === 2) rankBadgeClass = 'silver';
        else if (team.rank === 3) rankBadgeClass = 'bronze';

        const diffText = team.rank === 1 ? 'Líder Geral' : `-${team.diffToLeader} pts`;

        return `
          <div class="team-row-card" style="--team-color: ${team.color}">
            <div class="rank-number ${rankBadgeClass}">#${team.rank}</div>
            <div class="team-icon-circle" style="background: ${team.color}22; border: 1px solid ${team.color}66; font-weight: 800; font-size: 0.95rem;">
              ${team.icon || team.name.substring(0, 2).toUpperCase()}
            </div>
            <div class="team-main-info">
              <div class="team-name-title">
                ${team.name}
                <span class="team-tag" style="color:${team.color}; background:${team.color}18;">${team.shortName}</span>
                <span style="font-size: 0.75rem; color: #a7f3d0; background: rgba(16,185,129,0.15); padding: 2px 8px; border-radius: 99px;">
                  Nota: ${team.notaEscolar}
                </span>
              </div>
              <div class="team-class-sub">
                ${team.turma} • Tutor: ${team.tutor || '-'} • E-Lixo: <strong>${team.stats.pesoKg} kg</strong> (+${team.stats.elixoComTeto} pts)
              </div>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-track">
                <div class="progress-fill" style="width: ${percent}%; background: ${team.color}"></div>
              </div>
              <div class="progress-label">
                <span>${diffText}</span>
                <span>${percent}%</span>
              </div>
            </div>
            <div class="team-score-end">
              <div class="score-number">${team.totalPoints.toLocaleString('pt-BR')}</div>
              <div class="score-unit">PONTOS</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // ==========================================
  // ABA DO JUIZ: LANÇAMENTO DE NOTAS
  // ==========================================
  function getAllDesktopProvas() {
    return state.getProvas();
  }

  function renderJudgeTab() {
    const allProvas = getAllDesktopProvas();
    const judges = state.getJudges();

    // Seletor de Juiz
    const judgeSelect = document.getElementById('judge-select');
    if (judgeSelect) {
      judgeSelect.innerHTML = `
        <option value="">-- Selecione seu nome / Comissão --</option>
        ${judges.map((j) => `<option value="${j.name}">${j.name} (${j.role})</option>`).join('')}
      `;
      if (judgeFormState.selectedJudge) {
        judgeSelect.value = judgeFormState.selectedJudge;
      }
    }

    if (!judgeFormState.selectedProvaId && allProvas.length > 0) {
      judgeFormState.selectedProvaId = allProvas[0].id;
    }

    // Renderiza Abas de Prova no Desktop
    renderDesktopProvaTabs();
    updateDesktopActiveProvaHero();
    setupDesktopCriteriaEditor();

    // Filtro e Busca para a Grade de Equipes no Desktop
    if (!window.desktopTeamFiltersInit) {
      window.desktopTeamFiltersInit = true;
      window.desktopFilterState = { segment: 'all', status: 'all', search: '' };

      const searchInp = document.getElementById('desktop-team-search');
      if (searchInp) {
        searchInp.addEventListener('input', (e) => {
          window.desktopFilterState.search = e.target.value.toLowerCase().trim();
          renderDesktopTeamGrid();
        });
      }

      document.querySelectorAll('.btn-desktop-filter-segment').forEach((btn) => {
        btn.addEventListener('click', () => {
          window.desktopFilterState.segment = btn.dataset.segment;
          document.querySelectorAll('.btn-desktop-filter-segment').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          sound.playClick();
          renderDesktopTeamGrid();
        });
      });

      document.querySelectorAll('.btn-desktop-filter-status').forEach((btn) => {
        btn.addEventListener('click', () => {
          window.desktopFilterState.status = btn.dataset.status;
          document.querySelectorAll('.btn-desktop-filter-status').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          sound.playClick();
          renderDesktopTeamGrid();
        });
      });
    }

    renderDesktopTeamGrid();
    renderProvaControls();
    updateJudgeSummaryPreview();
  }

  function renderDesktopProvaTabs() {
    const tabsContainer = document.getElementById('desktop-prova-tabs-container');
    const badgeCounter = document.getElementById('desktop-prova-counter-badge');
    if (!tabsContainer) return;

    const allProvas = getAllDesktopProvas();
    const allTeams = state.getTeams();
    const totalTurmas = allTeams.length;

    if (badgeCounter) {
      badgeCounter.innerText = `${allProvas.length} provas`;
    }

    tabsContainer.innerHTML = allProvas.map((p) => {
      const isActive = p.id === judgeFormState.selectedProvaId;
      const scores = state.getProvaScores(p.id);
      const evaluatedCount = scores.length;
      const isComplete = evaluatedCount >= totalTurmas && totalTurmas > 0;

      let badgeText = `${evaluatedCount}/${totalTurmas}`;
      if (isComplete) badgeText = `✓ ${evaluatedCount}`;

      return `
        <button type="button" class="prova-tab-pill ${isActive ? 'active' : ''} ${isComplete ? 'completed' : ''}" 
                data-prova-id="${p.id}" id="desktop-tab-${p.id}">
          <span style="font-size: 0.75rem; font-weight: 800; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${p.icon || 'P'}</span>
          <span>${p.shortTitle || p.title}</span>
          <span class="tab-badge-eval" title="${evaluatedCount} de ${totalTurmas} turmas avaliadas">${badgeText}</span>
        </button>
      `;
    }).join('');

    tabsContainer.querySelectorAll('.prova-tab-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.provaId;
        if (judgeFormState.selectedProvaId === targetId) return;

        judgeFormState.selectedProvaId = targetId;
        judgeFormState.criteriaValues = {};
        judgeFormState.directPlace = 1;
        judgeFormState.directPoints = 0;
        judgeFormState.isExceededTime = false;

        sound.playClick();
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

        renderDesktopProvaTabs();
        updateDesktopActiveProvaHero();
        renderDesktopTeamGrid();
        renderProvaControls();
        updateJudgeSummaryPreview();
      });
    });
  }

  function updateDesktopActiveProvaHero() {
    const prova = state.getProva(judgeFormState.selectedProvaId);
    if (!prova) return;

    const heroIcon = document.getElementById('desktop-hero-prova-icon');
    const heroName = document.getElementById('desktop-hero-prova-name');
    const heroCategory = document.getElementById('desktop-hero-prova-category');
    const heroAnexo = document.getElementById('desktop-hero-prova-anexo');
    const heroMode = document.getElementById('desktop-hero-prova-mode');
    const heroDesc = document.getElementById('desktop-hero-prova-desc');
    const btnCriteria = document.getElementById('btn-desktop-open-criteria');

    if (heroIcon) heroIcon.innerText = prova.icon || 'P';
    if (heroName) heroName.innerText = prova.title;
    if (heroCategory) heroCategory.innerText = prova.category || 'Geral';
    if (heroAnexo) heroAnexo.innerText = `${prova.anexo || ''} • ${prova.itemEdital || ''}`;

    let modeText = 'Rubrica (100 pts)';
    if (prova.type === 'soma_direta') modeText = 'Soma Direta dos Critérios';
    else if (prova.type === 'top3_zero') modeText = 'Top 3 (100, 75, 50, 0)';
    else if (prova.type === 'standard_colocacao') modeText = 'Colocação (100, 75, 50, 25)';
    else if (prova.type === 'elixo_pesagem') modeText = '1 kg = 1 pt + Bônus';
    else if (prova.type === 'rubrica_elixo_mob') modeText = 'Rubrica Mobilização (Até 100 pts)';

    if (heroMode) heroMode.innerText = `Modo: ${modeText}`;
    if (heroDesc) heroDesc.innerHTML = `<strong>Regra do Edital:</strong> ${prova.description}`;

    if (btnCriteria) {
      btnCriteria.style.display = prova.id === 'prova_elixo_pesagem' ? 'none' : 'inline-flex';
    }
  }

  // Configuração do Modal de Critérios no Desktop
  let desktopTempCriteria = [];
  function setupDesktopCriteriaEditor() {
    const btnOpen = document.getElementById('btn-desktop-open-criteria');
    const modal = document.getElementById('modal-criteria-editor');
    if (!btnOpen || !modal || window.desktopCriteriaEditorInit) return;
    window.desktopCriteriaEditorInit = true;

    const modalTitle = document.getElementById('criteria-editor-modal-title');
    const scoringTypeSelect = document.getElementById('edit-prova-scoring-type');
    const sumBadge = document.getElementById('criteria-editor-sum-badge');
    const rowsContainer = document.getElementById('criteria-editor-rows-container');
    const btnAdd = document.getElementById('btn-add-new-criterion');
    const btnBalance = document.getElementById('btn-balance-criteria-100');
    const btnReset = document.getElementById('btn-reset-default-criteria');
    const btnSave = document.getElementById('btn-save-criteria-editor');
    const btnCancel = document.getElementById('btn-cancel-criteria-editor');
    const btnClose = document.getElementById('btn-close-criteria-editor');

    function renderModalRows() {
      const totalMaxSum = desktopTempCriteria.reduce((acc, c) => acc + Number(c.max || 0), 0);
      if (sumBadge) {
        sumBadge.innerText = `Soma Máxima das Rubricas: ${totalMaxSum} pts`;
        sumBadge.style.color = totalMaxSum === 100 ? '#34d399' : '#fbbf24';
      }

      if (desktopTempCriteria.length === 0) {
        rowsContainer.innerHTML = `
          <div style="text-align: center; padding: 1.5rem; background: rgba(0,0,0,0.3); border-radius: 8px; color: #94a3b8; font-size: 0.85rem;">
            Esta prova atualmente não possui critérios de rubrica definidos.<br>
            Clique abaixo em <strong>+ Adicionar Novo Critério</strong> para criar a rubrica!
          </div>
        `;
        return;
      }

      rowsContainer.innerHTML = `
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
            ${desktopTempCriteria.map((c, idx) => `
              <tr>
                <td style="color: #94a3b8; font-weight: 700;">${idx + 1}</td>
                <td>
                  <input type="text" class="form-input desktop-crit-name" data-idx="${idx}" value="${c.name}" 
                         placeholder="Ex: Criatividade, Originalidade..." style="padding: 0.45rem 0.65rem; font-size: 0.85rem;">
                </td>
                <td>
                  <input type="number" min="1" max="100" class="form-input desktop-crit-max" data-idx="${idx}" value="${c.max}" 
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

      rowsContainer.querySelectorAll('.desktop-crit-name').forEach((inp) => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          desktopTempCriteria[idx].name = e.target.value;
        });
      });

      rowsContainer.querySelectorAll('.desktop-crit-max').forEach((inp) => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          desktopTempCriteria[idx].max = Math.max(1, parseInt(e.target.value, 10) || 0);
          const newSum = desktopTempCriteria.reduce((acc, c) => acc + Number(c.max || 0), 0);
          if (sumBadge) sumBadge.innerText = `Soma Máxima das Rubricas: ${newSum} pts`;
        });
      });

      rowsContainer.querySelectorAll('.btn-delete-criterion').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.delIdx, 10);
          desktopTempCriteria.splice(idx, 1);
          sound.playClick();
          renderModalRows();
        });
      });
    }

    btnOpen.addEventListener('click', () => {
      const prova = state.getProva(judgeFormState.selectedProvaId);
      if (!prova) return;

      if (modalTitle) modalTitle.innerText = `Definir Critérios da Prova: ${prova.title}`;
      desktopTempCriteria = JSON.parse(JSON.stringify(prova.criteria || []));
      if (scoringTypeSelect) scoringTypeSelect.value = prova.type || 'rubrica_colocacao';

      renderModalRows();
      modal.classList.add('active');
    });

    if (btnCancel) btnCancel.addEventListener('click', () => modal.classList.remove('active'));
    if (btnClose) btnClose.addEventListener('click', () => modal.classList.remove('active'));

    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        desktopTempCriteria.push({
          name: `Critério ${desktopTempCriteria.length + 1}`,
          max: 20
        });
        sound.playClick();
        renderModalRows();
      });
    }

    if (btnBalance) {
      btnBalance.addEventListener('click', () => {
        if (desktopTempCriteria.length === 0) return;
        const count = desktopTempCriteria.length;
        const base = Math.floor(100 / count);
        const remainder = 100 - (base * count);

        desktopTempCriteria.forEach((c, i) => {
          c.max = base + (i === 0 ? remainder : 0);
        });

        sound.playScoreDing();
        renderModalRows();
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm('Restaurar os critérios padrão do Edital para esta prova?')) {
          try {
            const restored = state.resetProvaCriteria(judgeFormState.selectedProvaId);
            if (restored) {
              desktopTempCriteria = JSON.parse(JSON.stringify(restored.criteria || []));
              if (scoringTypeSelect) scoringTypeSelect.value = restored.type || 'rubrica_colocacao';
              sound.playScoreDing();
              renderModalRows();
            }
          } catch (e) {
            alert(e.message);
          }
        }
      });
    }

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        try {
          const scoringType = scoringTypeSelect ? scoringTypeSelect.value : 'rubrica_colocacao';
          const validCriteria = desktopTempCriteria.filter((c) => (c.name || '').trim().length > 0);

          state.updateProvaCriteria(judgeFormState.selectedProvaId, {
            criteria: validCriteria,
            type: scoringType
          });

          modal.classList.remove('active');
          sound.playScoreDing();

          updateDesktopActiveProvaHero();
          renderDesktopProvaTabs();
          renderDesktopTeamGrid();
          renderProvaControls();
          updateJudgeSummaryPreview();

          alert('Critérios da rubrica salvos com sucesso.');
        } catch (e) {
          alert('Erro ao salvar critérios: ' + e.message);
        }
      });
    }
  }

  function renderDesktopTeamGrid() {
    const teamGrid = document.getElementById('team-selector-grid');
    if (!teamGrid) return;

    const allTeams = state.getTeams();
    const provaId = judgeFormState.selectedProvaId;
    const isPesagem = provaId === 'prova_elixo_pesagem';
    const filter = window.desktopFilterState || { segment: 'all', status: 'all', search: '' };

    // Contadores de status
    let countPending = 0;
    let countScored = 0;

    allTeams.forEach((t) => {
      const sc = state.getTeamScore(t.id, provaId);
      if (sc) countScored++;
      else countPending++;
    });

    const cAll = document.getElementById('desktop-count-all');
    const cPend = document.getElementById('desktop-count-pending');
    const cScor = document.getElementById('desktop-count-scored');
    if (cAll) cAll.innerText = allTeams.length;
    if (cPend) cPend.innerText = countPending;
    if (cScor) cScor.innerText = countScored;

    // Filtra equipes
    const filtered = allTeams.filter((t) => {
      if (filter.segment !== 'all' && t.segmento !== filter.segment) return false;
      if (filter.search) {
        const q = filter.search;
        const match = (t.name || '').toLowerCase().includes(q) ||
                      (t.turma || '').toLowerCase().includes(q) ||
                      (t.shortName || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      const sc = state.getTeamScore(t.id, provaId);
      if (filter.status === 'pending' && sc !== null) return false;
      if (filter.status === 'scored' && sc === null) return false;
      return true;
    });

    const counter = document.getElementById('desktop-team-filtered-counter');
    if (counter) counter.innerText = `${filtered.length} de ${allTeams.length} turmas`;

    if (filtered.length > 0 && !filtered.some((t) => t.id === judgeFormState.selectedTeamId)) {
      judgeFormState.selectedTeamId = filtered[0].id;
    }

    if (filtered.length === 0) {
      teamGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 1.5rem; color: #94a3b8; font-size: 0.85rem; background: rgba(0,0,0,0.25); border-radius: 8px;">
          Nenhuma equipe encontrada com os filtros selecionados.
        </div>
      `;
      return;
    }

    teamGrid.innerHTML = filtered.map((t) => {
      const isSelected = t.id === judgeFormState.selectedTeamId;
      const score = state.getTeamScore(t.id, provaId);
      const isEvaluated = score !== null;

      let badge = '';
      if (isPesagem) {
        badge = t.pesoELixoKg > 0 
          ? `<span style="font-size: 0.7rem; color: #34d399; font-weight: 700;">${t.pesoELixoKg} kg</span>`
          : `<span style="font-size: 0.7rem; color: #94a3b8;">Sem pesagem</span>`;
      } else {
        const rubricPart = (isEvaluated && score.rubricScore !== undefined) ? ` (${score.rubricScore} pts rubrica)` : '';
        badge = isEvaluated
          ? `<span style="font-size: 0.7rem; color: #34d399; font-weight: 700;">${score.points} pts${rubricPart}</span>`
          : `<span style="font-size: 0.7rem; color: #fbbf24;">Pendente</span>`;
      }

      return `
        <div class="team-chip ${isSelected ? 'selected' : ''}" 
             data-team-id="${t.id}"
             style="--chip-color: ${t.color}; --chip-glow: ${t.color}44; display: flex; flex-direction: column; align-items: flex-start; padding: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem; width: 100%;">
            <div class="team-chip-icon" style="font-size: 0.85rem; font-weight: 800; background: ${t.color}22; color: ${t.color}; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid ${t.color}44;">${t.icon || t.turma}</div>
            <div class="team-chip-info" style="flex: 1; overflow: hidden;">
              <span class="team-chip-name" style="color: ${isSelected ? t.color : 'inherit'}; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${t.turma}
              </span>
              <span class="team-chip-class" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.name} (${t.shortName})</span>
            </div>
          </div>
          <div style="margin-top: 0.4rem; padding-top: 0.35rem; border-top: 1px solid rgba(255,255,255,0.08); width: 100%; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.7rem; color: #818cf8; font-weight: 600;">${t.segmento}</span>
            ${badge}
          </div>
        </div>
      `;
    }).join('');

    teamGrid.querySelectorAll('.team-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        judgeFormState.selectedTeamId = chip.dataset.teamId;
        sound.playClick();
        loadExistingScoreDesktop(judgeFormState.selectedTeamId);
        renderDesktopTeamGrid();
        renderProvaControls();
        updateJudgeSummaryPreview();
      });
    });
  }

  function loadExistingScoreDesktop(teamId) {
    const existing = state.getTeamScore(teamId, judgeFormState.selectedProvaId);
    if (existing && !existing.isWeight) {
      if (existing.criteriaDetails) {
        judgeFormState.criteriaValues = { ...existing.criteriaDetails };
      }
      if (existing.placeInProva) {
        judgeFormState.directPlace = existing.placeInProva;
      }
      const noteEl = document.getElementById('input-judge-note');
      if (noteEl && existing.note) {
        noteEl.value = existing.note;
      }
    }
  }



  // Envio da nota
  const submitScoreBtn = document.getElementById('btn-submit-judge-score');
  if (submitScoreBtn) {
    submitScoreBtn.addEventListener('click', () => {
      if (!judgeFormState.selectedTeamId) {
        alert('Por favor, selecione a equipe.');
        return;
      }
      if (!judgeFormState.selectedJudge) {
        alert('Por favor, selecione seu nome ou papel na comissão.');
        return;
      }

      const team = state.getTeam(judgeFormState.selectedTeamId);
      const isPesagem = judgeFormState.selectedProvaId === 'prova_elixo_pesagem';

      // Se for pesagem do E-Lixo
      if (isPesagem) {
        const peso = judgeFormState.pesoInput;
        if (confirm(`Confirmar registro de ${peso} kg de resíduos para a equipe ${team.name}?`)) {
          state.updateTeamELixoWeight(team.id, peso);
          sound.playScoreDing();
          showToast(`${peso} kg registrados para ${team.name}.`, 'toast-success');
          renderPlacar();
        }
        return;
      }

      const total = calculateScoreTotal();
      const prova = state.getProva(judgeFormState.selectedProvaId);

      const modal = document.getElementById('confirm-score-modal');
      const modalBody = document.getElementById('confirm-modal-body');
      if (modal && modalBody) {
        modalBody.innerHTML = `
          <div style="text-align: center; margin-bottom: 1.25rem;">
            <div style="font-size: 2.8rem;">${team.icon}</div>
            <h3 style="font-size: 1.4rem; color: ${team.color};">${team.name}</h3>
            <p style="color: #94a3b8; font-size: 0.9rem;">${prova.title}</p>
          </div>
          <div style="background: rgba(0,0,0,0.4); border-radius: 12px; padding: 1.25rem; text-align: center; margin-bottom: 1rem;">
            <div style="font-size: 2.8rem; font-family: 'Outfit'; font-weight: 900; color: #facc15;">
              ${total} <span style="font-size: 1rem; color: #94a3b8;">pontos na gincana</span>
            </div>
            ${prova.criteria && prova.criteria.length > 0 ? `
              <div style="font-size: 0.85rem; color: #a5b4fc; margin-top: 0.2rem;">
                Nota na Rubrica: ${calculateRubricTotal()} / 100 • Colocação: ${judgeFormState.directPlace}º lugar
              </div>
            ` : ''}
            <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.5rem;">Avaliador: <strong>${judgeFormState.selectedJudge}</strong></div>
          </div>
          <p style="font-size: 0.85rem; color: #cbd5e1; text-align: center;">
            Deseja homologar esta pontuação no placar oficial do SESI CONECTA?
          </p>
        `;
        const pinInput = document.getElementById('input-confirm-pin');
        const pinError = document.getElementById('pin-modal-error');
        if (pinInput) pinInput.value = '';
        if (pinError) pinError.innerText = '';

        modal.classList.add('active');
        if (pinInput) setTimeout(() => pinInput.focus(), 200);
      }
    });
  }

  const btnFinalConfirm = document.getElementById('btn-modal-confirm-score');
  if (btnFinalConfirm) {
    btnFinalConfirm.addEventListener('click', () => {
      try {
        const pinInput = document.getElementById('input-confirm-pin');
        const pinError = document.getElementById('pin-modal-error');
        const enteredPin = pinInput ? pinInput.value.trim() : '';

        const judge = state.getJudges().find((j) => j.name === judgeFormState.selectedJudge);
        if (judge) {
          const auth = state.authenticateJudge(judge.id, enteredPin);
          if (!auth.success) {
            if (pinError) pinError.innerText = 'PIN incorreto. Tente novamente (padrão: 1234).';
            sound.playBuzzer();
            if (pinInput) {
              pinInput.value = '';
              pinInput.focus();
            }
            return;
          }
        }

        const total = calculateScoreTotal();
        const rubricTotal = calculateRubricTotal();

        const result = state.addScore({
          teamId: judgeFormState.selectedTeamId,
          provaId: judgeFormState.selectedProvaId,
          judgeName: judgeFormState.selectedJudge,
          points: total,
          rubricScore: rubricTotal,
          placeInProva: judgeFormState.directPlace,
          criteriaDetails: judgeFormState.criteriaValues,
          note: document.getElementById('input-judge-note') ? document.getElementById('input-judge-note').value : ''
        });

        if (result.leaderChanged) {
          sound.playLeadChange();
          confetti.celebrate();
          showToast(`NOVA LIDERANÇA: ${result.newLeaderTeam.name} assumiu a ponta do placar!`, 'toast-lead');
        } else {
          sound.playScoreDing();
          showToast(`Pontuação de ${total} pts lançada com sucesso!`, 'toast-success');
        }

        const modal = document.getElementById('confirm-score-modal');
        if (modal) modal.classList.remove('active');
        if (pinInput) pinInput.value = '';
        if (pinError) pinError.innerText = '';

        renderPlacar();
      } catch (err) {
        alert('Erro ao registrar pontuação: ' + err.message);
      }
    });
  }

  // ==========================================
  // PLANILHA GERAL DE APURAÇÃO (ANEXO X)
  // ==========================================
  function renderPlanilhaGeral() {
    const container = document.getElementById('planilha-geral-table-container');
    if (!container) return;

    const teams = state.getTeams();
    const provas = state.getProvas();
    const rankings = state.getTeamRankings();

    container.innerHTML = `
      <div style="background: rgba(15,23,42,0.85); border: 1px solid var(--border-glass-bright); border-radius: 12px; padding: 1.5rem; overflow-x: auto;">
        <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h4 style="font-size: 1.25rem; font-weight: 800; color: #f8fafc;">Planilha Geral de Pontuação Oficial</h4>
            <span style="font-size: 0.85rem; color: #94a3b8;">
              Acompanhamento oficial de notas das 10 provas e apuração em tempo real.
            </span>
          </div>
          <button id="btn-export-anexo-x" class="btn btn-secondary btn-sm">Exportar Planilha (CSV)</button>
        </div>

        <table class="data-table" style="font-size: 0.82rem;">
          <thead>
            <tr>
              <th style="min-width: 220px;">Prova da Gincana</th>
              <th style="text-align: center;">Máx</th>
              ${teams.map((t) => `
                <th style="text-align: center; color: ${t.color}; min-width: 140px;">
                  ${t.icon} ${t.shortName}<br><small style="color: #94a3b8;">${t.turma}</small>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${provas.map((p) => `
              <tr>
                <td><strong>${p.title}</strong> <small style="color:#818cf8;">(${p.category || p.itemEdital})</small></td>
                <td style="text-align: center; color: #94a3b8;">${p.maxScore || 100}</td>
                ${teams.map((t) => {
                  const sc = state.getScores().find((s) => s.teamId === t.id && s.provaId === p.id);
                  const pts = sc ? sc.points : '-';
                  return `<td style="text-align: center; font-weight: 700;">${pts}</td>`;
                }).join('')}
              </tr>
            `).join('')}

            <!-- Subtotal Provas -->
            <tr style="background: rgba(99,102,241,0.15); font-weight: 800;">
              <td>Subtotal de Provas</td>
              <td style="text-align: center; color: #818cf8;">-</td>
              ${teams.map((t) => {
                const s = state.getTeamFullStats(t.id);
                return `<td style="text-align: center; color: #818cf8; font-size: 1rem;">${s.pontosDemaisProvas}</td>`;
              }).join('')}
            </tr>

            <!-- Penalidades -->
            <tr style="color: #f87171;">
              <td>Desconto de Penalidades</td>
              <td style="text-align: center;">-</td>
              ${teams.map((t) => {
                const s = state.getTeamFullStats(t.id);
                return `<td style="text-align: center; font-weight: 700;">-${s.totalPenalidades}</td>`;
              }).join('')}
            </tr>

            <!-- TOTAL FINAL -->
            <tr style="background: rgba(234,179,8,0.2); font-weight: 900; font-size: 1.15rem;">
              <td style="color: #fde047;">TOTAL FINAL OFICIAL</td>
              <td style="text-align: center; color: #fde047;">-</td>
              ${teams.map((t) => {
                const s = state.getTeamFullStats(t.id);
                return `<td style="text-align: center; color: #fde047; font-size: 1.25rem;">${s.totalFinal}</td>`;
              }).join('')}
            </tr>

            <!-- Classificação Atual -->
            <tr style="background: rgba(16,185,129,0.25); font-weight: 800;">
              <td style="color: #6ee7b7;">Classificação no Placar</td>
              <td style="text-align: center; color: #6ee7b7;">-</td>
              ${teams.map((t) => {
                const r = rankings.find((item) => item.id === t.id);
                return `<td style="text-align: center; color: #6ee7b7; font-size: 1.1rem;">${r ? r.rank + 'º Lugar' : '-'}</td>`;
              }).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;

    const btnExp = document.getElementById('btn-export-anexo-x');
    if (btnExp) {
      btnExp.addEventListener('click', () => {
        const csv = state.exportCSV();
        downloadFile(csv, 'planilha_geral_gincana.csv', 'text/csv;charset=utf-8;');
        showToast('Planilha da Gincana exportada!', 'toast-success');
      });
    }
  }

  // ==========================================
  // ABA DE PENALIDADES (ITEM 37)
  // ==========================================
  function renderPenalidades() {
    const container = document.getElementById('penalidades-container');
    if (!container) return;

    const penalties = state.getPenalties();
    const teams = state.getTeams();

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1.35fr; gap: 1.5rem;">
        
        <!-- Formulário Nova Penalidade -->
        <div style="background: rgba(15,23,42,0.85); border: 1px solid var(--border-glass); border-radius: 12px; padding: 1.5rem;">
          <h4 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 1rem; color: #f87171;">
            Registrar Infração (Item 37 do Edital)
          </h4>

          <div class="form-group">
            <label class="form-label">Equipe:</label>
            <select id="pen-team-select" class="form-select">
              ${teams.map((t) => `<option value="${t.id}">${t.icon} ${t.name} (${t.turma})</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Gravidade da Infração:</label>
            <select id="pen-category-select" class="form-select">
              <option value="Leve - 1ª (Advertência)">Leve: 1ª ocorrência (Advertência formal - 0 pts)</option>
              <option value="Leve - Reincidência (-25 pts)">Leve: Reincidência (Perda de 25 pontos)</option>
              <option value="Moderada - 1ª (-50 pts)">Moderada: 1ª ocorrência (Perda de 50 pontos)</option>
              <option value="Moderada - Reincidência (-100 pts)">Moderada: Reincidência (Perda de 100 pontos)</option>
              <option value="Grave - 1ª (-100 pts)">Grave: 1ª ocorrência (Perda de 100 pontos)</option>
              <option value="Grave - Reincidência (Desclassificação)">Grave: Reincidência (Desclassificação)</option>
              <option value="Gravíssima (Desclassificação)">Gravíssima (Desclassificação imediata)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Descrição da Ocorrência:</label>
            <textarea id="pen-desc-input" class="form-textarea" rows="2" placeholder="Ex: Uso antecipado coletivo da camiseta / provocação..."></textarea>
          </div>

          <button id="btn-save-penalty" class="btn btn-danger" style="width: 100%;">
            Aplicar Penalidade
          </button>
        </div>

        <!-- Lista de Penalidades Ativas -->
        <div style="background: rgba(15,23,42,0.85); border: 1px solid var(--border-glass); border-radius: 12px; padding: 1.5rem;">
          <h4 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 1rem;">
            Histórico de Infrações Registradas
          </h4>

          ${penalties.length === 0 ? `
            <div style="text-align: center; padding: 2rem; color: #94a3b8;">
              Nenhuma infração registrada. Espírito esportivo exemplar!
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${penalties.map((p) => {
                const t = state.getTeam(p.teamId);
                return `
                  <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <strong style="color: ${t ? t.color : '#ffffff'};">${t ? t.name : 'Equipe'}</strong> • 
                      <span style="color: #fca5a5; font-size: 0.85rem;">${p.category}</span>
                      <p style="font-size: 0.8rem; color: #cbd5e1; margin-top: 0.2rem;">${p.infraction || 'Sem descrição'}</p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                      <span style="color: #f87171; font-weight: 800; font-size: 1.1rem;">-${p.points} pts</span>
                      <button class="btn btn-sm btn-secondary btn-del-penalty" data-id="${p.id}" style="padding: 2px 6px;">✕</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

      </div>
    `;

    const btnSavePen = document.getElementById('btn-save-penalty');
    if (btnSavePen) {
      btnSavePen.addEventListener('click', () => {
        const teamId = document.getElementById('pen-team-select').value;
        const cat = document.getElementById('pen-category-select').value;
        const infraction = document.getElementById('pen-desc-input').value;

        let points = 0;
        if (cat.includes('25 pts')) points = 25;
        else if (cat.includes('50 pts')) points = 50;
        else if (cat.includes('100 pts')) points = 100;

        state.addPenalty({
          teamId,
          category: cat,
          infraction,
          points
        });

        sound.playBuzzer();
        showToast('Penalidade registrada.', 'toast-warning');
        renderPenalidades();
        renderPlacar();
      });
    }

    container.querySelectorAll('.btn-del-penalty').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.deletePenalty(btn.dataset.id);
        renderPenalidades();
        renderPlacar();
      });
    });
  }

  // ==========================================
  // GESTÃO DE PROVAS & EQUIPES
  // ==========================================
  function renderProvasManagement() {
    const provas = state.getProvas();
    const listEl = document.getElementById('provas-admin-list');
    if (!listEl) return;

    listEl.innerHTML = provas.map((p) => `
      <div class="team-row-card" style="grid-template-columns: 1fr auto; margin-bottom: 0.75rem;">
        <div>
          <div style="font-weight: 800; font-size: 1.1rem; margin-bottom: 0.2rem;">
            ${p.title} <span style="font-size: 0.8rem; color: #818cf8;">(${p.anexo || p.itemEdital})</span>
          </div>
          <div style="font-size: 0.85rem; color: #94a3b8;">
            Categoria: <span style="color: #818cf8;">${p.category}</span> • Pontuação Máxima: ${p.maxScore} pts
          </div>
          <p style="font-size: 0.82rem; color: #cbd5e1; margin-top: 0.4rem;">${p.description || 'Sem descrição'}</p>
        </div>
      </div>
    `).join('');
  }

  function renderTeamsManagement() {
    const teams = state.getTeams();
    const listEl = document.getElementById('teams-admin-list');
    if (!listEl) return;

    listEl.innerHTML = teams.map((t) => `
      <div class="team-row-card" style="grid-template-columns: 50px 1fr auto; --team-color: ${t.color}; margin-bottom: 0.75rem;">
        <div class="team-icon-circle" style="background: ${t.color}22; border: 1px solid ${t.color};">
          ${t.icon}
        </div>
        <div>
          <div style="font-weight: 800; font-size: 1.15rem; color: ${t.color};">${t.name} (${t.shortName})</div>
          <div style="font-size: 0.85rem; color: #94a3b8;">Turma: ${t.turma} • Tutor: ${t.tutor || '-'}</div>
          <div style="font-size: 0.78rem; color: #cbd5e1; margin-top: 2px;">Representantes: ${t.representatives || '-'} • Slogan: "${t.slogan || '-'}"</div>
        </div>
        <div style="text-align: right;">
          <span style="font-weight: 800; color: #34d399; font-size: 1.1rem;">${t.pesoELixoKg || 0} kg</span>
          <div style="font-size: 0.75rem; color: #94a3b8;">E-Lixo arrecadado</div>
        </div>
      </div>
    `).join('');
  }

  // ==========================================
  // UTILITÁRIOS
  // ==========================================
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

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  if (muteBtn) {
    muteBtn.innerHTML = sound.isMuted() ? '<span style="font-size:0.75rem; font-weight:700;">SOM: OFF</span>' : '<span style="font-size:0.75rem; font-weight:700;">SOM: ON</span>';
    muteBtn.addEventListener('click', () => {
      const isMuted = sound.toggleMute();
      muteBtn.innerHTML = isMuted ? '<span style="font-size:0.75rem; font-weight:700;">SOM: OFF</span>' : '<span style="font-size:0.75rem; font-weight:700;">SOM: ON</span>';
      showToast(isMuted ? 'Áudio desativado' : 'Áudio ativado', 'toast-info');
    });
  }

  // Fechar modais
  document.querySelectorAll('.modal-close-btn, .btn-modal-cancel').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.remove('active'));
    });
  });

  // Reatividade em tempo real
  state.subscribe(() => {
    renderPlacar();
    renderDesktopProvaTabs();
    renderDesktopTeamGrid();
    const activeTab = document.querySelector('.nav-tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'tab-planilha') renderPlanilhaGeral();
    if (activeTab && activeTab.dataset.tab === 'tab-penalidades') renderPenalidades();
    if (activeTab && activeTab.dataset.tab === 'tab-provas') renderProvasAdmin();
    if (activeTab && activeTab.dataset.tab === 'tab-equipes') renderTeamsAdmin();
  });

  // Render inicial
  renderPlacar();
  renderJudgeTab();
});

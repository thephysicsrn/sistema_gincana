/**
 * Gincana Master Pro - Lógica do Modo Telão (Projetor / TV)
 * SESI CONECTA 2026 - Padrão Institucional e Corporativo
 * Suporta Modo Standby (Apenas Logo SESI) e Cerimônia Oficial de Revelação com Animação e Som.
 */

document.addEventListener('DOMContentLoaded', () => {
  const state = window.gincanaState;
  const sound = window.gincanaSound;
  const confetti = window.gincanaConfetti;

  // Telas Principais
  const standbyScreen = document.getElementById('telao-standby-screen');
  const resultsScreen = document.getElementById('telao-results-screen');
  const revealOverlay = document.getElementById('telao-reveal-overlay');

  // Elementos do Standby
  const standbyEventTitle = document.getElementById('standby-event-title');
  const standbyEventSub = document.getElementById('standby-event-sub');
  const btnStandbySound = document.getElementById('btn-standby-sound');
  const btnStandbyFullscreen = document.getElementById('btn-standby-fullscreen');

  // Elementos do Overlay de Revelação
  const revealCountdown = document.getElementById('reveal-countdown-display');
  const revealStepText = document.getElementById('reveal-announcement-step');
  const revealMainTitle = document.getElementById('reveal-main-title');
  const revealSubtitle = document.getElementById('reveal-subtitle');

  // Elementos da Tela de Resultados
  const podiumEl = document.getElementById('telao-podium');
  const listEl = document.getElementById('telao-leaderboard-list');
  const bannerEl = document.getElementById('telao-announcement');
  const announcementBody = document.getElementById('announcement-body');
  const fullscreenBtn = document.getElementById('btn-telao-fullscreen');
  const soundBtn = document.getElementById('btn-telao-sound');
  const telaoEventTitle = document.getElementById('telao-event-title');
  const telaoEventSub = document.getElementById('telao-event-sub');

  // Elementos do Ranking Deslizante Contínuo
  const slidingViewport = document.getElementById('sliding-viewport');
  const slidingTrack = document.getElementById('sliding-track');
  const tickerLeaderContent = document.getElementById('ticker-leader-content');
  const btnToggleScroll = document.getElementById('btn-toggle-scroll');
  const slidingSpeedIndicator = document.getElementById('sliding-speed-indicator');

  let bannerTimeout = null;
  let isRevealing = false;

  // Estado da Rolagem Contínua
  let scrollPosition = 0;
  let scrollSpeed = 0.75; // Pixels por frame (fluido e contínuo)
  let isScrollPaused = false;
  let scrollAnimationId = null;
  let speedLevelIndex = 1;
  const speedLevels = [
    { label: 'Velocidade: Suave', speed: 0.4 },
    { label: 'Velocidade: Normal', speed: 0.75 },
    { label: 'Velocidade: Ágil', speed: 1.35 }
  ];

  // =========================================================================
  // 1. SINCRONIZAÇÃO DO MODO DO TELÃO (STANDBY vs RESULTADOS)
  // =========================================================================

  function syncTelaoMode(forcedMode = null) {
    const config = (state && typeof state.getConfig === 'function') ? state.getConfig() : ((state && state.data && state.data.config) || {});
    const mode = forcedMode || (state && typeof state.getTelaoMode === 'function' ? state.getTelaoMode() : 'standby');

    // Atualiza títulos institucionais
    if (standbyEventTitle) standbyEventTitle.innerText = config.eventName || 'SESI CONECTA 2026';
    if (standbyEventSub) standbyEventSub.innerText = config.editalTitle || 'Tecnologia que transforma, resíduo que ganha novo destino';
    if (telaoEventTitle) telaoEventTitle.innerText = config.eventName || 'SESI CONECTA 2026';
    if (telaoEventSub) telaoEventSub.innerText = `${config.editalTitle || 'Gincana Escolar'} • ${config.selectedUnit || 'SESI Escola'}`;

    if (mode === 'standby') {
      isRevealing = false;
      if (revealOverlay) revealOverlay.classList.add('hidden');
      if (bannerEl) bannerEl.classList.remove('show');
      if (standbyScreen) standbyScreen.classList.remove('hidden');
      if (resultsScreen) resultsScreen.style.display = 'none';
    } else if (mode === 'results') {
      if (!isRevealing) {
        if (revealOverlay) revealOverlay.classList.add('hidden');
        if (bannerEl) bannerEl.classList.remove('show');
        if (standbyScreen) standbyScreen.classList.add('hidden');
        if (resultsScreen) resultsScreen.style.display = 'block';
        renderTelao();
      }
    }
  }

  // =========================================================================
  // 2. CERIMÔNIA OFICIAL DE REVELAÇÃO DOS RESULTADOS (SHOW ANIMADO)
  // =========================================================================

  function runRevealAnimation() {
    if (isRevealing) return;
    isRevealing = true;

    // Watchdog de segurança para garantir que isRevealing nunca fique travado
    setTimeout(() => {
      if (isRevealing) {
        isRevealing = false;
        if (revealOverlay) revealOverlay.classList.add('hidden');
        if (resultsScreen) resultsScreen.style.display = 'block';
        renderTelao();
      }
    }, 14000);

    // Garante que o áudio está inicializado
    sound.init();

    // Exibe overlay da cerimônia
    if (revealOverlay) revealOverlay.classList.remove('hidden');
    if (standbyScreen) standbyScreen.classList.add('hidden');
    if (resultsScreen) resultsScreen.style.display = 'none';

    if (revealMainTitle) revealMainTitle.innerText = 'DIVULGAÇÃO DOS RESULTADOS OFICIAIS';
    if (revealSubtitle) revealSubtitle.innerText = 'A Coordenação Geral autorizou a liberação do placar da Gincana SESI CONECTA 2026.';
    if (revealStepText) revealStepText.innerText = 'Contagem Regressiva para os Resultados...';

    // Inicia rufar de tambores para suspense
    sound.playDrumRoll(3.5);

    // Contagem Regressiva: 3 -> 2 -> 1
    let count = 3;
    if (revealCountdown) revealCountdown.innerText = count;
    sound.playCountdownTick(false);

    const countInterval = setInterval(() => {
      count--;
      if (count > 0) {
        if (revealCountdown) revealCountdown.innerText = count;
        sound.playCountdownTick(false);
      } else {
        clearInterval(countInterval);
        sound.playCountdownTick(true);
        if (revealCountdown) revealCountdown.innerText = 'AO VIVO';
        if (revealStepText) revealStepText.innerText = 'Revelando Classificação Oficial!';

        setTimeout(() => {
          // Fecha o overlay de contagem e abre a tela de resultados no formato Ranking Deslizante Contínuo
          if (revealOverlay) revealOverlay.classList.add('hidden');
          if (resultsScreen) resultsScreen.style.display = 'block';

          // Renderiza a esteira contínua do ranking deslizante
          renderTelao();

          // Fanfarra e celebração da liderança
          sound.playFanfare();
          confetti.celebrate();
          setTimeout(() => confetti.celebrate(), 1500);
          setTimeout(() => confetti.celebrate(), 3000);

          const rankings = state.getTeamRankings();
          if (rankings.length > 0 && rankings[0].totalPoints > 0) {
            triggerVictoryAnnouncement(rankings[0]);
          }

          isRevealing = false;
        }, 800);
      }
    }, 1000);
  }

  function triggerVictoryAnnouncement(championTeam) {
    if (!bannerEl || !championTeam) return;
    const annTitle = document.getElementById('announcement-title');
    if (annTitle) annTitle.innerText = 'CAMPEÃ GERAL DA GINCANA SESI CONECTA 2026';
    if (announcementBody) {
      announcementBody.innerHTML = `
        <span style="color: ${championTeam.color}; font-size: 2.2rem; font-weight: 900;">${championTeam.name}</span>
        <span style="font-size: 1.4rem; color: #facc15; margin-left: 0.5rem;">(${championTeam.turma}) • ${championTeam.totalPoints.toLocaleString('pt-BR')} PONTOS!</span>
      `;
    }
    bannerEl.classList.add('show');
    setTimeout(() => bannerEl.classList.remove('show'), 12000);
  }

  // =========================================================================
  // 3. RENDERIZAÇÃO DO RANKING DESLIZANTE CONTÍNUO (LIVE BROADCAST)
  // =========================================================================

  function createSlidingTeamCardHtml(team, maxPoints) {
    const percent = Math.min(100, Math.max(12, Math.round((team.totalPoints / (maxPoints || 1)) * 100)));
    let rankBadgeClass = 'rank-other';
    let rankLabel = `#${team.rank}`;
    if (team.rank === 1) {
      rankBadgeClass = 'rank-top1';
      rankLabel = '#1';
    } else if (team.rank === 2) {
      rankBadgeClass = 'rank-top2';
      rankLabel = '#2';
    } else if (team.rank === 3) {
      rankBadgeClass = 'rank-top3';
      rankLabel = '#3';
    }

    const diffText = team.rank === 1 
      ? 'LÍDER DA GINCANA' 
      : `-${(maxPoints - team.totalPoints).toLocaleString('pt-BR')} PTS DA LIDERANÇA`;

    return `
      <div class="sliding-team-card" style="--team-color: ${team.color};">
        <div class="sliding-rank-badge ${rankBadgeClass}">
          ${rankLabel}
        </div>
        <div class="sliding-team-icon" style="border-color: ${team.color}; color: ${team.color}; background: ${team.color}18;">
          ${team.icon || team.name.substring(0, 2).toUpperCase()}
        </div>
        <div class="sliding-team-details">
          <div class="sliding-team-name-row">
            <span class="sliding-team-title" style="color: ${team.color};">${team.name}</span>
            <span class="sliding-turma-badge">${team.turma || team.className || ''}</span>
            <span class="sliding-segmento-text">${team.segmento || ''} • ${team.turno || ''}</span>
          </div>
          <div class="sliding-metrics-row">
            <span class="sliding-metric-pill">
              <strong style="color: #34d399;">Nota Escolar:</strong> ${team.notaEscolar || 0} pts
            </span>
            <span class="sliding-metric-pill">
              <strong style="color: #f59e0b;">E-Lixo:</strong> ${team.stats ? team.stats.pesoKg : 0} kg
            </span>
          </div>
        </div>
        <div class="sliding-progress-column">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${percent}%; background: ${team.color}; box-shadow: 0 0 10px ${team.color}88;"></div>
          </div>
          <div class="progress-label">
            <span style="color: ${team.rank === 1 ? '#facc15' : '#94a3b8'};">${diffText}</span>
            <span>${percent}%</span>
          </div>
        </div>
        <div class="sliding-score-column">
          <div class="sliding-score-number">${team.totalPoints.toLocaleString('pt-BR')}</div>
          <div class="sliding-score-unit">PONTOS</div>
        </div>
      </div>
    `;
  }

  function startContinuousSliding() {
    if (scrollAnimationId) cancelAnimationFrame(scrollAnimationId);

    function step() {
      if (!isScrollPaused && slidingTrack && slidingViewport) {
        scrollPosition += scrollSpeed;
        const totalHeight = slidingTrack.scrollHeight;
        const halfHeight = totalHeight / 2;

        if (halfHeight > 0 && scrollPosition >= halfHeight) {
          scrollPosition = 0; // Loop contínuo perfeito sem saltos
        }
        slidingTrack.style.transform = `translateY(-${scrollPosition}px)`;
      }
      scrollAnimationId = requestAnimationFrame(step);
    }

    scrollAnimationId = requestAnimationFrame(step);
  }

  function renderTelao(withSuspense = false) {
    const rankings = state.getTeamRankings();
    if (rankings.length === 0) return;

    const leader = rankings[0];
    const maxPoints = leader.totalPoints || 1;

    // 1. Atualiza a barra de destaque no topo (Líder da Classificação)
    if (tickerLeaderContent && leader) {
      tickerLeaderContent.innerHTML = `
        <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${leader.color}; box-shadow:0 0 10px ${leader.color};"></span>
        <span style="color:${leader.color}; font-size:1.25rem;">${leader.name}</span>
        <span style="color:#94a3b8; font-size:0.95rem; font-weight:600;">(${leader.turma})</span>
        <span style="color:#facc15; font-size:1.25rem; font-weight:900; margin-left:0.5rem;">${leader.totalPoints.toLocaleString('pt-BR')} PONTOS</span>
      `;
    }

    // 2. Renderiza a esteira contínua do ranking deslizante
    if (slidingTrack) {
      const cardsHtml = rankings.map(team => createSlidingTeamCardHtml(team, maxPoints)).join('');
      // Duplica os cards para loop contínuo infinito e suave
      slidingTrack.innerHTML = cardsHtml + cardsHtml;

      if (!scrollAnimationId) {
        startContinuousSliding();
      }
    }
  }

  // Controles de Interação da Rolagem
  if (btnToggleScroll) {
    btnToggleScroll.addEventListener('click', () => {
      isScrollPaused = !isScrollPaused;
      btnToggleScroll.innerText = isScrollPaused ? 'Rolagem: PAUSADA' : 'Rolagem: ON';
      btnToggleScroll.style.background = isScrollPaused ? 'rgba(239, 68, 68, 0.25)' : '';
      btnToggleScroll.style.borderColor = isScrollPaused ? '#ef4444' : '';
      sound.playClick();
    });
  }

  if (slidingSpeedIndicator) {
    slidingSpeedIndicator.style.cursor = 'pointer';
    slidingSpeedIndicator.title = 'Clique para alterar a velocidade de rolagem';
    slidingSpeedIndicator.addEventListener('click', () => {
      speedLevelIndex = (speedLevelIndex + 1) % speedLevels.length;
      scrollSpeed = speedLevels[speedLevelIndex].speed;
      slidingSpeedIndicator.innerText = speedLevels[speedLevelIndex].label;
      sound.playClick();
    });
  }

  if (slidingViewport) {
    slidingViewport.addEventListener('mouseenter', () => {
      isScrollPaused = true;
    });
    slidingViewport.addEventListener('mouseleave', () => {
      if (btnToggleScroll && btnToggleScroll.innerText.includes('PAUSADA')) return;
      isScrollPaused = false;
    });
    slidingViewport.addEventListener('touchstart', () => {
      isScrollPaused = true;
    }, { passive: true });
    slidingViewport.addEventListener('touchend', () => {
      if (btnToggleScroll && btnToggleScroll.innerText.includes('PAUSADA')) return;
      isScrollPaused = false;
    }, { passive: true });
  }

  // Notificação de Nova Pontuação (quando o modo for 'results')
  function triggerScoreAnnouncement(scoreData, leaderChanged, newLeaderTeam) {
    if (!bannerEl || !scoreData || state.getTelaoMode() !== 'results' || isRevealing) return;

    const team = state.getTeam(scoreData.teamId);
    const prova = state.getProva(scoreData.provaId);
    const annTitle = document.getElementById('announcement-title');

    if (leaderChanged && newLeaderTeam) {
      if (annTitle) annTitle.innerText = 'NOVA LIDERANÇA NO PLACAR GERAL';
      announcementBody.innerHTML = `
        <span style="color:#fde047;">${newLeaderTeam.name}</span> assume o 1º Lugar da Gincana!
      `;
      sound.playLeadChange();
      confetti.celebrate();
    } else {
      if (annTitle) annTitle.innerText = 'NOVA PONTUAÇÃO REGISTRADA';
      announcementBody.innerHTML = `
        <strong style="color:${team ? team.color : '#ffffff'}">${team ? team.name : 'Equipe'}</strong>: 
        +${scoreData.points} pts na prova <em>${prova ? prova.title : 'Gincana'}</em>
      `;
      sound.playScoreDing();
    }

    bannerEl.classList.add('show');
    if (bannerTimeout) clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => {
      bannerEl.classList.remove('show');
    }, 5500);
  }

  // =========================================================================
  // 4. ESCUTA DE EVENTOS EM TEMPO REAL (GESTOR E JUÍZES)
  // =========================================================================

  let lastKnownTelaoMode = state.getTelaoMode();

  state.subscribe((data, meta) => {
    // Normaliza os parâmetros para aceitar tanto (data, meta) quanto (meta)
    const eventInfo = (meta && typeof meta === 'object') ? meta : (data && data.source ? data : {});
    const source = eventInfo.source;

    // 1. Comando explícito para disparar a cerimônia animada de revelação
    if (source === 'telao_trigger_reveal') {
      lastKnownTelaoMode = 'results';
      runRevealAnimation();
      return;
    }

    // 2. Mudança explícita de modo do telão (standby vs results)
    if (source === 'telao_mode_change') {
      const targetMode = eventInfo.mode || state.getTelaoMode();
      lastKnownTelaoMode = targetMode;
      isRevealing = false;
      syncTelaoMode(targetMode);
      return;
    }

    // 3. Sincronização vinda do servidor ou socket ou storage
    const currentMode = state.getTelaoMode();
    if (currentMode !== lastKnownTelaoMode) {
      lastKnownTelaoMode = currentMode;
      syncTelaoMode();
    } else {
      syncTelaoMode();
    }

    // Se estiver em modo results e receber novos dados ou notas
    if (state.getTelaoMode() === 'results' && !isRevealing) {
      renderTelao();
      if (eventInfo && eventInfo.payload) {
        if (eventInfo.payload.action === 'ADD_SCORE' && eventInfo.payload.score) {
          triggerScoreAnnouncement(
            eventInfo.payload.score,
            eventInfo.payload.leaderChanged,
            eventInfo.payload.newLeaderTeam
          );
        }
      }
    }
  });

  // =========================================================================
  // 5. CONTROLES DE TELA CHEIA E SOM
  // =========================================================================

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Erro ao ativar tela cheia:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
  if (btnStandbyFullscreen) btnStandbyFullscreen.addEventListener('click', toggleFullscreen);

  function updateSoundButtons() {
    const label = sound.isMuted() ? 'SOM: OFF' : 'SOM: ON';
    if (soundBtn) soundBtn.innerText = label;
    if (btnStandbySound) btnStandbySound.innerText = label;
  }

  function handleSoundToggle() {
    sound.toggleMute();
    updateSoundButtons();
  }

  if (soundBtn) soundBtn.addEventListener('click', handleSoundToggle);
  if (btnStandbySound) btnStandbySound.addEventListener('click', handleSoundToggle);

  updateSoundButtons();

  // =========================================================================
  // 6. CICLO PERIÓDICO DE ATUALIZAÇÃO (COMANDOS & SINCRONISMO)
  // =========================================================================

  async function autoSyncTelao() {
    try {
      // 1. Recarrega dados mais recentes do armazenamento local
      state.loadFromStorage(false);

      // 2. Consulta o servidor central via HTTP para obter o estado mais recente
      // (garante sincronização mesmo entre diferentes navegadores/dispositivos em rede)
      if (typeof state.syncWithServer === 'function') {
        await state.syncWithServer();
      }

      // 3. Solicita sincronização ativa ao servidor WebSocket se conectado
      state.requestServerSync();

      const currentMode = state.getTelaoMode();
      if (currentMode !== lastKnownTelaoMode) {
        lastKnownTelaoMode = currentMode;
        syncTelaoMode();
      }

      // 4. Sincroniza o modo de exibição (Standby vs Resultados)
      syncTelaoMode();

      // 5. Se estiver em exibição de resultados e sem revelação em andamento, atualiza pontuações
      if (state.getTelaoMode() === 'results' && !isRevealing) {
        renderTelao();
      }
    } catch (err) {
      console.warn('[Telão SESI] Erro no ciclo de autoSync:', err);
    }
  }

  // Agenda sincronização contínua a cada 10 segundos para resposta ágil e infalível
  const TELAO_SYNC_INTERVAL_MS = 10000;
  setInterval(autoSyncTelao, TELAO_SYNC_INTERVAL_MS);

  // Inicialização imediata
  autoSyncTelao();
});

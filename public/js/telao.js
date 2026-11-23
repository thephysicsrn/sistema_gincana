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

  // Elementos do Overlay da Cerimônia Solene do Pódio (Lenta: 3º -> 2º -> 1º)
  const podiumOverlay = document.getElementById('telao-podium-overlay');
  const podiumStage = document.getElementById('podium-stage-container');
  const btnPodiumClose = document.getElementById('btn-podium-overlay-close');
  const podiumCeremonyTag = document.getElementById('podium-ceremony-tag');
  const podiumCeremonyTitle = document.getElementById('podium-ceremony-title');
  const podiumCeremonySub = document.getElementById('podium-ceremony-subtitle');
  let podiumTimers = [];

  if (btnPodiumClose) {
    btnPodiumClose.addEventListener('click', () => {
      stopPodiumCeremonyAnimation();
    });
  }

  function stopPodiumCeremonyAnimation() {
    podiumTimers.forEach(t => clearTimeout(t));
    podiumTimers = [];
    if (podiumOverlay) podiumOverlay.classList.add('hidden');
    if (resultsScreen) resultsScreen.style.display = 'block';
    isRevealing = false;
    renderTelao();
  }

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
  const btnTelaoForceRefresh = document.getElementById('btn-telao-force-refresh');
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
  // 1. SINCRONIZAÇÃO DO MODO DO TELÃO (STANDBY vs RESULTADOS) & TURNO
  // =========================================================================

  function updateTelaoTurnoButtons(currentTurno) {
    const btnMat = document.getElementById('btn-telao-turno-matutino');
    const btnVesp = document.getElementById('btn-telao-turno-vespertino');
    if (!btnMat || !btnVesp) return;

    if (currentTurno === 'Matutino') {
      btnMat.classList.add('active');
      btnMat.style.background = 'linear-gradient(135deg, #2563eb, #7c3aed)';
      btnMat.style.color = '#ffffff';
      btnMat.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.5)';
      btnVesp.classList.remove('active');
      btnVesp.style.background = 'transparent';
      btnVesp.style.color = '#94a3b8';
      btnVesp.style.boxShadow = 'none';
    } else {
      btnVesp.classList.add('active');
      btnVesp.style.background = 'linear-gradient(135deg, #2563eb, #7c3aed)';
      btnVesp.style.color = '#ffffff';
      btnVesp.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.5)';
      btnMat.classList.remove('active');
      btnMat.style.background = 'transparent';
      btnMat.style.color = '#94a3b8';
      btnMat.style.boxShadow = 'none';
    }
  }

  function setupTelaoTurnoControls() {
    const btnMat = document.getElementById('btn-telao-turno-matutino');
    const btnVesp = document.getElementById('btn-telao-turno-vespertino');
    if (btnMat && !btnMat.dataset.bound) {
      btnMat.dataset.bound = 'true';
      btnMat.addEventListener('click', () => {
        state.setTelaoTurno('Matutino');
        updateTelaoTurnoButtons('Matutino');
        sound.playClick();
        scrollPosition = 0;
        syncTelaoMode();
        renderTelao();
      });
    }
    if (btnVesp && !btnVesp.dataset.bound) {
      btnVesp.dataset.bound = 'true';
      btnVesp.addEventListener('click', () => {
        state.setTelaoTurno('Vespertino');
        updateTelaoTurnoButtons('Vespertino');
        sound.playClick();
        scrollPosition = 0;
        syncTelaoMode();
        renderTelao();
      });
    }
  }

  function syncTelaoMode(forcedMode = null) {
    const config = (state && typeof state.getConfig === 'function') ? state.getConfig() : ((state && state.data && state.data.config) || {});
    const mode = forcedMode || (state && typeof state.getTelaoMode === 'function' ? state.getTelaoMode() : 'standby');
    const currentTurno = (state && typeof state.getTelaoTurno === 'function') ? state.getTelaoTurno() : 'Matutino';

    setupTelaoTurnoControls();
    updateTelaoTurnoButtons(currentTurno);

    // Atualiza títulos institucionais
    if (standbyEventTitle) standbyEventTitle.innerText = 'Gincana SESI ESCOLA 2026';
    if (standbyEventSub) standbyEventSub.innerText = `${config.editalTitle || 'Tecnologia que transforma, resíduo que ganha novo destino'} • Gincana ${currentTurno}`;
    if (telaoEventTitle) telaoEventTitle.innerText = 'Gincana SESI ESCOLA 2026';
    if (telaoEventSub) {
      telaoEventSub.style.display = 'none';
      telaoEventSub.innerText = '';
    }

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

          const currentTurno = (state && typeof state.getTelaoTurno === 'function') ? state.getTelaoTurno() : 'Matutino';
          const rankings = state.getTeamRankings(currentTurno);
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
  // 2.1 CERIMÔNIA SOLENE DO PÓDIO (REVELAÇÃO LENTA: 3º ➔ 2º ➔ 1º LUGAR)
  // =========================================================================

  function runPodiumCeremonyAnimation(customTurno = null) {
    if (isRevealing) {
      stopPodiumCeremonyAnimation();
    }
    isRevealing = true;

    // Garante que o áudio está inicializado
    sound.init();

    // Determina o turno da cerimônia
    const currentTurno = customTurno || ((state && typeof state.getTelaoTurno === 'function') ? state.getTelaoTurno() : 'Matutino');
    updateTelaoTurnoButtons(currentTurno);

    // Esconde standby e overlay rápido caso estejam abertos
    if (standbyScreen) standbyScreen.classList.add('hidden');
    if (revealOverlay) revealOverlay.classList.add('hidden');
    if (resultsScreen) resultsScreen.style.display = 'none';

    // Exibe overlay solene do pódio
    if (podiumOverlay) podiumOverlay.classList.remove('hidden');

    // Recupera ranking ordenado das turmas
    const rankings = state.getTeamRankings(currentTurno);
    if (!rankings || rankings.length === 0) {
      setTimeout(() => stopPodiumCeremonyAnimation(), 3000);
      return;
    }

    const team1 = rankings[0] || null;
    const team2 = rankings.length >= 2 ? rankings[1] : null;
    const team3 = rankings.length >= 3 ? rankings[2] : (rankings.length >= 2 ? rankings[1] : rankings[0]);

    // Reseta timers anteriores
    podiumTimers.forEach(t => clearTimeout(t));
    podiumTimers = [];

    // Watchdog de segurança para garantir que a tela nunca trave
    podiumTimers.push(setTimeout(() => {
      stopPodiumCeremonyAnimation();
    }, 55000));

    // =========================================================================
    // FASE 0: Abertura Solene com Rufar de Tambores (0s a 4.5s)
    // =========================================================================
    if (podiumCeremonyTag) podiumCeremonyTag.innerText = `🏆 CERIMÔNIA OFICIAL DO PÓDIO • TURNO ${currentTurno.toUpperCase()}`;
    if (podiumCeremonyTitle) podiumCeremonyTitle.innerText = `OS GRANDES VENCEDORES DO SESI CONECTA 2026`;
    if (podiumCeremonySub) podiumCeremonySub.innerText = `A Coordenação Geral convida todos para a consagração dos 3 primeiros colocados!`;

    if (podiumStage) {
      podiumStage.innerHTML = `
        <div style="animation: suspensePulseGlow 1.8s infinite ease-in-out; text-align: center; max-width: 800px;">
          <div style="font-size: 5rem; margin-bottom: 0.5rem; filter: drop-shadow(0 0 25px rgba(245, 158, 11, 0.6));">👑</div>
          <div style="font-size: 2.3rem; font-weight: 900; color: #ffffff; text-shadow: 0 0 30px rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 2px;">
            A Tensão Toma Conta da Quadra...
          </div>
          <div style="font-size: 1.35rem; color: #fbbf24; font-weight: 700; margin-top: 0.75rem;">
            Rufem os tambores! Revelando a classificação sagrada do pódio...
          </div>
        </div>
      `;
    }

    sound.playDrumRoll(4.2);

    // =========================================================================
    // FASE 1: Revelação do 3º Colocado (Bronze) (4.5s a 12.0s)
    // =========================================================================
    podiumTimers.push(setTimeout(() => {
      if (!isRevealing) return;
      if (podiumCeremonyTag) podiumCeremonyTag.innerText = `🥉 3º LUGAR • MEDALHA DE BRONZE`;
      if (podiumCeremonyTitle) podiumCeremonyTitle.innerText = team3 ? team3.name : '3º Colocado';
      if (podiumCeremonySub) podiumCeremonySub.innerText = `Parabéns pela garra, união e dedicação extraordinária durante toda a gincana!`;

      sound.playScoreDing();
      confetti.celebrate();

      if (podiumStage && team3) {
        podiumStage.innerHTML = `
          <div class="podium-spotlight-card podium-card-bronze">
            <div class="podium-rank-pill pill-bronze">
              <span>🥉</span> 3º LUGAR • MEDALHA DE BRONZE
            </div>
            <div style="font-size: 3.4rem; font-weight: 900; color: #ffffff; line-height: 1.15; margin-bottom: 0.4rem; text-shadow: 0 0 30px rgba(205, 127, 50, 0.75);">
              ${team3.name}
            </div>
            <div style="font-size: 1.65rem; font-weight: 800; color: #fdba74; margin-bottom: 1.4rem;">
              Turma: ${team3.turma} • ${team3.className || team3.segmento || ''}
            </div>
            <div style="display: inline-flex; align-items: baseline; gap: 0.6rem; background: rgba(0,0,0,0.5); border: 2px solid rgba(205, 127, 50, 0.65); padding: 0.85rem 2.25rem; border-radius: 22px;">
              <span style="font-size: 3.2rem; font-weight: 900; color: #fbbf24; font-family: 'Outfit', sans-serif;">
                ${(team3.totalPoints || 0).toLocaleString('pt-BR')}
              </span>
              <span style="font-size: 1.25rem; font-weight: 900; color: #fed7aa; text-transform: uppercase;">Pontos Oficiais</span>
            </div>
            <div style="margin-top: 1.4rem; font-size: 1.2rem; color: #e2e8f0; font-weight: 700;">
              👏 Uma gigantesca salva de palmas para o 3º Lugar!
            </div>
          </div>
        `;
      }
    }, 4500));

    // =========================================================================
    // FASE 2: Revelação do 2º Colocado (Prata / Vice-Campeã) (12.0s a 19.5s)
    // =========================================================================
    podiumTimers.push(setTimeout(() => {
      if (!isRevealing) return;
      if (podiumCeremonyTag) podiumCeremonyTag.innerText = `🥈 2º LUGAR • VICE-CAMPEÃ GERAL`;
      if (podiumCeremonyTitle) podiumCeremonyTitle.innerText = team2 ? team2.name : '2º Colocado';
      if (podiumCeremonySub) podiumCeremonySub.innerText = `Uma jornada brilhante de superação e destaque absoluto em quadra!`;

      sound.playDrumRoll(2.5);
      setTimeout(() => {
        sound.playScoreDing();
        confetti.celebrate();
      }, 500);

      if (podiumStage && team2) {
        podiumStage.innerHTML = `
          <div class="podium-spotlight-card podium-card-silver">
            <div class="podium-rank-pill pill-silver">
              <span>🥈</span> 2º LUGAR • MEDALHA DE PRATA / VICE-CAMPEÃ
            </div>
            <div style="font-size: 3.4rem; font-weight: 900; color: #ffffff; line-height: 1.15; margin-bottom: 0.4rem; text-shadow: 0 0 30px rgba(226, 232, 240, 0.7);">
              ${team2.name}
            </div>
            <div style="font-size: 1.65rem; font-weight: 800; color: #cbd5e1; margin-bottom: 1.4rem;">
              Turma: ${team2.turma} • ${team2.className || team2.segmento || ''}
            </div>
            <div style="display: inline-flex; align-items: baseline; gap: 0.6rem; background: rgba(0,0,0,0.5); border: 2px solid rgba(226, 232, 240, 0.65); padding: 0.85rem 2.25rem; border-radius: 22px;">
              <span style="font-size: 3.2rem; font-weight: 900; color: #f1f5f9; font-family: 'Outfit', sans-serif;">
                ${(team2.totalPoints || 0).toLocaleString('pt-BR')}
              </span>
              <span style="font-size: 1.25rem; font-weight: 900; color: #e2e8f0; text-transform: uppercase;">Pontos Oficiais</span>
            </div>
            <div style="margin-top: 1.4rem; font-size: 1.2rem; color: #f8fafc; font-weight: 700;">
              🥈 Parabéns à Vice-Campeã pela brilhante conquista!
            </div>
          </div>
        `;
      }
    }, 12000));

    // =========================================================================
    // FASE 3: Suspense Eletrizante para o 1º Lugar (19.5s a 25.0s)
    // =========================================================================
    podiumTimers.push(setTimeout(() => {
      if (!isRevealing) return;
      if (podiumCeremonyTag) podiumCeremonyTag.innerText = `👑 QUEM É A GRANDE CAMPEÃ?`;
      if (podiumCeremonyTitle) podiumCeremonyTitle.innerText = `O LUGAR MAIS ALTO DO PÓDIO!`;
      if (podiumCeremonySub) podiumCeremonySub.innerText = `Atenção absoluta na quadra para o anúncio da equipe Campeã Geral!`;

      sound.playDrumRoll(5.0);

      if (podiumStage) {
        podiumStage.innerHTML = `
          <div style="animation: suspensePulseGlow 1.2s infinite ease-in-out; text-align: center; max-width: 850px;">
            <div style="font-size: 6.5rem; margin-bottom: 0.5rem; filter: drop-shadow(0 0 35px #f59e0b);">👑</div>
            <div style="font-size: 3.2rem; font-weight: 900; color: #fef08a; text-shadow: 0 0 45px rgba(245, 158, 11, 0.9); text-transform: uppercase; letter-spacing: 3px;">
              E A GRANDE CAMPEÃ É...
            </div>
            <div style="font-size: 1.6rem; color: #fde68a; font-weight: 800; margin-top: 1.2rem; letter-spacing: 2px;">
              RUFEM TODOS OS TAMBORES!
            </div>
          </div>
        `;
      }
    }, 19500));

    // =========================================================================
    // FASE 4: Revelação Apoteótica do 1º Lugar (Ouro / Campeã) (25.0s a 34.0s)
    // =========================================================================
    podiumTimers.push(setTimeout(() => {
      if (!isRevealing) return;
      if (podiumCeremonyTag) podiumCeremonyTag.innerText = `🥇 1º LUGAR • GRANDE CAMPEÃ GERAL SESI CONECTA`;
      if (podiumCeremonyTitle) podiumCeremonyTitle.innerText = team1 ? team1.name : '1º Colocado';
      if (podiumCeremonySub) podiumCeremonySub.innerText = `A grande vencedora que levou a honra máxima da Gincana SESI CONECTA 2026!`;

      sound.playFanfare();
      confetti.celebrate();
      setTimeout(() => confetti.celebrate(), 1500);
      setTimeout(() => confetti.celebrate(), 3000);
      setTimeout(() => confetti.celebrate(), 4500);

      if (podiumStage && team1) {
        podiumStage.innerHTML = `
          <div class="podium-spotlight-card podium-card-gold" style="padding: 2.75rem 3.5rem;">
            <div class="podium-rank-pill pill-gold">
              <span>👑</span> 1º LUGAR • GRANDE CAMPEÃ GERAL SESI 2026
            </div>
            <div style="font-size: 3.8rem; font-weight: 900; color: #ffffff; line-height: 1.1; margin-bottom: 0.5rem; text-shadow: 0 0 40px rgba(245, 158, 11, 0.95);">
              ${team1.name}
            </div>
            <div style="font-size: 1.9rem; font-weight: 900; color: #fde047; margin-bottom: 1.5rem;">
              Turma: ${team1.turma} • ${team1.className || team1.segmento || ''}
            </div>
            <div style="display: inline-flex; align-items: baseline; gap: 0.6rem; background: rgba(0,0,0,0.55); border: 2px solid rgba(245, 158, 11, 0.85); padding: 0.9rem 2.6rem; border-radius: 24px; box-shadow: 0 0 35px rgba(245, 158, 11, 0.45);">
              <span style="font-size: 3.6rem; font-weight: 900; color: #facc15; font-family: 'Outfit', sans-serif;">
                ${(team1.totalPoints || 0).toLocaleString('pt-BR')}
              </span>
              <span style="font-size: 1.4rem; font-weight: 900; color: #fef08a; text-transform: uppercase;">PONTOS CAMPEÃ!</span>
            </div>
            <div style="margin-top: 1.5rem; font-size: 1.35rem; color: #ffffff; font-weight: 900; text-shadow: 0 0 20px rgba(255,255,255,0.6);">
              🏆 GLÓRIA E HONRA MÁXIMA NA GINCANA SESI CONECTA 2026! 🏆
            </div>
          </div>
        `;
      }
    }, 25000));

    // =========================================================================
    // FASE 5: Pódio Olímpico Completo (Todos os 3 Degraus) (34.0s a 48.0s)
    // =========================================================================
    podiumTimers.push(setTimeout(() => {
      if (!isRevealing) return;
      if (podiumCeremonyTag) podiumCeremonyTag.innerText = `🏆 PÓDIO CONSAGRADO • GINCANA SESI CONECTA 2026`;
      if (podiumCeremonyTitle) podiumCeremonyTitle.innerText = `O PÓDIO OFICIAL DA GINCANA (${currentTurno.toUpperCase()})`;
      if (podiumCeremonySub) podiumCeremonySub.innerText = `As três melhores turmas lado a lado na história do SESI CONECTA!`;

      confetti.celebrate();

      if (podiumStage && team1 && team2 && team3) {
        podiumStage.innerHTML = `
          <div class="olympic-podium-grid">
            
            <!-- 2º LUGAR (ESQUERDA) -->
            <div class="olympic-column">
              <div style="margin-bottom: 0.75rem;">
                <span style="font-size: 2.2rem;">🥈</span>
                <div style="font-size: 1.35rem; font-weight: 900; color: #f1f5f9; text-shadow: 0 0 15px rgba(226,232,240,0.5);">${team2.name}</div>
                <div style="font-size: 0.95rem; font-weight: 700; color: #cbd5e1;">${team2.turma}</div>
              </div>
              <div class="olympic-pedestal pedestal-2">
                <div style="font-size: 1.4rem; font-weight: 900; color: #f1f5f9;">2º LUGAR</div>
                <div style="font-size: 0.85rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Vice-Campeã</div>
                <div style="font-size: 1.9rem; font-weight: 900; color: #f8fafc; margin-top: 0.75rem; font-family: 'Outfit', sans-serif;">
                  ${(team2.totalPoints || 0).toLocaleString('pt-BR')} <span style="font-size: 0.9rem;">pts</span>
                </div>
              </div>
            </div>

            <!-- 1º LUGAR (CENTRO - MAIS ALTO) -->
            <div class="olympic-column" style="transform: scale(1.05);">
              <div style="margin-bottom: 0.75rem;">
                <span style="font-size: 3.2rem; filter: drop-shadow(0 0 20px #f59e0b);">👑</span>
                <div style="font-size: 1.6rem; font-weight: 900; color: #fef08a; text-shadow: 0 0 20px rgba(245,158,11,0.8);">${team1.name}</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #fde68a;">${team1.turma}</div>
              </div>
              <div class="olympic-pedestal pedestal-1">
                <div style="font-size: 1.8rem; font-weight: 900; color: #facc15;">🥇 1º LUGAR</div>
                <div style="font-size: 0.95rem; font-weight: 900; color: #fef08a; text-transform: uppercase; letter-spacing: 1px;">GRANDE CAMPEÃ</div>
                <div style="font-size: 2.3rem; font-weight: 900; color: #ffffff; margin-top: 0.75rem; font-family: 'Outfit', sans-serif;">
                  ${(team1.totalPoints || 0).toLocaleString('pt-BR')} <span style="font-size: 1.1rem;">pts</span>
                </div>
                <div style="margin-top: 0.5rem; font-size: 0.85rem; font-weight: 800; color: #fde047; background: rgba(0,0,0,0.35); padding: 0.25rem 0.75rem; border-radius: 99px;">
                  CAMPEÃ GERAL
                </div>
              </div>
            </div>

            <!-- 3º LUGAR (DIREITA) -->
            <div class="olympic-column">
              <div style="margin-bottom: 0.75rem;">
                <span style="font-size: 2.2rem;">🥉</span>
                <div style="font-size: 1.35rem; font-weight: 900; color: #fdba74; text-shadow: 0 0 15px rgba(205,127,50,0.5);">${team3.name}</div>
                <div style="font-size: 0.95rem; font-weight: 700; color: #fdba74;">${team3.turma}</div>
              </div>
              <div class="olympic-pedestal pedestal-3">
                <div style="font-size: 1.4rem; font-weight: 900; color: #fdba74;">3º LUGAR</div>
                <div style="font-size: 0.85rem; font-weight: 800; color: #fdba74; text-transform: uppercase;">Bronze</div>
                <div style="font-size: 1.9rem; font-weight: 900; color: #f8fafc; margin-top: 0.75rem; font-family: 'Outfit', sans-serif;">
                  ${(team3.totalPoints || 0).toLocaleString('pt-BR')} <span style="font-size: 0.9rem;">pts</span>
                </div>
              </div>
            </div>

          </div>
        `;
      }
    }, 34000));

    // =========================================================================
    // FASE FINAL: Transição Suave para o Placar Geral Deslizante (48.0s)
    // =========================================================================
    podiumTimers.push(setTimeout(() => {
      stopPodiumCeremonyAnimation();
    }, 48000));
  }

  // =========================================================================
  // 3. RENDERIZAÇÃO DO RANKING DESLIZANTE CONTÍNUO (LIVE BROADCAST)
  // =========================================================================

  function createSlidingTeamCardHtml(team, maxPoints) {
    const hasPoints = maxPoints > 0 && team.totalPoints > 0;
    const percent = hasPoints ? Math.min(100, Math.max(8, Math.round((team.totalPoints / maxPoints) * 100))) : 0;
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

    let diffText = '';
    if (maxPoints === 0 && team.totalPoints === 0) {
      diffText = 'AGUARDANDO NOTAS';
    } else if (team.rank === 1 || team.totalPoints === maxPoints) {
      diffText = team.rank === 1 ? 'LÍDER DA GINCANA' : 'EMPATADA NA LIDERANÇA';
    } else {
      diffText = `-${(maxPoints - team.totalPoints).toLocaleString('pt-BR')} PTS DA LIDERANÇA`;
    }

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
            ${team.mascote ? `
            <span class="sliding-metric-pill">
              <strong style="color: #34d399;">Mascote:</strong> ${team.mascote}
            </span>` : ''}
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
    const currentTurno = (state && typeof state.getTelaoTurno === 'function') ? state.getTelaoTurno() : 'Matutino';
    updateTelaoTurnoButtons(currentTurno);

    const activePill = document.getElementById('telao-active-turno-pill');
    if (activePill) {
      if (currentTurno === 'Matutino') {
        activePill.innerHTML = '☀️ GINCANA MATUTINO (8 TURMAS)';
        activePill.style.background = 'linear-gradient(135deg, #2563eb, #7c3aed)';
      } else {
        activePill.innerHTML = '🌙 GINCANA VESPERTINO (8 TURMAS)';
        activePill.style.background = 'linear-gradient(135deg, #7c3aed, #db2777)';
      }
    }

    const tickerLeaderBadge = document.getElementById('ticker-leader-badge');
    if (tickerLeaderBadge) {
      tickerLeaderBadge.innerText = `1º LUGAR • ${currentTurno.toUpperCase()}`;
    }

    const rankings = state.getTeamRankings(currentTurno);
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

  if (btnTelaoForceRefresh) {
    btnTelaoForceRefresh.addEventListener('click', async () => {
      btnTelaoForceRefresh.innerText = '🔄 Atualizando...';
      sound.playClick();
      await autoSyncTelao();
      sound.playScoreDing();
      btnTelaoForceRefresh.innerText = '✓ Atualizado!';
      btnTelaoForceRefresh.style.borderColor = '#10b981';
      btnTelaoForceRefresh.style.color = '#34d399';
      setTimeout(() => {
        btnTelaoForceRefresh.innerText = '🔄 Atualizar Placar';
        btnTelaoForceRefresh.style.borderColor = '';
        btnTelaoForceRefresh.style.color = '';
      }, 2000);
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

    // Mudança de Turno transmitido no telão
    if (source === 'telao_turno_change') {
      const currentTurno = eventInfo.turno || state.getTelaoTurno();
      updateTelaoTurnoButtons(currentTurno);
      syncTelaoMode();
      if (state.getTelaoMode() === 'results' && !isRevealing) {
        renderTelao();
      }
      return;
    }

    // 1. Comando explícito para disparar a cerimônia animada de revelação rápida
    if (source === 'telao_trigger_reveal') {
      lastKnownTelaoMode = 'results';
      runRevealAnimation();
      return;
    }

    // 1.1 Comando explícito para disparar a Cerimônia Solene Lenta do Pódio (3º -> 2º -> 1º)
    if (source === 'telao_podium_reveal') {
      lastKnownTelaoMode = 'results';
      const targetTurno = eventInfo.turno || (state.getTelaoTurno ? state.getTelaoTurno() : null);
      runPodiumCeremonyAnimation(targetTurno);
      return;
    }

    // 1.2 Comando explícito para Forçar Atualização Imediata das Notas
    if (source === 'force_refresh_telao') {
      autoSyncTelao();
      if (btnTelaoForceRefresh) {
        btnTelaoForceRefresh.innerText = '✓ Atualizado!';
        btnTelaoForceRefresh.style.borderColor = '#10b981';
        btnTelaoForceRefresh.style.color = '#34d399';
        setTimeout(() => {
          btnTelaoForceRefresh.innerText = '🔄 Atualizar Placar';
          btnTelaoForceRefresh.style.borderColor = '';
          btnTelaoForceRefresh.style.color = '';
        }, 2000);
      }
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

  // Agenda sincronização contínua a cada 3 segundos para resposta ultra-rápida sem delay
  const TELAO_SYNC_INTERVAL_MS = 3000;
  setInterval(autoSyncTelao, TELAO_SYNC_INTERVAL_MS);

  // Inicialização imediata
  autoSyncTelao();
});

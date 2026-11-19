/**
 * =========================================================================
 * MÓDULO DE IMPORTAÇÃO E EXPORTAÇÃO DE PLANILHA DE TURMAS / EQUIPES
 * Gincana SESI CONECTA
 * Suporte a Excel (.xlsx, .xls) e CSV (.csv com delimitador ';' ou ',')
 * =========================================================================
 */

(function (window) {
  'use strict';

  const PLANILHA_EXEMPLOS = [
    {
      'Nome da Equipe': 'Conecta Fênix',
      'Turma': '3ª Série A',
      'Segmento': 'Ensino Médio',
      'Turno': 'Matutino',
      'Cor': 'Vermelho',
      'Tutor / Professor': 'Prof. André',
      'Representantes': 'Lucas Silva e Camila Costa',
      'Slogan / Grito de Guerra': 'Conectar para transformar, reciclar para renovar!'
    },
    {
      'Nome da Equipe': 'Bio Circuitos',
      'Turma': '2ª Série A',
      'Segmento': 'Ensino Médio',
      'Turno': 'Matutino',
      'Cor': 'Azul',
      'Tutor / Professor': 'Prof.ª Renata',
      'Representantes': 'Gabriel Santos e Mariana Lima',
      'Slogan / Grito de Guerra': 'Tecnologia consciente, futuro presente!'
    },
    {
      'Nome da Equipe': 'Eco Titans',
      'Turma': '1ª Série A',
      'Segmento': 'Ensino Médio',
      'Turno': 'Matutino',
      'Cor': 'Verde',
      'Tutor / Professor': 'Prof. Carlos',
      'Representantes': 'Felipe Rocha e Beatriz Souza',
      'Slogan / Grito de Guerra': 'Reciclando o futuro, liderando o presente!'
    },
    {
      'Nome da Equipe': 'Cyber Guardiões',
      'Turma': '9º Ano A',
      'Segmento': 'Ensino Fundamental II',
      'Turno': 'Matutino',
      'Cor': 'Dourado',
      'Tutor / Professor': 'Prof. Marcos',
      'Representantes': 'Pedro Henrique e Sofia Ramos',
      'Slogan / Grito de Guerra': 'Pequenos gestos, grandes transformações!'
    }
  ];

  /**
   * Baixa a planilha modelo (.xlsx se SheetJS estiver disponível, senão .csv com BOM UTF-8)
   */
  function downloadPlanilhaModelo(formato = 'auto') {
    const hasXLSX = typeof window.XLSX !== 'undefined';

    if ((formato === 'xlsx' || formato === 'auto') && hasXLSX) {
      downloadExcelModelo();
    } else {
      downloadCsvModelo();
    }
  }

  function downloadExcelModelo() {
    const ws = window.XLSX.utils.json_to_sheet(PLANILHA_EXEMPLOS);

    // Ajusta largura das colunas para visual limpo no Excel
    ws['!cols'] = [
      { wch: 22 }, // Nome da Equipe
      { wch: 14 }, // Turma
      { wch: 24 }, // Segmento
      { wch: 14 }, // Turno
      { wch: 14 }, // Cor
      { wch: 20 }, // Tutor
      { wch: 32 }, // Representantes
      { wch: 45 }  // Slogan
    ];

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Turmas Gincana SESI');
    window.XLSX.writeFile(wb, 'modelo_turmas_gincana_sesi.xlsx');
  }

  function downloadCsvModelo() {
    const headers = [
      'Nome da Equipe',
      'Turma',
      'Segmento',
      'Turno',
      'Cor',
      'Tutor / Professor',
      'Representantes',
      'Slogan / Grito de Guerra'
    ];

    let csvContent = '\uFEFF'; // BOM para o Excel no Windows/Mac abrir com acentos corretos
    csvContent += headers.join(';') + '\r\n';

    PLANILHA_EXEMPLOS.forEach((row) => {
      const line = headers.map((h) => `"${(row[h] || '').replace(/"/g, '""')}"`).join(';');
      csvContent += line + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'modelo_turmas_gincana_sesi.csv');
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 150);
  }

  /**
   * Faz o parse do arquivo enviado pelo usuário (.xlsx, .xls ou .csv)
   */
  async function parseFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      if (typeof window.XLSX === 'undefined') {
        throw new Error('Biblioteca Excel carregando... Aguarde um instante ou salve a planilha como .CSV.');
      }
      return parseExcelBuffer(await file.arrayBuffer());
    } else {
      return parseCsvText(await file.text());
    }
  }

  function parseExcelBuffer(buffer) {
    const wb = window.XLSX.read(buffer, { type: 'array' });
    const firstSheetName = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheetName];
    const rows = window.XLSX.utils.sheet_to_json(ws, { defval: '' });
    return normalizeParsedRows(rows);
  }

  function parseCsvText(text) {
    // Remove BOM se presente
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      throw new Error('A planilha está vazia ou não contém dados válidos.');
    }

    // Detecta delimitador (; ou , ou \t)
    const firstLine = lines[0];
    let delimiter = ';';
    if ((firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length) {
      delimiter = ';';
    } else if ((firstLine.match(/,/g) || []).length > 0) {
      delimiter = ',';
    } else if (firstLine.includes('\t')) {
      delimiter = '\t';
    }

    function parseLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    }

    const headers = parseLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.every(v => v === '')) continue;

      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = values[idx] || '';
      });
      rows.push(obj);
    }

    return normalizeParsedRows(rows);
  }

  function normalizeParsedRows(rows) {
    const normalized = [];

    rows.forEach((row) => {
      // Busca chaves insensíveis a maiúsculas/minúsculas e acentos
      const findVal = (...aliases) => {
        for (const alias of aliases) {
          for (const key of Object.keys(row)) {
            const cleanKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const cleanAlias = alias.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            if (cleanKey === cleanAlias || cleanKey.includes(cleanAlias)) {
              if (row[key] !== undefined && String(row[key]).trim().length > 0) {
                return String(row[key]).trim();
              }
            }
          }
        }
        return '';
      };

      const name = findVal('nome da equipe', 'nome', 'equipe', 'turma/equipe');
      if (!name) return; // Linha sem nome de equipe é ignorada

      const turma = findVal('turma', 'serie', 'ano', 'serie / ano') || 'Turma';
      const segmento = findVal('segmento', 'nivel', 'etapa') || 'Ensino Médio';
      const turno = findVal('turno', 'horario') || 'Matutino';
      const color = findVal('cor', 'color') || '';
      const tutor = findVal('tutor', 'professor', 'orientador') || '';
      const representatives = findVal('representantes', 'lideres', 'lider', 'alunos') || '';
      const slogan = findVal('slogan', 'grito de guerra', 'lema', 'frase') || '';

      normalized.push({
        name,
        turma,
        segmento,
        turno,
        color,
        tutor,
        representatives,
        slogan
      });
    });

    if (normalized.length === 0) {
      throw new Error('Nenhuma turma válida foi identificada. Verifique se a coluna "Nome da Equipe" está presente na planilha.');
    }

    return normalized;
  }

  /**
   * Modal Interativo de Prévia e Confirmação da Importação
   */
  function showImportPreviewModal(parsedTeams, fileName, onConfirmCallback) {
    let modal = document.getElementById('modal-import-teams-preview');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-import-teams-preview';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-dialog" style="max-width: 760px; width: 95%;">
          <div class="modal-header">
            <h3 class="modal-title" style="display: flex; align-items: center; gap: 0.5rem;">
              <span>📊</span> Confirmar Importação de Turmas
            </h3>
            <button type="button" class="modal-close-btn" id="btn-close-import-preview">&times;</button>
          </div>
          
          <div style="padding: 1rem 0;">
            <div style="background: rgba(37, 99, 235, 0.1); border: 1px solid rgba(37, 99, 235, 0.3); border-radius: var(--radius-md); padding: 0.85rem 1rem; margin-bottom: 1.25rem;">
              <span id="import-preview-summary" style="font-size: 0.92rem; color: #93c5fd; font-weight: 600;">
                <!-- Preenchido via JS -->
              </span>
            </div>

            <!-- Tabela com as turmas detectadas -->
            <div style="max-height: 280px; overflow-y: auto; border: 1px solid var(--border-glass); border-radius: var(--radius-md); background: rgba(15, 23, 42, 0.6);">
              <table style="width: 100%; border-collapse: collapse; font-size: 0.84rem;">
                <thead>
                  <tr style="background: rgba(255, 255, 255, 0.05); text-align: left; border-bottom: 1px solid var(--border-glass);">
                    <th style="padding: 0.6rem 0.85rem;">#</th>
                    <th style="padding: 0.6rem 0.85rem;">Nome da Equipe</th>
                    <th style="padding: 0.6rem 0.85rem;">Turma</th>
                    <th style="padding: 0.6rem 0.85rem;">Segmento / Turno</th>
                    <th style="padding: 0.6rem 0.85rem;">Tutor / Líderes</th>
                  </tr>
                </thead>
                <tbody id="import-preview-tbody">
                  <!-- Linhas preenchidas via JS -->
                </tbody>
              </table>
            </div>

            <!-- Opções de Mesclagem ou Substituição -->
            <div style="margin-top: 1.25rem; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); padding: 1rem;">
              <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 0.5rem; color: #cbd5e1;">Como deseja aplicar a importação?</div>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer;">
                  <input type="radio" name="import-mode" value="append" checked>
                  <span><strong>Adicionar às turmas existentes</strong> (mantém as turmas atuais e adiciona as novas)</span>
                </label>
                <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer; color: #f87171;">
                  <input type="radio" name="import-mode" value="replace">
                  <span><strong>Substituir todas as turmas</strong> (apaga turmas existentes e cadastra apenas as da planilha)</span>
                </label>
              </div>
            </div>
          </div>

          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.75rem; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 1rem;">
            <button type="button" class="btn btn-secondary" id="btn-cancel-import-preview">Cancelar</button>
            <button type="button" class="btn btn-primary" id="btn-confirm-import-action" style="font-weight: 700;">
              Confirmar Importação (<span id="import-confirm-count">0</span> Turmas)
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#btn-close-import-preview').onclick = () => modal.classList.remove('active');
      modal.querySelector('#btn-cancel-import-preview').onclick = () => modal.classList.remove('active');
    }

    const summaryEl = modal.querySelector('#import-preview-summary');
    const tbodyEl = modal.querySelector('#import-preview-tbody');
    const countEl = modal.querySelector('#import-confirm-count');
    const confirmBtn = modal.querySelector('#btn-confirm-import-action');

    summaryEl.innerHTML = `📄 Arquivo: <strong>${fileName}</strong> • Encontradas <strong>${parsedTeams.length} turmas</strong> prontas para cadastro.`;
    countEl.innerText = parsedTeams.length;

    tbodyEl.innerHTML = parsedTeams.map((t, idx) => `
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
        <td style="padding: 0.55rem 0.85rem; color: #94a3b8;">${idx + 1}</td>
        <td style="padding: 0.55rem 0.85rem; font-weight: 700; color: #fff;">${t.name}</td>
        <td style="padding: 0.55rem 0.85rem;">${t.turma}</td>
        <td style="padding: 0.55rem 0.85rem; color: #cbd5e1;">${t.segmento} • ${t.turno}</td>
        <td style="padding: 0.55rem 0.85rem; color: #94a3b8; font-size: 0.78rem;">
          ${t.tutor ? `Tutor: ${t.tutor}` : ''} ${t.representatives ? `• ${t.representatives}` : ''}
        </td>
      </tr>
    `).join('');

    confirmBtn.onclick = () => {
      const mode = modal.querySelector('input[name="import-mode"]:checked').value;
      const replace = mode === 'replace';
      modal.classList.remove('active');
      if (typeof onConfirmCallback === 'function') {
        onConfirmCallback(parsedTeams, replace);
      }
    };

    modal.classList.add('active');
  }

  // Exporta objeto global PlanilhaTurmas
  window.PlanilhaTurmas = {
    downloadPlanilhaModelo,
    parseFile,
    showImportPreviewModal
  };

})(window);

# 🏆 Gincana Master Pro - Sistema Oficial de Pontuação Escolar

Sistema web completo, moderno e em tempo real para gerenciamento, lançamento de notas e exibição de placar para gincanas escolares.

---

## 🌟 Principais Recursos

### 1. ⚖️ Aba Dedicada ao Juiz (Painel do Juiz)
- **Identificação do Juiz**: Seleção rápida do avaliador responsável.
- **Seleção Visual de Equipes**: Cards clicáveis com as cores e mascotes de cada equipe.
- **Tipos Flexíveis de Provas**:
  - **Avaliação por Critérios**: Sliders interativos de 0 a 10 (ex: Criatividade, Sincronia, Torcida) com cálculo ponderado automático.
  - **Pontuação Direta**: Botões rápidos de soma (+10, +25, +50, +100) para provas de arrecadação de alimentos ou contagem.
  - **Posição no Ranking**: Botões para 1º, 2º, 3º e 4º lugares de corridas e esportes coletivos.
- **Bônus & Penalidades**: Campos rápidos para acréscimos ou descontos disciplinares.
- **Confirmação Segura**: Modal com resumo completo antes do envio definitivo para evitar erros na agitação da quadra.

### 2. 🏆 Placar Geral & Modo Telão (Projetor / TV)
- **Pódio Tridimensional dos 3 Primeiros**: Coroas, medalhas douradas, prateadas e bronzeadas, e animações de destaque.
- **Barras de Progresso Dinâmicas**: Indicador visual da distância de cada equipe em relação ao líder.
- **Modo Telão Exclusivo (`/telao.html`)**:
  - Tipografia extra-grande, nítida para ser lida a dezenas de metros de distância na quadra ou auditório.
  - Notificação banner gigante com efeito sonoro e confetes quando uma nota é lançada ou quando o líder do placar muda.
  - Botão de Tela Cheia integrado (F11).

### 3. 📱 Acesso Móvel pelos Juízes
- Portal dedicado para smartphones (`/juiz.html`): leve, responsivo e adaptado para telas de toque com feedback tátil e sonoro.
- Permite que vários juízes lancem notas ao mesmo tempo a partir de seus celulares conectados ao mesmo Wi-Fi da escola.

### 4. 🔊 Efeitos Sonoros e Visuais Nativos
- Sons sintetizados em tempo real via **Web Audio API** (sem necessidade de baixar arquivos MP3 pesados, funciona 100% offline).
- Efeitos visuais de confetes via Canvas de alta performance.

### 5. 💾 Histórico, Auditoria & Exportação
- Tabela de histórico de todos os lançamentos com data, hora, juiz, prova e observações.
- Possibilidade de anular lançamentos incorretos com recálculo automático instantâneo do placar.
- Exportação dos resultados em **CSV (compatível com Excel)** e **Backup JSON**.

---

## 🚀 Como Executar

### Opção 1: Via Servidor Local Node.js (Recomendado para Wi-Fi)
Para permitir que o telão e os celulares dos juízes fiquem sincronizados pela rede local:

1. Abra o terminal na pasta do projeto e execute:
   ```bash
   npm start
   ```
2. O terminal exibirá os links de acesso:
   - **Placar & Gestão:** `http://localhost:3000`
   - **Modo Telão (Projetor/TV):** `http://localhost:3000/telao.html`
   - **Portal do Juiz (Celular):** `http://<SEU-IP-LOCAL>:3000/juiz.html`

### Opção 2: Abertura Direta sem Servidor (Modo Offline)
Basta dar dois cliques no arquivo `public/index.html` ou `public/telao.html` em qualquer navegador (Chrome, Edge, Firefox).
A sincronização entre janelas e abas funciona normalmente através da tecnologia nativa `BroadcastChannel` e `LocalStorage`.

---

## 📁 Estrutura de Arquivos

```text
sistema-gincana/
├── package.json          # Configurações do projeto e scripts
├── server.js             # Servidor HTTP e WebSocket para rede local
├── README.md             # Manual de uso e documentação
└── public/
    ├── index.html        # Central com Placar, Área do Juiz, Gestão e Ajustes
    ├── telao.html        # Modo Telão exclusivo para Projetor/TV
    ├── juiz.html         # Portal móvel exclusivo para smartphones dos juízes
    ├── css/
    │   └── style.css     # Design system moderno esportivo (Glassmorphism dark)
    └── js/
        ├── state.js      # Estado central, persistência e barramento de sincronização
        ├── sound.js      # Efeitos sonoros via Web Audio API nativa
        ├── confetti.js   # Efeito visual de confetes via Canvas
        ├── app.js        # Lógica geral da aplicação principal
        ├── telao.js      # Lógica e animações do Modo Telão
        └── juiz.js       # Lógica do formulário móvel do juiz
```

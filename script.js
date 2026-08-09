const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const DEFAULT_PLAYERS = 2;
const ZONE_SIZE = 4;
const ZONE_MARGIN = 1;

const PLAYER_COLORS = [
  "#2e8b57", // vert
  "#b5442e", // rouge
  "#2f6fb0", // bleu
  "#7a4fb5", // violet
  "#c9a227", // or
  "#1f9e8f", // sarcelle
  "#c0518f", // rose
  "#55708a", // gris-bleu
];

function playerColor(player) {
  return PLAYER_COLORS[(player - 1) % PLAYER_COLORS.length];
}

// Le plateau grandit avec le nombre de joueurs pour garder les zones
// de départ bien espacées, jusqu'à un maximum raisonnable.
function boardSizeFor(numPlayers) {
  const raw = 16 + (numPlayers - 2) * 2.5;
  return Math.round(raw / 2) * 2;
}

// Répartit une zone de départ par joueur le long du pourtour du plateau
// (coins pour 2/4 joueurs, coins + bords pour les autres), façon carte
// multijoueur (chaque joueur dans "son coin"), en gardant un maximum
// d'écart entre les joueurs quel que soit leur nombre.
function buildZones(numPlayers, cols, rows) {
  const colCenter = (cols - ZONE_SIZE) / 2;
  const rowCenter = (rows - ZONE_SIZE) / 2;
  const halfColRange = colCenter - ZONE_MARGIN;
  const halfRowRange = rowCenter - ZONE_MARGIN;
  const startAngle = (3 * Math.PI) / 4;

  const zones = [];
  for (let i = 0; i < numPlayers; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / numPlayers;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    // Normalise la direction vers le bord du carré (et non du cercle
    // inscrit), pour que les joueurs s'étalent jusqu'aux coins/bords.
    const scale = 1 / Math.max(Math.abs(dirX), Math.abs(dirY));

    const row = clamp(Math.round(rowCenter + halfRowRange * dirY * scale), 0, rows - ZONE_SIZE);
    const col = clamp(Math.round(colCenter + halfColRange * dirX * scale), 0, cols - ZONE_SIZE);

    zones.push({ player: i + 1, row, col });
  }
  return zones;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function zoneOwnerFor(row, col, zones) {
  for (const zone of zones) {
    if (
      row >= zone.row &&
      row < zone.row + ZONE_SIZE &&
      col >= zone.col &&
      col < zone.col + ZONE_SIZE
    ) {
      return zone.player;
    }
  }
  return null;
}

function buildBoard(numPlayers) {
  const size = boardSizeFor(numPlayers);
  const cols = size;
  const rows = size;
  const zones = buildZones(numPlayers, cols, rows);

  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({ row, col, owner: zoneOwnerFor(row, col, zones) });
    }
  }
  return { cols, rows, zones, cells };
}

function isVisibleTo(cell, viewingPlayer) {
  return cell.owner === viewingPlayer;
}

const boardEl = document.getElementById("board");
const viewSwitchEl = document.getElementById("view-switch");
const playerCountEl = document.getElementById("player-count-switch");
const legendPlayersEl = document.getElementById("legend-players");

let numPlayers = DEFAULT_PLAYERS;
let viewingPlayer = 1;
let board = null;
let cellEls = [];

function buildAll() {
  board = buildBoard(numPlayers);
  if (viewingPlayer > numPlayers) viewingPlayer = 1;

  boardEl.style.setProperty("--cols", board.cols);
  boardEl.style.setProperty("--rows", board.rows);
  boardEl.innerHTML = "";
  cellEls = board.cells.map((cell) => {
    const el = document.createElement("div");
    el.className = "cell";
    el.dataset.row = cell.row;
    el.dataset.col = cell.col;
    el.setAttribute("role", "gridcell");
    boardEl.appendChild(el);
    return el;
  });

  renderPlayerCountSwitch();
  renderViewSwitch();
  renderLegend();
  render();
}

function render() {
  board.cells.forEach((cell, i) => {
    const el = cellEls[i];
    const visible = isVisibleTo(cell, viewingPlayer);
    el.classList.toggle("cell--fogged", !visible);
    el.classList.toggle("cell--zone", visible);
    el.style.setProperty("--zone-color", visible ? playerColor(cell.owner) : "");
  });
}

function renderPlayerCountSwitch() {
  playerCountEl.innerHTML = "";
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const btn = document.createElement("button");
    btn.className = "count-btn";
    btn.textContent = String(n);
    btn.classList.toggle("active", n === numPlayers);
    btn.addEventListener("click", () => {
      if (n === numPlayers) return;
      numPlayers = n;
      buildAll();
    });
    playerCountEl.appendChild(btn);
  }
}

function renderViewSwitch() {
  viewSwitchEl.innerHTML = "";
  for (let p = 1; p <= numPlayers; p++) {
    const btn = document.createElement("button");
    btn.className = "player-btn";
    btn.textContent = `Joueur ${p}`;
    btn.style.setProperty("--btn-color", playerColor(p));
    btn.classList.toggle("active", p === viewingPlayer);
    btn.addEventListener("click", () => setViewingPlayer(p));
    viewSwitchEl.appendChild(btn);
  }
}

function renderLegend() {
  legendPlayersEl.innerHTML = "";
  for (let p = 1; p <= numPlayers; p++) {
    const item = document.createElement("div");
    item.className = "legend__item";
    item.innerHTML = `<span class="swatch" style="background:${playerColor(p)}"></span> Zone de départ Joueur ${p}`;
    legendPlayersEl.appendChild(item);
  }
}

function setViewingPlayer(player) {
  viewingPlayer = player;
  [...viewSwitchEl.children].forEach((btn, i) => {
    btn.classList.toggle("active", i + 1 === player);
  });
  render();
}

buildAll();

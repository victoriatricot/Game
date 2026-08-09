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

// Bâtiment de la base : bunker de commandement avec antenne et fanion
// coloré (la couleur du joueur est injectée via currentColor / --zone-color).
const BUILDING_SVG = `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="32" cy="54" rx="20" ry="4" fill="rgba(0,0,0,0.35)"/>
  <rect x="30" y="12" width="4" height="20" fill="#2c3640"/>
  <path d="M34 12 L50 18 L34 24 Z" fill="currentColor"/>
  <rect x="14" y="30" width="36" height="24" rx="3" fill="#6b7684" stroke="#2c3640" stroke-width="1.5"/>
  <rect x="14" y="30" width="36" height="8" fill="#7d8a99"/>
  <rect x="18" y="34" width="6" height="5" fill="#cfe3f0"/>
  <rect x="40" y="34" width="6" height="5" fill="#cfe3f0"/>
  <rect x="27" y="40" width="10" height="14" fill="#2c3640"/>
</svg>`;

function playerColor(player) {
  return PLAYER_COLORS[(player - 1) % PLAYER_COLORS.length];
}

// Le plateau grandit avec le nombre de joueurs pour garder les zones
// de départ bien espacées, jusqu'à un maximum raisonnable.
function boardSizeFor(numPlayers) {
  const raw = 16 + (numPlayers - 2) * 2.5;
  return Math.round(raw / 2) * 2;
}

// Répartit une île de base par joueur sur un cercle centré sur le plateau
// (qui est lui-même rond), en gardant assez de marge pour qu'aucune île
// ne dépasse du bord circulaire, quel que soit le nombre de joueurs.
function buildZones(numPlayers, cols, rows) {
  const centerCol = cols / 2;
  const centerRow = rows / 2;
  const boardRadius = Math.min(cols, rows) / 2;
  const zoneDiagonalHalf = (ZONE_SIZE * Math.SQRT2) / 2;
  const zoneRadius = boardRadius - zoneDiagonalHalf - ZONE_MARGIN;
  const startAngle = (3 * Math.PI) / 4;

  const zones = [];
  for (let i = 0; i < numPlayers; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / numPlayers;
    const cx = centerCol + zoneRadius * Math.cos(angle);
    const cy = centerRow + zoneRadius * Math.sin(angle);

    const row = clamp(Math.round(cy - ZONE_SIZE / 2), 0, rows - ZONE_SIZE);
    const col = clamp(Math.round(cx - ZONE_SIZE / 2), 0, cols - ZONE_SIZE);

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
let islandEls = [];

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
    // Placement explicite : les îles réservent aussi des cellules de la
    // grille via un placement explicite, ce qui décalerait les cases
    // laissées à l'auto-placement si on ne fixait pas aussi leur position.
    el.style.gridRow = `${cell.row + 1} / span 1`;
    el.style.gridColumn = `${cell.col + 1} / span 1`;
    el.setAttribute("role", "gridcell");
    boardEl.appendChild(el);
    return el;
  });

  islandEls = board.zones.map((zone) => {
    const island = document.createElement("div");
    island.className = "island";
    island.style.gridRow = `${zone.row + 1} / span ${ZONE_SIZE}`;
    island.style.gridColumn = `${zone.col + 1} / span ${ZONE_SIZE}`;
    island.style.setProperty("--zone-color", playerColor(zone.player));

    const building = document.createElement("div");
    building.className = "building";
    building.innerHTML = BUILDING_SVG;
    island.appendChild(building);

    boardEl.appendChild(island);
    return { zone, el: island };
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

  islandEls.forEach(({ zone, el }) => {
    el.classList.toggle("island--hidden", zone.player !== viewingPlayer);
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
    item.innerHTML = `<span class="swatch" style="background:${playerColor(p)}"></span> Base du Joueur ${p}`;
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

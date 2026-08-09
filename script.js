/*
 * Client du prototype.
 *
 * Deux modes, un seul chemin de rendu :
 *   - "online" : la vue vient du serveur, qui fait autorité et applique
 *     le brouillard de guerre avant l'envoi ;
 *   - "local"  : la partie tourne dans le navigateur (hotseat), et on
 *     applique nous-mêmes GameCore.viewFor() pour le joueur qui regarde.
 *
 * Dans les deux cas `render()` ne travaille que sur une "vue" filtrée,
 * jamais sur l'état complet — ce qui garantit que le mode en ligne ne
 * peut pas laisser fuiter les positions adverses dans le navigateur.
 */

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
// coloré (la couleur du joueur est injectée via currentColor).
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

const ZONE_SIZE = GameCore.ZONE_SIZE;

function playerColor(player) {
  return PLAYER_COLORS[(player - 1) % PLAYER_COLORS.length];
}

function typeOf(ship) {
  return SHIP_TYPES.find((t) => t.id === ship.typeId);
}

function shipTooltip(ship) {
  const t = typeOf(ship);
  const detection =
    t.detectionType === "stealth"
      ? `furtif (détecté seulement à ${t.detectionRadius} cases ou moins)`
      : "détection normale";
  return (
    `${t.name} — Joueur ${ship.player}\n` +
    `PV ${ship.hp}/${t.hp} · déplacement ${t.moveRange} · portée ${t.attackRange} · dégâts ${t.damage}\n` +
    `Reconstruction ${t.scrapCost} scrap · rapporte ${t.scrapReward} scrap coulé\n` +
    `Détection : ${detection}`
  );
}

// --- Éléments du DOM ----------------------------------------------------

const el = (id) => document.getElementById(id);

const lobbyEl = el("lobby");
const waitingEl = el("waiting");
const gameEl = el("game");
const boardEl = el("board");
const viewSwitchEl = el("view-switch");
const viewSwitchRow = el("view-switch-row");
const legendPlayersEl = el("legend-players");
const turnCounterEl = el("turn-counter");
const selectionInfoEl = el("selection-info");
const sessionInfoEl = el("session-info");
const eventLogEl = el("event-log");
const netStatusEl = el("net-status");
const playerListEl = el("player-list");
const roomCodeEl = el("room-code");
const waitingHintEl = el("waiting-hint");

const btnMove = el("btn-move");
const btnAttack = el("btn-attack");
const btnCancel = el("btn-cancel");
const btnEndTurn = el("btn-end-turn");

// --- État du client -----------------------------------------------------

let mode = null; // "online" | "local"
let view = null; // vue filtrée en cours d'affichage
let localState = null; // état complet, uniquement en mode local
let viewingPlayer = 1; // en local : joueur dont on regarde la vue
let selectedShipId = null;
let actionMode = null; // "move" | "attack" | null
let orders = new Map(); // shipId -> {type, row, col}
let submittedSlots = [];
let mySlot = null;
let isHost = false;
let roomCode = null;

let cellEls = [];
let islandEls = [];
let shipEls = [];
let orderMarkerEls = [];
let renderedDims = null;

// --- Connexion au serveur ----------------------------------------------

let socket = null;

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  try {
    socket = new WebSocket(`${proto}//${location.host}`);
  } catch {
    return showOffline();
  }

  socket.addEventListener("open", () => {
    netStatusEl.textContent = "Connecté au serveur.";
    netStatusEl.classList.add("lobby__status--ok");
    el("btn-create").disabled = false;
    el("btn-join").disabled = false;
  });

  socket.addEventListener("close", showOffline);
  socket.addEventListener("error", showOffline);
  socket.addEventListener("message", (e) => onServerMessage(JSON.parse(e.data)));
}

function showOffline() {
  if (mode === "online") {
    sessionInfoEl.textContent = "Connexion au serveur perdue.";
    return;
  }
  netStatusEl.textContent =
    "Pas de serveur de jeu joignable — seule la partie locale est disponible.";
  netStatusEl.classList.add("lobby__status--off");
  el("btn-create").disabled = true;
  el("btn-join").disabled = true;
}

function onServerMessage(msg) {
  if (msg.t === "error") {
    netStatusEl.textContent = msg.message;
    netStatusEl.classList.add("lobby__status--off");
    return;
  }

  if (msg.t === "joined") {
    mode = "online";
    mySlot = msg.slot;
    isHost = msg.isHost;
    roomCode = msg.code;
    roomCodeEl.textContent = msg.code;
    lobbyEl.hidden = true;
    waitingEl.hidden = false;
    return;
  }

  if (msg.t === "lobby") {
    playerListEl.innerHTML = "";
    for (const p of msg.players) {
      const li = document.createElement("li");
      li.className = "player-list__item";
      li.innerHTML =
        `<span class="swatch" style="background:${playerColor(p.slot)}"></span> ` +
        `${p.name}${p.slot === mySlot ? " (vous)" : ""}`;
      playerListEl.appendChild(li);
    }
    el("btn-start").hidden = !isHost || msg.started;
    waitingHintEl.textContent = msg.started
      ? ""
      : `${msg.players.length} joueur(s) présent(s). Il en faut au moins 2.`;
    return;
  }

  if (msg.t === "state") {
    waitingEl.hidden = true;
    gameEl.hidden = false;
    viewSwitchRow.hidden = true;
    view = msg.view;
    viewingPlayer = view.me;
    submittedSlots = msg.submitted || [];
    // Le tour a été résolu : les ordres locaux ne valent plus rien.
    if (msg.events && msg.events.length) showEvents(msg.events);
    if (!submittedSlots.includes(mySlot)) {
      orders = new Map();
      selectedShipId = null;
      actionMode = null;
    }
    rebuildAndRender();
    return;
  }
}

// --- Démarrage des parties ---------------------------------------------

function startLocalGame(numPlayers) {
  mode = "local";
  localState = GameCore.createGame(numPlayers);
  viewingPlayer = 1;
  mySlot = null;
  orders = new Map();
  selectedShipId = null;
  actionMode = null;
  lobbyEl.hidden = true;
  gameEl.hidden = false;
  viewSwitchRow.hidden = false;
  refreshLocalView();
}

function refreshLocalView() {
  view = GameCore.viewFor(localState, viewingPlayer);
  rebuildAndRender();
}

// --- Construction et rendu du plateau -----------------------------------

function rebuildAndRender() {
  const dims = `${view.cols}x${view.rows}`;
  if (dims !== renderedDims) {
    buildCells();
    renderedDims = dims;
  }
  buildIslandsAndShips();
  render();
}

function buildCells() {
  boardEl.style.setProperty("--cols", view.cols);
  boardEl.style.setProperty("--rows", view.rows);
  boardEl.innerHTML = "";
  islandEls = [];
  shipEls = [];
  orderMarkerEls = [];

  cellEls = view.cells.map((cell) => {
    const node = document.createElement("div");
    node.className = "cell";
    node.dataset.row = cell.row;
    node.dataset.col = cell.col;
    // Placement explicite : îles, bateaux et marqueurs réservent aussi
    // des cellules de la grille, ce qui décalerait les cases laissées à
    // l'auto-placement si on ne fixait pas aussi leur position.
    node.style.gridRow = `${cell.row + 1} / span 1`;
    node.style.gridColumn = `${cell.col + 1} / span 1`;
    node.setAttribute("role", "gridcell");
    node.addEventListener("click", () => onCellClick(cell.row, cell.col));
    boardEl.appendChild(node);
    return node;
  });
}

// Îles et bateaux sont reconstruits à chaque vue : leur nombre change
// (bateaux coulés) et, en ligne, la vue peut arriver à tout moment.
function buildIslandsAndShips() {
  islandEls.forEach((entry) => entry.el.remove());
  shipEls.forEach((entry) => entry.el.remove());

  islandEls = view.zones.map((zone) => {
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

  shipEls = view.ships.map((ship) => {
    const type = typeOf(ship);
    const node = document.createElement("div");
    node.className = `ship ship--${ship.orientation}`;
    node.style.gridRow =
      ship.orientation === "horizontal"
        ? `${ship.row + 1} / span 1`
        : `${ship.row + 1} / span ${type.length}`;
    node.style.gridColumn =
      ship.orientation === "horizontal"
        ? `${ship.col + 1} / span ${type.length}`
        : `${ship.col + 1} / span 1`;
    node.style.setProperty("--zone-color", playerColor(ship.player));
    node.classList.toggle("ship--stealth", type.detectionType === "stealth");
    node.title = shipTooltip(ship);

    const label = document.createElement("span");
    label.className = "ship__label";
    label.textContent = type.code;
    node.appendChild(label);

    node.addEventListener("click", (e) => {
      e.stopPropagation();
      onShipClick(ship);
    });

    boardEl.appendChild(node);
    return { ship, el: node };
  });
}

function render() {
  view.cells.forEach((cell, i) => {
    const node = cellEls[i];
    if (!node) return;
    const mine = cell.owner === viewingPlayer;
    node.classList.toggle("cell--fogged", !mine && !shipAt(cell.row, cell.col));
    node.classList.toggle("cell--zone", mine);
    node.style.setProperty("--zone-color", mine ? playerColor(cell.owner) : "");
  });

  shipEls.forEach(({ ship, el: node }) => {
    node.classList.toggle("ship--selected", ship.id === selectedShipId);
  });

  renderOrderMarkers();
  renderTurnBar();
  renderLegend();
  renderSessionInfo();
  if (mode === "local") renderViewSwitch();
}

function shipAt(row, col) {
  return view.ships.some((s) => s.cells.some((c) => c.row === row && c.col === col));
}

function renderOrderMarkers() {
  orderMarkerEls.forEach((node) => node.remove());
  orderMarkerEls = [];

  orders.forEach((order, shipId) => {
    const ship = view.ships.find((s) => s.id === shipId);
    if (!ship) return;
    const type = typeOf(ship);

    const marker = document.createElement("div");
    marker.style.setProperty("--zone-color", playerColor(ship.player));

    if (order.type === "move") {
      marker.className = "order-marker order-marker--move";
      if (ship.orientation === "horizontal") {
        marker.style.gridRow = `${order.row + 1} / span 1`;
        marker.style.gridColumn = `${order.col + 1} / span ${type.length}`;
      } else {
        marker.style.gridRow = `${order.row + 1} / span ${type.length}`;
        marker.style.gridColumn = `${order.col + 1} / span 1`;
      }
    } else {
      marker.className = "order-marker order-marker--attack";
      marker.style.gridRow = `${order.row + 1} / span 1`;
      marker.style.gridColumn = `${order.col + 1} / span 1`;
    }

    boardEl.appendChild(marker);
    orderMarkerEls.push(marker);
  });
}

function renderTurnBar() {
  turnCounterEl.textContent = `Tour ${view.turn}`;
  const waiting = mode === "online" && submittedSlots.includes(mySlot);

  btnEndTurn.textContent = waiting ? "Annuler mes ordres" : "Fin du tour";

  const ship = selectedShipId ? view.ships.find((s) => s.id === selectedShipId) : null;
  if (!ship) {
    selectionInfoEl.textContent = waiting
      ? `Ordres envoyés — en attente des autres joueurs (${submittedSlots.length}/${view.numPlayers}).`
      : "Cliquez un de vos bateaux pour lui donner un ordre.";
    btnMove.hidden = true;
    btnAttack.hidden = true;
    btnCancel.hidden = true;
    return;
  }

  const type = typeOf(ship);
  const order = orders.get(ship.id);
  const orderText = order
    ? ` — ordre : ${order.type === "move" ? "déplacement" : "attaque"} en (${order.row}, ${order.col})`
    : " — aucun ordre";
  const modeText =
    actionMode === "move"
      ? " · cliquez une case de mer à portée"
      : actionMode === "attack"
        ? " · cliquez une case à portée pour tirer"
        : "";
  selectionInfoEl.textContent = `${type.name} — PV ${ship.hp}/${type.hp}${orderText}${modeText}`;

  btnMove.hidden = false;
  btnAttack.hidden = false;
  btnCancel.hidden = false;
  btnMove.classList.toggle("active", actionMode === "move");
  btnAttack.classList.toggle("active", actionMode === "attack");
}

function renderLegend() {
  legendPlayersEl.innerHTML = "";
  const item = document.createElement("div");
  item.className = "legend__item";
  item.innerHTML = `<span class="swatch" style="background:${playerColor(viewingPlayer)}"></span> Votre base`;
  legendPlayersEl.appendChild(item);
}

function renderSessionInfo() {
  const parts = [];
  if (mode === "online") parts.push(`Salon ${roomCode} · Joueur ${mySlot}`);
  else parts.push("Partie locale");
  parts.push(`Scrap : ${view.scrap}`);
  sessionInfoEl.textContent = parts.join(" · ");
}

function renderViewSwitch() {
  if (viewSwitchEl.children.length !== localState.numPlayers) {
    viewSwitchEl.innerHTML = "";
    for (let p = 1; p <= localState.numPlayers; p++) {
      const btn = document.createElement("button");
      btn.className = "player-btn";
      btn.textContent = `Joueur ${p}`;
      btn.style.setProperty("--btn-color", playerColor(p));
      btn.addEventListener("click", () => {
        viewingPlayer = p;
        selectedShipId = null;
        actionMode = null;
        refreshLocalView();
      });
      viewSwitchEl.appendChild(btn);
    }
  }
  [...viewSwitchEl.children].forEach((btn, i) => {
    btn.classList.toggle("active", i + 1 === viewingPlayer);
  });
}

function showEvents(events) {
  const lines = events.map((e) => {
    if (e.type === "sunk") {
      const t = SHIP_TYPES.find((x) => x.id === e.typeId);
      return e.by === viewingPlayer
        ? `Vous avez coulé un ${t.name} du joueur ${e.victim} (+${e.scrap} scrap)`
        : `Votre ${t.name} a été coulé par le joueur ${e.by}`;
    }
    if (e.type === "hit") {
      if (e.by === viewingPlayer) return `Touché en (${e.row}, ${e.col})`;
      if (e.victim === viewingPlayer) return `Un de vos bateaux a été touché en (${e.row}, ${e.col})`;
      return null;
    }
    if (e.type === "miss" && e.by === viewingPlayer) return `Manqué en (${e.row}, ${e.col})`;
    if (e.type === "moveBlocked") return null;
    return null;
  });
  const text = lines.filter(Boolean).join(" · ");
  eventLogEl.textContent = text;
}

// --- Interactions -------------------------------------------------------

function isMyShip(ship) {
  return mode === "online" ? ship.player === mySlot : ship.player === viewingPlayer;
}

function onShipClick(ship) {
  if (selectedShipId && actionMode) {
    onCellClick(ship.row, ship.col);
    return;
  }
  if (!isMyShip(ship)) return;
  selectedShipId = ship.id;
  actionMode = null;
  render();
}

function onCellClick(row, col) {
  if (!selectedShipId || !actionMode) return;
  const ship = view.ships.find((s) => s.id === selectedShipId);
  if (!ship || !isMyShip(ship)) return;

  const state = mode === "local" ? localState : view;
  const valid =
    actionMode === "move"
      ? GameCore.isValidMoveOrder(state, ship, row, col)
      : GameCore.isValidAttackOrder(state, ship, row, col);
  if (!valid) return;

  orders.set(ship.id, { type: actionMode, row, col });
  actionMode = null;
  render();
}

function armMode(m) {
  if (!selectedShipId) return;
  actionMode = actionMode === m ? null : m;
  render();
}

function clearSelection() {
  selectedShipId = null;
  actionMode = null;
  render();
}

function endTurn() {
  if (mode === "online") {
    if (submittedSlots.includes(mySlot)) {
      socket.send(JSON.stringify({ t: "unready" }));
    } else {
      socket.send(JSON.stringify({ t: "orders", orders: Object.fromEntries(orders) }));
    }
    return;
  }

  // Mode local : on résout tout de suite avec les ordres accumulés de
  // tous les joueurs (chacun ayant donné les siens via la bascule Vue).
  const { events } = GameCore.resolveTurn(localState, Object.fromEntries(orders));
  orders = new Map();
  selectedShipId = null;
  actionMode = null;
  refreshLocalView();
  showEvents(events);
}

btnMove.addEventListener("click", () => armMode("move"));
btnAttack.addEventListener("click", () => armMode("attack"));
btnCancel.addEventListener("click", clearSelection);
btnEndTurn.addEventListener("click", endTurn);

el("btn-local").addEventListener("click", () => {
  startLocalGame(Number(el("select-players").value) || 2);
});

el("btn-create").addEventListener("click", () => {
  socket.send(
    JSON.stringify({
      t: "create",
      numPlayers: Number(el("select-players").value) || 2,
      name: el("input-name").value.trim() || undefined,
    })
  );
});

el("btn-join").addEventListener("click", () => {
  socket.send(
    JSON.stringify({
      t: "join",
      code: el("input-code").value.trim().toUpperCase(),
      name: el("input-name").value.trim() || undefined,
    })
  );
});

el("btn-start").addEventListener("click", () => {
  socket.send(JSON.stringify({ t: "start" }));
});

connect();

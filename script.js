const COLS = 16;
const ROWS = 16;
const ZONE_SIZE = 4;

const CELL_TYPES = {
  OCEAN: "ocean",
  P1_START: "p1",
  P2_START: "p2",
};

function buildBoard() {
  const cells = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      cells.push({ row, col, type: cellTypeFor(row, col) });
    }
  }
  return cells;
}

function cellTypeFor(row, col) {
  if (row >= ROWS - ZONE_SIZE && col < ZONE_SIZE) return CELL_TYPES.P1_START;
  if (row < ZONE_SIZE && col >= COLS - ZONE_SIZE) return CELL_TYPES.P2_START;
  return CELL_TYPES.OCEAN;
}

function isVisibleTo(cell, viewingPlayer) {
  if (viewingPlayer === 1) return cell.type === CELL_TYPES.P1_START;
  return cell.type === CELL_TYPES.P2_START;
}

const board = buildBoard();
let viewingPlayer = 1;

const boardEl = document.getElementById("board");
boardEl.style.setProperty("--cols", COLS);
boardEl.style.setProperty("--rows", ROWS);

const cellEls = board.map((cell) => {
  const el = document.createElement("div");
  el.className = "cell";
  el.dataset.row = cell.row;
  el.dataset.col = cell.col;
  el.setAttribute("role", "gridcell");
  boardEl.appendChild(el);
  return el;
});

function render() {
  board.forEach((cell, i) => {
    const el = cellEls[i];
    const visible = isVisibleTo(cell, viewingPlayer);
    el.classList.toggle("cell--fogged", !visible);
    el.classList.toggle("cell--p1", visible && cell.type === CELL_TYPES.P1_START);
    el.classList.toggle("cell--p2", visible && cell.type === CELL_TYPES.P2_START);
  });
}

function setViewingPlayer(player) {
  viewingPlayer = player;
  document.getElementById("btn-view-p1").classList.toggle("active", player === 1);
  document.getElementById("btn-view-p2").classList.toggle("active", player === 2);
  render();
}

document.getElementById("btn-view-p1").addEventListener("click", () => setViewingPlayer(1));
document.getElementById("btn-view-p2").addEventListener("click", () => setViewingPlayer(2));

setViewingPlayer(1);

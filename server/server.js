/*
 * Serveur de jeu autoritaire.
 *
 * Deux rôles :
 *   1. servir les fichiers statiques du prototype (le même dossier que
 *      celui publié sur GitHub Pages) ;
 *   2. tenir l'état réel des parties et arbitrer les tours via WebSocket.
 *
 * Principe de sécurité : l'état complet ne quitte JAMAIS le serveur.
 * Chaque client reçoit uniquement `GameCore.viewFor(state, sonJoueur)`,
 * et tous les ordres sont revalidés ici — un client ne peut donner
 * d'ordre qu'à ses propres bateaux.
 *
 * L'état des parties est en mémoire pour l'instant : un redémarrage du
 * serveur perd les parties en cours. La persistance PostgreSQL viendra
 * dans une étape suivante.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const GameCore = require("../game-core.js");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// --- Serveur de fichiers statiques -------------------------------------

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.join(ROOT, relative);

  // Empêche de sortir du dossier du projet via des ".." dans l'URL.
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, "index.html")) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

// --- Salons de jeu ------------------------------------------------------

/** code -> { code, hostId, numPlayers, started, state, players: Map, orders: Map } */
const rooms = new Map();
let nextClientId = 1;

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I/O/0/1 ambigus
  let code;
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function lobbyPayload(room) {
  return {
    t: "lobby",
    code: room.code,
    numPlayers: room.numPlayers,
    started: room.started,
    players: [...room.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({ slot: p.slot, name: p.name, connected: p.ws.readyState === p.ws.OPEN })),
  };
}

function broadcastLobby(room) {
  for (const player of room.players.values()) send(player.ws, lobbyPayload(room));
}

function sendStateTo(room, player, events) {
  send(player.ws, {
    t: "state",
    view: GameCore.viewFor(room.state, player.slot),
    submitted: [...room.orders.keys()],
    events: events || [],
  });
}

function broadcastState(room, events) {
  for (const player of room.players.values()) sendStateTo(room, player, events);
}

function startGame(room) {
  room.state = GameCore.createGame(room.numPlayers);
  room.started = true;
  room.orders = new Map();
  broadcastLobby(room);
  broadcastState(room);
}

// Résout le tour dès que tous les joueurs encore connectés ont soumis
// leurs ordres.
function maybeResolveTurn(room) {
  const activeSlots = [...room.players.values()]
    .filter((p) => p.ws.readyState === p.ws.OPEN)
    .map((p) => p.slot);
  if (activeSlots.length === 0) return;
  if (!activeSlots.every((slot) => room.orders.has(slot))) return;

  const merged = {};
  for (const orders of room.orders.values()) Object.assign(merged, orders);

  const { events } = GameCore.resolveTurn(room.state, merged);
  room.orders = new Map();
  broadcastState(room, events);
}

// Ne garde que les ordres portant sur les bateaux du joueur, et
// seulement s'ils sont valides. Un client malveillant ne peut donc ni
// bouger un bateau adverse, ni dépasser sa portée.
function sanitizeOrders(state, slot, rawOrders) {
  const clean = {};
  if (!rawOrders || typeof rawOrders !== "object") return clean;

  for (const [shipId, order] of Object.entries(rawOrders)) {
    const ship = state.ships.find((s) => s.id === shipId);
    if (!ship || ship.player !== slot) continue;
    if (!order || (order.type !== "move" && order.type !== "attack")) continue;
    const row = Number(order.row);
    const col = Number(order.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) continue;
    if (!GameCore.isValidOrder(state, ship, { type: order.type, row, col })) continue;
    clean[shipId] = { type: order.type, row, col };
  }
  return clean;
}

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const client = { id: nextClientId++, room: null, slot: null };

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { t: "error", message: "Message illisible" });
    }

    if (msg.t === "create") {
      const numPlayers = GameCore.clamp(
        Number(msg.numPlayers) || 2,
        GameCore.MIN_PLAYERS,
        GameCore.MAX_PLAYERS
      );
      const code = makeRoomCode();
      const room = {
        code,
        hostId: client.id,
        numPlayers,
        started: false,
        state: null,
        players: new Map(),
        orders: new Map(),
      };
      rooms.set(code, room);

      client.room = room;
      client.slot = 1;
      room.players.set(client.id, { id: client.id, slot: 1, name: msg.name || "Joueur 1", ws });

      send(ws, { t: "joined", code, slot: 1, isHost: true });
      broadcastLobby(room);
      return;
    }

    if (msg.t === "join") {
      const room = rooms.get(String(msg.code || "").toUpperCase());
      if (!room) return send(ws, { t: "error", message: "Salon introuvable" });
      if (room.started) return send(ws, { t: "error", message: "La partie a déjà commencé" });
      if (room.players.size >= room.numPlayers) {
        return send(ws, { t: "error", message: "Salon complet" });
      }

      const used = new Set([...room.players.values()].map((p) => p.slot));
      let slot = 1;
      while (used.has(slot)) slot++;

      client.room = room;
      client.slot = slot;
      room.players.set(client.id, { id: client.id, slot, name: msg.name || `Joueur ${slot}`, ws });

      send(ws, { t: "joined", code: room.code, slot, isHost: room.hostId === client.id });
      broadcastLobby(room);
      return;
    }

    const room = client.room;
    if (!room) return send(ws, { t: "error", message: "Aucun salon rejoint" });

    if (msg.t === "start") {
      if (room.hostId !== client.id) {
        return send(ws, { t: "error", message: "Seul l'hôte peut lancer la partie" });
      }
      if (room.started) return;
      if (room.players.size < GameCore.MIN_PLAYERS) {
        return send(ws, { t: "error", message: "Il faut au moins 2 joueurs" });
      }
      // La partie se joue avec le nombre de joueurs réellement présents.
      room.numPlayers = room.players.size;
      startGame(room);
      return;
    }

    if (msg.t === "orders") {
      if (!room.started) return send(ws, { t: "error", message: "La partie n'a pas commencé" });
      room.orders.set(client.slot, sanitizeOrders(room.state, client.slot, msg.orders));
      broadcastState(room);
      maybeResolveTurn(room);
      return;
    }

    if (msg.t === "unready") {
      if (!room.started) return;
      room.orders.delete(client.slot);
      broadcastState(room);
      return;
    }
  });

  ws.on("close", () => {
    const room = client.room;
    if (!room) return;
    room.players.delete(client.id);
    room.orders.delete(client.slot);

    if (room.players.size === 0) {
      rooms.delete(room.code);
      return;
    }
    // L'hôte partant, le joueur restant le plus ancien reprend la main.
    if (room.hostId === client.id) {
      room.hostId = [...room.players.values()][0].id;
    }
    broadcastLobby(room);
    if (room.started) {
      broadcastState(room);
      maybeResolveTurn(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Bataille Navale — serveur sur http://localhost:${PORT}`);
});

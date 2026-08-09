/*
 * Logique de jeu pure, partagée entre le serveur Node (qui fait autorité)
 * et le navigateur (qui l'utilise pour le mode local hotseat).
 *
 * Aucune dépendance au DOM ici : ce module ne fait que produire et faire
 * évoluer un état de partie. Tout ce qui touche à l'affichage vit dans
 * script.js.
 *
 * Point important : c'est `viewFor()` qui applique le brouillard de
 * guerre. Le serveur n'envoie JAMAIS l'état complet à un client, sinon
 * n'importe quel joueur pourrait lire les positions adverses dans les
 * outils développeur du navigateur.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./ships-config.js"));
  } else {
    root.GameCore = factory(root.SHIP_TYPES);
  }
})(typeof self !== "undefined" ? self : this, function (SHIP_TYPES) {
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 8;
  const ZONE_SIZE = 4;
  const ZONE_MARGIN = 1;
  const HARBOR_DEPTH = 5;

  // Ordre d'amarrage du port, de la case la plus proche de l'île (eaux
  // abritées) à la plus éloignée (eaux profondes).
  const HARBOR_ORDER = ["destroyer", "cruiser", "submarine", "battleship", "carrier"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function chebyshevDist(row1, col1, row2, col2) {
    return Math.max(Math.abs(row1 - row2), Math.abs(col1 - col2));
  }

  // Le plateau grandit avec le nombre de joueurs pour garder les zones
  // de départ (île + port) bien espacées.
  function boardSizeFor(numPlayers) {
    const raw = 22 + (numPlayers - 2) * 3;
    return Math.round(raw / 2) * 2;
  }

  // Répartit une île de base par joueur sur un cercle centré sur le
  // plateau (lui-même rond), avec assez de marge au-delà de chaque île
  // pour son port sans dépasser le bord.
  function buildZones(numPlayers, cols, rows) {
    const centerCol = cols / 2;
    const centerRow = rows / 2;
    const boardRadius = Math.min(cols, rows) / 2;
    const outwardExtent = ZONE_SIZE / 2 + HARBOR_DEPTH;
    const zoneRadius = boardRadius - outwardExtent - ZONE_MARGIN;
    const startAngle = (3 * Math.PI) / 4;

    const zones = [];
    for (let i = 0; i < numPlayers; i++) {
      const angle = startAngle + (i * 2 * Math.PI) / numPlayers;
      const cx = centerCol + zoneRadius * Math.cos(angle);
      const cy = centerRow + zoneRadius * Math.sin(angle);

      const row = clamp(Math.round(cy - ZONE_SIZE / 2), 0, rows - ZONE_SIZE);
      const col = clamp(Math.round(cx - ZONE_SIZE / 2), 0, cols - ZONE_SIZE);

      // Le port est placé du côté de l'île le plus éloigné du centre du
      // plateau (eaux libres).
      const dRow = row + ZONE_SIZE / 2 - centerRow;
      const dCol = col + ZONE_SIZE / 2 - centerCol;
      const harborSide =
        Math.abs(dRow) >= Math.abs(dCol)
          ? dRow >= 0
            ? "bottom"
            : "top"
          : dCol >= 0
            ? "right"
            : "left";

      zones.push({ player: i + 1, row, col, harborSide });
    }
    return zones;
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

  // Place les 5 bateaux d'un joueur en formation fixe dans son port.
  function buildShipsForZone(zone) {
    const horizontal = zone.harborSide === "top" || zone.harborSide === "bottom";

    return HARBOR_ORDER.map((shipId, depthIndex) => {
      const type = SHIP_TYPES.find((t) => t.id === shipId);
      const offset = Math.floor((ZONE_SIZE - type.length) / 2);

      let row;
      let col;
      if (horizontal) {
        col = zone.col + offset;
        row =
          zone.harborSide === "top"
            ? zone.row - 1 - depthIndex
            : zone.row + ZONE_SIZE + depthIndex;
      } else {
        row = zone.row + offset;
        col =
          zone.harborSide === "left"
            ? zone.col - 1 - depthIndex
            : zone.col + ZONE_SIZE + depthIndex;
      }

      const orientation = horizontal ? "horizontal" : "vertical";
      const cells = Array.from({ length: type.length }, (_, i) =>
        horizontal ? { row, col: col + i } : { row: row + i, col }
      );

      return {
        id: `p${zone.player}-${shipId}`,
        player: zone.player,
        typeId: type.id,
        orientation,
        row,
        col,
        hp: type.hp,
        cells,
      };
    });
  }

  function typeOf(ship) {
    return SHIP_TYPES.find((t) => t.id === ship.typeId);
  }

  function createGame(numPlayers) {
    const n = clamp(numPlayers, MIN_PLAYERS, MAX_PLAYERS);
    const size = boardSizeFor(n);
    const zones = buildZones(n, size, size);
    const ships = zones.flatMap(buildShipsForZone);

    return {
      numPlayers: n,
      cols: size,
      rows: size,
      turn: 1,
      zones,
      ships,
      scrap: Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 0])),
    };
  }

  function isLandCell(state, row, col) {
    if (row < 0 || col < 0 || row >= state.rows || col >= state.cols) return true;
    return zoneOwnerFor(row, col, state.zones) !== null;
  }

  // Un bateau se déplace en gardant sa longueur et son orientation : on
  // vérifie que toutes ses cases d'arrivée restent en mer et dans les
  // limites. Les conflits entre bateaux sont tranchés à la résolution.
  function isValidMoveOrder(state, ship, row, col) {
    const type = typeOf(ship);
    if (chebyshevDist(ship.row, ship.col, row, col) > type.moveRange) return false;
    const dRow = row - ship.row;
    const dCol = col - ship.col;
    return ship.cells.every((c) => !isLandCell(state, c.row + dRow, c.col + dCol));
  }

  function isValidAttackOrder(state, ship, row, col) {
    if (row < 0 || col < 0 || row >= state.rows || col >= state.cols) return false;
    return chebyshevDist(ship.row, ship.col, row, col) <= typeOf(ship).attackRange;
  }

  function isValidOrder(state, ship, order) {
    if (!order) return false;
    if (order.type === "move") return isValidMoveOrder(state, ship, order.row, order.col);
    if (order.type === "attack") return isValidAttackOrder(state, ship, order.row, order.col);
    return false;
  }

  /*
   * Résolution simultanée d'un tour.
   * `orders` : { [shipId]: {type:'move'|'attack', row, col} }
   * Les déplacements sont appliqués d'abord (un conflit annule les
   * déplacements concernés), puis les attaques sont résolues contre les
   * positions finales.
   * Retourne { state, events } — `events` sert à raconter le tour aux
   * joueurs sans leur révéler d'information cachée.
   */
  function resolveTurn(state, orders) {
    const events = [];
    const shipById = new Map(state.ships.map((s) => [s.id, s]));

    const intended = new Map();
    for (const [shipId, order] of Object.entries(orders || {})) {
      const ship = shipById.get(shipId);
      if (!ship || order.type !== "move") continue;
      if (!isValidMoveOrder(state, ship, order.row, order.col)) continue;
      const dRow = order.row - ship.row;
      const dCol = order.col - ship.col;
      intended.set(shipId, {
        row: order.row,
        col: order.col,
        cells: ship.cells.map((c) => ({ row: c.row + dRow, col: c.col + dCol })),
      });
    }

    // Cases déjà tenues par les bateaux qui ne bougent pas.
    const occupied = new Map();
    for (const ship of state.ships) {
      if (intended.has(ship.id)) continue;
      for (const c of ship.cells) occupied.set(`${c.row},${c.col}`, ship.id);
    }

    for (const [shipId, data] of [...intended.entries()]) {
      const blocked = data.cells.some((c) => {
        const key = `${c.row},${c.col}`;
        return occupied.has(key) && occupied.get(key) !== shipId;
      });
      if (blocked) {
        intended.delete(shipId);
        events.push({ type: "moveBlocked", shipId });
      } else {
        for (const c of data.cells) occupied.set(`${c.row},${c.col}`, shipId);
      }
    }

    for (const [shipId, data] of intended.entries()) {
      const ship = shipById.get(shipId);
      ship.row = data.row;
      ship.col = data.col;
      ship.cells = data.cells;
    }

    for (const [shipId, order] of Object.entries(orders || {})) {
      const attacker = shipById.get(shipId);
      if (!attacker || order.type !== "attack") continue;
      if (!isValidAttackOrder(state, attacker, order.row, order.col)) continue;

      const target = state.ships.find(
        (s) =>
          s.player !== attacker.player &&
          s.cells.some((c) => c.row === order.row && c.col === order.col)
      );

      if (!target) {
        events.push({ type: "miss", by: attacker.player, row: order.row, col: order.col });
        continue;
      }

      target.hp -= typeOf(attacker).damage;
      events.push({
        type: "hit",
        by: attacker.player,
        victim: target.player,
        row: order.row,
        col: order.col,
      });

      if (target.hp <= 0) {
        const reward = typeOf(target).scrapReward;
        state.scrap[attacker.player] = (state.scrap[attacker.player] || 0) + reward;
        events.push({
          type: "sunk",
          by: attacker.player,
          victim: target.player,
          typeId: target.typeId,
          scrap: reward,
        });
      }
    }

    state.ships = state.ships.filter((s) => s.hp > 0);
    state.turn += 1;

    return { state, events };
  }

  /*
   * Brouillard de guerre : ne renvoie que ce que `player` a le droit de
   * voir — sa propre île, sa propre flotte, son scrap. Les flottes et
   * bases adverses ne sont pas incluses du tout (elles ne sont donc pas
   * lisibles côté client).
   *
   * La détection approximative des ennemis (et le cas furtif du
   * sous-marin) viendra enrichir cette fonction — c'est le seul endroit
   * à modifier pour ça.
   */
  function viewFor(state, player) {
    const myZone = state.zones.find((z) => z.player === player);
    const myShips = state.ships.filter((s) => s.player === player);

    const cells = [];
    for (let row = 0; row < state.rows; row++) {
      for (let col = 0; col < state.cols; col++) {
        const inMyZone =
          myZone &&
          row >= myZone.row &&
          row < myZone.row + ZONE_SIZE &&
          col >= myZone.col &&
          col < myZone.col + ZONE_SIZE;
        cells.push({ row, col, owner: inMyZone ? player : null });
      }
    }

    return {
      numPlayers: state.numPlayers,
      cols: state.cols,
      rows: state.rows,
      turn: state.turn,
      me: player,
      scrap: state.scrap[player] || 0,
      zones: myZone ? [myZone] : [],
      ships: myShips.map((s) => ({ ...s, cells: s.cells.map((c) => ({ ...c })) })),
      cells,
    };
  }

  return {
    MIN_PLAYERS,
    MAX_PLAYERS,
    ZONE_SIZE,
    HARBOR_DEPTH,
    SHIP_TYPES,
    clamp,
    chebyshevDist,
    boardSizeFor,
    createGame,
    typeOf,
    isLandCell,
    isValidMoveOrder,
    isValidAttackOrder,
    isValidOrder,
    resolveTurn,
    viewFor,
    zoneOwnerFor,
  };
});

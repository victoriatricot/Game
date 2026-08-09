/*
 * Configuration centralisée des types de bateaux.
 * Toutes les valeurs numériques sont des points de départ à équilibrer
 * via les tests, pas des valeurs finales. Modifier uniquement ce fichier
 * pour rééquilibrer — aucune de ces valeurs ne doit être dupliquée ou
 * codée en dur ailleurs dans le code.
 *
 * Champs :
 *   length        cases occupées (alignées, horizontal ou vertical)
 *   hp            points de vie (1 par case tant que non touché)
 *   moveRange     cases de déplacement par tour
 *   attackRange   portée d'attaque en cases
 *   damage        dégâts infligés par tir
 *   scrapCost     coût de reconstruction à la base, en scrap
 *   scrapReward   scrap rapporté quand ce bateau est coulé
 *   detectionType "normal" | "stealth" (voir note d'architecture ci-dessous)
 *   detectionRadius  uniquement pour "stealth" : distance à laquelle un
 *                    bateau ennemi doit se trouver pour le révéler
 *
 * Note d'architecture — détection et "zone approximative" (pour l'étape
 * combat à venir) :
 *   Tant qu'un bateau n'est pas touché, l'adversaire ne doit voir qu'une
 *   zone approximative (même taille visuelle pour tous les types), jamais
 *   sa position exacte. Cette zone doit être calculée à partir d'un
 *   générateur DÉCOUPLÉ de la position réelle du bateau (par ex. une
 *   position/empreinte stable dérivée du bateau, recalculée uniquement
 *   quand il bouge), pour que detectionType puisse changer la règle
 *   d'affichage par type sans dupliquer la logique :
 *     - "normal"  : la zone approximative est révélée dès qu'un
 *                   adversaire explore/voit la case occupée par le bateau.
 *     - "stealth" : le bateau (sous-marin) ne révèle sa zone approximative
 *                   que lorsqu'un bateau ennemi se trouve à
 *                   `detectionRadius` cases ou moins de sa position RÉELLE.
 *                   Il redevient invisible dès que cette condition cesse
 *                   d'être vraie — pas de mémoire de détection passée.
 */
const SHIP_TYPES = [
  {
    id: "destroyer",
    name: "Destroyer",
    code: "DE",
    length: 2,
    hp: 2,
    moveRange: 4,
    attackRange: 1,
    damage: 1,
    scrapCost: 6,
    scrapReward: 3,
    detectionType: "normal",
  },
  {
    id: "submarine",
    name: "Sous-marin",
    code: "SM",
    length: 3,
    hp: 3,
    moveRange: 3,
    attackRange: 2,
    damage: 2,
    scrapCost: 9,
    scrapReward: 5,
    detectionType: "stealth",
    detectionRadius: 2,
  },
  {
    id: "cruiser",
    name: "Croiseur",
    code: "CR",
    length: 3,
    hp: 3,
    moveRange: 3,
    attackRange: 3,
    damage: 2,
    scrapCost: 9,
    scrapReward: 5,
    detectionType: "normal",
  },
  {
    id: "battleship",
    name: "Cuirassé",
    code: "CU",
    length: 4,
    hp: 4,
    moveRange: 2,
    attackRange: 3,
    damage: 3,
    scrapCost: 12,
    scrapReward: 6,
    detectionType: "normal",
  },
  {
    id: "carrier",
    name: "Porte-avions",
    code: "PA",
    length: 5,
    hp: 5,
    moveRange: 2,
    attackRange: 5,
    damage: 1,
    scrapCost: 15,
    scrapReward: 8,
    detectionType: "normal",
  },
];

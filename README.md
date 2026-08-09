# Bataille Navale — Prototype

Prototype jouable en local, sans serveur. Étape 1 : le plateau, les zones de
départ et le brouillard de guerre.

## Lancer le prototype

Aucune dépendance ni build. Ouvre `index.html` dans un navigateur, ou sers le
dossier avec un serveur statique :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Ce qui est fait

- Plateau circulaire (grille CSS carrée découpée en cercle), responsive, dont
  la taille s'adapte au nombre de joueurs (2 à 8, sélecteur en haut).
- Une base par joueur : une île texturée avec un bâtiment de commandement,
  répartie sur un cercle inscrit dans le plateau pour ne jamais dépasser du
  bord ni chevaucher une autre base.
- Brouillard de guerre : bascule "Vue Joueur X" en haut de l'écran pour
  simuler ce que chaque joueur voit — seules sa base et sa flotte sont
  visibles, le reste du plateau est masqué.
- Les 5 types de bateaux par joueur (porte-avions, cuirassé, croiseur,
  sous-marin, destroyer), amarrés en formation fixe dans le port qui entoure
  chaque île. Stats (points de vie, déplacement, portée, dégâts, coûts en
  scrap, type de détection) centralisées dans `ships-config.js` — c'est le
  seul fichier à modifier pour rééquilibrer.
- Tour simultané, version simple pour tester rapidement en hotseat : cliquez
  un de vos bateaux, choisissez "Déplacer" ou "Attaquer", cliquez une case à
  portée, puis "Fin du tour" pour résoudre les ordres de tous les joueurs
  d'un coup (changez de "Vue" pour donner ses ordres à chaque joueur avant de
  finir le tour). Tir à l'aveugle pour l'instant (pas encore de zone de
  détection approximative), et un conflit de déplacement entre deux bateaux
  annule simplement les deux ordres — à raffiner à l'étape combat.

## Prochaines étapes (à valider une par une)

1. Détection approximative (avec le cas particulier du sous-marin furtif) et
   logique touché/coulé case par case, gestion plus fine des collisions de
   déplacement (repousser au lieu d'annuler).
2. Ressources : scrap à la destruction d'un bateau, reconstruction à la base.

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

## Prochaines étapes (à valider une par une)

1. Système de tour simultané : sélection d'une action (déplacement ou
   attaque) par bateau, résolution en fin de tour.
2. Combat : détection approximative (avec le cas particulier du sous-marin
   furtif), tir touché/coulé, gestion des collisions.
3. Ressources : scrap à la destruction d'un bateau, reconstruction à la base.

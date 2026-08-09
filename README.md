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

## Ce qui est fait (étape 1)

- Plateau en grille carrée 16x16 (divs CSS Grid), responsive.
- Une zone de départ 4x4 par joueur (Joueur 1 en bas à gauche, Joueur 2 en
  haut à droite).
- Brouillard de guerre : bascule "Vue Joueur 1 / Joueur 2" en haut de l'écran
  pour simuler ce que chaque joueur voit — seule sa propre zone de départ est
  visible, le reste du plateau est masqué.

## Prochaines étapes (à valider une par une)

1. Placement des bateaux (5 types par joueur) dans leur zone de départ.
2. Système de tour simultané : sélection d'une action (déplacement ou
   attaque) par bateau, résolution en fin de tour.
3. Combat : détection approximative, tir touché/coulé, gestion des
   collisions.
4. Ressources : scrap à la destruction d'un bateau, reconstruction à la base.

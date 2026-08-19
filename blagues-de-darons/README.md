# 🃏 Blagues de Darons

Recueil communautaire de blagues de darons : ajout, thèmes, vote et
classement.

## Principe

- **Thèmes** : chaque blague appartient à un thème (Blagues de bureau,
  Blagues de barbecue, Jeux de mots...). On peut filtrer par thème ou en
  créer un nouveau en ajoutant une blague.
- **Ajout** : n'importe qui peut soumettre une blague avec un thème et,
  optionnellement, un nom d'auteur.
- **Vote** : chaque blague fraîchement ajoutée passe par la case « En
  vote ». Un vote 👍/👎 par visiteur et par blague (mémorisé via un
  identifiant anonyme stocké dans le navigateur, on peut changer d'avis
  ou retirer son vote en recliquant).
- **Classement** : dès qu'une blague atteint **5 votes**, le verdict tombe
  automatiquement : score positif → elle rejoint le classement (🏆),
  score nul ou négatif → elle est recalée (🪦). Le verdict est recalculé
  à chaque nouveau vote, une blague recalée peut donc revenir en grâce si
  elle continue de récolter des votes positifs.

## Lancer en local

```bash
cd blagues-de-darons
npm install
npm start
# puis ouvrir http://localhost:3001
```

## Architecture

| Fichier | Rôle |
| --- | --- |
| `server.js` | API Express (thèmes, blagues, votes) + sert le frontend statique. |
| `data/jokes.json` | Stockage des blagues (fichier JSON, pas de base de données pour ce prototype). |
| `data/themes.json` | Liste des thèmes de départ. |
| `public/` | Frontend statique (HTML/CSS/JS vanilla, sans framework). |

Les données vivent dans un fichier JSON sur le disque : simple pour un
prototype, mais non adapté à un déploiement multi-instances ou à un disque
éphémère (ex. certains hébergeurs redéploient un système de fichiers propre
à chaque build). Pour une mise en prod durable, migrer vers une vraie base
de données (SQLite/PostgreSQL).

## Idées d'évolution

- Modération (signaler une blague, suppression par un admin).
- Pagination pour le classement quand il y aura beaucoup de blagues.
- Partage d'une blague (lien direct, capture d'écran).
- Comptes utilisateurs pour un historique de contributions.

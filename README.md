# Bataille Navale — Prototype

Jeu de bataille navale multijoueur à tours simultanés.

## Jouer

### En ligne (multijoueur)

Nécessite le serveur de jeu (voir « Lancer le serveur » plus bas). Un joueur
crée un salon, obtient un code à 4 lettres, les autres le rejoignent avec ce
code, puis l'hôte lance la partie.

### En local (hotseat)

**https://victoriatricot.github.io/Game/** — la version publiée sur GitHub
Pages est un site statique : le multijoueur en ligne y est indisponible
(pas de serveur), mais la partie locale sur un seul écran fonctionne. Chaque
joueur donne ses ordres à son tour via la bascule « Vue », puis « Fin du
tour » résout tout simultanément.

## Lancer le serveur en local

```bash
npm install
npm start
# puis ouvrir http://localhost:3000
```

Le serveur sert aussi les fichiers statiques, donc une seule commande suffit
pour avoir le jeu complet en local.

## Déployer le serveur sur Railway

Le dépôt est prêt pour Railway : `railway.json` fixe la commande de
démarrage et la sonde de santé, et le serveur écoute sur `process.env.PORT`
comme l'exige la plateforme.

```bash
npm install -g @railway/cli
railway login
railway init      # à lancer depuis ce dossier
railway up        # build et déploiement
railway domain    # génère l'URL publique
```

Le service héberge le jeu **entier** (serveur de partie + fichiers
statiques) : l'URL renvoyée par `railway domain` suffit pour jouer, rien
d'autre à configurer.

Vérifier que tout tourne : `https://VOTRE-URL/healthz` doit répondre
`{"status":"ok",...}`.

### Et la version GitHub Pages ?

GitHub Pages est un hébergeur statique : il ne peut pas faire tourner le
serveur, donc le multijoueur en ligne y est indisponible par défaut (la
partie locale, elle, fonctionne). Deux options :

- utiliser directement l'URL Railway, qui sert déjà tout ;
- ou pointer la version Pages vers le serveur Railway en ajoutant le
  paramètre `?server=` à l'adresse :
  `https://victoriatricot.github.io/Game/?server=VOTRE-URL.up.railway.app`

### Base de données

Pas encore nécessaire : les parties vivent en mémoire et une partie perdue
au redémarrage n'est pas un drame à ce stade. Quand la persistance
deviendra utile (reprendre une partie, comptes joueurs), `railway add`
permet d'ajouter un PostgreSQL au projet, et Railway injecte alors
`DATABASE_URL` dans l'environnement du serveur.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `ships-config.js` | Stats des 5 types de bateaux. **Seul fichier à modifier pour rééquilibrer.** |
| `game-core.js` | Logique de jeu pure (plateau, ordres, résolution des tours, brouillard de guerre). Partagée serveur/navigateur, sans dépendance au DOM. |
| `server/server.js` | Serveur autoritaire : salons, WebSocket, arbitrage des tours. |
| `railway.json` | Configuration de déploiement Railway. |
| `script.js` | Client : rendu et interactions. |
| `index.html`, `style.css` | Interface. |

### Le serveur fait autorité — et pourquoi c'est indispensable

L'état réel de la partie ne quitte jamais le serveur. Chaque client reçoit
uniquement `viewFor(state, sonJoueur)` : sa propre base, sa propre flotte,
son scrap. Les positions adverses ne sont pas envoyées du tout.

C'est structurant pour ce jeu : le brouillard de guerre et le sous-marin
furtif sont des mécaniques centrales. Si le navigateur connaissait toute la
partie (avec un simple masquage à l'affichage), n'importe qui pourrait lire
les positions ennemies dans les outils développeur et ces mécaniques
n'auraient plus aucun sens.

Dans le même esprit, tous les ordres sont **revalidés côté serveur** : un
client ne peut ni donner d'ordre à un bateau adverse, ni dépasser la portée
de déplacement ou de tir de ses propres bateaux. Les tentatives sont
silencieusement ignorées.

## Ce qui est fait

- Plateau circulaire dont la taille s'adapte au nombre de joueurs (2 à 8).
- Une base par joueur : île texturée avec bâtiment de commandement, répartie
  sur un cercle inscrit dans le plateau.
- Brouillard de guerre appliqué à la source (serveur), pas à l'affichage.
- Les 5 types de bateaux, amarrés en formation fixe dans le port de chaque
  île, avec leurs stats propres.
- Tours simultanés : chaque joueur donne un ordre par bateau (déplacement ou
  attaque), la résolution a lieu quand tout le monde a validé.
- Combat : dégâts, coulage, scrap gagné à la destruction.
- Multijoueur en ligne par salons (WebSocket), avec repli automatique en
  mode local si aucun serveur n'est joignable.

## Prochaines étapes

1. **Détection approximative** : afficher les ennemis repérés comme une zone
   floue plutôt que rien, avec le cas particulier du sous-marin furtif
   (`detectionType` est déjà prévu dans `ships-config.js`). Tout se joue
   dans `viewFor()`.
2. **Touché-coulé** : immobiliser un bateau touché, révéler sa position
   exacte, exiger de viser les cases restantes.
3. **Collisions** : repousser vers une case libre au lieu d'annuler le
   déplacement.
4. **Reconstruction** : dépenser le scrap à la base pour reconstruire un
   bateau.
5. **Persistance** : base PostgreSQL et déploiement du serveur sur Railway
   (les parties sont actuellement en mémoire — un redémarrage les perd).

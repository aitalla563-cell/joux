# 🏍️ LIVREUR RUSH: MOROCCO — مول التوصيل 3D

لعبة توصيل طعام ثلاثية الأبعاد في مدينة مغربية (Three.js + Vite) مع لعب جماعي عبر Socket.IO.
Jeu 3D de livraison de repas dans une ville marocaine (Three.js + Vite), avec multijoueur Socket.IO.

## Lancer le jeu / Lancement

```bash
npm install
npm run dev            # http://localhost:3000
```

## Multijoueur / اللعب الجماعي

```bash
cd server && npm install && cd ..
npm run server         # écoute sur le port 3001
```

Copiez `.env.example` vers `.env` pour changer `VITE_SERVER_URL` (côté jeu) ou
`SERVER_PORT`, `MAX_PLAYERS_PER_ROOM` (côté serveur). L'URL du serveur peut aussi être saisie dans
**الإعدادات / Settings**.

## Contrôles / التحكم

| Action | Clavier | Mobile |
|---|---|---|
| تسارع / Accélérer | W / ↑ | زر على الشاشة |
| فرامل / Freiner | S / ↓ | زر على الشاشة |
| يمين-يسار / Direction | A D / ← → | زر على الشاشة |
| منبه / Klaxon | H | 📯 |
| كاميرا / Caméra | C | — |
| إيقاف / Pause | Échap | ⏸ |

## Structure

- `src/game/` : boucle de jeu (`Game.js`), moto, physique, caméra, entrées, sons
- `src/world/` : routes, bâtiments, trafic, obstacles, piétons, météo, jour/nuit
- `src/missions/` : commandes, satisfaction client, événements, missions
- `src/ui/UIManager.js` : HUD, pause, résultats, garage, réglages (le HTML est dans `index.html`)
- `src/multiplayer/` : client Socket.IO, salles, joueurs distants
- `server/` : serveur Socket.IO (salles, course de 180 s, classement)

## Protocole multijoueur

Client → serveur : `create_room`, `join_room`, `find_room`, `start_game`, `player_state`, `delivery_complete`, `leave_room`
Serveur → client : `room_created`, `room_joined`, `player_joined`, `player_left`, `game_start`, `game_state` (20 Hz), `race_end`, `error`

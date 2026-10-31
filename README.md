# Mafia After Dark — play Mafia online with friends

A real-time, browser-based Mafia game built with React, Vite, Express, and Socket.IO. It uses room codes and private role/action messages; no account or database is required for a casual game.

## Features

- Create a private room and invite friends with a 6-character room code.
- 5–15 players per room.
- Secret role assignment: Thief, Police, Doctor, Villager.
- Night actions: Thieves choose a target, Police investigate, Doctor protects.
- Day discussion, host-controlled voting, automatic vote resolution, win detection, and restart.
- Responsive desktop/mobile interface.
- Role identities are not included in the public room state during the game.

## Rules implemented

- 5–7 players: 1 Thief, 1 Police, 1 Doctor, remaining players are Villagers.
- 8–15 players: 2 Thieves, 1 Police, 1 Doctor, remaining players are Villagers.
- Villagers win when all Thieves are eliminated.
- Thieves win when living Thieves equal or outnumber all other living players.
- The Doctor can protect themself. Other roles cannot target themselves.
- If multiple Thieves choose different targets, the most-selected target is attacked; ties are random.
- Vote ties result in no elimination.
- The host is a normal player and receives a random role like everyone else.
- Players should use voice/video or a separate group chat for discussion. This website does not provide voice chat.

## Requirements

- Node.js 20 or newer
- npm
- A modern browser

## Run locally

1. Extract this project ZIP.
2. Open a terminal in the project folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the backend and frontend together:

   ```bash
   npm run dev
   ```

5. Open **http://localhost:5173**.
6. Create a room. Open the same URL in other browser tabs/devices and join using the room code. For friends on other networks, deploy the project (see below); localhost is only available on your own device/network unless you configure networking.

The frontend runs on port `5173`; the Socket.IO server runs on port `3001`.

## Deploy to a public website with Render

This project includes `render.yaml` for a single web service.

1. Create a GitHub account if needed and install Git.
2. Create a new GitHub repository, for example `mafia-after-dark`.
3. Extract the ZIP and upload/push all project files to the repository. Do **not** upload `node_modules`.
4. Sign in to [Render](https://render.com/).
5. Choose **New + → Blueprint** and connect the GitHub repository containing `render.yaml`. Alternatively, create a **Web Service** from the repository and use the settings below.
6. Use these settings if creating the service manually:
   - **Runtime:** Node
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Environment variable:** `NODE_ENV=production`
   - **Node version:** 20 or newer
7. Deploy and wait for the build to finish. Open the `https://...onrender.com` URL Render provides.
8. Send that URL and the in-game room code to friends. Everyone can join from their own device.

Free hosting plans and provider policies can change; the service may sleep when idle or have usage limits. The first connection after inactivity may take a little longer.

## Alternative deployment

Any Node hosting provider that supports long-lived WebSocket connections can host this app. Set the build command to `npm install && npm run build`, start command to `npm start`, and `NODE_ENV=production`. The service must support Socket.IO/WebSocket connections and serve the built `dist` directory.

## Troubleshooting

- **“Cannot connect to the game server” locally:** run `npm run dev` from the project directory and check that ports 5173 and 3001 are free.
- **Room not found:** check the six-character room code and make sure the host still has the room open.
- **Can't start:** at least five connected players are required.
- **Friend cannot join from another network:** `localhost` is not public. Deploy the project and use the hosted URL.
- **Refresh/disconnect:** this starter version does not support reconnecting a player to their existing seat after a browser refresh. Avoid refreshing during a game; the disconnected seat remains in the room until the game ends/restarts.
- **Public deployment:** rooms are unlisted but not password-protected. Anyone who knows a room code may attempt to join while the lobby is open. Do not use real personal or sensitive information in player names.

## Notes / next improvements

For a larger public release, consider adding reconnect tokens, rate limiting, room expiry, automated tests, configurable role counts, optional timers, and persistent game storage. This starter is designed for private games with friends, not as a hardened competitive service.

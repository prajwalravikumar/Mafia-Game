const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.NODE_ENV === "production" ? false : "*" }
});

const PORT = process.env.PORT || 3001;
const rooms = new Map();
const ROLES = { THIEF: "Thief", POLICE: "Police", DOCTOR: "Doctor", VILLAGER: "Villager" };

function makeCode() {
  let code;
  do { code = crypto.randomBytes(3).toString("hex").toUpperCase(); } while (rooms.has(code));
  return code;
}
function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 20);
}
function roomFor(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}
function playerFor(room, socketId) {
  return room?.players.find(p => p.id === socketId);
}
function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
  for (const p of room.players) {
    io.to(p.id).emit("game:private", {
      role: p.role || null,
      alive: p.alive,
      actionSubmitted: Boolean(room.actions[p.id]),
      isHost: p.id === room.hostId
    });
  }
}
function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    phase: room.phase,
    round: room.round,
    players: room.players.map(p => ({
      id: p.id, name: p.name, alive: p.alive,
      connected: p.connected,
      roleRevealed: room.status === "ended" ? p.role : undefined
    })),
    events: room.events.slice(-12),
    winner: room.winner,
    message: room.message,
    phaseEndsAt: room.phaseEndsAt || null
  };
}
function announce(room, message) {
  room.message = message;
  room.events.push({ id: crypto.randomUUID(), text: message, at: Date.now() });
  if (room.events.length > 40) room.events.shift();
}
function roleCounts(count) {
  // One killer for 5–7 players, two for 8+; police and doctor are always included.
  return { thief: count >= 8 ? 2 : 1, police: 1, doctor: 1 };
}
function assignRoles(room) {
  const counts = roleCounts(room.players.length);
  const roles = [
    ...Array(counts.thief).fill(ROLES.THIEF),
    ROLES.POLICE, ROLES.DOCTOR
  ];
  while (roles.length < room.players.length) roles.push(ROLES.VILLAGER);
  for (let i = roles.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  room.players.forEach((p, i) => { p.role = roles[i]; p.alive = true; });
}
function alivePlayers(room) { return room.players.filter(p => p.alive); }
function endIfWon(room) {
  const alive = alivePlayers(room);
  const thieves = alive.filter(p => p.role === ROLES.THIEF).length;
  const others = alive.length - thieves;
  if (thieves === 0) {
    room.status = "ended"; room.phase = "ended"; room.winner = "villagers";
    announce(room, "The villagers have eliminated every Thief. The village wins!");
    return true;
  }
  if (thieves >= others) {
    room.status = "ended"; room.phase = "ended"; room.winner = "thieves";
    announce(room, "The Thieves have reached parity and taken over the village!");
    return true;
  }
  return false;
}
function startNight(room) {
  room.phase = "night";
  room.round += 1;
  room.actions = {};
  room.votes = {};
  room.phaseEndsAt = null;
  announce(room, `Night ${room.round} begins. Everyone close your eyes and submit your secret action.`);
  emitRoom(room);
}
function resolveNight(room) {
  const alive = alivePlayers(room);
  const thieves = alive.filter(p => p.role === ROLES.THIEF);
  const thiefTargets = thieves.map(p => room.actions[p.id]?.targetId).filter(Boolean);
  // If multiple thieves choose different targets, the most-voted target is selected; ties are random.
  const tally = {};
  thiefTargets.forEach(id => { tally[id] = (tally[id] || 0) + 1; });
  const max = Math.max(0, ...Object.values(tally));
  const candidates = Object.keys(tally).filter(id => tally[id] === max && max > 0);
  const victimId = candidates.length ? candidates[crypto.randomInt(candidates.length)] : null;
  const doctor = alive.find(p => p.role === ROLES.DOCTOR);
  const protectedId = doctor ? room.actions[doctor.id]?.targetId : null;
  const victim = victimId ? playerFor(room, victimId) : null;
  if (victim && victim.alive && victim.id !== protectedId) {
    victim.alive = false;
    announce(room, `${victim.name} was found eliminated this morning.`);
  } else if (victim && victim.id === protectedId) {
    announce(room, "Someone was targeted, but the Doctor saved them. Nobody was eliminated.");
  } else {
    announce(room, "The night passed quietly. Nobody was eliminated.");
  }
  // Police receives a private result only; never expose it in the public room state.
  const police = room.players.find(p => p.alive && p.role === ROLES.POLICE);
  if (police) {
    const targetId = room.actions[police.id]?.targetId;
    const target = targetId ? playerFor(room, targetId) : null;
    io.to(police.id).emit("police:result", target && target.id !== police.id
      ? { name: target.name, isThief: target.role === ROLES.THIEF, round: room.round }
      : { name: null, isThief: null, round: room.round });
  }
  if (endIfWon(room)) { emitRoom(room); return; }
  room.phase = "day";
  room.actions = {};
  room.votes = {};
  announce(room, "Daytime: discuss what happened, then the host can open the vote.");
  emitRoom(room);
}
function resolveVote(room) {
  const eligible = alivePlayers(room);
  const counts = {};
  for (const p of eligible) {
    const target = room.votes[p.id];
    if (target && eligible.some(t => t.id === target && target !== p.id)) counts[target] = (counts[target] || 0) + 1;
  }
  const max = Math.max(0, ...Object.values(counts));
  const candidates = Object.keys(counts).filter(id => counts[id] === max && max > 0);
  if (!candidates.length) {
    announce(room, "The vote ended in a tie or no valid votes. Nobody was eliminated.");
  } else {
    const chosenId = candidates[crypto.randomInt(candidates.length)];
    const chosen = playerFor(room, chosenId);
    if (chosen) {
      chosen.alive = false;
      announce(room, `${chosen.name} was voted out. Their role was ${chosen.role}.`);
    }
  }
  if (endIfWon(room)) { emitRoom(room); return; }
  startNight(room);
}
function leaveRoom(socket, announceLeave = true) {

  const code = socket.data.roomCode;

  if (!code) return;

  const room = rooms.get(code);

  // Remove socket from the Socket.IO room
  socket.leave(code);

  // Clear the player's current room reference
  socket.data.roomCode = null;

  if (!room) return;

  // Find the player who is leaving
  const playerIndex = room.players.findIndex(
    p => p.id === socket.id
  );

  if (playerIndex === -1) return;

  const player = room.players[playerIndex];

  // During the lobby, completely remove the player
  if (room.status === "lobby") {

    // Remove player name, socket ID and player record
    room.players.splice(playerIndex, 1);

    if (announceLeave) {
      announce(room, `${player.name} left the room.`);
    }

  } else {

    // During an active game, retain their seat
    // to avoid disrupting the ongoing game.
    player.connected = false;

    if (announceLeave) {
      announce(room, `${player.name} disconnected.`);
    }

  }

  // Delete the room if nobody remains
  if (room.players.length === 0) {

    rooms.delete(code);

    return;
  }

  // Transfer host privileges if the host leaves
  if (room.hostId === socket.id) {

    const nextHost = room.players.find(
      p => p.connected
    );

    room.hostId = nextHost?.id || null;

  }

  // Send updated room information to remaining players
  emitRoom(room);

}
io.on("connection", socket => {
  socket.on("room:create", ({ name }, cb = () => {}) => {
    const playerName = cleanName(name);
    if (!playerName) return cb({ error: "Enter a name first." });
    if (socket.data.roomCode) leaveRoom(socket, false);
    const code = makeCode();
    const room = {
      code, hostId: socket.id, status: "lobby", phase: "lobby", round: 0,
      players: [{ id: socket.id, name: playerName, alive: true, connected: true, role: null }],
      events: [], actions: {}, votes: {}, winner: null, message: "Waiting for friends to join."
    };
    rooms.set(code, room);
    socket.join(code); socket.data.roomCode = code;
    announce(room, `${playerName} created the room.`);
    emitRoom(room);
    cb({ code });
  });

  socket.on("room:join", ({ code, name }, cb = () => {}) => {
    const playerName = cleanName(name);
    const roomCode = String(code || "").trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!playerName) return cb({ error: "Enter a name first." });
    if (!room) return cb({ error: "Room not found. Check the code." });
    if (room.status !== "lobby") return cb({ error: "This game has already started." });
    if (room.players.length >= 15) return cb({ error: "This room is full (15 players maximum)." });
    // Remove stale disconnected players before checking names
    if (room.status === "lobby") {

      room.players = room.players.filter(p => {

        const oldSocket = io.sockets.sockets.get(p.id);

        return oldSocket && oldSocket.connected;

      });

    }

    // Check whether the name is already being used
    const duplicatePlayer = room.players.find(
      p => p.name.toLowerCase() === playerName.toLowerCase()
    );

    if (duplicatePlayer) {

      return cb({
        error: "That name is already in use in this room."
      });

    }
    if (socket.data.roomCode) leaveRoom(socket, false);
    room.players.push({ id: socket.id, name: playerName, alive: true, connected: true, role: null });
    socket.join(roomCode); socket.data.roomCode = roomCode;
    announce(room, `${playerName} joined the room.`);
    emitRoom(room);
    cb({ code: roomCode });
  });

  socket.on("game:start", (_, cb = () => {}) => {
    const room = roomFor(socket);
    if (!room) return cb({ error: "Join a room first." });
    if (room.hostId !== socket.id) return cb({ error: "Only the host can start the game." });
    if (room.status !== "lobby") return cb({ error: "The game has already started." });
    const connected = room.players.filter(p => p.connected);
    if (connected.length < 5) return cb({ error: "At least 5 players are needed to start." });
    room.players = connected;
    room.status = "playing";
    assignRoles(room);
    announce(room, "Roles have been assigned privately. Night falls!");
    startNight(room);
    emitRoom(room);
    cb({ ok: true });
  });

  socket.on("game:action", ({ targetId }, cb = () => {}) => {
    const room = roomFor(socket);
    const player = room && playerFor(room, socket.id);
    if (!room || room.status !== "playing" || room.phase !== "night") return cb({ error: "Night actions are not open." });
    if (!player?.alive) return cb({ error: "Eliminated players cannot act." });
    if (![ROLES.THIEF, ROLES.POLICE, ROLES.DOCTOR].includes(player.role)) return cb({ error: "Your role has no night action." });
    const target = playerFor(room, targetId);
    if (!target || !target.alive) return cb({ error: "Choose a living player." });
    if (target.id === player.id && player.role !== ROLES.DOCTOR) return cb({ error: "You cannot target yourself." });
    if (player.role === ROLES.THIEF && target.role === ROLES.THIEF) return cb({ error: "Thieves cannot target another Thief." });
    room.actions[player.id] = { targetId };
    emitRoom(room);
    cb({ ok: true });
    const required = alivePlayers(room).filter(p => [ROLES.THIEF, ROLES.POLICE, ROLES.DOCTOR].includes(p.role));
    if (required.every(p => room.actions[p.id])) resolveNight(room);
  });

  socket.on("game:open-vote", (_, cb = () => {}) => {
    const room = roomFor(socket);
    if (!room || room.status !== "playing" || room.phase !== "day") return cb({ error: "Voting can only open during the day." });
    if (room.hostId !== socket.id) return cb({ error: "Only the host can open voting." });
    room.phase = "vote"; room.votes = {};
    announce(room, "Voting is open. Vote for one living player to eliminate.");
    emitRoom(room); cb({ ok: true });
  });

  socket.on("game:vote", ({ targetId }, cb = () => {}) => {
    const room = roomFor(socket);
    const player = room && playerFor(room, socket.id);
    if (!room || room.status !== "playing" || room.phase !== "vote") return cb({ error: "Voting is not open." });
    if (!player?.alive) return cb({ error: "Eliminated players cannot vote." });
    const target = playerFor(room, targetId);
    if (!target?.alive || target.id === player.id) return cb({ error: "Choose another living player." });
    room.votes[player.id] = targetId;
    emitRoom(room); cb({ ok: true });
    if (alivePlayers(room).every(p => room.votes[p.id])) resolveVote(room);
  });

  socket.on("game:skip-vote", (_, cb = () => {}) => {
    const room = roomFor(socket);
    if (!room || room.hostId !== socket.id || room.phase !== "vote") return cb({ error: "Only the host can close the vote." });
    resolveVote(room);
    cb({ ok: true });
  });

  socket.on("game:restart", (_, cb = () => {}) => {
    const room = roomFor(socket);
    if (!room || room.hostId !== socket.id) return cb({ error: "Only the host can restart." });
    room.status = "lobby"; room.phase = "lobby"; room.round = 0; room.winner = null;
    room.actions = {}; room.votes = {}; room.phaseEndsAt = null;
    room.players = room.players.filter(p => p.connected).map(p => ({ ...p, role: null, alive: true }));
    announce(room, "A new game is ready. The host can start when everyone is set.");
    emitRoom(room); cb({ ok: true });
  });
  
  socket.on("room:leave", (_, cb = () => {}) => {

    if (!socket.data.roomCode) {
      return cb({ error: "You are not in a room." });
    }

    leaveRoom(socket, true);

    cb({ ok: true });

  });

  socket.on("disconnect", () => leaveRoom(socket));
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  app.get("/", (req, res) => res.json({ app: "Mafia After Dark", status: "ok", hint: "Run the Vite client on port 5173." }));
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Mafia server listening on ${PORT}`);
});

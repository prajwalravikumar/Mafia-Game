import React, { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const socket = io(
  import.meta.env.PROD
    ? window.location.origin
    : `${window.location.protocol}//${window.location.hostname}:3001`,
  {
  autoConnect: true,
  transports: ["websocket", "polling"]
});
const roleInfo = {
  Thief: { emoji: "🗡️", description: "Choose a player to eliminate each night. Stay hidden during the day." },
  Police: { emoji: "🕵️", description: "Investigate one living player each night. Your result is private." },
  Doctor: { emoji: "🩺", description: "Protect one living player each night. You may protect yourself." },
  Villager: { emoji: "🏡", description: "No night action. Discuss clues and vote to find the Thief." }
};

export default function App() {
  const [name, setName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState(null);
  const [privateInfo, setPrivateInfo] = useState({ role: null, alive: true, actionSubmitted: false, isHost: false });
  const [selectedTarget, setSelectedTarget] = useState("");
  const [policeResult, setPoliceResult] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    socket.on("room:update", setRoom);
    socket.on("game:private", setPrivateInfo);
    socket.on("police:result", result => setPoliceResult(result));
    socket.on("connect_error", () => setError("Cannot connect to the game server. Check that the server is running."));
    return () => {
      socket.off("room:update");
      socket.off("game:private");
      socket.off("police:result");
      socket.off("connect_error");
    };
  }, []);

  const me = room?.players.find(p => p.id === socket.id);
  const livingTargets = useMemo(() => (room?.players || []).filter(p =>
    p.alive && p.id !== socket.id || (p.alive && privateInfo.role === "Doctor" && p.id === socket.id)
  ), [room, privateInfo.role]);
  const isHost = Boolean(room && room.hostId === socket.id);
  const isPlaying = room?.status === "playing";
  const role = privateInfo.role;
  const canNightAct = isPlaying && room.phase === "night" && privateInfo.alive && ["Thief", "Police", "Doctor"].includes(role);
  const canVote = isPlaying && room.phase === "vote" && privateInfo.alive;

  function runAction(event, payload = {}) {
    setError(""); setNotice("");
    socket.emit(event, payload, result => {
      if (result?.error) setError(result.error);
      else if (result?.ok) setNotice("Done!");
      else if (result?.code) setNotice(`Room ${result.code} is ready.`);
    });
  }
  function createRoom() {
    setError("");
    socket.emit("room:create", { name }, result => {
      if (result?.error) setError(result.error);
      else setNotice(`Room created: ${result.code}`);
    });
  }
  function joinRoom() {
    setError(""); setNotice("");
    socket.emit("room:join", { name, code: roomCodeInput }, result => {
      if (result?.error) setError(result.error);
      else setNotice(`Joined room ${result.code}.`);
    });
  }
  async function copyInvite() {
    const invite = `${window.location.origin} — Room code: ${room?.code}`;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice(`Share this site with friends and give them room code ${room?.code}.`);
    }
  }
  function submitNightAction() {
    if (!selectedTarget) return setError("Select a player first.");
    runAction("game:action", { targetId: selectedTarget });
    setSelectedTarget("");
  }
  function submitVote() {
    if (!selectedTarget) return setError("Select a player first.");
    runAction("game:vote", { targetId: selectedTarget });
    setSelectedTarget("");
  }

  if (!room) return (
    <main className="shell">
      <header className="brand"><div className="brand-icon">☾</div><div><div className="eyebrow">THE GOCHU GAME</div><h1>Kamakshipalya Mafia</h1></div></header>
      <section className="hero">
        <div className="hero-copy">
          <div className="pill"><span className="pulse"/> UP TO 15 PLAYERS</div>
          <h2>Trust no one.<br/><em>All are Gochurams</em></h2>
          <p>Find the Gochu killer in Kamakshipalya. Talk, bluff, investigate, and survive the night.</p>
          <div className="role-strip"><span>🗡️ Thief</span><span>🕵️ Police</span><span>🩺 Doctor</span><span>🏡 Villagers</span></div>
        </div>
        <div className="entry-card">
          <div className="card-top"><span className="eyebrow">ENTER THE VILLAGE</span><span className="moon">☾</span></div>
          <label>Your player name</label>
          <input value={name} maxLength={20} onChange={e => setName(e.target.value)} placeholder="e.g. Alex" onKeyDown={e => e.key === "Enter" && createRoom()}/>
          <button className="primary full" onClick={createRoom}>＋ Create a room</button>
          <div className="or"><span/> OR JOIN YOUR FRIENDS <span/></div>
          <label>Room code</label>
          <div className="join-row"><input value={roomCodeInput} maxLength={6} onChange={e => setRoomCodeInput(e.target.value.toUpperCase())} placeholder="ABC123"/><button className="secondary" onClick={joinRoom}>Join</button></div>
          {error && <div className="alert">{error}</div>}
          <p className="fine-print">No account needed. Pick a name, invite your friends, and play.</p>
        </div>
      </section>
      <footer>KAMAKSHIPALYA MAFIA <span>•</span> THE GOCHU GAME</footer>
    </main>
  );

  return (
    <main className="shell app-shell">
      <header className="topbar">
        <div className="brand small-brand"><div className="brand-icon">☾</div><div><div className="eyebrow">THE GOCHU GAME</div><h1> Kamakshipalya Mafia</h1></div></div>
        <div className="room-chip"><span className="live-dot"/><span>ROOM</span><strong>{room.code}</strong><button title="Copy invite" onClick={copyInvite}>⧉</button></div>
      </header>
      <div className="game-layout">
        <section className="main-panel">
          <div className="phase-banner">
            <div className="phase-icon">{room.phase === "night" ? "🌙" : room.phase === "vote" ? "⚖️" : room.phase === "ended" ? "🏆" : "☀️"}</div>
            <div><div className="eyebrow">ROUND {room.round || "—"}</div><h2>{room.status === "lobby" ? "Waiting for the Players" : room.phase === "night" ? "Night has fallen" : room.phase === "vote" ? "Time to vote" : room.phase === "ended" ? "Game over" : "The village awakens"}</h2><p>{room.message}</p></div>
          </div>

          {room.status === "lobby" && <section className="section-card">
            <div className="section-heading"><h3>Players in the lobby</h3><span className="count">{room.players.length}/15</span></div>
            <p className="muted">Share the room code with your friends. At least 5 connected players are needed.</p>
            <PlayerGrid room={room} me={me}/>
            {isHost ? <button className="primary full start-button" disabled={room.players.length < 5} onClick={() => runAction("game:start")}>Deal the roles <span>→</span></button> : <div className="waiting-note"><span className="pulse"/> Waiting for the host to start…</div>}
          </section>}

          {isPlaying && <section className="section-card">
            <div className="section-heading"><h3>Players</h3><span className="count">{room.players.filter(p=>p.alive).length} alive</span></div>
            <PlayerGrid room={room} me={me} showStatus/>
            {role && <div className={`role-card role-${role.toLowerCase()}`}>
              <div className="role-emoji">{roleInfo[role]?.emoji}</div><div><div className="eyebrow">YOUR SECRET ROLE</div><h3>{role}</h3><p>{roleInfo[role]?.description}</p></div>
              {privateInfo.actionSubmitted && room.phase === "night" && <span className="submitted">Action sent ✓</span>}
            </div>}
            {!privateInfo.alive && <div className="alert">You have been eliminated. You can watch the rest of the game, but cannot act or vote.</div>}
            {canNightAct && <div className="action-box">
              <h3>{role === "Thief" ? "Choose your target" : role === "Police" ? "Choose someone to investigate" : "Choose someone to protect"}</h3>
              <p className="muted">Your choice is secret. Other players cannot see it.</p>
              <select value={selectedTarget} onChange={e=>setSelectedTarget(e.target.value)}><option value="">Select a living player…</option>{livingTargets.map(p=><option key={p.id} value={p.id}>{p.name}{p.id===socket.id?" (you)":""}</option>)}</select>
              <button className="primary" onClick={submitNightAction} disabled={privateInfo.actionSubmitted}>Confirm secret action</button>
            </div>}
            {role === "Police" && policeResult && <div className="result-box"><strong>🕵️ Private investigation result</strong><p>{policeResult.name ? `${policeResult.name} ${policeResult.isThief ? "is a Thief." : "is not a Thief."}` : "No result available for that round."}</p></div>}
            {room.phase === "day" && <div className="action-box">
              <h3>Discuss with your friends</h3><p className="muted">Talk out loud or use your group chat. When everyone is ready, the host can open voting.</p>
              {isHost ? <button className="primary" onClick={()=>runAction("game:open-vote")}>Open voting →</button> : <div className="waiting-note">The host will open voting when discussion is done.</div>}
            </div>}
            {canVote && <div className="action-box">
              <h3>Who do you suspect?</h3><p className="muted">Your vote is visible only as a tally after it is resolved.</p>
              <select value={selectedTarget} onChange={e=>setSelectedTarget(e.target.value)}><option value="">Choose a player to vote out…</option>{livingTargets.filter(p => p.id !== socket.id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <button className="primary" onClick={submitVote}>Cast vote</button>
            </div>}
            {room.phase === "vote" && isHost && <button className="secondary full" onClick={()=>runAction("game:skip-vote")}>Close vote early</button>}
          </section>}

          {room.status === "ended" && <section className="section-card end-card">
            <div className="win-emoji">{room.winner === "villagers" ? "🏡" : "🗡️"}</div>
            <h2>{room.winner === "villagers" ? "The village is safe!" : "The Thieves win!"}</h2>
            <p className="muted">Here are everyone's roles:</p>
            <div className="role-reveal">{room.players.map(p=><div className="reveal-row" key={p.id}><span>{roleInfo[p.roleRevealed]?.emoji} {p.name}</span><strong>{p.roleRevealed}</strong></div>)}</div>
            {isHost && <button className="primary full" onClick={()=>runAction("game:restart")}>Play another round ↻</button>}
          </section>}
        </section>
        <aside className="side-panel">
          <section className="section-card side-card">
            <div className="section-heading"><h3>Village feed</h3><span className="live-label"><span className="live-dot"/> LIVE</span></div>
            <div className="feed">{[...(room.events || [])].reverse().map(event=><div className="feed-item" key={event.id}><span className="feed-dot"/><p>{event.text}</p></div>)}</div>
          </section>
          <section className="section-card side-card rules">
            <h3>How to win</h3>
            <div className="rule"><span>🏡</span><p><strong>Villagers</strong><br/>Vote out every Thief.</p></div>
            <div className="rule"><span>🗡️</span><p><strong>Thieves</strong><br/>Survive until you equal or outnumber the other living players.</p></div>
            <p className="tiny">Night actions are private. Discuss by voice or your own group chat; this site handles roles, actions, and votes.</p>
          </section>
          {isHost && room.status !== "lobby" && <button className="secondary full" onClick={()=>runAction("game:restart")}>Restart game ↻</button>}
          {copied && <div className="success">Invite copied!</div>}
          {error && <div className="alert">{error}</div>}
          {notice && <div className="success">{notice}</div>}
          <button
          className="text-button"
            onClick={() => {

              setError("");
              setNotice("");

              socket.emit("room:leave", {}, (result) => {

                if (result?.error) {
                  setError(result.error);
                  return;
                }

                // Clear local game state
                setRoom(null);

                setPrivateInfo({
                  role: null,
                  alive: true,
                  actionSubmitted: false,
                  isHost: false
                });

                setPoliceResult(null);
                setSelectedTarget("");

                setNotice("You have successfully left the room.");

              });

            }}
          >
            Leave Room
          </button>
        </aside>
      </div>
      <footer>KAMAKSHIPALYA MAFIA<span>•</span> KEEP YOUR ROLE SECRET</footer>
    </main>
  );
}

function PlayerGrid({ room, me, showStatus = false }) {
  return <div className="player-grid">{room.players.map((p, i) => <div key={p.id} className={`player-tile ${!p.alive && showStatus ? "dead" : ""} ${p.id === me?.id ? "is-me" : ""}`}>
    <div className="avatar">{p.name.slice(0,1).toUpperCase()}</div><div className="player-name">{p.name}{p.id === me?.id ? " (you)" : ""}</div>
    <div className="player-status">{showStatus ? (!p.alive ? "ELIMINATED" : p.connected ? "IN THE GAME" : "DISCONNECTED") : (p.connected ? "READY" : "OFFLINE")}</div>
  </div>)}</div>;
}

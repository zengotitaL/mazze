"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { SIZE, canMove } from "../../../lib/maze";

export default function PlayPage({ params }) {
  const { code } = params;
  const [game, setGame] = useState(null);
  const [player, setPlayer] = useState(null);
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(new Set());
  const joining = useRef(false);
  const playerRef = useRef(null);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    const saved = sessionStorage.getItem("maze-player-name") || "";
    setName(saved);
  }, []);

  useEffect(() => {
    loadGame();
  }, [code]);

  useEffect(() => {
    if (!game) return;

    const channel = supabase
      .channel(`play-${game.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${game.id}` },
        (payload) => setGame(payload.new)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `game_id=eq.${game.id}` },
        () => loadPlayers(game.id)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [game?.id]);

  // A reliable backup check for kicks. Realtime is fast when available,
  // but this also removes a kicked player within a couple of seconds.
  useEffect(() => {
    if (!game || !player) return;

    const timer = setInterval(async () => {
      const current = playerRef.current;
      if (!current) return;

      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("id", current.id)
        .eq("game_id", game.id)
        .maybeSingle();

      if (!data) {
        handleRemovedPlayer();
      } else {
        setPlayer(data);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [game?.id, player?.id]);

  useEffect(() => {
    if (!player || !game || game.status !== "playing") return;
    revealAround(player.x, player.y, true);
  }, [game?.started_at, game?.status, player?.id]);

  useEffect(() => {
    if (!player || !game) return;

    function onKeyDown(e) {
      if (game.status !== "playing") return;
      const map = {
        ArrowUp: [0, -1],
        w: [0, -1],
        W: [0, -1],
        ArrowDown: [0, 1],
        s: [0, 1],
        S: [0, 1],
        ArrowLeft: [-1, 0],
        a: [-1, 0],
        A: [-1, 0],
        ArrowRight: [1, 0],
        d: [1, 0],
        D: [1, 0]
      };

      if (map[e.key]) {
        e.preventDefault();
        move(...map[e.key]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [player, game]);

  function revealAround(x, y, reset = false) {
    setRevealed((previous) => {
      const next = reset ? new Set() : new Set(previous);

      // Reveal exactly one square in every direction: a 3 x 3 area.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const rx = x + dx;
          const ry = y + dy;
          if (rx >= 0 && rx < SIZE && ry >= 0 && ry < SIZE) {
            next.add(`${rx},${ry}`);
          }
        }
      }

      return next;
    });
  }

  function handleRemovedPlayer() {
    if (!game) return;
    localStorage.removeItem(`maze-player-${game.id}`);
    localStorage.removeItem(`maze-player-token-${game.id}`);
    playerRef.current = null;
    setPlayer(null);
    setRevealed(new Set());
    setError("You were removed from the waiting room. You can enter your name and rejoin.");
  }

  async function loadGame() {
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("code", code.toUpperCase())
      .single();

    if (error || !data) {
      setError("Game not found.");
      return;
    }

    setGame(data);
    loadPlayers(data.id);

    const savedPlayerId = localStorage.getItem(`maze-player-${data.id}`);
    if (savedPlayerId) {
      const { data: existing } = await supabase
        .from("players")
        .select("*")
        .eq("id", savedPlayerId)
        .eq("game_id", data.id)
        .maybeSingle();

      if (existing) {
        setPlayer(existing);
      } else {
        localStorage.removeItem(`maze-player-${data.id}`);
        localStorage.removeItem(`maze-player-token-${data.id}`);
      }
    }
  }

  async function loadPlayers(gameId) {
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("game_id", gameId)
      .order("joined_at");

    const list = data || [];
    setPlayers(list);

    const current = playerRef.current;
    if (current) {
      const updated = list.find((p) => p.id === current.id);
      if (updated) {
        setPlayer(updated);
      } else {
        handleRemovedPlayer();
      }
    }
  }

  async function join() {
    if (joining.current || !game) return;
    joining.current = true;
    setError("");

    try {
      const clean = name.trim().slice(0, 20);
      if (!clean) throw new Error("Enter your name.");
      if (game.status === "editing") throw new Error("The host has not opened the waiting room yet.");
      if (game.status === "playing") throw new Error("This race has already started.");

      const { count } = await supabase
        .from("players")
        .select("*", { count: "exact", head: true })
        .eq("game_id", game.id);

      if ((count || 0) >= 25) throw new Error("This game is full.");

      const token = crypto.randomUUID();

      const { data, error } = await supabase
        .from("players")
        .insert({
          game_id: game.id,
          name: clean,
          player_token: token,
          x: game.start_pos.x,
          y: game.start_pos.y
        })
        .select()
        .single();

      if (error) throw error;

      sessionStorage.setItem("maze-player-name", clean);
      localStorage.setItem(`maze-player-${game.id}`, data.id);
      localStorage.setItem(`maze-player-token-${game.id}`, token);
      setPlayer(data);
      playerRef.current = data;
      loadPlayers(game.id);
    } catch (e) {
      setError(e.message);
    } finally {
      joining.current = false;
    }
  }

  async function move(dx, dy) {
    if (!player || !game || game.status !== "playing" || player.finished_at) return;

    const nx = player.x + dx;
    const ny = player.y + dy;

    if (!canMove(game.maze, nx, ny)) return;

    const nextPlayer = { ...player, x: nx, y: ny };
    setPlayer(nextPlayer);
    playerRef.current = nextPlayer;
    revealAround(nx, ny);

    const { error } = await supabase
      .from("players")
      .update({ x: nx, y: ny })
      .eq("id", player.id);

    if (error) {
      setError("Your move could not be saved. Try again.");
      return;
    }

    if (nx === game.finish_pos.x && ny === game.finish_pos.y) {
      await finishRace();
    }
  }

  async function finishRace() {
    const { data: fresh } = await supabase
      .from("players")
      .select("*")
      .eq("id", player.id)
      .single();

    if (fresh?.finished_at) return;

    const { count } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("game_id", game.id)
      .not("finished_at", "is", null);

    const place = Math.min((count || 0) + 1, 999);

    await supabase
      .from("players")
      .update({
        finished_at: new Date().toISOString(),
        place
      })
      .eq("id", player.id)
      .is("finished_at", null);

    if (place >= 3) {
      const { count: finishedCount } = await supabase
        .from("players")
        .select("*", { count: "exact", head: true })
        .eq("game_id", game.id)
        .not("finished_at", "is", null);

      if ((finishedCount || 0) >= 3) {
        await supabase
          .from("games")
          .update({
            status: "finished",
            finished_at: new Date().toISOString()
          })
          .eq("id", game.id);
      }
    }

    loadPlayers(game.id);
  }

  const podium = [...players]
    .filter((p) => p.place && p.place <= 3)
    .sort((a, b) => a.place - b.place);

  if (error && !game) {
    return (
      <main className="page-shell center">
        <section className="panel narrow">
          <h1>Maze Race</h1>
          <p className="error">{error}</p>
          <a href="/" className="button-link">Back Home</a>
        </section>
      </main>
    );
  }

  if (!game) return <main className="page-shell"><p>Loading...</p></main>;

  if (!player) {
    return (
      <main className="page-shell center">
        <section className="panel narrow">
          <h1>Join Maze Race</h1>
          <div className="code-box">
            <span>Game code</span>
            <strong>{game.code}</strong>
          </div>

          {game.status === "editing" ? (
            <p>The host is still building the maze. Try again when the waiting room opens.</p>
          ) : (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                placeholder="Your name"
              />
              <button className="primary full" onClick={join}>
                Join Waiting Room
              </button>
            </>
          )}

          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (game.status === "waiting") {
    return (
      <main className="page-shell center">
        <section className="panel waiting-card">
          <h1>You're in!</h1>
          <p className="big-name">{player.name}</p>
          <p>Waiting for the host to start the race.</p>
          <div className="waiting-players">
            <h2>Players ({players.length}/25)</h2>
            <div className="chips">
              {players.map((p) => <span key={p.id}>{p.name}</span>)}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (game.status === "finished" || player.finished_at) {
    return (
      <main className="page-shell center">
        <section className="panel podium-card">
          <h1>{player.finished_at ? "You finished!" : "Race Results"}</h1>
          {player.place && <p className="your-place">Your place: #{player.place}</p>}

          <div className="podium large">
            {podium.map((p) => (
              <div key={p.id} className={`place place-${p.place}`}>
                <b>{p.place === 1 ? "🥇" : p.place === 2 ? "🥈" : "🥉"}</b>
                <span>{p.name}</span>
              </div>
            ))}
          </div>

          {!podium.length && <p>Waiting for the top finishers...</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="play-layout">
      <header className="play-topbar">
        <div>
          <b>{player.name}</b>
          <span>Game {game.code}</span>
        </div>
        <div className="race-status">GO!</div>
      </header>

      <section className="player-maze-wrap">
        <div
          className="maze-grid player-maze fog-maze"
          style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}
        >
          {game.maze.flatMap((row, y) =>
            row.map((cell, x) => {
              const key = `${x},${y}`;
              const isRevealed = revealed.has(key);
              const isStart = game.start_pos?.x === x && game.start_pos?.y === y;
              const isFinish = game.finish_pos?.x === x && game.finish_pos?.y === y;
              const isMe = player.x === x && player.y === y;

              if (!isRevealed) {
                return <div key={key} className="cell fog" />;
              }

              return (
                <div
                  key={key}
                  className={[
                    "cell",
                    cell === 1 ? "wall" : "path",
                    isStart ? "start" : "",
                    isFinish ? "finish" : "",
                    isMe ? "me" : ""
                  ].join(" ")}
                />
              );
            })
          )}
        </div>
      </section>

      <section className="controls">
        <button onClick={() => move(0, -1)}>▲</button>
        <div>
          <button onClick={() => move(-1, 0)}>◀</button>
          <button onClick={() => move(0, 1)}>▼</button>
          <button onClick={() => move(1, 0)}>▶</button>
        </div>
        <p>You reveal a 3 × 3 area as you move. Arrow keys or WASD also work.</p>
      </section>
    </main>
  );
}

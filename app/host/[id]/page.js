"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { SIZE, hasPath, makeEmptyMaze } from "../../../lib/maze";

export default function HostPage({ params }) {
  const { id } = params;
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [tool, setTool] = useState("wall");
  const [painting, setPainting] = useState(false);
  const [message, setMessage] = useState("");
  const saveTimer = useRef(null);

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`host-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `game_id=eq.${id}` },
        () => loadPlayers()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${id}` },
        (payload) => setGame(payload.new)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [id]);

  async function load() {
    const { data } = await supabase.from("games").select("*").eq("id", id).single();
    setGame(data);
    loadPlayers();
  }

  async function loadPlayers() {
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("game_id", id)
      .order("joined_at");
    setPlayers(data || []);
  }

  function queueSave(nextMaze) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase.from("games").update({ maze: nextMaze }).eq("id", id);
    }, 250);
  }

  function paintCell(x, y) {
    if (!game || game.status !== "editing") return;

    if (tool === "start") {
      const next = { ...game, start_pos: { x, y } };
      setGame(next);
      supabase.from("games").update({ start_pos: { x, y } }).eq("id", id);
      return;
    }

    if (tool === "finish") {
      const next = { ...game, finish_pos: { x, y } };
      setGame(next);
      supabase.from("games").update({ finish_pos: { x, y } }).eq("id", id);
      return;
    }

    const nextMaze = game.maze.map((row) => [...row]);
    nextMaze[y][x] = tool === "wall" ? 1 : 0;
    setGame({ ...game, maze: nextMaze });
    queueSave(nextMaze);
  }

  async function openWaitingRoom() {
    if (!hasPath(game.maze, game.start_pos, game.finish_pos)) {
      setMessage("The start and finish are not connected by a valid path.");
      return;
    }

    await supabase.from("games").update({ status: "waiting" }).eq("id", id);
    setMessage("Waiting room is open. The maze is now hidden.");
  }

  async function startGame() {
    if (!players.length) {
      setMessage("At least one player must join first.");
      return;
    }

    if (!hasPath(game.maze, game.start_pos, game.finish_pos)) {
      setMessage("The maze does not have a valid path from start to finish.");
      return;
    }

    await supabase
      .from("players")
      .update({
        x: game.start_pos.x,
        y: game.start_pos.y,
        finished_at: null,
        place: null
      })
      .eq("game_id", id);

    await supabase
      .from("games")
      .update({
        status: "playing",
        started_at: new Date().toISOString(),
        finished_at: null
      })
      .eq("id", id);

    setMessage("Race started!");
  }

  async function kickPlayer(playerId) {
    const { error } = await supabase.from("players").delete().eq("id", playerId);

    if (error) {
      setMessage(`Could not kick player: ${error.message}`);
      return;
    }

    await loadPlayers();
    setMessage("Player removed. They can rejoin.");
  }

  async function kickAllPlayers() {
    if (!players.length) {
      setMessage("There are no players to kick.");
      return;
    }

    const { error } = await supabase.from("players").delete().eq("game_id", id);

    if (error) {
      setMessage(`Could not kick all players: ${error.message}`);
      return;
    }

    await loadPlayers();
    setMessage("All players were removed. They can rejoin.");
  }

  async function resetGame() {
    await supabase.from("players").delete().eq("game_id", id);

    await supabase
      .from("games")
      .update({
        status: "editing",
        started_at: null,
        finished_at: null
      })
      .eq("id", id);

    setMessage("Game reset. The maze is visible again.");
  }

  async function clearMaze() {
    const maze = makeEmptyMaze();
    setGame({ ...game, maze });
    await supabase.from("games").update({ maze }).eq("id", id);
  }

  const podium = useMemo(
    () =>
      [...players]
        .filter((p) => p.place)
        .sort((a, b) => a.place - b.place)
        .slice(0, 3),
    [players]
  );

  if (!game) return <main className="page-shell"><p>Loading...</p></main>;

  const hideHostMaze =
    game.status === "waiting" ||
    game.status === "playing" ||
    game.status === "finished";

  return (
    <main className="host-layout">
      <section className="panel host-sidebar">
        <h1>Maze Host</h1>

        <div className="code-box">
          <span>Game code</span>
          <strong>{game.code}</strong>
        </div>

        <p className="status">
          Status: <b>{game.status}</b>
        </p>

        {game.status === "editing" && (
          <>
            <h2>Maze Tools</h2>
            <div className="tool-grid">
              {["wall", "path", "start", "finish"].map((name) => (
                <button
                  key={name}
                  className={tool === name ? "tool active" : "tool"}
                  onClick={() => setTool(name)}
                >
                  {name}
                </button>
              ))}
            </div>

            <button className="secondary full" onClick={clearMaze}>
              Clear Maze
            </button>
          </>
        )}

        <div className="host-buttons">
          {game.status === "editing" && (
            <button className="primary full" onClick={openWaitingRoom}>
              Open Waiting Room
            </button>
          )}

          {game.status === "waiting" && (
            <button className="primary full" onClick={startGame}>
              Start Race
            </button>
          )}

          {(game.status === "playing" || game.status === "finished") && (
            <button className="secondary full" onClick={resetGame}>
              Reset Game
            </button>
          )}
        </div>

        {message && <p className="message">{message}</p>}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <h2 style={{ margin: 0 }}>Players ({players.length}/25)</h2>

          {game.status === "waiting" && players.length > 0 && (
            <button className="danger small" onClick={kickAllPlayers}>
              Kick All
            </button>
          )}
        </div>

        <div className="player-list" style={{ marginTop: "8px" }}>
          {!players.length && <p className="muted">No players yet.</p>}

          {players.map((p) => (
            <div className="player-row" key={p.id}>
              <span>
                {p.place ? `${p.place}. ` : ""}
                {p.name}
              </span>

              {game.status === "waiting" && (
                <button className="danger small" onClick={() => kickPlayer(p.id)}>
                  Kick
                </button>
              )}
            </div>
          ))}
        </div>

        {podium.length > 0 && (
          <div className="podium">
            <h2>Podium</h2>
            {podium.map((p) => (
              <div key={p.id} className={`place place-${p.place}`}>
                <b>{p.place === 1 ? "🥇" : p.place === 2 ? "🥈" : "🥉"}</b>
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="maze-stage">
        {hideHostMaze ? (
          <div
            style={{
              minHeight: "70vh",
              borderRadius: "16px",
              background: "#64748b",
              display: "grid",
              placeItems: "center",
              padding: "32px",
              textAlign: "center",
              color: "white"
            }}
          >
            <div>
              <div style={{ fontSize: "4rem", marginBottom: "12px" }}>🔒</div>
              <h2 style={{ fontSize: "2rem", margin: "0 0 12px" }}>
                Maze Hidden
              </h2>
              <p style={{ fontSize: "1.1rem", maxWidth: "520px", margin: "0 auto" }}>
                The full maze stays hidden from the moment the waiting room opens
                until the game is reset.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="maze-wrap">
              <div
                className="maze-grid editor"
                style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}
                onMouseLeave={() => setPainting(false)}
              >
                {game.maze.flatMap((row, y) =>
                  row.map((cell, x) => {
                    const isStart =
                      game.start_pos?.x === x && game.start_pos?.y === y;
                    const isFinish =
                      game.finish_pos?.x === x && game.finish_pos?.y === y;

                    const cls = [
                      "cell",
                      cell === 1 ? "wall" : "path",
                      isStart ? "start" : "",
                      isFinish ? "finish" : ""
                    ].join(" ");

                    return (
                      <div
                        key={`${x}-${y}`}
                        className={cls}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setPainting(true);
                          paintCell(x, y);
                        }}
                        onMouseEnter={() => painting && paintCell(x, y)}
                        onMouseUp={() => setPainting(false)}
                      />
                    );
                  })
                )}
              </div>
            </div>

            <div className="legend">
              <span>Click or drag to paint.</span>
              <span>Green = start</span>
              <span>Gold = finish</span>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

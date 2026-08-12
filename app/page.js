"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { makeEmptyMaze, randomCode } from "../lib/maze";

export default function Home() {
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createGame() {
    setBusy(true);
    setError("");

    try {
      let code = randomCode();
      let created = false;
      let gameId = null;

      for (let tries = 0; tries < 5 && !created; tries++) {
        const { data, error } = await supabase
          .from("games")
          .insert({
            code,
            status: "editing",
            maze: makeEmptyMaze(),
            start_pos: { x: 1, y: 1 },
            finish_pos: { x: 48, y: 48 }
          })
          .select()
          .single();

        if (!error) {
          created = true;
          gameId = data.id;
        } else {
          code = randomCode();
        }
      }

      if (!created) throw new Error("Could not create a game.");

      const hostToken = crypto.randomUUID();
      localStorage.setItem(`maze-host-${gameId}`, hostToken);

      await supabase
        .from("games")
        .update({ host_token: hostToken })
        .eq("id", gameId);

      window.location.href = `/host/${gameId}`;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function joinGame(e) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    const name = playerName.trim().slice(0, 20);

    if (!code || !name) {
      setError("Enter your name and the game code.");
      return;
    }

    sessionStorage.setItem("maze-player-name", name);
    window.location.href = `/play/${code}`;
  }

  return (
    <main className="home-shell">
      <section className="hero-card">
        <h1>Maze Race</h1>
        <p className="subtitle">
          Build a maze, invite up to 25 players, and race to the finish.
        </p>

        <div className="home-actions">
          <button className="primary big" onClick={createGame} disabled={busy}>
            {busy ? "Creating..." : "Create a Game"}
          </button>

          <div className="divider"><span>or join</span></div>

          <form onSubmit={joinGame} className="join-form">
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your name"
              maxLength={20}
            />
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Game code"
              maxLength={6}
            />
            <button className="secondary" type="submit">
              Join Game
            </button>
          </form>

          {error && <p className="error">{error}</p>}
        </div>
      </section>
    </main>
  );
}

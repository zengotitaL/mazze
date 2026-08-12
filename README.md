# Maze Race

A classroom-friendly multiplayer maze racing game for up to 25 players.

## Features

- Host creates a room and gets a 6-character join code.
- 50 x 50 maze editor.
- Click and drag to paint walls and paths.
- Set a start square and finish square.
- Up to 25 players can join by name.
- Host can kick a player from the waiting room.
- Kicked players may rejoin.
- Host starts the race.
- Players move with Arrow Keys or WASD.
- Mobile/touch direction buttons included.
- First 3 finishers are recorded.
- Everyone sees the podium when the game finishes.
- Host can reset the room for another race.

## Setup

1. Create a free Supabase project at https://supabase.com.
2. In Supabase, open SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. In Supabase Project Settings -> API, copy:
   - Project URL
   - anon public key
5. Copy `.env.local.example` to `.env.local`.
6. Put your Supabase values into `.env.local`.
7. Install and run:

```bash
npm install
npm run dev
```

8. Open http://localhost:3000.

## Deploy

You can deploy this project to Vercel. Add the same two environment variables in Vercel.

## Important classroom note

This starter validates movement in the browser and uses database rules for basic access. For a high-stakes competitive game, move validation and finish placement should be moved into a server-side function. For normal classroom use, this version is a practical starting point.

export const SIZE = 50;

export function makeEmptyMaze() {
  const maze = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => 0)
  );

  // Border walls
  for (let i = 0; i < SIZE; i++) {
    maze[0][i] = 1;
    maze[SIZE - 1][i] = 1;
    maze[i][0] = 1;
    maze[i][SIZE - 1] = 1;
  }

  return maze;
}

export function canMove(maze, x, y) {
  return (
    x >= 0 &&
    x < SIZE &&
    y >= 0 &&
    y < SIZE &&
    maze[y][x] !== 1
  );
}

export function samePoint(a, b) {
  return a?.x === b?.x && a?.y === b?.y;
}

export function hasPath(maze, start, finish) {
  if (!start || !finish) return false;

  const queue = [[start.x, start.y]];
  const seen = new Set([`${start.x},${start.y}`]);

  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === finish.x && y === finish.y) return true;

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (!seen.has(key) && canMove(maze, nx, ny)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
  }

  return false;
}

export function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

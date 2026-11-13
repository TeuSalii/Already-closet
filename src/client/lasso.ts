// The geometry of drawing around a garment, kept apart from the screen so it
// can be tested without a phone.
//
// The picture's edge works like a magnet. Near it, the line sticks to it;
// a finger that slides off the picture and comes back on another side makes
// the line follow the edge around the corner; and a shape that starts and
// ends on the edge is closed along the edge, not with a straight line
// through the garment. So a piece that runs out of the photo (a coat cut
// off at the bottom) is cut out without fiddling at the border.

export type Box = { x: number; y: number; width: number; height: number };

// `t`: where the point lies on the picture's edge, as the distance from the
// top-left corner going clockwise. Null for a point inside the picture.
export type LassoPoint = { x: number; y: number; t: number | null };

const SNAP = 16; // on screen, in points: this close to the edge sticks to it
const MIN_STEP = 3; // skip touch points closer than this: a lighter outline
const SMOOTHING = 0.5; // 0: no smoothing, towards 1: smoother but lags the finger

// A touch point, kept on the picture and stuck to the edge when close to it.
export function place(raw: { x: number; y: number }, box: Box): LassoPoint {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  let x = clamp(raw.x, box.x, right);
  let y = clamp(raw.y, box.y, bottom);
  if (x - box.x < SNAP) x = box.x;
  else if (right - x < SNAP) x = right;
  if (y - box.y < SNAP) y = box.y;
  else if (bottom - y < SNAP) y = bottom;
  const onEdge = x === box.x || x === right || y === box.y || y === bottom;
  return { x, y, t: onEdge ? along(x, y, box) : null };
}

// Adds a touch point to the line. Returns the line unchanged if the finger
// barely moved.
export function extend(points: LassoPoint[], raw: { x: number; y: number }, box: Box): LassoPoint[] {
  let next = place(raw, box);
  const last = points[points.length - 1];
  if (last === undefined) return [next];

  // Inside the picture, follow the finger a little behind: hand jitter
  // disappears, the line still feels attached. On the edge, no smoothing:
  // it would pull the line off the edge.
  if (next.t === null) {
    next = { x: last.x + (next.x - last.x) * (1 - SMOOTHING), y: last.y + (next.y - last.y) * (1 - SMOOTHING), t: null };
  }
  if (Math.hypot(next.x - last.x, next.y - last.y) < MIN_STEP) return points;

  // From edge to edge: go along the edge, through any corner in between.
  const corners = last.t !== null && next.t !== null ? walk(last.t, next.t, box) : [];
  return [...points, ...corners, next];
}

// Closes the shape when the finger lifts. Start and end both on the edge:
// close along the edge. Otherwise the straight line back to the start.
export function close(points: LassoPoint[], box: Box): LassoPoint[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || first.t === null || last.t === null) return points;
  return [...points, ...walk(last.t, first.t, box)];
}

// Did this point just catch the edge? For a light tap and the edge glow.
export const caughtEdge = (before: LassoPoint | undefined, after: LassoPoint | undefined) =>
  after !== undefined && after.t !== null && (before === undefined || before.t === null);

// Position on the edge, clockwise from the top-left corner.
function along(x: number, y: number, box: Box): number {
  const { width: w, height: h } = box;
  const rx = x - box.x;
  const ry = y - box.y;
  if (ry === 0) return rx; // top
  if (rx === w) return w + ry; // right
  if (ry === h) return w + h + (w - rx); // bottom
  return 2 * w + h + (h - ry); // left
}

// The corners passed going from a to b along the edge, the shorter way round.
function walk(a: number, b: number, box: Box): LassoPoint[] {
  const { x, y, width: w, height: h } = box;
  const perimeter = 2 * (w + h);
  const corners: LassoPoint[] = [
    { x, y, t: 0 },
    { x: x + w, y, t: w },
    { x: x + w, y: y + h, t: w + h },
    { x, y: y + h, t: 2 * w + h },
  ];
  const forward = mod(b - a, perimeter);
  const clockwise = forward <= perimeter / 2;
  const distance = (c: LassoPoint) => (clockwise ? mod(c.t! - a, perimeter) : mod(a - c.t!, perimeter));
  const span = clockwise ? forward : perimeter - forward;
  return corners
    .filter((c) => distance(c) > 0 && distance(c) < span)
    .sort((p, q) => distance(p) - distance(q));
}

const mod = (n: number, m: number) => ((n % m) + m) % m;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// The eyes of a Bloub avatar as padlocks, like the eyes of the logo. The engine draws each eye as a
// capsule around (0, 0) and puts the pose in its matrix: the lean, the blink, the look. The mood is
// in the size of the capsule, which is wide and low for a sleepy or happy eye. A padlock takes the
// size of the capsule, so a lowered eye is a flat padlock, and the matrix still moves it.

/** The half size of the capsule at rest; a padlock keeps its shape at this size. */
const REST_HALF_WIDTH = 9.3;
const REST_HALF_HEIGHT = 20.6;
/** A padlock at rest is drawn this many times larger than in the logo, to fill a resting eye. */
const BASE_SCALE = 1.6;
/** A padlock does not stretch as far as a capsule: wide and tall eyes stay readable as locks. */
const WIDTH_RANGE = { min: 0.8, max: 1.3 } as const;
const HEIGHT_RANGE = { min: 0.14, max: 1.4 } as const;

// The lock of the logo (`APP_LOGO_LOCK_*`), outlined, because the engine fills an eye and cannot
// stroke it. The shackle is the centre line of the logo (x = ±4, up to y = -4.5 - 4) with half of the
// stroke width 3.4 on each side. The keyhole turns the other way, so that the fill rule cuts it out.
const SHACKLE = "M-5.7 0V-4.5A5.7 5.7 0 0 1 5.7 -4.5V0H2.3V-4.5A2.3 2.3 0 0 0 -2.3 -4.5V0Z";
const BODY = "M-4.5 -1.5H4.5A3.5 3.5 0 0 1 8 2V5A6 6 0 0 1 2 11H-2A6 6 0 0 1 -8 5V2A3.5 3.5 0 0 1 -4.5 -1.5Z";
const KEYHOLE = "M-1.9 4.4A1.9 1.9 0 1 0 1.9 4.4A1.9 1.9 0 1 0 -1.9 4.4Z";
/** The lock spans y = -10.2 to 11, so its centre is moved to 0 to sit where the capsule sat. */
const CENTER_Y = 0.4;

const cache = new Map<string, string>();

function clamp(value: number, range: { min: number; max: number }): number {
  return Math.min(range.max, Math.max(range.min, value));
}

function scalePath(d: string, scaleX: number, scaleY: number): string {
  // Every command of the lock is absolute or an axis move, and an arc has radii, a rotation of 0,
  // two flags and a point; so the numbers are told apart by the command and the place in it.
  return d.replace(/([MLHVAZ])([^MLHVAZ]*)/g, (_whole, command: string, rest: string) => {
    const numbers = rest.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
    const out = numbers.map((value, place) => {
      if (command === "H") return value * scaleX;
      if (command === "V") return (value - CENTER_Y) * scaleY;
      if (command === "A") {
        // rx ry rotation large sweep x y
        if (place === 0) return value * scaleX;
        if (place === 1) return value * scaleY;
        if (place === 5) return value * scaleX;
        if (place === 6) return (value - CENTER_Y) * scaleY;
        return value;
      }
      return place % 2 === 0 ? value * scaleX : (value - CENTER_Y) * scaleY;
    });
    return `${command}${out.map((value) => Number(value.toFixed(2))).join(" ")}`;
  });
}

/**
 * The padlock that takes the place of one capsule eye of the engine, in the same local frame.
 * Pass it to `BloubBot` as `eyePath`, or call it on `RenderedEye.d` where a frame is drawn.
 */
export function padlockEyePath(capsule: string): string {
  const cached = cache.get(capsule);
  if (cached !== undefined) return cached;
  // The capsule starts at `M -w y` and its first arc ends at `0 -h`: the numbers at 0 and 8.
  const numbers = capsule.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  const halfWidth = Math.abs(numbers[0] ?? REST_HALF_WIDTH);
  const halfHeight = Math.abs(numbers[8] ?? REST_HALF_HEIGHT);
  const scaleX = BASE_SCALE * clamp(halfWidth / REST_HALF_WIDTH, WIDTH_RANGE);
  const scaleY = BASE_SCALE * clamp(halfHeight / REST_HALF_HEIGHT, HEIGHT_RANGE);
  const padlock = [SHACKLE, BODY, KEYHOLE].map((part) => scalePath(part, scaleX, scaleY)).join("");
  cache.set(capsule, padlock);
  return padlock;
}

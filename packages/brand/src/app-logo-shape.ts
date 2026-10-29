// The OpenOwnBot mark as plain data, so that a canvas can draw the same mark that
// `AppLogo` draws as SVG: the social cards in apps/auth-api do.

/** The mark is a square of this side, in its own units. */
export const APP_LOGO_SIZE = 240;
/** The corner radius of the square, in the same units. */
export const APP_LOGO_CORNER = 50;

/** Each eye is one scribbled stroke, as SVG `points`. */
export const APP_LOGO_EYE_POINTS = {
  left: "43.55 93.61 64.69 81.41 36.48 108.04 79.67 83.11 35.93 122.88 91.58 90.74 38.9 132.69 97.66 98.76 42.44 138.88 100.43 105.4 46.9 143.83 101.97 112.04 55.08 149.51 101.83 122.52 73.01 152.43 94.14 140.23",
  right:
    "145.65 93.61 166.79 81.41 140.83 101.52 175.58 81.46 138.3 109.53 183.18 83.63 137.55 117.43 189.67 87.33 139.67 129.39 197.88 95.78 142.92 136.32 201.52 102.48 149.03 143.86 204.07 112.08 159.14 150.37 203.51 124.75 169.28 152.61 199.82 134.98",
} as const;

/**
 * The face of the mark: each eye is a padlock, and a smile with two cheeks sits below. The paths are
 * drawn around (0, 0) in a 64-unit square; scale them by `APP_LOGO_FACE_SCALE` and move them to a
 * centre of `APP_LOGO_LOCK_CENTERS`.
 */
export const APP_LOGO_FACE_SCALE = APP_LOGO_SIZE / 64;
export const APP_LOGO_LOCK_CENTERS = {
  left: { x: 18.5 * APP_LOGO_FACE_SCALE, y: 27.5 * APP_LOGO_FACE_SCALE },
  right: { x: 45.5 * APP_LOGO_FACE_SCALE, y: 27.5 * APP_LOGO_FACE_SCALE },
} as const;
/** The stroke width of the shackle, in the units of the lock paths. */
export const APP_LOGO_LOCK_SHACKLE_WIDTH = 3.4;
export const APP_LOGO_LOCK_SHACKLE = "M-4 0V-4.5A4 4 0 0 1 4 -4.5V0";
export const APP_LOGO_LOCK_BODY =
  "M-4.5 -1.5H4.5A3.5 3.5 0 0 1 8 2V5A6 6 0 0 1 2 11H-2A6 6 0 0 1 -8 5V2A3.5 3.5 0 0 1 -4.5 -1.5Z";
export const APP_LOGO_LOCK_KEYHOLE = { cx: 0, cy: 4.4, r: 1.9 } as const;
export const APP_LOGO_CHEEK_COLOR = "#ee8e78";
/** The cheeks and the smile, in the 64-unit square of the mark. */
export const APP_LOGO_CHEEKS = [
  { cx: 10.5, cy: 41.5, rx: 3.8, ry: 2.2 },
  { cx: 53.5, cy: 41.5, rx: 3.8, ry: 2.2 },
] as const;
export const APP_LOGO_SMILE = "M28 44.5Q32 48.7 36 44.5";
export const APP_LOGO_SMILE_WIDTH = 2.6;

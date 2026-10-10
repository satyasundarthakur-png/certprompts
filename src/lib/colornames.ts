const NAMED: [string, number, number, number][] = [
  ["ivory", 255, 253, 240], ["cream", 250, 243, 224], ["white", 255, 255, 255], ["light grey", 210, 210, 210],
  ["grey", 128, 128, 128], ["charcoal", 54, 54, 58], ["black", 17, 17, 17], ["parchment", 240, 230, 200],
  ["beige", 225, 210, 180], ["antique gold", 201, 162, 74], ["bright gold", 230, 190, 60], ["bronze", 176, 112, 58],
  ["copper", 200, 121, 58], ["brown", 107, 66, 38], ["maroon", 122, 31, 43], ["burgundy", 128, 0, 32],
  ["crimson", 192, 24, 47], ["red", 229, 57, 53], ["coral", 255, 107, 87], ["orange", 245, 124, 0],
  ["yellow", 249, 215, 28], ["olive", 128, 128, 0], ["lime", 166, 214, 8], ["green", 46, 158, 79],
  ["forest green", 34, 85, 51], ["deep green", 18, 53, 43], ["dark teal", 0, 77, 77], ["dark brown", 60, 40, 25], ["dark red", 90, 20, 20], ["dark purple", 50, 20, 60], ["sage", 156, 175, 136], ["mint", 170, 230, 200], ["gold", 212, 175, 55], ["lavender", 200, 180, 230], ["peach", 255, 200, 160], ["emerald", 11, 107, 77], ["teal", 15, 124, 128], ["turquoise", 64, 224, 208],
  ["sky blue", 59, 154, 225], ["royal blue", 31, 95, 209], ["navy", 20, 33, 61], ["midnight blue", 15, 27, 61],
  ["indigo", 63, 63, 181], ["violet", 124, 77, 219], ["purple", 91, 42, 134], ["plum", 74, 31, 79],
  ["magenta", 194, 24, 91], ["pink", 240, 111, 165], ["blush", 244, 194, 194], ["silver", 181, 187, 196],
];

function lab(r: number, g: number, b: number): [number, number, number] {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = f(r), G = f(g), B = f(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g3 = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * g3(y) - 16, 500 * (g3(x) - g3(y)), 200 * (g3(y) - g3(z))];
}

const LABS = NAMED.map(([n, r, g, b]) => [n, lab(r, g, b)] as const);

/** Human colour name for a hex value (nearest by CIE Lab distance). */
export function colorName(hex: string) {
  const h = hex.replace("#", "");
  const L = lab(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
  let best = "";
  let bd = Infinity;
  for (const [n, c] of LABS) {
    const d = (L[0] - c[0]) ** 2 + (L[1] - c[1]) ** 2 + (L[2] - c[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

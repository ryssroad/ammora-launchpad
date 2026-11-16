/** Small, self-contained art: no fonts, scripts, external images or network requests. */
export function glyphSvg(seed: number) {
  const colors = ["e4b56a", "b8dca4", "9acfe0", "d5b2ef", "efad9e", "eee0a5"];
  const bits = (seed >>> 0) | (1 << 7);
  let path = "";
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (bits & (1 << (y * 3 + Math.min(x, 4 - x)))) path += `M${x + 1} ${y + 1}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7"><path fill="#181512" d="M0 0h7v7H0z"/><path fill="#${colors[(seed >>> 16) % colors.length]}" d="${path}"/></svg>`;
}

export function glyphImage(seed: number) {
  // SVG is ASCII; btoa works in both browsers and Node 22.
  return `data:image/svg+xml;base64,${btoa(glyphSvg(seed))}`;
}

export function newGlyphSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Accept only our inert, bounded SVG grammar; never arbitrary inline SVG. */
export function safeGlyphImage(value: string): string | null {
  if (!value.startsWith("data:image/svg+xml;base64,") || value.length > 1000) return null;
  try {
    const svg = atob(value.slice(26));
    return /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 7 7"><path fill="#181512" d="M0 0h7v7H0z"\/><path fill="#[a-f0-9]{6}" d="(?:M[1-5] [1-5]h1v1h-1z){1,25}"\/><\/svg>$/.test(svg) ? value : null;
  } catch {
    return null;
  }
}

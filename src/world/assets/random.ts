/** Tiny LCG for deterministic decorative placement (not used by the simulation). */
export function makeDecoRng(seed: number): () => number {
  const state = { s: seed >>> 0 };
  return () => {
    state.s = (state.s * 1103515245 + 12345) >>> 0;
    return (state.s >>> 8) / 16777216;
  };
}

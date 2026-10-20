// シードを指定できる乱数（mulberry32）。同じシードなら、どの端末でも同じ並びになる。

export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

export function randomSeed() {
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  } catch (e) {
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }
}

// 分数の計算。物理量は小数ではなく分数で扱い、「ぴったり」を誤差なく判定する（仕様書 0章-8）。
// 分数は { n: 分子, d: 分母 } の形で、いつも約分済み・分母は正。

export function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function frac(n, d = 1) {
  if (!Number.isInteger(n) || !Number.isInteger(d)) throw new Error('分数には整数を使う');
  if (d === 0) throw new Error('分母が0');
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export const mul = (a, b) => frac(a.n * b.n, a.d * b.d);
export const div = (a, b) => frac(a.n * b.d, a.d * b.n);
export const eq = (a, b) => a.n === b.n && a.d === b.d;
export const isInt = (a) => a.d === 1;
export const toNumber = (a) => a.n / a.d;
export const cmp = (a, b) => a.n * b.d - b.n * a.d;
export const add = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);

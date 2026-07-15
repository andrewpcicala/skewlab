// Abramowitz & Stegun approximation 7.1.26 — max error ≤ 1.5e-7
export function erf(x: number): number {
  const p  =  0.3275911;
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t    = 1 / (1 + p * absX);
  // Horner-form evaluation of the degree-5 polynomial in t
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  return sign * (1 - poly * Math.exp(-absX * absX));
}

// CDF of the standard normal via the erf identity: Φ(x) = ½(1 + erf(x/√2))
export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// PDF of the standard normal: φ(x) = e^(-x²/2) / √(2π)
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

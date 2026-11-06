// Temporary, label-free illustration: the eclipsed Sun and its corona among stars.
// Deterministic (seeded), so server and client render the same SVG.

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);

export function EclipseIllustration() {
  const W = 1600;
  const H = 1000;
  const cx = 980;
  const cy = 470;
  const R = 92;
  const r = rng(1919);
  const streaks = Array.from({ length: 260 }, () => {
    const a = r() * Math.PI * 2;
    return { a, len: 24 + r() ** 2.4 * 340, w: 0.5 + r() * 2.2, o: 0.04 + r() * 0.2 };
  });
  const stars = Array.from({ length: 140 }, () => ({ x: r() * W, y: r() * H, s: 0.5 + r() ** 4 * 2.2, o: 0.25 + r() * 0.6 }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="baer-glow" cx={cx} cy={cy} r="420" gradientUnits="userSpaceOnUse">
          <stop offset="0.2" stopColor="#f3ece0" stopOpacity="0.5" />
          <stop offset="0.42" stopColor="#f3ece0" stopOpacity="0.1" />
          <stop offset="1" stopColor="#f3ece0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="baer-sky" cx="0.6" cy="0.45" r="0.8">
          <stop offset="0" stopColor="#1b1a18" />
          <stop offset="1" stopColor="#0d0c0b" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#baer-sky)" />
      {stars.map((s, i) => (
        <circle key={i} cx={f(s.x)} cy={f(s.y)} r={f(s.s)} fill="#f3ece0" fillOpacity={s.o.toFixed(2)} />
      ))}
      <circle cx={cx} cy={cy} r="420" fill="url(#baer-glow)" />
      <g stroke="#f6f0e6" strokeLinecap="round">
        {streaks.map((s, i) => (
          <line
            key={i}
            x1={f(cx + (R + 2) * Math.cos(s.a))}
            y1={f(cy + (R + 2) * Math.sin(s.a))}
            x2={f(cx + (R + s.len) * Math.cos(s.a))}
            y2={f(cy + (R + s.len) * Math.sin(s.a))}
            strokeWidth={s.w.toFixed(2)}
            strokeOpacity={s.o.toFixed(2)}
          />
        ))}
      </g>
      <circle cx={cx} cy={cy} r={R} fill="#070706" stroke="#fffaf2" strokeOpacity="0.85" strokeWidth="1.4" />
    </svg>
  );
}

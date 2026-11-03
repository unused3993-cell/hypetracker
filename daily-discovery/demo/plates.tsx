// Illustrated plates for the demo discoveries, drawn as inline SVG.
// Schematic illustrations made for this demo, not reproductions of historical images.

import type { ReactElement } from "react";

const W = 800;
const H = 1000;

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

function Grain({ id, opacity = 0.07 }: { id: string; opacity?: number }) {
  return (
    <>
      <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="matrix" values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${opacity} 0`} />
      </filter>
    </>
  );
}

// ── Plate: Hakata Bay chart ───────────────────────────────────────────────────
function Hakata({ id }: { id: string }) {
  const ink = "#24406a";
  const red = "#b6402a";
  const land = "#f1ebdd";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true">
      <defs>
        <Grain id={id} />
        <pattern id={`${id}-waves`} width="48" height="24" patternUnits="userSpaceOnUse">
          {[
            [0, 12],
            [48, 12],
            [24, 24],
          ].map(([cx, cy], i) => (
            <g key={i}>
              {[22, 15, 8].map((r) => (
                <circle key={r} cx={cx} cy={cy} r={r} fill={r === 22 ? "#e6dfcd" : "none"} stroke={ink} strokeOpacity="0.22" strokeWidth="1" />
              ))}
            </g>
          ))}
        </pattern>
        <pattern id={`${id}-hatch`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="7" stroke={ink} strokeOpacity="0.16" strokeWidth="1" />
        </pattern>
        <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9" fill="none" stroke={ink} strokeWidth="1.6" />
        </marker>
        <marker id={`${id}-arrow-red`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9" fill="none" stroke={red} strokeWidth="1.6" />
        </marker>
      </defs>
      <rect width={W} height={H} fill="#e6dfcd" />
      <rect width={W} height={H} fill={`url(#${id}-waves)`} />

      {/* Land */}
      <g fill={land} stroke={ink} strokeWidth="1.6" strokeLinejoin="round">
        {/* Korean peninsula */}
        <path d="M0,0 L352,0 C344,52 318,84 292,112 C268,140 236,150 212,184 C186,222 150,236 118,262 C84,290 46,292 0,318 Z" />
        {/* Tsushima */}
        <path d="M318,298 C338,322 334,362 318,392 C306,420 316,450 296,482 C280,508 258,524 248,508 C238,484 258,452 262,420 C266,384 282,350 290,322 C296,302 308,292 318,298 Z" />
        {/* Iki */}
        <path d="M468,606 C494,596 514,612 512,638 C510,662 484,676 464,664 C446,652 448,618 468,606 Z" />
        {/* Northern Kyushu */}
        <path d="M120,1000 L176,918 C194,890 226,872 262,866 C302,860 334,840 356,810 C370,792 390,790 400,808 C408,826 412,852 428,870 C444,886 470,894 492,886 C512,878 516,852 536,842 C562,830 592,836 614,826 C634,818 646,800 668,806 C652,832 644,864 668,884 C694,904 730,894 744,868 C754,850 750,826 766,810 C780,796 790,780 800,774 L800,1000 Z" />
        {/* Takashima */}
        <path d="M452,840 C466,832 480,838 480,852 C480,866 464,872 452,866 C442,860 442,846 452,840 Z" />
      </g>
      <g fill={`url(#${id}-hatch)`} stroke="none">
        <path d="M0,0 L352,0 C344,52 318,84 292,112 C268,140 236,150 212,184 C186,222 150,236 118,262 C84,290 46,292 0,318 Z" />
        <path d="M120,1000 L176,918 C194,890 226,872 262,866 C302,860 334,840 356,810 C370,792 390,790 400,808 C408,826 412,852 428,870 C444,886 470,894 492,886 C512,878 516,852 536,842 C562,830 592,836 614,826 C634,818 646,800 668,806 C652,832 644,864 668,884 C694,904 730,894 744,868 C754,850 750,826 766,810 C780,796 790,780 800,774 L800,1000 Z" />
      </g>

      {/* The coastal wall */}
      <path d="M662,872 C690,900 728,892 742,866" fill="none" stroke={red} strokeWidth="6" strokeLinecap="round" />

      {/* Routes */}
      <path d="M214,178 C250,236 300,248 322,320 C348,410 382,540 452,600 C540,676 646,744 690,842" fill="none" stroke={ink} strokeWidth="2.4" strokeDasharray="10 7" markerEnd={`url(#${id}-arrow)`} />
      <path d="M244,150 C290,214 346,232 360,318 C376,420 420,560 486,598 C520,640 500,760 468,826" fill="none" stroke={ink} strokeWidth="2.6" markerEnd={`url(#${id}-arrow)`} />
      <path d="M0,690 C130,716 300,770 440,840" fill="none" stroke={red} strokeWidth="2.6" markerEnd={`url(#${id}-arrow-red)`} />

      {/* Typhoon */}
      <g transform="translate(466,852)" fill="none" stroke={ink} strokeWidth="1.6" strokeOpacity="0.85">
        {[0, 120, 240].map((r) => (
          <path key={r} transform={`rotate(${r})`} d="M0,-22 C24,-24 40,-4 34,22 M0,-34 C36,-38 58,-6 50,32" />
        ))}
      </g>

      {/* Compass */}
      <g transform="translate(690,120)" stroke={ink} fill="none" strokeWidth="1.2">
        <circle r="34" strokeOpacity="0.5" />
        <path d="M0,-46 L7,0 L0,46 L-7,0 Z" fill={ink} fillOpacity="0.85" />
        <text y="-56" textAnchor="middle" className="pl-mono" fill={ink} stroke="none" fontSize="15">N</text>
      </g>

      {/* Labels */}
      <g className="pl-mono" fill={ink} fontSize="15" letterSpacing="4">
        <text x="44" y="96">GORYEO</text>
        <text x="236" y="968">KYUSHU</text>
      </g>
      <g className="pl-serif" fill={ink} fontStyle="italic" fontSize="26">
        <text x="232" y="560" textAnchor="end">Tsushima</text>
        <text x="440" y="700" textAnchor="end">Iki</text>
        <text x="610" y="950">Hakata Bay</text>
        <text x="372" y="930">Takashima</text>
        <text x="470" y="300" fontSize="30" transform="rotate(38 470 300)" fillOpacity="0.75">Korea Strait</text>
      </g>
      <text x="612" y="978" className="pl-mono" fill={red} fontSize="12" letterSpacing="2">STONE WALL, 1276–</text>

      {/* Legend */}
      <g transform="translate(536,470)" className="pl-mono" fontSize="12" letterSpacing="1">
        <rect x="-18" y="-30" width="252" height="124" fill="#f1ebdd" stroke={ink} strokeWidth="1" />
        <line x1="0" y1="0" x2="54" y2="0" stroke={ink} strokeWidth="2.4" strokeDasharray="10 7" />
        <text x="68" y="5" fill={ink}>1274</text>
        <line x1="0" y1="30" x2="54" y2="30" stroke={ink} strokeWidth="2.6" />
        <text x="68" y="35" fill={ink}>1281 · FROM KOREA</text>
        <line x1="0" y1="60" x2="54" y2="60" stroke={red} strokeWidth="2.6" />
        <text x="68" y="65" fill={red}>1281 · FROM CHINA</text>
      </g>

      <rect width={W} height={H} filter={`url(#${id}-grain)`} />
    </svg>
  );
}

// ── Plate: Strasbourg 1518 ─────────────────────────────────────────────────────
function Strasbourg({ id }: { id: string }) {
  const ink = "#221f1b";
  const ox = "#8a2c1d";
  const r = rng(1518);
  const cx = 400;
  const cy = 400;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const dots = Array.from({ length: 300 }, (_, n) => {
    const rad = 15.5 * Math.sqrt(n + 1);
    const a = n * golden;
    return {
      x: cx + rad * Math.cos(a) + (r() - 0.5) * 6,
      y: cy + rad * Math.sin(a) + (r() - 0.5) * 6,
      s: 2.2 + (n / 300) * 4.2,
      o: Math.max(0.12, 1 - n / 330),
    };
  });
  const houses = [
    [40, 70, 80], [110, 60, 55], [170, 64, 95], [550, 66, 70], [616, 58, 100], [674, 86, 60],
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true">
      <defs>
        <Grain id={id} opacity={0.08} />
      </defs>
      <rect width={W} height={H} fill="#ece4d4" />

      {/* Timeline rings */}
      <g fill="none" stroke={ink} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 5">
        {[70, 160, 250].map((rr) => (
          <circle key={rr} cx={cx} cy={cy} r={rr} />
        ))}
      </g>
      <g>
        {dots.map((d, i) => (
          <circle key={i} cx={f(d.x)} cy={f(d.y)} r={f(d.s)} fill={ox} fillOpacity={d.o.toFixed(2)} />
        ))}
        <circle cx={cx} cy={cy} r="10" fill="#c23b22" />
        <circle cx={cx} cy={cy} r="17" fill="none" stroke="#c23b22" strokeWidth="1.2" />
      </g>
      <g className="pl-mono" fontSize="12.5" letterSpacing="2.5" fill={ink}>
        <text x={cx + 22} y={cy - 22}>14 JULY</text>
        <text x={cx + 74} y={cy - 64} transform={`rotate(-45 ${cx + 74} ${cy - 64})`}>LATE JULY</text>
        <text x={cx + 120} y={cy - 128} transform={`rotate(-45 ${cx + 120} ${cy - 128})`}>AUGUST</text>
        <text x={cx + 182} y={cy - 190} transform={`rotate(-45 ${cx + 182} ${cy - 190})`}>SEPTEMBER</text>
      </g>

      {/* Town and cathedral */}
      <g fill={ink}>
        {houses.map(([x, w, h], i) => (
          <path key={i} d={`M${x},910 L${x},${910 - h} L${x + w / 2},${910 - h - w * 0.55} L${x + w},${910 - h} L${x + w},910 Z`} />
        ))}
        <rect x="262" y="760" width="276" height="150" />
        <rect x="262" y="700" width="78" height="62" />
        <rect x="460" y="700" width="78" height="62" />
        <path d="M272,700 L272,640 L330,640 L330,700 Z" />
        <path d="M272,640 L301,452 L330,640 Z" />
        <path d="M340,760 L400,706 L460,760 Z" />
        <rect x="0" y="908" width={W} height="6" />
      </g>
      <g fill="#ece4d4">
        <circle cx="400" cy="790" r="30" />
        {[300, 400, 500].map((x) => (
          <path key={x} d={`M${x - 20},910 L${x - 20},872 Q${x},838 ${x + 20},872 L${x + 20},910 Z`} />
        ))}
        {[286, 314].map((x) => (
          <rect key={x} x={x - 4} y="652" width="8" height="34" />
        ))}
      </g>
      <g stroke={ink} strokeWidth="2.4">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return <line key={i} x1="400" y1="790" x2={f(400 + 30 * Math.cos(a))} y2={f(790 + 30 * Math.sin(a))} />;
        })}
      </g>
      <circle cx="400" cy="790" r="9" fill={ink} />

      <text x="400" y="964" textAnchor="middle" className="pl-mono" fontSize="14" letterSpacing="5" fill={ink}>
        STRASBOURG · MDXVIII
      </text>
      <rect width={W} height={H} filter={`url(#${id}-grain)`} />
    </svg>
  );
}

// ── Plate: Alexandrite ──────────────────────────────────────────────────────────
function Gem({ cx, cy, R, hue, sat, seed }: { cx: number; cy: number; R: number; hue: number; sat: number; seed: number }) {
  const r = rng(seed);
  const pt = (deg: number, rad: number) => [cx + rad * Math.cos((deg * Math.PI) / 180), cy + rad * Math.sin((deg * Math.PI) / 180)] as const;
  const O = (k: number) => pt(22.5 + 45 * k, R);
  const T = (k: number) => pt(22.5 + 45 * k, R * 0.5);
  const M = (k: number) => pt(45 + 45 * k, R * 0.8);
  const light = (pts: readonly (readonly [number, number])[]) => {
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length - cx;
    const my = pts.reduce((s, p) => s + p[1], 0) / pts.length - cy;
    const dir = (-mx * 0.7 - my * 0.7) / R; // light from the top-left
    return 34 + dir * 22 + (r() - 0.5) * 18;
  };
  const poly = (pts: readonly (readonly [number, number])[]) => pts.map((p) => `${f(p[0])},${f(p[1])}`).join(" ");
  const facets: { pts: (readonly [number, number])[]; l: number }[] = [];
  for (let k = 0; k < 8; k++) {
    const kp = (k + 7) % 8;
    facets.push({ pts: [M(k), O(k), O((k + 1) % 8)], l: 0 });
    facets.push({ pts: [T(k), M(kp), O(k), M(k)], l: 0 });
    facets.push({ pts: [T(k), T((k + 1) % 8), M(k)], l: 0 });
  }
  facets.forEach((fc) => (fc.l = light(fc.pts)));
  const table = Array.from({ length: 8 }, (_, k) => T(k));
  return (
    <g>
      <ellipse cx={cx} cy={cy + R + 26} rx={R * 0.8} ry="12" fill="#000" opacity="0.35" />
      {facets.map((fc, i) => (
        <polygon key={i} points={poly(fc.pts)} fill={`hsl(${hue} ${sat}% ${fc.l.toFixed(0)}%)`} stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
      ))}
      <polygon points={poly(table)} fill={`hsl(${hue} ${sat}% 44%)`} stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
      <polygon points={poly([T(4), T(5), M(4)])} fill="#fff" opacity="0.28" />
      <polygon points={poly([table[5], table[6], [cx, cy] as const])} fill="#fff" opacity="0.12" />
    </g>
  );
}

function Alexandrite({ id }: { id: string }) {
  const x0 = 110;
  const x1 = 690;
  const X = (nm: number) => x0 + ((nm - 400) / 300) * (x1 - x0);
  const base = 880;
  const Y = (t: number) => base - t * 210;
  // Schematic transmission: chromium absorbs in the violet and in the yellow.
  const T = (nm: number) =>
    0.06 +
    0.62 * Math.exp(-(((nm - 492) / 42) ** 2)) +
    0.86 / (1 + Math.exp(-(nm - 655) / 14)) -
    0.04 * Math.exp(-(((nm - 580) / 20) ** 2));
  const curve = Array.from({ length: 151 }, (_, i) => 400 + i * 2)
    .map((nm, i) => `${i ? "L" : "M"}${f(X(nm))},${f(Y(Math.min(0.95, Math.max(0.02, T(nm)))))}`)
    .join(" ");
  const stops = [
    [400, "#5b2a86"], [440, "#3a3fd1"], [480, "#1f8fd6"], [505, "#22b38a"], [540, "#57c13c"],
    [575, "#e4d330"], [600, "#f29b23"], [630, "#ec4e22"], [700, "#9e1a1a"],
  ] as const;
  const fg = "#e9e4da";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true">
      <defs>
        <Grain id={id} opacity={0.12} />
        <linearGradient id={`${id}-spec`} x1="0" x2="1">
          {stops.map(([nm, c]) => (
            <stop key={nm} offset={((nm - 400) / 300).toFixed(3)} stopColor={c} />
          ))}
        </linearGradient>
        <radialGradient id={`${id}-day`} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#dfe9ee" stopOpacity="0.16" />
          <stop offset="1" stopColor="#dfe9ee" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-lamp`} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#ffb25a" stopOpacity="0.2" />
          <stop offset="1" stopColor="#ffb25a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="#17191b" />
      <rect x="0" y="0" width={W / 2} height="560" fill={`url(#${id}-day)`} />
      <rect x={W / 2} y="0" width={W / 2} height="560" fill={`url(#${id}-lamp)`} />
      <line x1={W / 2} y1="70" x2={W / 2} y2="520" stroke={fg} strokeOpacity="0.18" />

      <Gem cx={210} cy={290} R={138} hue={168} sat={48} seed={7} />
      <Gem cx={590} cy={290} R={138} hue={336} sat={58} seed={7} />

      <g className="pl-mono" fill={fg} fontSize="14" letterSpacing="4" textAnchor="middle">
        <text x="210" y="500">DAYLIGHT</text>
        <text x="590" y="500">INCANDESCENT</text>
      </g>
      <g className="pl-serif" fill={fg} fillOpacity="0.6" fontStyle="italic" fontSize="20" textAnchor="middle">
        <text x="210" y="528">rich in blue-green</text>
        <text x="590" y="528">rich in red</text>
      </g>

      {/* Transmission sketch */}
      <text x={x0} y="628" className="pl-mono" fill={fg} fillOpacity="0.7" fontSize="12" letterSpacing="3">
        LIGHT TRANSMITTED · SCHEMATIC
      </text>
      <path d={`${curve} L${x1},${base} L${x0},${base} Z`} fill={fg} fillOpacity="0.07" />
      <path d={curve} fill="none" stroke={fg} strokeWidth="2" />
      <rect x={x0} y={base + 8} width={x1 - x0} height="18" fill={`url(#${id}-spec)`} />
      <line x1={x0} y1={base} x2={x1} y2={base} stroke={fg} strokeOpacity="0.5" />
      <g className="pl-mono" fill={fg} fillOpacity="0.6" fontSize="11" textAnchor="middle">
        {[400, 500, 600, 700].map((nm) => (
          <g key={nm}>
            <line x1={X(nm)} y1={base + 28} x2={X(nm)} y2={base + 34} stroke={fg} strokeOpacity="0.5" />
            <text x={X(nm)} y={base + 50}>{nm} nm</text>
          </g>
        ))}
      </g>
      <g className="pl-serif" fill={fg} fontStyle="italic" fontSize="19" textAnchor="middle">
        <text x={X(492)} y={Y(0.7) - 16}>blue-green window</text>
        <text x={X(670)} y={Y(0.92) - 16}>red window</text>
        <text x={X(578)} y={Y(0.12) - 16} fillOpacity="0.7">absorbed</text>
      </g>
      <rect width={W} height={H} filter={`url(#${id}-grain)`} />
    </svg>
  );
}

// ── Plate: Eclipse of 1919 ─────────────────────────────────────────────────────
function Eclipse({ id }: { id: string }) {
  const r = rng(1919);
  const cx = 400;
  const cy = 450;
  const R = 86;
  const streaks = Array.from({ length: 220 }, () => {
    const a = r() * Math.PI * 2;
    const len = 30 + r() ** 2.2 * 260;
    return { a, len, w: 0.6 + r() * 2.4, o: 0.05 + r() * 0.22 };
  });
  const field = Array.from({ length: 160 }, () => ({ x: r() * W, y: r() * H, s: 0.5 + r() ** 3 * 1.8, o: 0.25 + r() * 0.6 }));
  const hyades = [
    [-150, -110], [170, -60], [-60, 190], [230, 140], [-250, 40], [80, -230], [-190, -250], [300, -170],
    [-300, 230], [140, 300], [20, -160], [-120, 330],
  ];
  const fg = "#efe9dc";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true">
      <defs>
        <Grain id={id} opacity={0.14} />
        <radialGradient id={`${id}-glow`} cx={cx} cy={cy} r="300" gradientUnits="userSpaceOnUse">
          <stop offset="0.28" stopColor="#f6efe0" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#f6efe0" stopOpacity="0.12" />
          <stop offset="1" stopColor="#f6efe0" stopOpacity="0" />
        </radialGradient>
        <marker id={`${id}-tip`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,1 L9,5 L0,9" fill="none" stroke="#d9a441" strokeWidth="1.6" />
        </marker>
      </defs>
      <rect width={W} height={H} fill="#0d0e11" />
      {/* Measuring grid */}
      <g stroke={fg} strokeOpacity="0.14" strokeWidth="1">
        {Array.from({ length: 7 }, (_, i) =>
          Array.from({ length: 9 }, (_, j) => {
            const x = 100 + i * 100;
            const y = 100 + j * 100;
            return <path key={`${i}-${j}`} d={`M${x - 6},${y} H${x + 6} M${x},${y - 6} V${y + 6}`} />;
          }),
        )}
      </g>
      {field.map((s, i) => (
        <circle key={i} cx={f(s.x)} cy={f(s.y)} r={f(s.s)} fill={fg} fillOpacity={s.o.toFixed(2)} />
      ))}
      <circle cx={cx} cy={cy} r="300" fill={`url(#${id}-glow)`} />
      <g stroke="#f6efe0" strokeLinecap="round">
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
      <circle cx={cx} cy={cy} r={R} fill="#050506" stroke="#fffaf0" strokeOpacity="0.9" strokeWidth="1.5" />

      {hyades.map(([dx, dy], i) => {
        const d = Math.hypot(dx, dy);
        const shift = 3600 / d; // deflection falls off with distance from the Sun (exaggerated)
        const ux = dx / d;
        const uy = dy / d;
        const x = cx + dx;
        const y = cy + dy;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="5" fill="none" stroke={fg} strokeOpacity="0.8" strokeWidth="1.2" />
            <line x1={f(x + ux * 6)} y1={f(y + uy * 6)} x2={f(x + ux * shift)} y2={f(y + uy * shift)} stroke="#d9a441" strokeWidth="1.6" markerEnd={`url(#${id}-tip)`} />
            <circle cx={f(x + ux * (shift + 4))} cy={f(y + uy * (shift + 4))} r="3.6" fill={fg} />
          </g>
        );
      })}

      <g className="pl-mono" fill={fg} fontSize="13" letterSpacing="3">
        <text x="48" y="64">29 · V · 1919</text>
        <text x={W - 48} y="64" textAnchor="end">HYADES · TAURUS</text>
      </g>
      <g transform="translate(48,920)" className="pl-mono" fill={fg} fillOpacity="0.75" fontSize="12" letterSpacing="1.5">
        <circle cx="6" cy="-4" r="5" fill="none" stroke={fg} strokeWidth="1.2" />
        <text x="20" y="0">TRUE POSITION</text>
        <circle cx="186" cy="-4" r="3.6" fill={fg} />
        <text x="198" y="0">APPARENT POSITION</text>
        <text x="0" y="28" fillOpacity="0.7">SHIFT GREATLY EXAGGERATED · REAL DEFLECTION ≤ 1.75″</text>
      </g>
      <rect width={W} height={H} filter={`url(#${id}-grain)`} />
    </svg>
  );
}

// ── Plate: Antikythera mechanism ───────────────────────────────────────────────
function gearPath(cx: number, cy: number, r: number, teeth: number, depth: number) {
  const pts: string[] = [];
  const p = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * p;
    const seq: [number, number][] = [
      [a, r - depth],
      [a + p * 0.22, r],
      [a + p * 0.5, r],
      [a + p * 0.72, r - depth],
    ];
    for (const [ang, rad] of seq) pts.push(`${f(cx + rad * Math.cos(ang))},${f(cy + rad * Math.sin(ang))}`);
  }
  return `M${pts.join(" L")} Z`;
}

function Antikythera({ id }: { id: string }) {
  const bronze = "#cfa765";
  const fill = "rgba(207,167,101,0.07)";
  const b1 = { x: 330, y: 650, r: 210 };
  const spokes = [0, 90, 180, 270];
  const spiral = (() => {
    const cx = 290;
    const cy = 230;
    const pts: string[] = [];
    for (let i = 0; i <= 600; i++) {
      const th = (i / 600) * Math.PI * 10;
      const rr = 40 + (26 * th) / (Math.PI * 2);
      pts.push(`${f(cx + rr * Math.cos(th - Math.PI / 2))},${f(cy + rr * Math.sin(th - Math.PI / 2))}`);
    }
    const ticks = Array.from({ length: 235 }, (_, i) => {
      const th = ((i + 0.5) / 235) * Math.PI * 10;
      const rr = 40 + (26 * th) / (Math.PI * 2) + 13;
      const a = th - Math.PI / 2;
      return `M${f(cx + (rr - 6) * Math.cos(a))},${f(cy + (rr - 6) * Math.sin(a))} L${f(cx + (rr + 6) * Math.cos(a))},${f(cy + (rr + 6) * Math.sin(a))}`;
    });
    return { d: `M${pts.join(" L")}`, ticks: ticks.join(" "), cx, cy };
  })();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true">
      <defs>
        <Grain id={id} opacity={0.16} />
        <radialGradient id={`${id}-patina`} cx="0.4" cy="0.55" r="0.8">
          <stop offset="0" stopColor="#3c5d54" />
          <stop offset="1" stopColor="#22352f" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-patina)`} />

      <g fill={fill} stroke={bronze} strokeWidth="2" strokeLinejoin="round">
        {/* Metonic spiral */}
        <path d={spiral.d} fill="none" />
        <path d={spiral.ticks} fill="none" strokeOpacity="0.55" strokeWidth="0.9" />
        <circle cx={spiral.cx} cy={spiral.cy} r="16" />

        {/* b1 main drive wheel */}
        <path d={gearPath(b1.x, b1.y, b1.r, 224, 7)} />
        <circle cx={b1.x} cy={b1.y} r={b1.r - 22} fill="none" />
        {spokes.map((deg) => (
          <g key={deg} transform={`rotate(${deg + 45} ${b1.x} ${b1.y})`}>
            <path d={`M${b1.x + 34},${b1.y - 9} L${b1.x + b1.r - 24},${b1.y - 14} L${b1.x + b1.r - 24},${b1.y + 14} L${b1.x + 34},${b1.y + 9} Z`} />
          </g>
        ))}
        <circle cx={b1.x} cy={b1.y} r="34" />
        <circle cx={b1.x} cy={b1.y} r="8" fill={bronze} />

        {/* Small gear meshing with b1 */}
        <path d={gearPath(590, 650, 46, 48, 7)} />
        <circle cx="590" cy="650" r="8" fill={bronze} />

        {/* e3 — 223 teeth */}
        <path d={gearPath(624, 380, 112, 223, 5)} />
        <circle cx="624" cy="380" r="96" fill="none" strokeOpacity="0.6" />
        <circle cx="624" cy="380" r="20" />
        <circle cx="624" cy="380" r="6" fill={bronze} />

        {/* k1/k2 pin-and-slot pair */}
        <path d={gearPath(626, 860, 58, 50, 6)} />
        <path d={gearPath(640, 852, 50, 50, 6)} strokeOpacity="0.75" />
        <rect x="640" y="814" width="9" height="40" rx="4" fill="none" transform="rotate(-20 644 834)" />
        <circle cx="646" cy="830" r="4" fill={bronze} />
      </g>

      {/* Leaders and labels */}
      <g stroke={bronze} strokeOpacity="0.6" strokeWidth="0.9" fill="none">
        <path d="M486,224 L560,224" />
        <path d="M624,268 L624,230 L660,230" />
        <path d="M140,860 L180,820" />
        <path d="M560,902 L520,940" />
      </g>
      <g className="pl-mono" fill={bronze} fontSize="12.5" letterSpacing="2.4">
        <text x="568" y="228">METONIC · 235 MONTHS</text>
        <text x="668" y="234">e3 · 223 TEETH</text>
        <text x="60" y="880">b1 · DRIVE WHEEL</text>
        <text x="370" y="958">k1 · k2 · PIN AND SLOT</text>
      </g>
      <text x="48" y="64" className="pl-mono" fill={bronze} fontSize="13" letterSpacing="3">
        FRAGMENT A · RECONSTRUCTION SKETCH
      </text>
      <rect width={W} height={H} filter={`url(#${id}-grain)`} />
    </svg>
  );
}

const PLATES: Record<string, (p: { id: string }) => ReactElement> = {
  hakata: Hakata,
  strasbourg: Strasbourg,
  alexandrite: Alexandrite,
  eclipse: Eclipse,
  antikythera: Antikythera,
};

export function DemoPlate({ name, id }: { name: string; id: string }) {
  const Plate = PLATES[name];
  return Plate ? <Plate id={id} /> : null;
}

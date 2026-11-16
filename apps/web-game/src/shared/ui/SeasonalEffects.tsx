import { useMemo } from 'react';

type Season = 'spring' | 'summer' | 'autumn' | 'winter';

function makeItems(count: number, seed: number) {
  return Array.from({ length: count }, (_, i) => {
    const n = (i * 9301 + seed * 49297) % 233280;
    const r = n / 233280;
    const n2 = ((i + 7) * 1103515245 + seed) % 2147483647;
    const r2 = (n2 & 0xffff) / 0xffff;
    const n3 = ((i + 13) * 1664525 + seed) % 4294967296;
    const r3 = (n3 >>> 0) / 4294967296;
    return {
      left: r * 100,
      delay: r2 * 12,
      duration: 8 + r3 * 10,
      size: 0.7 + r * 0.9,
      drift: (r2 - 0.5) * 60,
      opacity: 0.35 + r3 * 0.45,
    };
  });
}

export function SeasonalEffects({ season }: { season: Season }) {
  const spring = useMemo(() => makeItems(18, 11), []);
  const autumn = useMemo(() => makeItems(16, 23), []);
  const winter = useMemo(() => makeItems(28, 37), []);

  if (season === 'spring') {
    return (
      <div className="pointer-events-none fixed inset-0 z-[45] overflow-hidden" aria-hidden>
        {spring.map((it, i) => (
          <span
            key={i}
            className="season-fall season-petal absolute top-[-10%]"
            style={{
              left: `${it.left}%`,
              animationDelay: `${it.delay}s`,
              animationDuration: `${it.duration}s`,
              fontSize: `${14 * it.size}px`,
              opacity: it.opacity,
              ['--drift' as any]: `${it.drift}px`,
            }}
          >
            🌸
          </span>
        ))}
      </div>
    );
  }

  if (season === 'summer') {
    return (
      <div className="pointer-events-none fixed inset-0 z-[45] overflow-hidden" aria-hidden>
        <div className="season-sun-glow absolute -right-16 -top-16 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl sm:h-96 sm:w-96" />
        <div className="season-sun-rays absolute -right-10 -top-10 h-56 w-56 rounded-full border border-amber-200/40 sm:h-72 sm:w-72" />
        <div className="absolute inset-0 bg-gradient-to-b from-amber-100/10 via-transparent to-transparent" />
      </div>
    );
  }

  if (season === 'autumn') {
    return (
      <div className="pointer-events-none fixed inset-0 z-[45] overflow-hidden" aria-hidden>
        {autumn.map((it, i) => (
          <span
            key={i}
            className="season-fall season-leaf absolute top-[-10%]"
            style={{
              left: `${it.left}%`,
              animationDelay: `${it.delay}s`,
              animationDuration: `${it.duration}s`,
              fontSize: `${13 * it.size}px`,
              opacity: it.opacity,
              ['--drift' as any]: `${it.drift}px`,
            }}
          >
            🍂
          </span>
        ))}
      </div>
    );
  }

  // winter
  return (
    <div className="pointer-events-none fixed inset-0 z-[45] overflow-hidden" aria-hidden>
      {winter.map((it, i) => (
        <span
          key={i}
          className="season-fall season-snow absolute top-[-10%] text-white"
          style={{
            left: `${it.left}%`,
            animationDelay: `${it.delay}s`,
            animationDuration: `${7 + it.duration * 0.6}s`,
            fontSize: `${8 + 8 * it.size}px`,
            opacity: 0.45 + it.opacity * 0.5,
            ['--drift' as any]: `${it.drift * 0.6}px`,
            textShadow: '0 0 6px rgba(255,255,255,0.7)',
          }}
        >
          ❄
        </span>
      ))}
    </div>
  );
}

/** Compact, theme-aware adaptation of the supplied Hoardcore header mark. */
export function HoardcoreWordmark() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 430 72" className="h-9 w-auto max-w-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="hoardcore-wordmark-glow" x="-20%" y="-30%" width="140%" height="160%">
        <feGaussianBlur stdDeviation="3" result="glow" />
        <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <linearGradient id="hoardcore-wordmark-metal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--foreground)" />
        <stop offset="100%" stopColor="var(--muted-foreground)" />
      </linearGradient>
      <linearGradient id="hoardcore-wordmark-accent" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--foreground)" />
        <stop offset="55%" stopColor="var(--primary)" />
        <stop offset="100%" stopColor="var(--primary)" />
      </linearGradient>
    </defs>
    <path d="M12 14 4 22v28l8 8" fill="none" stroke="var(--primary)" strokeWidth="2.5" />
    <rect x="4" y="32" width="2.5" height="8" fill="var(--primary)" filter="url(#hoardcore-wordmark-glow)" />
    <g fontFamily="var(--font-sans)" fontSize="49" fontWeight="900" fontStyle="italic" letterSpacing=".035em">
      <text x="30" y="52" fill="none" stroke="var(--primary)" strokeWidth="5" opacity=".48" filter="url(#hoardcore-wordmark-glow)">HOARDCORE</text>
      <text x="30" y="52" fill="none" stroke="var(--background)" strokeWidth="3">HOARDCORE</text>
      <text x="30" y="52" fill="url(#hoardcore-wordmark-metal)">HOARD<tspan fill="url(#hoardcore-wordmark-accent)">CORE</tspan></text>
    </g>
    <text x="35" y="66" fill="var(--primary)" fontFamily="var(--font-mono)" fontWeight="700" fontSize="8.5" letterSpacing=".3em">INVENTORY ACQUISITION ENGINE</text>
    <path d="M357 52h48" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" opacity=".55" />
    <path d="M383 52h22" fill="none" stroke="var(--primary)" strokeWidth="2" />
    <circle cx="413" cy="52" r="2.5" fill="var(--primary)" filter="url(#hoardcore-wordmark-glow)" />
  </svg>
}

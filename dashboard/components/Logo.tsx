export interface LogoProps {
  size?: number;
}

/**
 * karst mark — Rocky, the Eridian, as he appears preserved in his crystalline
 * containment case (Project Hail Mary): a faceted warm-stone specimen with a
 * small green gem, framed by a translucent crystal.
 */
export function Logo({ size = 28 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      aria-label="karst logo"
    >
      {/* crystal containment */}
      <polygon points="20,2.5 36,20 20,37.5 4,20" fill="#818cf8" fillOpacity={0.07} stroke="#c7d2fe" strokeOpacity={0.5} strokeWidth={1} strokeLinejoin="round" />
      <line x1="20" y1="2.5" x2="13" y2="11" stroke="#e0e7ff" strokeOpacity={0.4} strokeWidth={0.8} strokeLinecap="round" />

      {/* faceted rock body */}
      <g stroke="#4a3420" strokeWidth={0.6} strokeLinejoin="round">
        <polygon points="20,7 31,14 19,19" fill="#c39a6b" />
        <polygon points="31,14 28,30 19,19" fill="#a3744a" />
        <polygon points="28,30 16,33 19,19" fill="#8f6840" />
        <polygon points="16,33 9,24 19,19" fill="#a87c54" />
        <polygon points="9,24 11,12 19,19" fill="#b9895c" />
        <polygon points="11,12 20,7 19,19" fill="#cca57a" />
      </g>
      <polygon points="20,7 31,14 19,19 11,12" fill="#d9b88c" opacity={0.35} />
      <path d="M19,19 L22,24 M19,19 L15,21" stroke="#5c4226" strokeWidth={0.5} fill="none" strokeLinecap="round" />

      {/* green gem */}
      <circle cx="24" cy="12.5" r="1.7" fill="#34d399" />
      <circle cx="23.4" cy="11.9" r="0.5" fill="#d1fae5" />

      {/* crisp outline */}
      <polygon points="20,7 31,14 28,30 16,33 9,24 11,12" fill="none" stroke="#3a2a18" strokeWidth={1} strokeLinejoin="round" />
    </svg>
  );
}

export default Logo;

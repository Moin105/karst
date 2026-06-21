export interface LogoProps {
  size?: number;
}

/**
 * karst mark — an original faceted rock-creature: a stone-textured body with
 * raised arms and a small emerald gem. Nods to karst (rocky terrain) without
 * copying any specific character. Stone facets use speckled/hatched patterns.
 */
export function Logo({ size = 28 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      aria-label="karst logo"
    >
      <defs>
        <pattern id="ksStoneL" width={6} height={6} patternUnits="userSpaceOnUse">
          <rect width={6} height={6} fill="#cca57a" />
          <circle cx={1.5} cy={2} r={0.7} fill="#a3744a" />
          <circle cx={4.6} cy={4.4} r={0.6} fill="#a3744a" />
          <circle cx={3.2} cy={0.8} r={0.4} fill="#e6cca0" />
          <path d="M0 6L6 0" stroke="#a3744a" strokeWidth={0.35} opacity={0.5} />
        </pattern>
        <pattern id="ksStoneM" width={6} height={6} patternUnits="userSpaceOnUse">
          <rect width={6} height={6} fill="#b9895c" />
          <circle cx={2} cy={1.6} r={0.7} fill="#8f6840" />
          <circle cx={4.8} cy={4} r={0.6} fill="#8f6840" />
          <circle cx={1} cy={4.6} r={0.4} fill="#cca57a" />
          <path d="M0 6L6 0" stroke="#8f6840" strokeWidth={0.35} opacity={0.5} />
        </pattern>
        <pattern id="ksStoneD" width={6} height={6} patternUnits="userSpaceOnUse">
          <rect width={6} height={6} fill="#8f6840" />
          <circle cx={1.6} cy={2.2} r={0.7} fill="#5c4226" />
          <circle cx={4.4} cy={4.6} r={0.6} fill="#5c4226" />
          <circle cx={3} cy={1} r={0.4} fill="#b9895c" />
          <path d="M0 6L6 0" stroke="#5c4226" strokeWidth={0.35} opacity={0.5} />
        </pattern>
      </defs>

      {/* legs */}
      <path d="M26 55L21 62M38 55L43 62" stroke="#3a2a18" strokeWidth={5} strokeLinecap="round" />
      <path d="M26 55L21 62M38 55L43 62" stroke="#a3744a" strokeWidth={3} strokeLinecap="round" />

      {/* arms + claws */}
      <path d="M22 36L12 24L8 13M42 36L52 24L56 13" stroke="#3a2a18" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 13L5 8M8 13L11 8M56 13L53 8M56 13L59 8" stroke="#3a2a18" strokeWidth={3} strokeLinecap="round" />
      <path d="M22 36L12 24L8 13M42 36L52 24L56 13" stroke="#b9895c" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />

      {/* faceted, patterned stone body */}
      <polygon points="32,28 18,38 24,56 32,52" fill="url(#ksStoneM)" />
      <polygon points="32,28 46,38 40,56 32,52" fill="url(#ksStoneD)" />
      <polygon points="24,33 32,28 40,33 32,38" fill="url(#ksStoneL)" />
      <polygon points="32,28 46,38 40,56 24,56 18,38" fill="none" stroke="#3a2a18" strokeWidth={1.2} strokeLinejoin="round" />
      <line x1={32} y1={38} x2={32} y2={52} stroke="#3a2a18" strokeWidth={0.8} />

      {/* emerald gem + joint accents */}
      <circle cx={12} cy={24} r={1.7} fill="#34d399" />
      <circle cx={52} cy={24} r={1.7} fill="#34d399" />
      <circle cx={32} cy={42} r={2.7} fill="#34d399" />
      <circle cx={31.1} cy={41.1} r={0.9} fill="#d1fae5" />
    </svg>
  );
}

export default Logo;

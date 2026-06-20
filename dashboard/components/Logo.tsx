export interface LogoProps {
  size?: number;
}

const ANGLES = [0, 72, 144, 216, 288];
const LIMB =
  "M17.5,19.5 L18.6,9.8 Q19,4.8 20,4.2 Q21,4.8 21.4,9.8 L22.5,19.5 Z";

/**
 * karst mark — Rocky, the five-legged Eridian rock-being from Project Hail
 * Mary: a domed carapace on five tapering hands. White outlines, purple rock.
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
      {ANGLES.map((a) => (
        <g key={a} transform={`rotate(${a} 20 20)`}>
          <path d={LIMB} fill="#818cf8" stroke="#ffffff" strokeWidth={1} strokeLinejoin="round" />
          <line x1="20" y1="4.6" x2="18.8" y2="2.6" stroke="#ffffff" strokeWidth={1} strokeLinecap="round" />
          <line x1="20" y1="4.6" x2="21.2" y2="2.6" stroke="#ffffff" strokeWidth={1} strokeLinecap="round" />
        </g>
      ))}
      {/* carapace dome */}
      <circle cx="20" cy="20" r="6.2" fill="#6366f1" stroke="#ffffff" strokeWidth={1.2} />
      <ellipse cx="18.2" cy="18" rx="2.3" ry="1.5" fill="#a5b4fc" opacity="0.75" />
    </svg>
  );
}

export default Logo;

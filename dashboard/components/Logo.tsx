export interface LogoProps {
  size?: number;
}

/**
 * karst mark — a pentapod ("Rocky", the Eridian rock-being from Project Hail
 * Mary): five legs radiating from a faceted carapace. Doubles as a code
 * dependency graph (nodes + edges). White on dark, purple carapace.
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
      {/* legs */}
      <line x1="20" y1="13.6" x2="20" y2="4.5" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="26.09" y1="18.02" x2="34.74" y2="15.21" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="23.76" y1="25.18" x2="29.11" y2="32.54" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="16.24" y1="25.18" x2="10.89" y2="32.54" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="13.91" y1="18.02" x2="5.26" y2="15.21" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />

      {/* feet */}
      <circle cx="20" cy="4.5" r="2.1" fill="#ffffff" />
      <circle cx="34.74" cy="15.21" r="2.1" fill="#ffffff" />
      <circle cx="29.11" cy="32.54" r="2.1" fill="#ffffff" />
      <circle cx="10.89" cy="32.54" r="2.1" fill="#ffffff" />
      <circle cx="5.26" cy="15.21" r="2.1" fill="#ffffff" />

      {/* carapace */}
      <polygon
        points="20,13.6 26.09,18.02 23.76,25.18 16.24,25.18 13.91,18.02"
        fill="#818cf8"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* faceted core */}
      <polygon
        points="20,16.8 23.04,19.01 21.88,22.59 18.12,22.59 16.96,19.01"
        fill="#6366f1"
      />
    </svg>
  );
}

export default Logo;

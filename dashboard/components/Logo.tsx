export interface LogoProps {
  size?: number;
}

export function Logo({ size = 28 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      aria-label="karst logo"
    >
      {/* connecting lines */}
      <line x1="16" y1="16" x2="6" y2="6" stroke="#ffffff" strokeWidth="1.5" />
      <line x1="16" y1="16" x2="26" y2="8" stroke="#ffffff" strokeWidth="1.5" />
      <line x1="16" y1="16" x2="16" y2="28" stroke="#ffffff" strokeWidth="1.5" />

      {/* satellite circles */}
      <circle cx="6" cy="6" r="2.5" fill="#ffffff" />
      <circle cx="26" cy="8" r="2.5" fill="#ffffff" />
      <circle cx="16" cy="28" r="2.5" fill="#ffffff" />

      {/* center node */}
      <circle cx="16" cy="16" r="5" fill="#818cf8" />
    </svg>
  );
}

export default Logo;

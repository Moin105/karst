// Formatting helpers used across dashboard pages.

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '$0.00';
  const abs = Math.abs(n);
  // Show up to 4 decimals for small amounts (typical per-query cost),
  // otherwise default to 2 decimals.
  const fractionDigits = abs > 0 && abs < 1 ? 4 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

export function formatRelative(unixMs: number | null | undefined): string {
  if (!unixMs) return '—';
  const diff = Date.now() - unixMs;
  const abs = Math.abs(diff);
  const future = diff < 0;
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  let phrase: string;
  if (sec < 45) phrase = 'just now';
  else if (min < 60) phrase = `${min}m`;
  else if (hr < 24) phrase = `${hr}h`;
  else if (day < 30) phrase = `${day}d`;
  else if (day < 365) phrase = `${Math.round(day / 30)}mo`;
  else phrase = `${Math.round(day / 365)}y`;

  if (phrase === 'just now') return phrase;
  return future ? `in ${phrase}` : `${phrase} ago`;
}

export function formatDate(unixMs: number | null | undefined): string {
  if (!unixMs) return '—';
  const d = new Date(unixMs);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function severityColor(s: string | null | undefined): 'default' | 'success' | 'warning' | 'danger' {
  switch (s) {
    case 'bug':
      return 'danger';
    case 'idea':
      return 'warning';
    case 'praise':
      return 'success';
    case 'question':
    default:
      return 'default';
  }
}

export function statusColor(s: string | null | undefined): 'default' | 'success' | 'warning' | 'danger' {
  switch (s) {
    // feedback statuses
    case 'new':
      return 'warning';
    case 'triaged':
      return 'default';
    case 'replied':
      return 'success';
    case 'closed':
      return 'default';
    // partner statuses
    case 'lead':
      return 'default';
    case 'contacted':
      return 'warning';
    case 'demo_booked':
      return 'warning';
    case 'piloting':
      return 'success';
    case 'paying':
      return 'success';
    case 'lost':
      return 'danger';
    // blog statuses
    case 'draft':
      return 'warning';
    case 'published':
      return 'success';
    default:
      return 'default';
  }
}

export function trimMd(s: string | null | undefined, n: number): string {
  if (!s) return '';
  // Strip basic markdown syntax for a clean preview.
  const stripped = s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= n) return stripped;
  return stripped.slice(0, n).trimEnd() + '…';
}

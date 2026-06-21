// Public, aggregate PyPI download stats from pypistats.org.
//
// IMPORTANT: PyPI exposes only ANONYMOUS, AGGREGATE download counts — never who
// installed a package (no names, emails, or IPs). This is by design. So this
// module can answer "how many / which versions / which OS", never "who".
//
// Data notes: pypistats lags ~1 day, keeps ~180 days, and 404s for packages it
// hasn't ingested yet (brand-new / very-low-download). All failures degrade to
// `available: false` so the page renders cleanly.

const PACKAGE = process.env.KARST_PYPI_PACKAGE || 'karst';
const BASE = 'https://pypistats.org/api/packages';

export type DayPoint = { date: string; count: number };
export type Breakdown = { label: string; downloads: number };

export type PypiStats = {
  available: boolean;
  package: string;
  lastDay: number;
  lastWeek: number;
  lastMonth: number;
  perDay: DayPoint[];        // downloads/day (mirrors excluded), oldest→newest
  byPython: Breakdown[];     // summed over the returned window
  bySystem: Breakdown[];     // summed over the returned window
};

async function getJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${BASE}/${PACKAGE}${path}`, {
      headers: { 'User-Agent': 'karst-admin-dashboard' },
      // Cache for an hour — pypistats only updates daily, and this keeps us well
      // under their fair-use limits.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function sumByCategory(rows: Array<{ category: string | null; downloads: number }> | undefined): Breakdown[] {
  if (!rows) return [];
  const totals = new Map<string, number>();
  for (const r of rows) {
    const label = r.category == null || r.category === 'null' ? 'unknown' : String(r.category);
    totals.set(label, (totals.get(label) ?? 0) + (r.downloads || 0));
  }
  return [...totals.entries()]
    .map(([label, downloads]) => ({ label, downloads }))
    .filter((b) => b.downloads > 0)
    .sort((a, b) => b.downloads - a.downloads);
}

export async function getPypiStats(): Promise<PypiStats> {
  const empty: PypiStats = {
    available: false,
    package: PACKAGE,
    lastDay: 0,
    lastWeek: 0,
    lastMonth: 0,
    perDay: [],
    byPython: [],
    bySystem: [],
  };

  const [recent, overall, python, system] = await Promise.all([
    getJson('/recent'),
    getJson('/overall?mirrors=false'),
    getJson('/python_minor'),
    getJson('/system'),
  ]);

  // If even the lightweight `recent` endpoint is missing, treat as no data.
  if (!recent && !overall) return empty;

  const perDay: DayPoint[] = (overall?.data ?? [])
    .map((d: { date: string; downloads: number }) => ({ date: d.date, count: d.downloads || 0 }))
    .sort((a: DayPoint, b: DayPoint) => a.date.localeCompare(b.date));

  const byPython = sumByCategory(python?.data).map((b) => ({
    ...b,
    label: /^\d/.test(b.label) ? `Python ${b.label}` : b.label,
  }));

  return {
    available: true,
    package: PACKAGE,
    lastDay: recent?.data?.last_day ?? 0,
    lastWeek: recent?.data?.last_week ?? 0,
    lastMonth: recent?.data?.last_month ?? 0,
    perDay,
    byPython,
    bySystem: sumByCategory(system?.data),
  };
}

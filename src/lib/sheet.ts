import { parse } from 'csv-parse/sync';
import covers from '../data/covers.json'; // written by scripts/fetch-covers.mjs

const SHEET_ID = '1ICIoxSlUR9LZJMr_RaHG2F1pBWHZuN8obxa_XUttOIk';

export type Game = {
  name: string;
  icon: string;
  earned: number;
  total: number;
  percent: number;
  notes: string;
  lastPlayed: string;
  lastPlayedTs: number;
  review: string;
};

type Row = string[];

// The sheet is shared publicly, so Google serves each tab as CSV at build time.
async function fetchTab(tab: string): Promise<Row[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch "${tab}" tab: ${res.status}`);
  return parse(await res.text(), { relax_column_count: true });
}

// "28.09.2026" -> timestamp
function parseDate(s: string): number {
  const [d, m, y] = s.split('.').map(Number);
  return d && m && y ? Date.UTC(y, m - 1, d) : 0;
}

export async function getGames(): Promise<Game[]> {
  const rows = await fetchTab('Games');
  const [header = [], ...body] = rows;
  const col = (prefix: string) => header.findIndex((h) => h?.trim().toLowerCase().startsWith(prefix));
  const idx = {
    name: col('game'),
    ach: col('achievements'),
    notes: col('additional'),
    last: col('last played'),
    review: col('review'),
  };

  return body
    .map((row, i) => {
      const get = (n: number) => (n >= 0 ? (row[n] ?? '').trim() : '');
      const [earned = 0, total = 0] = get(idx.ach).split('/').map((n) => Number(n) || 0);
      const lastPlayed = get(idx.last);
      return {
        name: get(idx.name),
        icon: (covers as Record<string, string>)[i + 2] ?? '', // i=0 is sheet row 2 (row 1 is the header)
        earned,
        total,
        percent: total ? Math.round((earned / total) * 100) : 0,
        notes: get(idx.notes),
        lastPlayed,
        lastPlayedTs: parseDate(lastPlayed),
        review: get(idx.review),
      };
    })
    .filter((g) => g.name)
    .sort((a, b) => b.lastPlayedTs - a.lastPlayedTs);
}

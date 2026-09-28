import { parse } from 'csv-parse/sync';
import covers from '../data/covers.json'; // written by scripts/fetch-covers.mjs
import { franchiseOf } from '../data/franchises';

const SHEET_ID = '1ICIoxSlUR9LZJMr_RaHG2F1pBWHZuN8obxa_XUttOIk';

export type Game = {
  name: string;
  icon: string;
  achievements: string; // as written in the sheet
  earned: number;
  total: number;
  percent: number;
  platinum: boolean;
  notes: string;
  lastPlayed: string;
  lastPlayedTs: number;
  review: string;
  franchise: string;
  complete: boolean;
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
    franchise: col('franchise'),
  };

  return body
    .map((row, i) => {
      const get = (n: number) => (n >= 0 ? (row[n] ?? '').trim() : '');
      // Formats seen: "29/80", "10/10 (all)", "30/30 (Platinum)", "23/59 Trophies", "1718/?", "-", "Platinum Trophy"
      const achievements = get(idx.ach);
      const m = /(\d+)\s*\/\s*(\d+|\?)/.exec(achievements);
      const earned = m ? Number(m[1]) : 0;
      const total = m && m[2] !== '?' ? Number(m[2]) : 0;
      const lastPlayed = get(idx.last);
      return {
        name: get(idx.name),
        icon: (covers as Record<string, string>)[i + 2] ?? '', // i=0 is sheet row 2 (row 1 is the header)
        achievements: achievements === '-' ? '' : achievements,
        earned,
        total,
        percent: total ? Math.round((earned / total) * 100) : -1, // -1: unknown total
        platinum: /platinum/i.test(achievements),
        notes: get(idx.notes),
        lastPlayed,
        lastPlayedTs: parseDate(lastPlayed),
        review: get(idx.review),
        franchise: get(idx.franchise) || franchiseOf(get(idx.name)),
        complete: /\(all\)/i.test(achievements) || (total > 0 && earned >= total),
      };
    })
    .filter((g) => g.name)
    .sort((a, b) => b.lastPlayedTs - a.lastPlayedTs);
}

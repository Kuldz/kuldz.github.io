import { parse } from 'csv-parse/sync';

const SHEET_ID = '1ICIoxSlUR9LZJMr_RaHG2F1pBWHZuN8obxa_XUttOIk';
const API_KEY: string | undefined = import.meta.env.SHEETS_API_KEY ?? process.env.SHEETS_API_KEY;

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

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheets request failed: ${res.status} ${url.replace(/key=[^&]+/, 'key=***')}`);
  return res.json();
}

// Sheets API: displayed values plus, separately, column A as raw formulas (=IMAGE("url")).
async function fetchViaApi(tab: string): Promise<{ rows: Row[]; icons: string[] }> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values`;
  const tabName = encodeURIComponent(tab);
  const [values, formulas] = await Promise.all([
    fetchJson(`${base}/${tabName}?key=${API_KEY}`),
    fetchJson(`${base}/${tabName}!A:A?valueRenderOption=FORMULA&key=${API_KEY}`),
  ]);
  const icons = (formulas.values ?? []).map((r: string[]) => /=IMAGE\(\s*"([^"]+)"/i.exec(r[0] ?? '')?.[1] ?? '');
  return { rows: values.values ?? [], icons };
}

// No key: public CSV export. Same data, but IMAGE() cells come through empty.
async function fetchViaCsv(tab: string): Promise<{ rows: Row[]; icons: string[] }> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch "${tab}" tab: ${res.status}`);
  const rows: Row[] = parse(await res.text(), { skip_empty_lines: true, relax_column_count: true });
  return { rows, icons: [] };
}

// "28.09.2026" -> timestamp
function parseDate(s: string): number {
  const [d, m, y] = s.split('.').map(Number);
  return d && m && y ? Date.UTC(y, m - 1, d) : 0;
}

export async function getGames(): Promise<Game[]> {
  const { rows, icons } = API_KEY ? await fetchViaApi('Games') : await fetchViaCsv('Games');
  console.log(`[sheet] source=${API_KEY ? 'api' : 'csv (no SHEETS_API_KEY)'} rows=${rows.length} icons=${icons.filter(Boolean).length}`);
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
        icon: icons[i + 1] ?? '', // +1: icons include the header row
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

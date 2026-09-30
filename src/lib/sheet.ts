import { parse } from 'csv-parse/sync';
import covers from '../data/covers.json'; // written by scripts/fetch-covers.mjs
import { franchiseOf } from '../data/franchises';
import { platformOverrides } from '../data/platforms';

const SHEET_ID = '1ICIoxSlUR9LZJMr_RaHG2F1pBWHZuN8obxa_XUttOIk';

type Row = string[];

export type Game = {
  name: string;
  icon: string;
  achievements: string; // as written in the sheet
  earned: number;
  total: number;
  percent: number;
  platinum: boolean;
  platform: string; // 'pc', 'playstation', or whatever the sheet/overrides say (e.g. 'switch')
  notes: string;
  lastPlayed: string;
  lastPlayedTs: number;
  review: string;
  franchise: string;
  complete: boolean;
  everything: boolean; // optional "Everything" column: played to pieces, beyond achievements
  ongoing: boolean; // marked "ongoing:" in the Backlog tab
};

export type Masterpiece = {
  name: string;
  icon: string;
  rating: number;
  fields: { label: string; value: string }[]; // every other column, labelled with the sheet's header
};

export type BacklogItem = {
  name: string;
  icon: string;
  why: string;
  ongoing: boolean;
  playedBefore: boolean;
  hoursBeat: number | null;
  hours100: number | null;
  priority: number;
  game?: Game; // matching row from the Games tab, for progress
};

const iconFor = (tab: string, sheetRow: number): string =>
  (covers as Record<string, Record<string, string>>)[tab]?.[sheetRow] ?? '';

// The sheet is shared publicly, so Google serves each tab as CSV at build time.
const tabs = new Map<string, Promise<Row[]>>();
function fetchTab(tab: string): Promise<Row[]> {
  if (!tabs.has(tab)) {
    tabs.set(
      tab,
      (async () => {
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch "${tab}" tab: ${res.status}`);
        return parse(await res.text(), { relax_column_count: true });
      })(),
    );
  }
  return tabs.get(tab)!;
}

// "28.09.2026" -> timestamp
function parseDate(s: string): number {
  const [d, m, y] = s.split('.').map(Number);
  return d && m && y ? Date.UTC(y, m - 1, d) : 0;
}

// Match names across tabs ignoring case and punctuation ("Resident Evil 7: Biohazard" == "Resident Evil 7 Biohazard").
const norm = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const findCol = (header: Row, prefix: string) =>
  header.findIndex((h) => h?.trim().toLowerCase().startsWith(prefix));

// Order of precedence: "Platform" column in the sheet, override list, then the achievements text.
// Non-Steam PC launchers (Battle.net, Ubisoft, ...) still count as PC.
function platformOf(column: string, name: string, achievements: string): string {
  const c = (column || platformOverrides[name] || '').toLowerCase().trim();
  if (/^(ps|playstation)/.test(c)) return 'playstation';
  if (c === 'steam') return 'pc';
  if (c) return c;
  return /trophies|platinum/i.test(achievements) ? 'playstation' : 'pc';
}

let gamesPromise: Promise<Game[]> | undefined;
function loadGames(): Promise<Game[]> {
  gamesPromise ??= (async () => {
    const [header = [], ...body] = await fetchTab('Games');
    const idx = {
      name: findCol(header, 'game'),
      ach: findCol(header, 'achievements'),
      notes: findCol(header, 'additional'),
      last: findCol(header, 'last played'),
      review: findCol(header, 'review'),
      franchise: findCol(header, 'franchise'),
      platform: findCol(header, 'platform'),
      everything: findCol(header, 'everything'),
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
          icon: iconFor('Games', i + 2), // i=0 is sheet row 2 (row 1 is the header)
          achievements: achievements === '-' ? '' : achievements,
          earned,
          total,
          percent: total ? Math.round((earned / total) * 100) : -1, // -1: unknown total
          platinum: /platinum/i.test(achievements),
          platform: platformOf(get(idx.platform), get(idx.name), achievements),
          notes: get(idx.notes),
          lastPlayed,
          lastPlayedTs: parseDate(lastPlayed),
          review: get(idx.review),
          franchise: get(idx.franchise) || franchiseOf(get(idx.name)),
          complete: /\(all\)/i.test(achievements) || (total > 0 && earned >= total),
          everything: !!get(idx.everything) && !/^(no|n|0|false|-)$/i.test(get(idx.everything)),
          ongoing: false,
        };
      })
      .filter((g) => g.name)
      .sort((a, b) => b.lastPlayedTs - a.lastPlayedTs);
  })();
  return gamesPromise;
}

let backlogPromise: Promise<Omit<BacklogItem, 'game'>[]> | undefined;
function loadBacklog() {
  backlogPromise ??= (async () => {
    const [header = [], ...body] = await fetchTab('Backlog');
    const idx = {
      name: findCol(header, 'game'),
      why: findCol(header, 'why'),
      beat: findCol(header, 'hours to beat'),
      full: findCol(header, 'hours to 100'),
      priority: findCol(header, 'priority'),
    };
    const hours = (s: string) => (s && !Number.isNaN(Number(s)) ? Number(s) : null);

    return body
      .map((row, i) => {
        const get = (n: number) => (n >= 0 ? (row[n] ?? '').trim() : '');
        const why = get(idx.why);
        return {
          name: get(idx.name),
          icon: iconFor('Backlog', i + 2),
          why: why.replace(/^ongoing:\s*/i, ''),
          ongoing: /^ongoing\b/i.test(why),
          playedBefore: /^played before\b/i.test(why),
          hoursBeat: hours(get(idx.beat)),
          hours100: hours(get(idx.full)),
          priority: Number(get(idx.priority)) || 0,
        };
      })
      .filter((b) => b.name);
  })();
  return backlogPromise;
}

export async function getGames(): Promise<Game[]> {
  const [games, backlog] = await Promise.all([loadGames(), loadBacklog()]);
  const ongoing = new Set(backlog.filter((b) => b.ongoing).map((b) => norm(b.name)));
  return games.map((g) => ({ ...g, ongoing: ongoing.has(norm(g.name)) }));
}

export async function getBacklog(): Promise<BacklogItem[]> {
  const [games, backlog] = await Promise.all([loadGames(), loadBacklog()]);
  const byName = new Map(games.map((g) => [norm(g.name), g]));
  return backlog.map((b) => ({ ...b, game: byName.get(norm(b.name)) }));
}

export async function getMasterpieces(): Promise<Masterpiece[]> {
  const [header = [], ...body] = await fetchTab('Masterpieces');
  const idx = { name: findCol(header, 'game'), rating: findCol(header, 'rating') };
  // Any other column (besides the thumbnail) is shown with its header as the label.
  const factCols = header
    .map((h, i) => ({ label: (h ?? '').trim(), i }))
    .filter((c) => c.label && c.i !== idx.name && c.i !== idx.rating && !/^thumbnail/i.test(c.label));

  return body
    .map((row, i) => {
      const get = (n: number) => (n >= 0 ? (row[n] ?? '').trim() : '');
      return {
        name: get(idx.name),
        icon: iconFor('Masterpieces', i + 2),
        rating: Number(get(idx.rating)) || 0,
        fields: factCols.map((c) => ({ label: c.label, value: get(c.i) })).filter((f) => f.value),
      };
    })
    .filter((m) => m.name)
    .sort((a, b) => b.rating - a.rating);
}

export type InfoSection = { title: string; items: { label: string; value: string }[] };

// The Info tab has no header row: a row with only its first cell filled starts a section,
// and rows with a label and a value belong to the section above.
export async function getInfo(): Promise<InfoSection[]> {
  const rows = await fetchTab('Info');
  const sections: InfoSection[] = [];
  for (const row of rows) {
    const label = (row[0] ?? '').trim();
    const value = (row[1] ?? '').trim();
    if (!label) continue;
    if (!value) {
      sections.push({ title: label, items: [] });
    } else {
      if (!sections.length) sections.push({ title: '', items: [] });
      sections[sections.length - 1].items.push({ label, value });
    }
  }
  return sections;
}

// The sheet's own column headers, so the site can label things in the sheet's words.
export async function getLabels() {
  const [games, backlog] = await Promise.all([fetchTab('Games'), fetchTab('Backlog')]);
  const pick = (header: Row = [], prefix: string, fallback: string) => {
    const i = findCol(header, prefix);
    return (i >= 0 && header[i]?.trim()) || fallback;
  };
  return {
    achievements: pick(games[0], 'achievements', 'Achievements'),
    notes: pick(games[0], 'additional', 'Notes'),
    lastPlayed: pick(games[0], 'last played', 'Last played'),
    review: pick(games[0], 'review', 'Review'),
    why: pick(backlog[0], 'why', 'Why'),
  };
}

// "Last Played / Updated" -> "Last played" (short form for narrow column headings)
export const shortLabel = (s: string) => {
  const t = s.split(' / ')[0].trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

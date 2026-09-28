// Pulls the in-cell icons out of the sheet's XLSX export (the Sheets API doesn't expose them).
// Writes public/covers/<sheet row>.<ext> and src/data/covers.json ({ "<sheet row>": "/covers/<file>" }).
// Never fails the build: on any error the site just renders placeholders.
import { unzipSync, strFromU8 } from 'fflate';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const SHEET_ID = '1ICIoxSlUR9LZJMr_RaHG2F1pBWHZuN8obxa_XUttOIk';
const OUT_DIR = 'public/covers';
const MAP_FILE = 'src/data/covers.json';

const covers = {};

try {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`);
  if (!res.ok) throw new Error(`export failed: ${res.status}`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const text = (path) => strFromU8(files[path]);

  // Games is the first tab: sheet1 -> its drawing -> anchors (row) -> image rIds -> media files.
  const sheetRels = text('xl/worksheets/_rels/sheet1.xml.rels');
  const drawingPath = 'xl/drawings/' + /drawings\/(drawing\d+\.xml)/.exec(sheetRels)?.[1];
  const drawing = text(drawingPath);
  const drawingRels = text(drawingPath.replace('drawings/', 'drawings/_rels/') + '.rels');
  const media = Object.fromEntries(
    [...drawingRels.matchAll(/Id="([^"]+)"[^>]*Target="\.\.\/media\/([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const anchors = drawing.split(/<xdr:(?:one|two|absolute)CellAnchor/).slice(1);
  for (const a of anchors) {
    const col = Number(/<xdr:col>(\d+)</.exec(a)?.[1]);
    const row = Number(/<xdr:row>(\d+)</.exec(a)?.[1]); // 0-based
    const file = media[/r:embed="([^"]+)"/.exec(a)?.[1]];
    if (col !== 0 || Number.isNaN(row) || !file || !files[`xl/media/${file}`]) continue;
    const name = `${row + 1}.${file.split('.').pop()}`; // 1-based sheet row
    writeFileSync(`${OUT_DIR}/${name}`, files[`xl/media/${file}`]);
    covers[row + 1] = `/covers/${name}`;
  }
  console.log(`[covers] extracted ${Object.keys(covers).length} icons`);
} catch (err) {
  console.warn(`[covers] skipped, using placeholders: ${err.message}`);
}

mkdirSync('src/data', { recursive: true });
writeFileSync(MAP_FILE, JSON.stringify(covers));

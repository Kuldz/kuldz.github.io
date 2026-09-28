// Pulls the in-cell icons out of the sheet's XLSX export (the Sheets API doesn't expose them).
// Writes public/covers/<tab>-<sheet row>.<ext> and src/data/covers.json:
//   { "<tab name>": { "<sheet row>": "/covers/<file>" } }
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
  const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

  // tab name -> worksheet file, via workbook.xml + its rels
  const workbookRels = Object.fromEntries(
    [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*>/g)].map((m) => [
      attr(m[0], 'Id'),
      attr(m[0], 'Target'),
    ]),
  );
  const tabs = [...text('xl/workbook.xml').matchAll(/<sheet [^>]*>/g)].map((m) => ({
    name: attr(m[0], 'name'),
    file: workbookRels[attr(m[0], 'r:id')],
  }));

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  for (const { name, file } of tabs) {
    const sheetFile = file.split('/').pop(); // sheet1.xml
    const relsPath = `xl/worksheets/_rels/${sheetFile}.rels`;
    if (!files[relsPath]) continue;
    const drawingFile = /drawings\/(drawing\d+\.xml)/.exec(text(relsPath))?.[1];
    if (!drawingFile) continue;

    const drawing = text(`xl/drawings/${drawingFile}`);
    const drawingRels = text(`xl/drawings/_rels/${drawingFile}.rels`);
    const media = Object.fromEntries(
      [...drawingRels.matchAll(/<Relationship [^>]*>/g)].map((m) => [
        attr(m[0], 'Id'),
        attr(m[0], 'Target')?.split('/').pop(),
      ]),
    );

    covers[name] = {};
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    for (const a of drawing.split(/<xdr:(?:one|two|absolute)CellAnchor/).slice(1)) {
      const col = Number(/<xdr:col>(\d+)</.exec(a)?.[1]);
      const row = Number(/<xdr:row>(\d+)</.exec(a)?.[1]); // 0-based
      const image = media[/r:embed="([^"]+)"/.exec(a)?.[1]];
      if (col !== 0 || Number.isNaN(row) || !image || !files[`xl/media/${image}`]) continue;
      const out = `${slug}-${row + 1}.${image.split('.').pop()}`; // 1-based sheet row
      writeFileSync(`${OUT_DIR}/${out}`, files[`xl/media/${image}`]);
      covers[name][row + 1] = `/covers/${out}`;
    }
  }
  console.log(
    `[covers] extracted ${Object.entries(covers)
      .map(([tab, m]) => `${tab}: ${Object.keys(m).length}`)
      .join(', ')}`,
  );
} catch (err) {
  console.warn(`[covers] skipped, using placeholders: ${err.message}`);
}

mkdirSync('src/data', { recursive: true });
writeFileSync(MAP_FILE, JSON.stringify(covers));

// Builds the Pokédex page's data: every species (#1-#1025) with name, types, whether it's out in
// Pokémon GO yet, and the thumbnails from the Poke Genie backup (shared Dropbox folder).
// Writes public/pokedex/<file>.jpg and src/data/pokedex.json:
//   [{ number, name, types, released, entries: [{ file, form, label, types, unreleased? }] }]
// file is null for a form not pictured yet; unreleased marks a form that isn't out in GO.
// On GitHub's build (CI) any failure stops the build, so the last good site stays online.
// Locally it never fails: the page just shows nothing.
import { unzipSync } from 'fflate';
import { parse } from 'csv-parse/sync';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const BACKUP_URL =
  'https://www.dropbox.com/scl/fo/ylzwetaxk4n9mealtzbq1/AETzNFTnOTe07HAAJOF1mJc?rlkey=2fykbx9bbpx6k2mgj1pmd1fhx&dl=1';
const POKEAPI_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const UNRELEASED_URL =
  'https://pokemongo.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:Unreleased_Pok%C3%A9mon&cmlimit=500&cmnamespace=0&format=json';
// PvPoke's copy of the game data: every form that's out in GO, used to mark the forms not pictured yet.
const PVPOKE_URL = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/pokemon.json';
// Species Poke Genie keeps as one Pokédex entry, so their forms are never "missing": Pikachu (hats), Burmy, Cherrim.
const NO_FORMS = new Set([25, 412, 421]);
const OUT_DIR = 'public/pokedex';
const MAP_FILE = 'src/data/pokedex.json';
const LAST_SPECIES = 1025;

// The wiki's "unreleased" category as of 2026-10-04, used only if the wiki can't be reached.
const UNRELEASED_FALLBACK = ["Alcremie","Arceus","Archaludon","Arctovish","Arctozolt","Basculegion","Brute Bonnet","Calyrex","Capsakid","Chewtle","Chi-Yu","Chien-Pao","Copperajah","Cufant","Cyclizar","Dracovish","Dracozolt","Drednaw","Eiscue","Farigiraf","Fezandipiti","Finizen","Flutter Mane","Glastrier","Gouging Fire","Great Tusk","Iron Boulder","Iron Bundle","Iron Crown","Iron Hands","Iron Jugulis","Iron Leaves","Iron Moth","Iron Thorns","Iron Treads","Iron Valiant","Koraidon","Magearna","Manaphy","Milcery","Miraidon","Munkidori","Ogerpon","Okidogi","Palafin","Pecharunt","Phione","Pincurchin","Pyukumuku","Rabsca","Raging Bolt","Rellor","Roaring Moon","Sandy Shocks","Scovillain","Scream Tail","Silvally","Slither Wing","Spectrier","Terapagos","Ting-Lu","Type: Null","Veluza","Walking Wake","Wishiwashi","Wo-Chien"];

// Announced debuts the wiki may already have taken out of its "unreleased" category.
// They count as released from their date on. From the wiki's 2026 release log.
const UPCOMING = { Bramblin: '2026-10-13', Brambleghast: '2026-10-13', Minior: '2026-10-19' };

// Poke Genie's form names ("19_Alola.jpg") -> PokeAPI's ("rattata-alola") and how to write them.
const FORMS = {
  Alola: { api: 'alola', label: (n) => `Alolan ${n}` },
  Galarian: { api: 'galar', label: (n) => `Galarian ${n}` },
  Hisuian: { api: 'hisui', label: (n) => `Hisuian ${n}` },
  Paldean: { api: 'paldea', label: (n) => `Paldean ${n}` },
  Mega: { api: 'mega', label: (n) => `Mega ${n}` },
  MegaX: { api: 'mega-x', label: (n) => `Mega ${n} X` },
  MegaY: { api: 'mega-y', label: (n) => `Mega ${n} Y` },
  Origin: { api: 'origin', label: (n) => `${n} (Origin)` },
  Altered: { api: 'altered', label: (n) => `${n} (Altered)` },
  Black: { api: 'black', label: (n) => `Black ${n}` },
  White: { api: 'white', label: (n) => `White ${n}` },
  Armored: { api: 'armored', label: (n) => `Armored ${n}` },
  Sword: { api: 'crowned', label: (n) => `${n} (Crowned Sword)` },
  Shield: { api: 'crowned', label: (n) => `${n} (Crowned Shield)` },
};

const csv = async (file) => {
  const res = await fetch(`${POKEAPI_CSV}/${file}`);
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return parse(await res.text(), { columns: true });
};

let dex = [];

try {
  const [backup, speciesNames, pokemon, pokemonTypes, types, unreleasedNames, gameForms] = await Promise.all([
    fetch(BACKUP_URL).then((r) => {
      if (!r.ok) throw new Error(`backup download failed: ${r.status}`);
      return r.arrayBuffer();
    }),
    csv('pokemon_species_names.csv'),
    csv('pokemon.csv'),
    csv('pokemon_types.csv'),
    csv('types.csv'),
    fetch(UNRELEASED_URL, { headers: { 'user-agent': 'kuldz.com build' } })
      .then((r) => r.json())
      .then((j) => j.query.categorymembers.map((m) => m.title))
      .catch((err) => {
        console.warn(`[pokedex] wiki unreachable (${err.message}), using the saved unreleased list`);
        return UNRELEASED_FALLBACK;
      }),
    fetch(PVPOKE_URL)
      .then((r) => r.json())
      .catch((err) => {
        console.warn(`[pokedex] PvPoke unreachable (${err.message}), not marking missing forms`);
        return [];
      }),
  ]);

  const nameOf = Object.fromEntries(
    speciesNames.filter((r) => r.local_language_id === '9').map((r) => [r.pokemon_species_id, r.name]),
  );
  const typeName = Object.fromEntries(types.map((t) => [t.id, t.identifier]));
  const typesById = {};
  for (const t of pokemonTypes) (typesById[t.pokemon_id] ??= [])[Number(t.slot) - 1] = typeName[t.type_id];
  const idOf = Object.fromEntries(pokemon.map((p) => [p.identifier, p.id]));
  const identifierOf = Object.fromEntries(pokemon.map((p) => [p.id, p.identifier]));

  const today = new Date().toISOString().slice(0, 10);
  const unreleased = new Set([
    ...unreleasedNames,
    ...Object.entries(UPCOMING).filter(([, date]) => date > today).map(([name]) => name),
  ]);

  dex = Array.from({ length: LAST_SPECIES }, (_, i) => {
    const number = i + 1;
    const name = nameOf[number] ?? `#${number}`;
    return { number, name, types: typesById[number] ?? [], released: !unreleased.has(name), entries: [] };
  });

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const files = unzipSync(new Uint8Array(backup));
  for (const [path, data] of Object.entries(files)) {
    // "3.jpg", "3_Mega.jpg", "19_Alola.jpg"
    const m = /pokedex\/((\d+)(?:_([^/]+))?)\.jpg$/i.exec(path);
    if (!m) continue;
    const [, file, num, rawForm = ''] = m;
    const species = dex[Number(num) - 1];
    if (!species) continue;
    writeFileSync(`${OUT_DIR}/${file}.jpg`, data);
    // Some forms come with the species name glued on ("Deoxysattack"): drop it and capitalise the rest ("Attack").
    const prefix = species.name.toLowerCase().replace(/[^a-z]/g, '');
    let form = rawForm.toLowerCase().startsWith(prefix) ? rawForm.slice(prefix.length) : rawForm;
    form = form.charAt(0).toUpperCase() + form.slice(1);
    const f = FORMS[form];
    // Types: PokeAPI's form ("deoxys-attack", "rattata-alola"); falls back to the species' types if there's no match.
    const formId = form && idOf[`${identifierOf[num]?.split('-')[0]}-${f ? f.api : form.toLowerCase()}`];
    species.entries.push({
      file: `/pokedex/${file}.jpg`,
      form,
      label: !form ? species.name : f ? f.label(species.name) : `${species.name} (${form})`,
      types: (formId && typesById[formId]) || species.types,
    });
  }
  // Plain form first, then the others alphabetically
  for (const s of dex) s.entries.sort((a, b) => (b.form === '') - (a.form === '') || a.form.localeCompare(b.form));

  // Forms that are out in GO but not pictured yet become "?" entries after the pictured ones.
  // Only for species with at least one picture; a species with none is already a "?" tile.
  // Poke Genie and PvPoke name forms differently ("Alola" vs "Alolan", "10% Forme"), so both are boiled down to a key.
  const ALIASES = { alola: 'alolan', sword: 'crownedsword', shield: 'crownedshield' };
  const key = (form) => {
    const k = form.toLowerCase().replace(/forme/g, '').replace(/[^a-z0-9]/g, '');
    return ALIASES[k] ?? k;
  };
  const labelFor = (name, form) =>
    /^Mega /.test(form) ? `Mega ${name} ${form.slice(5)}`
    : /^(Mega|Primal|Alolan|Galarian|Hisuian|Paldean|Black|White|Armored)$/.test(form) ? `${form} ${name}`
    : `${name} (${form.replace(/ Forme$/, '')})`;
  const formsInGo = {};
  for (const p of gameForms) {
    if (p.tags?.includes('shadow') || NO_FORMS.has(p.dex)) continue;
    const form = /\(([^)]+)\)/.exec(p.speciesName)?.[1] ?? '';
    // Named forms that aren't out yet (Pirouette Meloetta) are kept and shown like unreleased species;
    // unnamed unreleased entries are just duplicates in the game data.
    const unreleased = p.released === false;
    if (unreleased && !form) continue;
    (formsInGo[p.dex] ??= []).push({ form, unreleased, types: p.types.filter((t) => t !== 'none') });
  }
  for (const s of dex) {
    if (!s.entries.length || !formsInGo[s.number]) continue;
    const have = new Set(s.entries.map((e) => key(e.form)));
    // The plain picture ("487.jpg") counts as the default form, e.g. Altered Giratina or 50% Zygarde.
    // PokeAPI's main entry names it ("giratina-altered"); if it doesn't ("cherrim"), the game data's first form does (Overcast).
    const forms = formsInGo[s.number];
    const defaultId = (identifierOf[s.number] ?? '').replace(/[^a-z0-9]/g, '');
    const released = forms.filter((f) => !f.unreleased).map((f) => key(f.form));
    const defaultKey = released.find((k) => k === '' || defaultId.endsWith(k)) ?? released[0];
    for (const { form, unreleased, types } of forms) {
      const k = key(form);
      if (have.has(k) || (k === defaultKey && have.has(''))) continue;
      s.entries.push({
        file: null, form, label: form ? labelFor(s.name, form) : s.name, types: types.length ? types : s.types,
        ...(unreleased && { unreleased: true }),
      });
    }
  }

  const owned = dex.filter((s) => s.entries.length).length;
  if (!owned) throw new Error('the backup has no Pokédex thumbnails (moved or emptied Dropbox folder?)');
  console.log(`[pokedex] ${owned} species with thumbnails, ${dex.filter((s) => s.released).length} released in GO`);
} catch (err) {
  // On GitHub's build, stop instead of publishing an empty Pokédex; the last good site stays online.
  if (process.env.CI) {
    console.error(`[pokedex] failed: ${err.message}`);
    process.exit(1);
  }
  dex = [];
  console.warn(`[pokedex] skipped: ${err.message}`);
}

mkdirSync('src/data', { recursive: true });
writeFileSync(MAP_FILE, JSON.stringify(dex));

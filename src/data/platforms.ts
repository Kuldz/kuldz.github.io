// Games whose platform can't be told from the achievements text (no achievements, console-only, ...).
// Anything not listed is PC, or PlayStation when the achievements mention trophies/platinum.
// A "Platform" column in the sheet takes priority over this list.
export const platformOverrides: Record<string, string> = {
  'The Legend of Zelda: Breath of the Wild': 'switch',
  'Super Smash Bros. Ultimate': 'switch',
};

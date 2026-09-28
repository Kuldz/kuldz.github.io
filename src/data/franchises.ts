// Franchise -> substrings matched (case-insensitive) against the game name; first match wins.
// Games that match nothing are standalone. A "Franchise" column in the sheet overrides this.
export const franchises: Record<string, string[]> = {
  'Half-Life': ['half-life', 'black mesa'],
  Portal: ['portal'],
  'Batman: Arkham': ['batman'],
  Borderlands: ['borderlands'],
  'Call of Duty': ['call of duty'],
  'Devil May Cry': ['devil may cry'],
  DOOM: ['doom'],
  'Dying Light': ['dying light'],
  "Five Nights at Freddy's": ['five nights at freddy'],
  'Hollow Knight': ['hollow knight'],
  'Hotline Miami': ['hotline miami'],
  'Just Cause': ['just cause'],
  LEGO: ['lego'],
  'Monster Hunter': ['monster hunter'],
  'Mortal Kombat': ['mortal kombat'],
  Ori: ['ori and the'],
  Outlast: ['outlast'],
  Persona: ['persona'],
  Yakuza: ['yakuza'],
};

export function franchiseOf(name: string): string {
  const n = name.toLowerCase();
  return Object.entries(franchises).find(([, keys]) => keys.some((k) => n.includes(k)))?.[0] ?? '';
}

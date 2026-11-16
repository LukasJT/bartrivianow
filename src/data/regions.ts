export const zones = {
 gta: ['Toronto & GTA','Toronto et RGT',43.6532,-79.3832],
 horseshoe: ['Golden Horseshoe','Golden Horseshoe',43.256,-79.870],
 waterloo: ['Waterloo Region','Région de Waterloo',43.450,-80.490],
 london: ['London area','Région de London',42.9849,-81.2453],
 ottawa: ['Ottawa area','Région d’Ottawa',45.4215,-75.6972],
 montreal: ['Montréal area','Région de Montréal',45.5019,-73.5674],
 thunderbay: ['Thunder Bay','Thunder Bay',48.3809,-89.2477],
 sudbury: ['Greater Sudbury','Grand Sudbury',46.4927,-80.993],
 northbay: ['North Bay','North Bay',46.3091,-79.4608],
 timmins: ['Timmins','Timmins',48.4758,-81.3305],
} as const;
export type Region = keyof typeof zones;
export type Locale = 'en' | 'fr';
export const regionIds = Object.keys(zones) as Region[];
export const regionLabel = (id: Region, lang: Locale) => zones[id][lang === 'fr' ? 1 : 0];
export const isRegion = (id: string): id is Region => Object.hasOwn(zones, id);

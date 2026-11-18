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
 simcoe: ['Barrie & Simcoe County','Barrie et comté de Simcoe',44.3894,-79.6903],
 kawarthas: ['Peterborough & Kawarthas','Peterborough et Kawarthas',44.3091,-78.3197],
 kingston: ['Kingston area','Région de Kingston',44.2312,-76.4860],
 sarnia: ['Sarnia & Lambton County','Sarnia et comté de Lambton',42.9745,-82.4066],
 windsor: ['Windsor & Essex County','Windsor et comté d’Essex',42.3149,-83.0364],
 buffalo: ['Buffalo & Western New York','Buffalo et ouest de l’État de New York',42.8864,-78.8784],
 stratford: ['Stratford & Perth County','Stratford et comté de Perth',43.3700,-80.9822],
 rochester: ['Rochester area','Région de Rochester',43.1566,-77.6088],
 fingerlakes: ['Finger Lakes','Finger Lakes',42.4439,-76.5019],
 centralny: ['Central New York','Centre de l’État de New York',43.0481,-76.1474],
 capitalny: ['Capital Region & Upper Hudson','Région de la capitale et Haut-Hudson',42.6526,-73.7562],
 hudsonvalley: ['Lower Hudson Valley','Basse vallée de l’Hudson',41.0340,-73.7629],
} as const;
export type Region = keyof typeof zones;
export type Locale = 'en' | 'fr';
export const regionIds = Object.keys(zones) as Region[];
export const regionLabel = (id: Region, lang: Locale) => zones[id][lang === 'fr' ? 1 : 0];
export const isRegion = (id: string): id is Region => Object.hasOwn(zones, id);

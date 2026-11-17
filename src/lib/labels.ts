import type { Locale } from '../data/regions.ts';
export const labels = {
 en:{trivia:'Trivia',comedy:'Comedy',games:'Table games',free:'Free to play',paid:'Paid entry',unknown:'Unknown',
 'gift-card':'Gift card',cash:'Cash',other:'Other prize',bilingual:'Bilingual',en:'English',fr:'French'},
 fr:{trivia:'Quiz',comedy:'Humour',games:'Jeux de table',free:'Participation gratuite',paid:'Entrée payante',unknown:'Inconnu',
 'gift-card':'Carte-cadeau',cash:'Argent',other:'Autre prix',bilingual:'Bilingue',en:'Anglais',fr:'Français'}
};
export const money=(cents:number,lang:Locale)=>new Intl.NumberFormat(lang==='fr'?'fr-CA':'en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:cents%100?2:0}).format(cents/100);

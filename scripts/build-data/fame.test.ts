import { describe, expect, it } from 'vitest';
import { addSitelinks, articleUrl, type Sitelinks } from './fame';

const row = (item: string, links: number, extra: Record<string, string> = {}) => ({
  item: { value: `http://www.wikidata.org/entity/${item}` },
  links: { value: String(links) },
  ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v }])),
});

describe('fame (Wikidata sitelinks)', () => {
  it('keeps the item with the most sitelinks per town, from every route', () => {
    const into: Sitelinks = new Map();
    // P1566 on a district item (Madrid's GeoNames id), then the item GeoNames links.
    addSitelinks(into, [row('Q116170766', 0, { geonames: '3117735' })]);
    addSitelinks(into, [row('Q2807', 306)], new Map([['Q2807', [3117735]]]));
    // An article GeoNames links (München), and a weaker P1566 match afterwards.
    const article = 'https://en.wikipedia.org/wiki/Munich';
    addSitelinks(into, [row('Q1726', 241, { article })], new Map([[article, [2867714]]]));
    addSitelinks(into, [row('Q999', 3, { geonames: '2867714' })]);
    expect(into.get(3117735)).toEqual(['Q2807', 306]);
    expect(into.get(2867714)).toEqual(['Q1726', 241]);
  });

  it('normalises Wikipedia links to the https form Wikidata uses', () => {
    expect(articleUrl('http://en.wikipedia.org/wiki/Recife')).toBe(
      'https://en.wikipedia.org/wiki/Recife',
    );
    expect(articleUrl('https://ru.wikipedia.org/wiki/%D0%A0')).toBe(
      'https://ru.wikipedia.org/wiki/%D0%A0',
    );
    expect(articleUrl('https://www.example.org/munich')).toBeNull();
  });
});

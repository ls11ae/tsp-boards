// Place list files (docs/data/curated/*.txt) as places of a country's data: town names (exact,
// the first option if ambiguous, "Town; label" with a label of its own), coordinates, composite
// places "Name = A + B" and marks "* ".
// Shared by cli/collection.ts and cli/export-poster.ts.

import { citiesFromColumns, type CountryFile } from '../../src/core/data';
import {
  NameIndex,
  compositePlace,
  mergePlaces,
  parsePlaceLines,
  type ListPlace,
} from '../../src/core/places';
import type { Member, Place } from '../../src/core/puzzle-file';

/** The places of a list file; places within `mergeKm` of each other become one. */
export function readPlaceList(text: string, file: CountryFile, mergeKm = 2): Place[] {
  const index = new NameIndex(citiesFromColumns(file.cities, file.states));
  /** A town by exact name (first option if ambiguous, with a note). */
  const townOf = (name: string, lineNo: number) => {
    const match = index.match(name);
    const town = match.options[0];
    if (!town || match.kind !== 'exact')
      throw new Error(`line ${lineNo}: "${name}" is ${match.status}`);
    if (match.status === 'ambiguous')
      console.error(`line ${lineNo}: "${name}" is ambiguous, using ${town.name} (${town.state})`);
    return town;
  };
  const listPlaces: ListPlace[] = parsePlaceLines(text).flatMap((line): ListPlace[] => {
    if (line.members) {
      const members: Member[] = line.members.map((m) => {
        if (m.lat !== undefined && m.lon !== undefined)
          return { name: m.name, lat: m.lat, lon: m.lon };
        const town = townOf(m.name, line.line);
        return { id: town.id, name: town.name, lat: town.lat, lon: town.lon };
      });
      return [
        {
          ...compositePlace(line.name, members, line.label, line.nameEn),
          ...(line.highlight ? { highlight: true } : {}),
          lines: [line.line],
          names: [line.label ?? line.name],
        },
      ];
    }
    if (line.lat !== undefined && line.lon !== undefined) {
      return [
        {
          name: line.name,
          lat: line.lat,
          lon: line.lon,
          ...(line.label ? { label: line.label } : {}),
          ...(line.nameEn ? { nameEn: line.nameEn } : {}),
          ...(line.highlight ? { highlight: true } : {}),
          lines: [line.line],
          names: [line.label ?? line.name],
        },
      ];
    }
    const town = townOf(line.name, line.line);
    return [
      {
        id: town.id,
        name: town.name,
        lat: town.lat,
        lon: town.lon,
        ...(line.label ? { label: line.label } : {}),
        ...(line.highlight ? { highlight: true } : {}),
        lines: [line.line],
        names: [line.label ?? town.label],
      },
    ];
  });
  return mergePlaces(listPlaces, mergeKm).map((p) => ({
    ...(p.id !== undefined ? { id: p.id } : {}),
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    ...(p.label ? { label: p.label } : {}),
    ...(p.nameEn ? { nameEn: p.nameEn } : {}),
    ...(p.members ? { members: p.members } : {}),
    ...(p.highlight ? { highlight: true } : {}),
  }));
}

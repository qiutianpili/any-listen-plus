// folia-al stub: no Folium mods in the Any Listen embed, so mod tunings are always identity (empty).
const EMPTY: Readonly<Record<string, number>> = Object.freeze({});
export const useFoliumTunings = (_target: string): Readonly<Record<string, number>> => EMPTY;
export const FoliumTuningCards = () => null;
export const tuningsRegistry = { list: () => [], subscribe: () => () => {} } as const;

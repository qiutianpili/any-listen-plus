// Contract between mobile.js (Any Listen side) and the Folia view. mobile.js owns every touch of
// Any Listen internals (window.__alPl / __alLrc from the bundle patch, DOM buttons), so a change on the
// AL side never needs a rebuild of this bundle.
export interface AlSnapshot {
  id: string | null;
  name: string;
  singer: string;
  album: string;
  pic: string | null;
  lrc: string | null;
  tlrc: string | null;
  rlrc: string | null;
  awlrc: string | null;
  playing: boolean;
  /** seconds */
  duration: number;
  /** 0..1 */
  volume: number;
  muted: boolean;
  rate: number;
  /** AL player.togglePlayMethod: listLoop | singleLoop | random | list | none ('' when the bundle hook is missing) */
  playMode: string;
  /** in AL's 我喜欢 list (null when the bundle hook is missing) */
  loved: boolean | null;
}
export interface AlApi {
  snapshot(): AlSnapshot;
  /** lyric clock in ms: audio time minus output latency plus lyric offset (same clock AL's lyric player uses) */
  time(): number;
  toggle(): void;
  prev(): void;
  next(): void;
  seek(sec: number): void;
  setVolume(v: number): void;
  setMute(m: boolean): void;
  /** the view crashed: mobile.js unmounts it and falls back to the original page */
  fail(err: unknown): void;
  /** hide the detail page (back to AL main) */
  close(): void;
  /** switch this browser to AL's original detail page (persists al-detail-style) */
  toOriginal(): void;
  isPhone(): boolean;
  setPlayMode(mode: string): void;
  setLoved(v: boolean): void;
  /** current play queue (AL playList) or null when the bundle hook is missing */
  queue(): AlQueueItem[] | null;
  /** itemId of the playing queue item */
  currentItem(): string | null;
  playItem(itemId: string): void;
}
export interface AlQueueItem { id: string; name: string; singer: string; later: boolean; pic: string | null }

// Per-song random lyric style with a user-chosen pool.
// Port of Folia Major PR #771 ("feat: allow choosing per-song random lyric styles",
// "fix: recognize standalone random style pool imports", "随机歌词样式自成一页"), AGPL-3.0,
// © chthollyphile and Folia contributors (Cyber-Yichen). Adapted to the Any Listen detail page:
// the on/off switch is Folia's own `random_visualizer_mode_per_song`; the pool is stored under the same
// key upstream uses (`random_visualizer_modes`, folia: namespace via __foliaLS).
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { __foliaLS } from './ls';
import type { VisualizerMode } from '../folia-src/types';
import { VISUALIZER_REGISTRY } from '../folia-src/components/visualizer/registry';
import { useVisualizerSettingsStore } from '../folia-src/stores/useVisualizerSettingsStore';

export const RANDOM_VISUALIZER_MODES_STORAGE_KEY = 'random_visualizer_modes';
export const ALL_MODES = (): VisualizerMode[] => VISUALIZER_REGISTRY.map(e => e.mode as VisualizerMode);

export const normalizeRandomVisualizerModes = (value: unknown): VisualizerMode[] => {
    const selected = new Set(Array.isArray(value) ? value : []);
    const modes = ALL_MODES().filter(m => selected.has(m));
    return modes.length > 0 ? modes : ALL_MODES();
};

/** Picks within the saved selection, excluding the current style whenever another choice exists. */
export const pickRandomVisualizerMode = (modes: readonly VisualizerMode[], current: VisualizerMode, random: () => number = Math.random): VisualizerMode => {
    const selected = normalizeRandomVisualizerModes(modes);
    const alternatives = selected.filter(m => m !== current);
    const candidates = alternatives.length > 0 ? alternatives : selected;
    return candidates[Math.floor(random() * candidates.length)];
};

const readPool = (): VisualizerMode[] => {
    try { return normalizeRandomVisualizerModes(JSON.parse(__foliaLS.getItem(RANDOM_VISUALIZER_MODES_STORAGE_KEY) || 'null')); }
    catch { return normalizeRandomVisualizerModes(null); }
};

type PoolState = { modes: VisualizerMode[]; setModes: (m: readonly VisualizerMode[]) => void };
export const useRandomPoolStore = create<PoolState>((set) => ({
    modes: readPool(),
    setModes: (m) => {
        const next = normalizeRandomVisualizerModes(m);
        try { __foliaLS.setItem(RANDOM_VISUALIZER_MODES_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        set({ modes: next });
    },
}));

/** Random on/off: Folia's own setting, written without its status toast. */
export const setRandomEnabled = (enable: boolean) => {
    try { __foliaLS.setItem('random_visualizer_mode_per_song', String(enable)); } catch { /* ignore */ }
    useVisualizerSettingsStore.setState({ randomVisualizerModePerSong: enable } as any);
};

/** A style picked by hand turns random off (upstream: handleSetVisualizerMode without preserveRandom). */
export const pickModeByHand = (mode: VisualizerMode) => {
    const vs = useVisualizerSettingsStore.getState();
    vs.handleSetVisualizerMode(mode, { notify: false });
    if (vs.randomVisualizerModePerSong) setRandomEnabled(false);
};

/** Applies one style from the pool per song; keeps it for the whole song (upstream useRandomVisualizerMode). */
export function useRandomVisualizerMode(songId: string | null) {
    const enabled = useVisualizerSettingsStore(s => s.randomVisualizerModePerSong);
    const visualizerMode = useVisualizerSettingsStore(s => s.visualizerMode) as VisualizerMode;
    const modes = useRandomPoolStore(s => s.modes);
    const observed = useRef<string | null>(null);
    const pending = useRef<{ songId: string | null; from: VisualizerMode; modes: readonly VisualizerMode[] } | null>(null);
    useEffect(() => {
        if (!enabled) { observed.current = songId; pending.current = null; return; }
        const songChanged = songId !== null && observed.current !== null && observed.current !== songId;
        if (songId !== null) observed.current = songId;
        if (!songChanged && modes.includes(visualizerMode)) { pending.current = null; return; }
        const p = pending.current;
        if (p?.songId === songId && p.from === visualizerMode && p.modes === modes) return;
        pending.current = { songId, from: visualizerMode, modes };
        const next = pickRandomVisualizerMode(modes, visualizerMode);
        if (next !== visualizerMode) useVisualizerSettingsStore.getState().handleSetVisualizerMode(next, { notify: false });
    }, [songId, enabled, modes, visualizerMode]);
}

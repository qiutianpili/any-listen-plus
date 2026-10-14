// Folia "now playing" view for Any Listen. Mirrors Folia's own OBS web source (ObsWebSourceApp):
// VisualizerRenderer fed by an external player, theme from cover colours, rAF lyric clock — plus a
// small transport/chrome layer and Folia's own per-mode / background settings panels.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValue, useMotionValueEvent, type MotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, Pause, Play, Settings2, SkipBack, SkipForward, Volume2, VolumeX, X, RotateCcw } from 'lucide-react';
import VisualizerRenderer from '../folia-src/components/visualizer/VisualizerRenderer';
import { VISUALIZER_REGISTRY, getVisualizerModeLabel, getVisualizerRegistryEntry } from '../folia-src/components/visualizer/registry';
import { VISUALIZER_BACKGROUND_REGISTRY, getVisualizerBackgroundModeLabel, getVisualizerBackgroundRegistryEntry, DEFAULT_VISUALIZER_BACKGROUND_MODE } from '../folia-src/components/visualizer/backgrounds/registry';
import type { VisualizerBackgroundActions } from '../folia-src/components/visualizer/backgrounds/definition';
import VisualizerPresetGroup from '../folia-src/components/visualizer/VisualizerPresetGroup';
import { useVisualizerBackgroundConfig } from '../folia-src/components/visualizer/useVisualizerBackgroundConfig';
import { useVisualizerTunings } from '../folia-src/components/visualizer/useVisualizerTunings';
import { colorWithAlpha } from '../folia-src/components/visualizer/colorMix';
import { buildVisualizerTheme } from '../folia-src/components/app/presentation/buildVisualizerTheme';
import { buildBuiltinDualTheme } from '../folia-src/hooks/themeControllerState';
import { extractColors } from '../folia-src/utils/colorExtractor';
import { parseAwlrc, parseLRC } from '../folia-src/utils/lyrics/parserCore';
import { NO_LYRIC_LINES } from '../folia-src/utils/lyrics/noLyricLines';
import { useVisualizerSettingsStore } from '../folia-src/stores/useVisualizerSettingsStore';
import { useVisualizerAssetStore } from '../folia-src/stores/useVisualizerAssetStore';
import { useThemeSettingsStore } from '../folia-src/stores/useThemeSettingsStore';
import { useTypographySettingsStore } from '../folia-src/stores/useTypographySettingsStore';
import type { DualTheme, Line, Theme, VisualizerMode } from '../folia-src/types';
import { PlayerBottomBarLayoutContext } from '../folia-src/components/floating-player/PlayerBottomBarLayoutContext';
import { playerBottomBarLiveOffset } from '../folia-src/stores/motionSignals';
import type { AlApi, AlSnapshot } from './api';

const EMPTY_SPECTRUM = new Uint8Array(0);
/** read by main.debug() for tests: lyric line count / active line / clock */
export const debugState = { lines: 0, idx: -1, t: 0, text: '', renders: 0, stalls: 0, fallback: '' };
// three.js / pixi modes: loaded as separate chunks on demand, flagged in the picker
const GPU_MODES = new Set<string>(['diorama', 'sonnet', 'tempera', 'lumiere', 'pendolo']);

const findLatestActiveLineIndex = (lines: Line[], time: number) => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (!line || time < line.startTime) continue;
        if (time <= (line.renderHints?.renderEndTime ?? line.endTime)) return index;
    }
    return -1;
};

const fmt = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

const sameSnap = (a: AlSnapshot | null, b: AlSnapshot) => !!a && a.id === b.id && a.name === b.name && a.singer === b.singer
    && a.album === b.album && a.pic === b.pic && a.lrc === b.lrc && a.tlrc === b.tlrc && a.rlrc === b.rlrc && a.awlrc === b.awlrc
    && a.playing === b.playing && Math.abs(a.duration - b.duration) < 0.5 && Math.abs(a.volume - b.volume) < 0.005 && a.muted === b.muted && a.rate === b.rate;

const parseLyrics = (s: AlSnapshot | null): Line[] => {
    if (!s) return NO_LYRIC_LINES;
    try {
        if (s.awlrc && s.awlrc.trim()) {
            const d = parseAwlrc(s.awlrc, s.tlrc || '', {}, s.rlrc || '');
            if (d.lines.length) return d.lines;
        }
        if (s.lrc && s.lrc.trim()) {
            const d = parseLRC(s.lrc, s.tlrc || '', {}, s.rlrc || '');
            if (d.lines.length) return d.lines;
        }
    } catch (e) {
        console.warn('[folia] lyric parse failed', e);
    }
    return NO_LYRIC_LINES;
};

const Toggle: React.FC<{ label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; theme: Theme }> = ({ label, desc, value, onChange, theme }) => (
    <button type="button" onClick={() => onChange(!value)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="min-w-0">
            <span className="block text-sm" style={{ color: theme.primaryColor }}>{label}</span>
            {desc && <span className="block text-xs opacity-60" style={{ color: theme.secondaryColor }}>{desc}</span>}
        </span>
        <span className="relative h-6 w-11 shrink-0 rounded-full transition-colors" style={{ backgroundColor: value ? theme.accentColor : 'rgba(255,255,255,.18)' }}>
            <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: value ? 22 : 2 }} />
        </span>
    </button>
);

// Progress row owns its own 4 Hz state so the clock never re-renders the whole visualizer tree.
const ProgressRow: React.FC<{ currentTime: MotionValue<number>; duration: number; api: AlApi }> = ({ currentTime, duration, api }) => {
    const [pos, setPos] = useState(() => currentTime.get());
    const last = useRef(0);
    useMotionValueEvent(currentTime, 'change', (v) => { const n = performance.now(); if (n - last.current >= 250) { last.current = n; setPos(v); } });
    const [scrub, setScrub] = useState<number | null>(null);
    const shownPos = scrub ?? pos;
    const commit = (e: React.SyntheticEvent) => { const v = Number((e.target as HTMLInputElement).value); setScrub(null); api.seek(v); };
    return (
        <div className="flex items-center gap-2 text-[11px] tabular-nums opacity-80">
            <span className="w-10 text-right">{fmt(shownPos)}</span>
            <input type="range" className="fal-range flex-1" min={0} max={Math.max(1, duration)} step={0.1} value={Math.min(shownPos, duration || 0)} aria-label="播放进度"
                style={{ ['--p' as string]: `${duration ? Math.min(100, (shownPos / duration) * 100) : 0}%` }}
                onChange={(e) => setScrub(Number(e.target.value))}
                onPointerUp={commit} onKeyUp={commit} onTouchEnd={commit} />
            <span className="w-10">{fmt(duration)}</span>
        </div>
    );
};

export const FoliaAlApp: React.FC<{ api: AlApi }> = ({ api }) => {
    const { t } = useTranslation();
    debugState.renders++;
    const phone = api.isPhone();
    const [snap, setSnap] = useState<AlSnapshot | null>(() => { try { return api.snapshot(); } catch { return null; } });
    const snapRef = useRef(snap); snapRef.current = snap;

    // --- AL state polling (cheap object reads, 4x per second) ---
    useEffect(() => {
        const id = window.setInterval(() => {
            if (document.hidden) return;
            try { const s = api.snapshot(); if (!sameSnap(snapRef.current, s)) setSnap(s); } catch { /* ignore */ }
        }, 250);
        return () => window.clearInterval(id);
    }, [api]);

    const lyricKey = snap ? [snap.id, snap.lrc, snap.tlrc, snap.rlrc, snap.awlrc].join('\u0001') : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const lines = useMemo(() => parseLyrics(snap), [lyricKey]);
    const linesRef = useRef(lines); linesRef.current = lines;

    // --- clock: AL's corrected lyric clock, smoothed between audio clock ticks ---
    const currentTime = useMotionValue(0);
    const [currentLineIndex, setCurrentLineIndex] = useState(-1);
    const lineIdxRef = useRef(-1);
    useEffect(() => {
        let raf = 0; let anchorT = 0; let anchorP = 0; let running = true;
        // Folia's word/line state only updates on MotionValue "change" events, and set() with an unchanged
        // value emits none: paused (or still buffering) on open, after a seek while paused, or when a new
        // line mounts while the clock stands still, words would stay in their hidden "waiting" state.
        // So while the clock is static, re-emit it ~3x/s with a 1µs wobble (cheap: listeners just compare).
        let lastBase = NaN; let lastNudge = 0; let flip = false;
        const tick = (now: number) => {
            if (!running) return;
            const s = snapRef.current;
            let raw = 0;
            try { raw = api.time() / 1000; } catch { raw = 0; }
            if (!Number.isFinite(raw)) raw = 0;
            let cur = raw;
            if (s?.playing) {
                const rate = s.rate || 1;
                const pred = anchorT + ((now - anchorP) / 1000) * rate;
                const err = raw - pred;
                if (Math.abs(err) > 0.15 || anchorP === 0) { anchorT = raw; anchorP = now; cur = raw; }
                else { anchorT += err * 0.08; cur = pred + err * 0.08; }
            } else { anchorT = raw; anchorP = now; }
            if (cur !== lastBase) { lastBase = cur; currentTime.set(cur); }
            else if (now - lastNudge > 300) { lastNudge = now; flip = !flip; currentTime.set(cur + (flip ? 1e-6 : 0)); }
            const L = linesRef.current;
            const idx = L.length ? findLatestActiveLineIndex(L, cur) : -1;
            if (idx !== lineIdxRef.current) { lineIdxRef.current = idx; setCurrentLineIndex(idx); debugState.text = idx >= 0 ? (L[idx]?.fullText || '') : ''; }
            debugState.lines = L.length; debugState.idx = idx; debugState.t = Math.round(cur * 1000);
            raf = requestAnimationFrame(tick);
        };
        const start = () => { if (!raf) { anchorP = 0; raf = requestAnimationFrame(tick); } };
        const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
        const vis = () => { if (document.hidden) stop(); else start(); };
        document.addEventListener('visibilitychange', vis);
        start();
        return () => { running = false; stop(); document.removeEventListener('visibilitychange', vis); };
    }, [api, currentTime]);

    // --- Folia stores (persisted under folia:* keys) ---
    const visualizerMode = useVisualizerSettingsStore(s => s.visualizerMode);
    const visualizerOpacity = useVisualizerSettingsStore(s => s.visualizerOpacity);
    const vs = useVisualizerSettingsStore();
    const backgroundConfig = useVisualizerBackgroundConfig();
    const visualizerTunings = useVisualizerTunings();
    const assets = useVisualizerAssetStore(useShallow(s => ({
        cappellaCustomEmojiImages: s.cappellaCustomEmojiImages,
        cappellaCustomAvatarImages: s.cappellaCustomAvatarImages,
        monetPortraitImage: s.monetPortraitImage,
    })));
    const isDaylight = useThemeSettingsStore(s => s.isDaylight);
    const staticMode = useThemeSettingsStore(s => s.staticMode);
    const themeStore = useThemeSettingsStore();
    const typo = useTypographySettingsStore();

    // --- theme from cover (same as Folia's OBS source) ---
    const coverUrl = snap?.pic || null;
    const [dual, setDual] = useState<DualTheme>(() => buildBuiltinDualTheme());
    useEffect(() => {
        let cancelled = false;
        if (!coverUrl) { setDual(buildBuiltinDualTheme()); return () => { cancelled = true; }; }
        void extractColors(coverUrl, 5)
            .then(colors => { if (!cancelled) setDual(buildBuiltinDualTheme({ coverColors: colors })); })
            .catch(() => { if (!cancelled) setDual(buildBuiltinDualTheme()); });
        return () => { cancelled = true; };
    }, [coverUrl]);
    const theme: Theme = isDaylight ? dual.light : dual.dark;
    // memoised like Folia's own App: a fresh theme object on every render re-runs theme-keyed work in the
    // visualizers and backgrounds (shader uniforms / sync WebGL renders, lyric layout caches)
    const { visualizerTheme, visualizerSubtitleTheme } = useMemo(() => buildVisualizerTheme({
        appStyle: {},
        theme,
        lyricsFontStyle: typo.lyricsFontStyle ?? theme.fontStyle,
        lyricsFontWeight: typo.lyricsFontWeight,
        lyricsCustomFontFamily: typo.lyricsCustomFont?.family ?? null,
        lyricsFontFallbackFamilies: typo.lyricsFontFallbackFamilies,
        subtitleFontInheritsLyrics: typo.subtitleFontInheritsLyrics,
        subtitleFontStyle: typo.subtitleFontStyle,
        subtitleFontWeight: typo.subtitleFontWeight,
        subtitleFontFamily: typo.subtitleFontFamily,
        subtitleFontFallbackFamilies: typo.subtitleFontFallbackFamilies,
        visualizerMode,
    }), [theme, typo.lyricsFontStyle, typo.lyricsFontWeight, typo.lyricsCustomFont?.family, typo.lyricsFontFallbackFamilies, typo.subtitleFontInheritsLyrics,
        typo.subtitleFontStyle, typo.subtitleFontWeight, typo.subtitleFontFamily, typo.subtitleFontFallbackFamilies, visualizerMode]);

    // no audio analyser in AL (audio may be cross-origin); spectrum-driven visuals take Folia's low-energy branch
    const audioPower = useMotionValue(0);
    const bass = useMotionValue(0); const lowMid = useMotionValue(0); const mid = useMotionValue(0);
    const vocal = useMotionValue(0); const treble = useMotionValue(0); const spectrum = useMotionValue(EMPTY_SPECTRUM);
    const audioBands = useMemo(() => ({ bass, lowMid, mid, vocal, treble, spectrum }), [bass, lowMid, mid, vocal, treble, spectrum]);

    // --- chrome visibility ---
    const [chrome, setChrome] = useState(true);
    const [panel, setPanel] = useState(false);
    const hideTimer = useRef(0);
    const overChrome = useRef(false);
    const poke = useCallback(() => {
        setChrome(true);
        window.clearTimeout(hideTimer.current);
        const arm = () => { hideTimer.current = window.setTimeout(() => { if (overChrome.current) arm(); else setChrome(false); }, phone ? 4500 : 3000); };
        arm();
    }, [phone]);
    const chromeHover = { onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') overChrome.current = true; }, onPointerLeave: () => { overChrome.current = false; } };
    useEffect(() => { poke(); return () => window.clearTimeout(hideTimer.current); }, [poke]);
    const chromeVisible = chrome || panel || !snap?.playing;

    // keyboard: space = play/pause, esc = close panel / detail
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tg = e.target as HTMLElement | null;
            if (tg && /INPUT|TEXTAREA|SELECT/.test(tg.tagName)) return;
            if (e.key === 'Escape') { e.stopPropagation(); if (panel) setPanel(false); else api.close(); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [api, panel]);

    // --- stall watchdog: a 2 Hz heartbeat timer. Timers only run late when the main thread itself is blocked
    // (a slow GPU only lowers the frame rate), so 3 beats >2.5 s late within 30 s in a non-classic mode means
    // this device can't run that mode: fall back to classic and say so. Hidden tabs are ignored (timers throttle).
    // Disable for testing with localStorage 'folia:al-watchdog' = '0'.
    const [notice, setNotice] = useState<string | null>(null);
    const modeRef = useRef(visualizerMode); modeRef.current = visualizerMode;
    useEffect(() => {
        let off = false; try { off = window.localStorage.getItem('folia:al-watchdog') === '0'; } catch { /* ignore */ }
        if (off) return;
        const STEP = 500; let last = performance.now(); let stalls: number[] = []; let lastMode = modeRef.current;
        const reset = () => { last = performance.now(); stalls = []; };
        const id = window.setInterval(() => {
            const now = performance.now(); const late = now - last - STEP; last = now;
            const m = modeRef.current;
            if (m !== lastMode) { lastMode = m; stalls = []; return; }
            if (document.hidden || m === 'classic' || late < 2500) return;
            stalls = stalls.filter(t => now - t < 30000); stalls.push(now); debugState.stalls++;
            if (stalls.length >= 3) {
                stalls = [];
                const label = getVisualizerModeLabel(m as VisualizerMode, t);
                debugState.fallback = m;
                console.warn(`[folia] "${m}" kept blocking the page (3 stalls > 2.5 s in 30 s) — switching to classic`);
                useVisualizerSettingsStore.getState().handleSetVisualizerMode('classic' as VisualizerMode, { notify: false });
                setNotice(`「${label}」在此设备上过于卡顿，已自动切回经典模式`);
            }
        }, STEP);
        const vis = () => reset();
        document.addEventListener('visibilitychange', vis);
        return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
    }, [t]);
    useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(null), 7000); return () => window.clearTimeout(id); }, [notice]);

    const duration = snap?.duration || 0;
    const fg = theme.primaryColor;
    const playing = !!snap?.playing;

    const onLyricLineSeek = useCallback((sec: number) => api.seek(Math.max(0, sec)), [api]);

    // --- settings panel props (Folia's own panels) ---
    const controlCardBg = colorWithAlpha(theme.backgroundColor, isDaylight ? 0.42 : 0.52);
    const rangeInputClass = [
        'w-full h-1.5 rounded-full appearance-none cursor-pointer',
        '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:transition-transform',
        '[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:transition-transform',
        isDaylight ? 'bg-black/15 [&::-webkit-slider-thumb]:bg-zinc-700 [&::-moz-range-thumb]:bg-zinc-700' : 'bg-white/10 [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:bg-white',
    ].join(' ');
    const backgroundActions: VisualizerBackgroundActions = {
        onModeChange: vs.handleSetVisualizerBackgroundMode,
        common: {
            onCoverColorChange: themeStore.handleToggleCoverColorBg,
            onOpacityChange: vs.handleSetBackgroundOpacity,
            onDisableGeometricChange: vs.handleToggleDisableVisualizerGeometricBackground,
            onDisableVignetteChange: vs.handleToggleDisableVisualizerVignette,
        },
        customImage: { onUpload: vs.handleUploadMonetBackgroundImage, onClear: vs.handleClearMonetBackgroundImage },
        monet: { onTuningChange: vs.handleSetMonetBackgroundTuning, onResetTuning: vs.handleResetMonetBackgroundTuning },
        nomand: { onTuningChange: vs.handleSetNomandBackgroundTuning, onResetTuning: vs.handleResetNomandBackgroundTuning },
        latent: { onTuningChange: vs.handleSetLatentBackgroundTuning, onResetTuning: vs.handleResetLatentBackgroundTuning },
        sora: { onTuningChange: vs.handleSetSoraBackgroundTuning, onResetTuning: vs.handleResetSoraBackgroundTuning },
        url: { onAdd: vs.handleAddUrlBackgroundItem, onUpdate: vs.handleUpdateUrlBackgroundItem, onDelete: vs.handleDeleteUrlBackgroundItem, onSelect: vs.handleSetUrlBackgroundSelectedId },
    };
    const entry = getVisualizerRegistryEntry(visualizerMode);
    const bgMode = backgroundConfig.mode ?? DEFAULT_VISUALIZER_BACKGROUND_MODE;
    const bgEntry = getVisualizerBackgroundRegistryEntry(bgMode);
    const resetMode = () => entry.resetSettings?.({
        resetClassicTuning: vs.handleResetClassicTuning, resetPartitaTuning: vs.handleResetPartitaTuning, resetFumeTuning: vs.handleResetFumeTuning,
        resetCladdaghTuning: vs.handleResetCladdaghTuning, resetCappellaTuning: vs.handleResetCappellaTuning, resetTiltTuning: vs.handleResetTiltTuning,
        resetDioramaTuning: vs.handleResetDioramaTuning, resetMonetTuning: vs.handleResetMonetTuning, resetPendoloTuning: vs.handleResetPendoloTuning,
        resetSonnetTuning: vs.handleResetSonnetTuning, resetTemperaTuning: vs.handleResetTemperaTuning, resetLumiereTuning: vs.handleResetLumiereTuning,
    });
    const tr = (key: string, fb: string) => { const v = t(key); return !v || v === key ? fb : v; };

    const modeOptions = useMemo(() => VISUALIZER_REGISTRY.map(e => ({
        value: e.mode,
        label: getVisualizerModeLabel(e.mode, t) + (GPU_MODES.has(e.mode) ? ' ·GPU' : ''),
    })), [t]);
    const bgOptions = useMemo(() => VISUALIZER_BACKGROUND_REGISTRY.map(e => ({ value: e.mode, label: getVisualizerBackgroundModeLabel(e.mode, t) })), [t]);

    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    // Folia's shared subtitle sits "clearance" px above the bottom-bar baseline: put the baseline at our bar's top
    const barRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = barRef.current; if (!el) return;
        const upd = () => { const h = el.getBoundingClientRect().height; playerBottomBarLiveOffset.set(Math.max(32, Math.round(h + 10 - 80))); };
        upd();
        const ro = new ResizeObserver(upd); ro.observe(el);
        return () => { ro.disconnect(); playerBottomBarLiveOffset.set(32); };
    }, []);
    const [coverOk, setCoverOk] = useState(true);
    useEffect(() => setCoverOk(true), [coverUrl]);
    const [vol, setVol] = useState<number | null>(null);
    const shownVol = vol ?? (snap?.volume ?? 1);

    return (
        <div
            className="folia-root"
            style={{ backgroundColor: theme.backgroundColor, color: fg, ['--fal-fg' as string]: fg, ['--fal-bg' as string]: theme.backgroundColor }}
            onPointerMove={(e) => { if (e.pointerType === 'mouse') poke(); }}
            onPointerDown={(e) => { if (e.pointerType !== 'mouse') { if (chrome && !panel && (e.target as HTMLElement).closest?.('.fal-chrome') == null) { setChrome(false); } else poke(); } }}
        >
            {/* own stacking context: modes put z-10/z-20 full-screen layers (Monet's poster) that would otherwise
                sit above our chrome and swallow every tap on close / settings / play */}
            <div className="absolute inset-0" style={{ isolation: 'isolate' }}>
                <PlayerBottomBarLayoutContext.Provider value={true}>
                <VisualizerRenderer
                    mode={visualizerMode as VisualizerMode}
                    visualizerTunings={visualizerTunings}
                    currentTime={currentTime}
                    currentLineIndex={currentLineIndex}
                    lines={lines}
                    theme={visualizerTheme}
                    subtitleTheme={visualizerSubtitleTheme}
                    isDaylight={isDaylight}
                    audioPower={audioPower}
                    audioBands={audioBands}
                    songTitle={snap?.name || null}
                    songArtist={snap?.singer || null}
                    songAlbum={snap?.album || null}
                    coverUrl={coverUrl}
                    showText={true}
                    seed={snap?.id || 'folia-al'}
                    paused={!playing}
                    staticMode={staticMode}
                    visualizerOpacity={visualizerOpacity}
                    background={backgroundConfig}
                    lyricsFontScale={typo.lyricsFontScale}
                    subtitleFontScale={typo.subtitleFontScale}
                    subtitleOverlayOpacity={typo.subtitleOverlayOpacity}
                    subtitleOverlayBackground={typo.subtitleOverlayBackground}
                    subtitleUpcomingLyricsBlur={typo.subtitleUpcomingLyricsBlur}
                    showHarmonySubtitle={typo.showHarmonySubtitle}
                    harmonySubtitleBackground={typo.harmonySubtitleBackground}
                    hideTranslationSubtitle={typo.hidePlayerTranslationSubtitle}
                    showSubtitleTranslation={typo.showSubtitleTranslation}
                    subtitleContentMode={typo.subtitleContentMode}
                    isPlayerChromeHidden={!chromeVisible}
                    onMonetTuningChange={vs.handleSetMonetTuning}
                    onLyricLineSeek={['monet', 'pendolo'].includes(visualizerMode) ? onLyricLineSeek : undefined}
                    {...assets}
                />
                </PlayerBottomBarLayoutContext.Provider>
            </div>

            {/* top bar */}
            <div className={`fal-chrome fal-top absolute left-0 right-0 top-0 flex items-center justify-between gap-2 px-3 sm:px-5 ${chromeVisible ? '' : 'fal-hidden'}`}
                style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }} {...chromeHover}>
                <button type="button" className="fal-btn fal-glass h-10 w-10" title="收起详情页" aria-label="收起详情页" onClick={() => api.close()}>
                    <ChevronDown size={22} />
                </button>
                <div className="flex items-center gap-2">
                    <div className="fal-glass flex items-center rounded-full p-1 text-xs" role="group" aria-label="详情页样式">
                        <span className="rounded-full px-3 py-1.5 font-medium" style={{ backgroundColor: colorWithAlpha(fg, 0.18) }}>Folia</span>
                        <button type="button" className="fal-btn px-3 py-1.5 opacity-70 hover:opacity-100" title="切换到 Any Listen 原版详情页" onClick={() => api.toOriginal()}>原版</button>
                    </div>
                    <button type="button" className="fal-btn fal-glass h-10 w-10" title="Folia 设置" aria-label="Folia 设置" onClick={() => setPanel(p => !p)}>
                        <Settings2 size={18} />
                    </button>
                </div>
            </div>

            {/* bottom transport */}
            <div ref={barRef} className={`fal-chrome fal-bottom absolute bottom-0 left-0 right-0 px-3 sm:px-6 ${chromeVisible ? '' : 'fal-hidden'}`}
                style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }} onPointerDown={stop} {...chromeHover}>
                <div className="fal-glass mx-auto flex max-w-[860px] flex-col gap-1 rounded-[22px] px-4 pb-2 pt-3 sm:px-5">
                    <div className="flex items-center gap-3">
                        {coverUrl && coverOk && <img src={coverUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" draggable={false} onError={() => setCoverOk(false)} />}
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{snap?.name || '未在播放'}</div>
                            <div className="truncate text-xs opacity-60">{[snap?.singer, snap?.album].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <button type="button" className="fal-btn h-10 w-10" title="上一曲" aria-label="上一曲" onClick={() => api.prev()}><SkipBack size={20} fill="currentColor" /></button>
                            <button type="button" className="fal-btn h-12 w-12" title={playing ? '暂停' : '播放'} aria-label={playing ? '暂停' : '播放'} onClick={() => api.toggle()}
                                style={{ backgroundColor: colorWithAlpha(fg, 0.14) }}>
                                {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="translate-x-[1px]" />}
                            </button>
                            <button type="button" className="fal-btn h-10 w-10" title="下一曲" aria-label="下一曲" onClick={() => api.next()}><SkipForward size={20} fill="currentColor" /></button>
                            {!phone && (
                                <div className="ml-2 hidden items-center gap-1 md:flex">
                                    <button type="button" className="fal-btn h-9 w-9" title={snap?.muted ? '取消静音' : '静音'} onClick={() => api.setMute(!snap?.muted)}>
                                        {!snap?.muted && shownVol > 0 ? <Volume2 size={18} /> : <VolumeX size={18} />}
                                    </button>
                                    <input type="range" className="fal-range w-24" min={0} max={1} step={0.01} value={shownVol} aria-label="音量"
                                        style={{ ['--p' as string]: `${shownVol * 100}%` }}
                                        onChange={(e) => { const v = Number(e.target.value); setVol(v); api.setVolume(v); }}
                                        onPointerUp={() => setTimeout(() => setVol(null), 400)} />
                                </div>
                            )}
                        </div>
                    </div>
                    <ProgressRow currentTime={currentTime} duration={duration} api={api} />
                </div>
            </div>

            {notice && (
                <div className="fal-glass pointer-events-none absolute left-1/2 top-16 max-w-[90%] -translate-x-1/2 rounded-full px-4 py-2 text-center text-xs" role="status"
                    style={{ marginTop: 'env(safe-area-inset-top)' }}>{notice}</div>
            )}

            {/* settings sheet: Folia's own mode / background settings panels */}
            {panel && <div className="absolute inset-0" onPointerDown={(e) => { e.stopPropagation(); setPanel(false); }} style={{ background: 'rgba(0,0,0,.25)' }} />}
            {panel && (
                <div className={`fal-sheet fal-glass absolute flex flex-col overflow-hidden ${phone ? 'bottom-0 left-0 right-0 max-h-[78%] rounded-t-[26px]' : 'bottom-4 right-4 top-4 w-[400px] rounded-[26px]'}`}
                    style={{ backgroundColor: colorWithAlpha(theme.backgroundColor, 0.86), paddingBottom: phone ? 'env(safe-area-inset-bottom)' : undefined }}
                    onPointerDown={stop} onWheel={stop}>
                    <div className="flex items-center justify-between px-5 pb-2 pt-4">
                        <div className="text-base font-semibold">Folia 视觉设置</div>
                        <button type="button" className="fal-btn h-9 w-9" aria-label="关闭" onClick={() => setPanel(false)}><X size={18} /></button>
                    </div>
                    <div className="fal-sheet-scroll visualizer-overlay-scrollbar flex-1 space-y-4 overflow-y-auto px-4 pb-5">
                        <div className="space-y-4 rounded-[24px] border border-white/10 p-4" style={{ backgroundColor: controlCardBg }}>
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-medium">{tr('options.visualizerMode', '歌词视觉')}</div>
                                {entry.resetSettings && <button type="button" className="fal-btn gap-1 px-2 py-1 text-xs opacity-70" onClick={resetMode}><RotateCcw size={12} />{tr('ui.default', '默认')}</button>}
                            </div>
                            <VisualizerPresetGroup label="" value={visualizerMode} options={modeOptions}
                                onChange={(m) => vs.handleSetVisualizerMode(m as VisualizerMode, { notify: false })} isDaylight={isDaylight} theme={theme} />
                            <div className="text-[11px] opacity-50">标 ·GPU 的模式使用 WebGL（three.js / Pixi），首次切换时单独加载，手机上更耗电。</div>
                        </div>
                        {entry.renderSettingsPanel?.({
                            t, isDaylight, theme, controlCardBg, rangeInputClass,
                            classicTuning: vs.classicTuning, onClassicTuningChange: vs.handleSetClassicTuning,
                            partitaTuning: vs.partitaTuning, onPartitaTuningChange: vs.handleSetPartitaTuning,
                            fumeTuning: vs.fumeTuning, onFumeTuningChange: vs.handleSetFumeTuning,
                            claddaghTuning: vs.claddaghTuning, onCladdaghTuningChange: vs.handleSetCladdaghTuning,
                            cappellaTuning: vs.cappellaTuning, onCappellaTuningChange: vs.handleSetCappellaTuning,
                            cappellaCustomEmojiImages: assets.cappellaCustomEmojiImages,
                            cappellaCustomEmojiCount: assets.cappellaCustomEmojiImages.length,
                            hasCappellaCustomEmojiPack: assets.cappellaCustomEmojiImages.length > 0,
                            onImportCappellaCustomEmojiPack: vs.handleImportCustomCappellaEmojiPack,
                            onClearCappellaCustomEmojiPack: vs.handleClearCustomCappellaEmojiPack,
                            cappellaCustomAvatarImages: assets.cappellaCustomAvatarImages,
                            hasCappellaCustomAvatar: assets.cappellaCustomAvatarImages.length > 0,
                            onImportCappellaCustomAvatar: vs.handleImportCustomCappellaAvatar,
                            onClearCappellaCustomAvatar: vs.handleClearCustomCappellaAvatar,
                            tiltTuning: vs.tiltTuning, onTiltTuningChange: vs.handleSetTiltTuning,
                            dioramaTuning: vs.dioramaTuning, onDioramaTuningChange: vs.handleSetDioramaTuning,
                            monetTuning: vs.monetTuning, onMonetTuningChange: vs.handleSetMonetTuning,
                            monetPortraitImage: assets.monetPortraitImage,
                            onUploadMonetPortraitImage: vs.handleUploadMonetPortraitImage,
                            onClearMonetPortraitImage: vs.handleClearMonetPortraitImage,
                            pendoloTuning: vs.pendoloTuning, onPendoloTuningChange: vs.handleSetPendoloTuning,
                            sonnetTuning: vs.sonnetTuning, onSonnetTuningChange: vs.handleSetSonnetTuning,
                            temperaTuning: vs.temperaTuning, onTemperaTuningChange: vs.handleSetTemperaTuning,
                            lumiereTuning: vs.lumiereTuning, onLumiereTuningChange: vs.handleSetLumiereTuning,
                        })}
                        <div className="space-y-4 rounded-[24px] border border-white/10 p-4" style={{ backgroundColor: controlCardBg }}>
                            <div className="text-sm font-medium">{tr('options.visualizerBackgroundMode', '背景')}</div>
                            <VisualizerPresetGroup label="" value={bgMode} options={bgOptions}
                                onChange={(m) => vs.handleSetVisualizerBackgroundMode(m)} isDaylight={isDaylight} theme={theme} />
                        </div>
                        {bgEntry.renderSettingsPanel?.({ config: backgroundConfig, actions: backgroundActions, t, isDaylight, theme, controlCardBg, rangeInputClass })}
                        <div className="space-y-4 rounded-[24px] border border-white/10 p-4" style={{ backgroundColor: controlCardBg }}>
                            <div className="text-sm font-medium">显示</div>
                            <Toggle theme={theme} label="显示翻译 / 罗马音字幕" value={typo.showSubtitleTranslation} onChange={typo.handleToggleShowSubtitleTranslation} />
                            <Toggle theme={theme} label="日间配色" value={isDaylight} onChange={(v) => themeStore.setDaylightPreference(v)} />
                            <Toggle theme={theme} label="静态模式" desc="停止歌词动画，最省电" value={staticMode} onChange={themeStore.handleToggleStaticMode} />
                            <div className="space-y-1">
                                <div className="flex justify-between text-sm"><span>歌词字号</span><span className="opacity-60">{Math.round((typo.lyricsFontScale || 1) * 100)}%</span></div>
                                <input type="range" className={rangeInputClass} min={0.6} max={1.6} step={0.05} value={typo.lyricsFontScale || 1}
                                    onChange={(e) => typo.handleSetLyricsFontScale(Number(e.target.value))} />
                            </div>
                        </div>
                        <div className="px-1 text-[11px] leading-relaxed opacity-45">
                            歌词视觉来自 Folia Major v0.7.19（chthollyphile，AGPL-3.0）。设置只保存在本浏览器。点右上角「原版」可切回 Any Listen 原版详情页。
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FoliaAlApp;

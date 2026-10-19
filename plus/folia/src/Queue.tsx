// Play-mode button + play-queue panel for the Folia detail page (2026-10-15).
// Icons are Folia's own lucide set (Repeat / Repeat1 / Shuffle / ListEnd / RepeatOff / ListMusic).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { List, useListRef, type RowComponentProps } from 'react-window';
import { ListEnd, ListMusic, Music2, Repeat, Repeat1, RepeatOff, Shuffle, X } from 'lucide-react';
import type { AlApi, AlQueueItem } from './api';
import { colorWithAlpha } from '../folia-src/components/visualizer/colorMix';
import type { Theme } from '../folia-src/types';

export const PLAY_MODES: { mode: string; label: string; Icon: React.FC<{ size?: number }> }[] = [
    { mode: 'listLoop', label: '列表循环', Icon: Repeat },
    { mode: 'singleLoop', label: '单曲循环', Icon: Repeat1 },
    { mode: 'random', label: '随机播放', Icon: Shuffle },
    { mode: 'list', label: '顺序播放', Icon: ListEnd },
    { mode: 'none', label: '单曲播放', Icon: RepeatOff },
];
const modeOf = (m: string) => PLAY_MODES.find(x => x.mode === m) || PLAY_MODES[PLAY_MODES.length - 1];

export const PlayModeButton: React.FC<{ api: AlApi; mode: string; onNotice: (s: string) => void; size?: number; className?: string }> = ({ api, mode, onNotice, size = 18, className = 'h-10 w-10' }) => {
    // optimistic target: keep showing what was clicked until the player reports that same mode
    // (intermediate snapshots from fast clicks must not snap the icon back)
    const [local, setLocal] = useState<string | null>(null);
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => { if (local != null && mode === local) { setLocal(null); window.clearTimeout(timer.current); } }, [mode, local]);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    const cur = modeOf(local ?? mode);
    const next = () => {
        const order = PLAY_MODES.slice(0, 4).map(x => x.mode);
        const i = order.indexOf(cur.mode);
        const n = order[(i + 1) % order.length];
        setLocal(n); api.setPlayMode(n); onNotice(modeOf(n).label);
        window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setLocal(null), 3000);
    };
    return (
        <button type="button" className={`fal-btn ${className}`} title={`播放方式：${cur.label}（点击切换）`} aria-label={`播放方式：${cur.label}`} onClick={next}>
            <cur.Icon size={size} />
        </button>
    );
};

const ROW_H = 52;
type RowProps = { items: AlQueueItem[]; cur: string | null; onPlay: (id: string) => void; activeBg: string; marker: string };
const Row = ({ index, style, ariaAttributes, items, cur, onPlay, activeBg, marker }: RowComponentProps<RowProps>): React.ReactElement => {
    const it = items[index];
    const active = it.id === cur;
    return (
        <div style={style} {...ariaAttributes} className="px-2">
            <div onClick={() => onPlay(it.id)} data-active={active}
                className={`fal-qrow group flex h-[48px] cursor-pointer items-center gap-2.5 rounded-lg px-2 transition-colors ${active ? '' : 'hover:bg-white/5'}`}
                style={active ? { backgroundColor: activeBg } : undefined}>
                <div className="h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: active ? marker : 'transparent' }} />
                <span className="w-7 shrink-0 text-right text-[11px] tabular-nums opacity-40">{index + 1}</span>
                <Cover src={it.pic} />
                <div className="min-w-0 flex-1">
                    <div className={`truncate text-xs ${active ? 'font-semibold' : 'font-medium'}`}>{it.name || '未知歌曲'}</div>
                    <div className="truncate text-[10px] opacity-50">{it.later ? '稍后播放 · ' : ''}{it.singer}</div>
                </div>
            </div>
        </div>
    );
};

const Cover: React.FC<{ src: string | null }> = React.memo(({ src }) => {
    const [bad, setBad] = useState(false);
    useEffect(() => setBad(false), [src]);
    return (
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white/10">
            {src && !bad
                ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBad(true)} className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center opacity-40"><Music2 size={15} /></div>}
        </div>
    );
});

export const QueuePanel: React.FC<{ api: AlApi; open: boolean; onClose: () => void; theme: Theme; fg: string; isDaylight: boolean; phone: boolean; songId: string | null; mode: string; onNotice: (s: string) => void }> =
({ api, open, onClose, theme, fg, isDaylight, phone, songId, mode, onNotice }) => {
    const [items, setItems] = useState<AlQueueItem[]>([]);
    const [cur, setCur] = useState<string | null>(null);
    const listRef = useListRef(null);
    const scrolledFor = useRef<string | null>(null);
    useEffect(() => {
        if (!open) { scrolledFor.current = null; return; }
        const read = () => { try { setItems(api.queue() || []); setCur(api.currentItem()); } catch { /* ignore */ } };
        read();
        const id = window.setInterval(read, 1500);
        return () => window.clearInterval(id);
    }, [open, api, songId]);
    useEffect(() => {
        if (!open || !cur || scrolledFor.current === cur) return;
        const i = items.findIndex(x => x.id === cur);
        if (i < 0 || !listRef.current) return;
        scrolledFor.current = cur;
        const go = () => { try { listRef.current?.scrollToRow({ index: i, align: 'center', behavior: 'instant' }); } catch { /* ignore */ } };
        requestAnimationFrame(go); window.setTimeout(go, 120); window.setTimeout(go, 320);
    }, [open, cur, items, listRef]);
    const rowProps = useMemo<RowProps>(() => ({
        items, cur,
        onPlay: (id: string) => { setCur(id); api.playItem(id); },
        activeBg: isDaylight ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.16)',
        marker: fg,
    }), [items, cur, api, isDaylight, fg]);
    const m = modeOf(mode);
    return (
        <AnimatePresence>
            {open && (
                <motion.div key="fal-queue-scrim" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }} style={{ background: 'rgba(0,0,0,.18)' }} onPointerDown={(e) => { e.stopPropagation(); onClose(); }} />
            )}
            {open && (
                <motion.div key="fal-queue" role="dialog" aria-label="播放列表"
                    className={`fal-glass absolute flex flex-col overflow-hidden ${phone ? 'bottom-0 left-0 right-0 h-[66%] rounded-t-[26px]' : 'bottom-[76px] right-5 h-[min(560px,calc(100%-170px))] w-[360px] rounded-[22px]'}`}
                    style={{ backgroundColor: colorWithAlpha(theme.backgroundColor, 0.86), color: fg, paddingBottom: phone ? 'env(safe-area-inset-bottom)' : undefined, transformOrigin: phone ? '50% 100%' : '100% 100%' }}
                    initial={{ opacity: 0, y: phone ? 40 : 14, scale: phone ? 1 : 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: phone ? 40 : 10, scale: phone ? 1 : 0.97 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
                    <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
                        <div className="flex min-w-0 items-center gap-2">
                            <ListMusic size={16} />
                            <span className="text-sm font-semibold">播放列表</span>
                            <span className="text-xs opacity-50">{items.length}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <PlayModeButton api={api} mode={mode} onNotice={onNotice} size={15} className="h-8 w-8" />
                            <span className="mr-1 text-[11px] opacity-50">{m.label}</span>
                            <button type="button" className="fal-btn h-8 w-8" title="关闭" aria-label="关闭播放列表" onClick={onClose}><X size={16} /></button>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 pb-2">
                        {items.length === 0
                            ? <div className="flex h-full items-center justify-center text-xs opacity-40">播放列表是空的</div>
                            : <List listRef={listRef} rowComponent={Row} rowCount={items.length} rowHeight={ROW_H} rowProps={rowProps} className="fal-qlist" style={{ height: '100%' }} overscanCount={6} />}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export const QueueIcon = ListMusic;

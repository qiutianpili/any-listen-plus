// Entry of the Folia bundle for Any Listen. Loaded with dynamic import() by mobile.js only when the
// song-detail page opens in Folia style; exports mount()/version. Everything renders inside a shadow
// root so neither side's CSS leaks into the other.
import './ls';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import css from './folia.css?inline';
import { loadFoliaLocale } from './stubs/i18nConfig';
import FoliaAlApp, { debugState } from './App';
import type { AlApi } from './api';
import { useVisualizerSettingsStore } from '../folia-src/stores/useVisualizerSettingsStore';
import { VISUALIZER_REGISTRY } from '../folia-src/components/visualizer/registry';

export const version = '0.1.0';

const DOC_STYLE_ID = 'folia-al-doc-style';
// @font-face and @property are ignored inside a shadow root, so they go to the document once.
// Both only declare things (a font family / --tw-* custom properties) and change nothing on AL's page.
const ensureDocStyle = () => {
    if (document.getElementById(DOC_STYLE_ID)) return;
    const props = (css.match(/@property\s+--[\w-]+\s*\{[^}]*\}/g) || []).join('\n');
    const fonts = [400, 500].map(w => `@font-face{font-family:'Folia Noto Serif SC';font-style:normal;font-weight:${w};font-display:swap;src:url('https://cdn.jsdmirror.cn/npm/@fontsource/noto-serif-sc@5.2.9/files/noto-serif-sc-chinese-simplified-${w}-normal.woff2') format('woff2')}`).join('\n');
    const st = document.createElement('style');
    st.id = DOC_STYLE_ID;
    st.textContent = fonts + '\n' + props;
    document.head.appendChild(st);
};

// Cap devicePixelRatio while Folia is mounted (canvas / WebGL modes read it): phones 1.5, others 2.
let dprRestore: (() => void) | null = null;
const capDpr = (phone: boolean) => {
    if (dprRestore) return;
    const real = window.devicePixelRatio || 1;
    const cap = phone ? 1.5 : 2;
    if (real <= cap) return;
    const own = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    try {
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => Math.min(cap, (own?.get ? own.get.call(window) : real) || real) });
        dprRestore = () => { try { if (own) Object.defineProperty(window, 'devicePixelRatio', own); else delete (window as any).devicePixelRatio; } catch { /* ignore */ } dprRestore = null; };
    } catch { /* not configurable: leave as is */ }
};

export interface FoliaHandle { unmount(): void }

/** scripting / test helpers: list modes, switch mode (same action as Folia's own picker) */
export const modes = () => VISUALIZER_REGISTRY.map(e => e.mode);
export const setMode = (mode: string) => useVisualizerSettingsStore.getState().handleSetVisualizerMode(mode as never, { notify: false });
export const debug = () => ({ ...debugState });
export const getMode = () => useVisualizerSettingsStore.getState().visualizerMode;

class Boundary extends React.Component<{ api: AlApi; children: React.ReactNode }, { err: boolean }> {
    state = { err: false };
    static getDerivedStateFromError() { return { err: true }; }
    componentDidCatch(error: unknown) { console.warn('[folia] view crashed, falling back to the original detail page', error); try { this.props.api.fail(error); } catch { /* ignore */ } }
    render() { return this.state.err ? null : this.props.children; }
}

export function mount(host: HTMLElement, api: AlApi): FoliaHandle {
    ensureDocStyle();
    capDpr(api.isPhone());
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = css;
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;inset:0';
    shadow.append(style, container);
    const root: Root = createRoot(container);
    root.render(<Boundary api={api}><FoliaAlApp api={api} /></Boundary>);
    void loadFoliaLocale();
    let done = false;
    return {
        unmount() {
            if (done) return; done = true;
            try { root.unmount(); } catch (e) { console.warn('[folia] unmount', e); }
            shadow.innerHTML = '';
            if (dprRestore) dprRestore();
        },
    };
}

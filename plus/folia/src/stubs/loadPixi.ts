// Same as folia-src/components/visualizer/loadPixi.ts plus pixi.js/unsafe-eval: Any Listen serves a CSP
// without 'unsafe-eval', and Pixi 8 refuses to init without it unless its no-eval polyfills are loaded
// (Sonnet / Tempera / Lumiere failed with "Current environment does not allow unsafe-eval").
import { installPixiFilterPoolCompat } from '../../folia-src/components/visualizer/pixiFilterPoolCompat';

type PixiModule = typeof import('pixi.js');

export const loadPixi = async (): Promise<PixiModule> => {
    const pixi = await import('pixi.js');
    await import('pixi.js/unsafe-eval');
    pixi.GlProgram.defaultOptions.preferredFragmentPrecision = 'highp';
    installPixiFilterPoolCompat(pixi);
    return pixi;
};

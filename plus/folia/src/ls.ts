// Namespaced localStorage for everything Folia persists (visualizer mode, tunings, typography...):
// keys are stored as "folia:<key>" so they can never collide with Any Listen's own keys.
// vite.config's lsPlugin rewrites every localStorage reference in folia-src to this module's export.
const real: Storage | null = (() => { try { return (window as any)['local' + 'Storage'] as Storage; } catch { return null; } })();
const P = 'folia:';
const mem = new Map<string, string>();
const ns = {
  getItem(k: string) { try { return real ? real.getItem(P + k) : (mem.get(k) ?? null); } catch { return mem.get(k) ?? null; } },
  setItem(k: string, v: string) { try { if (real) real.setItem(P + k, String(v)); else mem.set(k, String(v)); } catch { mem.set(k, String(v)); } },
  removeItem(k: string) { try { real ? real.removeItem(P + k) : mem.delete(k); } catch { mem.delete(k); } },
  keys(): string[] { const out: string[] = []; try { if (real) for (let i = 0; i < real.length; i++) { const k = real.key(i); if (k && k.startsWith(P)) out.push(k.slice(P.length)); } else out.push(...mem.keys()); } catch { /* ignore */ } return out; },
  key(i: number) { return ns.keys()[i] ?? null; },
  get length() { return ns.keys().length; },
  clear() { ns.keys().forEach((k) => ns.removeItem(k)); },
};
(globalThis as any).__foliaLS = ns;
export const __foliaLS = ns as unknown as Storage;

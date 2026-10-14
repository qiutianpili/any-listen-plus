// folia-al stub: TTML lyrics are not produced by Any Listen.
export class TTMLParser { constructor(..._a: unknown[]) {} parse(): never { throw new Error('TTML not supported in folia-al'); } }
export const parseTTML = (): never => { throw new Error('TTML not supported in folia-al'); };
export default { TTMLParser, parseTTML };

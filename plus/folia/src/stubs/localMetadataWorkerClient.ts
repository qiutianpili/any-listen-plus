// folia-al stub: local-library metadata worker (music-metadata) is not used in the Any Listen embed.
export interface EmbeddedMetadataResult { [k: string]: unknown }
export interface HashedLocalCoverResult { [k: string]: unknown }
export const initMetadataWorker = (): Worker => { throw new Error('metadata worker disabled in folia-al'); };
export const parseEmbeddedMetadataAsync = async (..._a: unknown[]): Promise<EmbeddedMetadataResult | null> => null;
export const hashLocalCoverBlobAsync = async (_cover: Blob): Promise<HashedLocalCoverResult | null> => null;

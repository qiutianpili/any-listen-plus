// folia-al stub: Folium mod stage layers are not supported in the Any Listen embed.
import type React from 'react';
export const stageLayersRegistry = { list: () => [], subscribe: () => () => {} } as const;
export const FoliumStageLayerSlot: React.FC<Record<string, unknown>> = () => null;

import { LIMITS, SCHEMA_VERSION } from './limits';
import type { Project, Slide } from './types';

export const blankSlide = (id: string): Slide => ({ id, background: { kind: 'solid', color: '#FFFFFF' }, elements: [] });

export function createProject(newId: () => string, now: () => string, title = '내 작품'): Project {
  const at = now();
  return { schemaVersion: SCHEMA_VERSION, id: newId(), title, revision: 0, createdAt: at, updatedAt: at, width: LIMITS.slideWidth, height: LIMITS.slideHeight, assetManifest: [], slides: [blankSlide(newId())] };
}

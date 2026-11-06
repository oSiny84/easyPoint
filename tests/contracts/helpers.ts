import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../../src/domain/types';

const DIR = 'tests/fixtures/sample';

// 공통 샘플 문서. 시험마다 새 복사본을 돌려준다.
export const loadSample = (): Project => JSON.parse(fs.readFileSync(path.join(DIR, 'project.json'), 'utf8'));
export const sampleAssets = () => new Map(fs.readdirSync(path.join(DIR, 'assets')).map(name => [name.split('.')[0], new Uint8Array(fs.readFileSync(path.join(DIR, 'assets', name)))]));

export const ids = {
  slide1: '00000000-0000-4000-8000-000000000010', photo1: '00000000-0000-4000-8000-000000000011', stroke1: '00000000-0000-4000-8000-000000000012', title: '00000000-0000-4000-8000-000000000013', body: '00000000-0000-4000-8000-000000000014',
  slide2: '00000000-0000-4000-8000-000000000020', slide3: '00000000-0000-4000-8000-000000000030', slide4: '00000000-0000-4000-8000-000000000040',
};

let counter = 1000;
export const nextId = () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`;
export const clock = () => { let tick = 0; return () => new Date(Date.UTC(2026, 10, 7, 0, 0, tick++)).toISOString(); };
export const contentOf = (project: Project) => JSON.parse(JSON.stringify({ title: project.title, slides: project.slides, assetManifest: project.assetManifest }));

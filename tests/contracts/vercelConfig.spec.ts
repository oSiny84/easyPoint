import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Vercel 배포 설정(docs/RELEASE.md §Vercel)이 실행 파일(launcher/CanvaCraftLauncher.cs)과 같은 응답 규칙을 지키는지 본다.
// Vercel 자체는 여기서 돌리지 않는다. 올린 뒤의 확인은 RELEASE.md의 절차로 한다.
type Rule = { source: string; headers: { key: string; value: string }[] };
const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
const launcher = fs.readFileSync('launcher/CanvaCraftLauncher.cs', 'utf8');
const rules: Rule[] = config.headers;
const header = (source: string, key: string) => rules.find(rule => rule.source === source)?.headers.find(item => item.key === key)?.value;
// 같은 머리글을 두 규칙이 함께 정하면 어느 쪽이 이기는지 Vercel 문서에 기대야 한다. 겹치지 않게 둔다.
const owners = (key: string) => rules.filter(rule => rule.headers.some(item => item.key === key)).map(rule => rule.source);

test('빌드 명령과 출력 폴더가 package.json의 제품 빌드와 같다', () => {
  expect(config.buildCommand).toBe('npm run build');
  expect(scripts.build).toContain('--base=./');
  expect(scripts.build).toContain('prune-dist.mjs');
  expect(config.outputDirectory).toBe('dist');
  expect(config.installCommand).toBe('npm ci');
});

test('모든 응답에 실행 파일과 같은 보안 머리글을 붙인다', () => {
  expect(header('/(.*)', 'Content-Security-Policy')).toBe("frame-ancestors 'none'");
  expect(launcher).toContain("Content-Security-Policy: frame-ancestors 'none'");
  expect(header('/(.*)', 'X-Content-Type-Options')).toBe('nosniff');
  expect(launcher).toContain('X-Content-Type-Options: nosniff');
  expect(owners('Content-Security-Policy')).toEqual(['/(.*)']);
});

test('assets만 오래 캐시하고 나머지는 매번 확인한다', () => {
  expect(header('/assets/(.*)', 'Cache-Control')).toBe('public, max-age=31536000, immutable');
  expect(launcher).toContain('"public, max-age=31536000, immutable" : "no-cache"');
  expect(header('/((?!assets/).*)', 'Cache-Control')).toBe('no-cache');
  expect(owners('Cache-Control').sort()).toEqual(['/((?!assets/).*)', '/assets/(.*)']);
});

test('템플릿 파일은 이진 파일로 내준다', () => {
  expect(header('/(.*).canvacraft', 'Content-Type')).toBe('application/octet-stream');
});

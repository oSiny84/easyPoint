// 내장 그림의 MIT 고지. 이미지로 합성하는 출력은 PNG의 라이선스 정보가 사라지므로 출력물 안에 글로 옮긴다.
// 문서가 쓰는 PNG 자체에서 읽으므로 작품을 다시 열어도, 라이브러리가 바뀌어도 그대로 동작한다.
import { readPngText } from '../assets/imageHeader';
import type { Project } from '../domain/types';
import { referencedAssets, type AssetResolver } from '../storage/projectFile';

const HEADER = '이 파일의 그림 일부는 Microsoft Fluent Emoji(https://github.com/microsoft/fluentui-emoji)를 사용했습니다.';

export async function licenseNotice(snapshot: Project, resolve: AssetResolver): Promise<string | null> {
  const texts = new Set<string>();
  for (const asset of referencedAssets(snapshot)) {
    if (asset.mime !== 'image/png') continue;
    const blob = await resolve(asset.id);
    const text = blob && readPngText(new Uint8Array(await blob.arrayBuffer()), 'License');
    if (text && text.includes('MIT License')) texts.add(text.split('\n').map(line => line.trim()).join('\n').trim());
  }
  return texts.size ? [HEADER, ...texts].join('\n\n') : null;
}

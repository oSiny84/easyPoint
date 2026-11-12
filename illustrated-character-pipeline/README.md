# 그림 캐릭터 준비 도구

생성한 캐릭터 그림을 요소 패널의 캐릭터 묶음(`public/characters-illustrated`)에 넣는다. 그림 배경 도구(`illustrated-background-pipeline`)와 같은 방식이다. 기본 요소 120개(`public/library`)는 `asset-pipeline`이 다시 만들므로 그 manifest에 섞지 않고, `loadLibrary`(`src/assets/library.ts`)가 두 manifest를 합친다. 새 캐릭터가 먼저 나온다.

## 순서

1. 장마다 메타데이터 JSON을 이 폴더에 둔다. `id`는 `art-character-`(그림책 친구) 또는 `art-creature-`(몬스터 친구)로 시작한다. `label`, `category`, `tags`, `date`, `prompt`, `sourceFile`, `inspection`을 적는다.
2. `node illustrated-character-pipeline/save.cjs <원본.png> illustrated-character-pipeline/<id>.json`. RGBA가 아니거나 한 변이 2560px를 넘으면 넣지 않는다. 이미 있는 파일은 덮어쓰지 않는다. PNG 픽셀은 바이트 그대로 두고 출처 설명 `License` tEXt 청크만 더한다.
3. `node illustrated-character-pipeline/thumbnails.cjs`로 160×160 미리보기를 만든다. 비율을 지키고 남는 곳은 투명으로 둔다.
4. `tests/contracts/library.spec.ts`와 `tests/e2e/library.spec.ts`의 수량을 고친다.

## 원본

2026-11-12에 넣은 17개의 원본 팩(`art-expansion-2026-11-12`, `creature-friends`)은 저장소 밖 `C:/D_ClaudeDevelop/CanvaCraft-art-originals/2026-11-12/`에 있다. manifest의 `sourceFile`은 이 폴더 기준 경로다. 원본 팩을 `public` 아래에 두면 배포 결과에 그대로 들어가므로 두지 않는다.

## 연결 전 검사

투명 배경과 가장자리 잘림은 넣기 전에 본다. 2026-11-12에는 브라우저 캔버스로 알파를 읽어 네 모서리와 가장자리 2px를 확인했고, 검은 배경에 올려 직접 봤다. 같은 검사를 `tests/e2e/library.spec.ts`의 그림 캐릭터 시험이 되풀이한다(알파 16 이하는 눈에 보이지 않는 생성 잔여로 본다).

## 출처 표시

`License` 청크와 manifest의 `license: 'AI-generated'`는 AI 생성 출처 설명이다. MIT·CC0가 아니므로 `src/export/notices.ts`가 출력물에 옮기지 않는다. 생성 프롬프트 원문은 `public/characters-illustrated/prompts/`에 있고 배포 결과에서는 빠진다(`scripts/prune-dist.mjs`).

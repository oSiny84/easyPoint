// MP4 내보내기의 임시 파일 자리(애니메이션 계약 §8): OPFS canvacraft-animation/tmp.
// 성공한 파일은 내려준 뒤에도 남으므로, 다음 내보내기를 시작할 때와 작품 목록에 들어올 때(배타 catalog 잠금) 폴더를 비운다.
// 영상 편집기의 임시 폴더는 영상 작품 목록에 들어가야만 비워지므로 함께 쓰지 않는다. 내보내기 Worker(video/animationJob.ts)도 이 폴더를 쓴다.
const ROOT = 'canvacraft-animation', TEMP = 'tmp';

export async function exportDirectory() {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(ROOT, { create: true });
  return root.getDirectoryHandle(TEMP, { create: true });
}

// 남은 임시 파일을 지운다. 지우지 못한 파일(다른 탭이 쓰는 중)은 다음에 지운다.
export async function clearExportFiles() {
  try {
    const directory = await exportDirectory(); const names: string[] = [];
    for await (const [name] of (directory as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) names.push(name);
    for (const name of names) await directory.removeEntry(name).catch(() => undefined);
    return names.length;
  } catch { return 0; }
}

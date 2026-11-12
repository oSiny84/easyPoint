// 탭 사이 잠금(계약 §6). 잠금 순서는 catalog → project다. 편집 세션은 공유 catalog 잠금과 작품별 배타 잠금을 쥔다.
// 자산 물리 삭제는 배타 catalog 잠금을 얻을 때만 한다. 다른 탭이 열려 있으면 미룬다.
// 영상 편집기는 이름이 다른 잠금을 쓴다(영상 계약 §6). 같은 id의 작품이 있어도 슬라이드 잠금과 충돌하지 않는다.
export type LockNames = { catalog: string; project: (id: string) => string };
export const SLIDE_LOCKS: LockNames = { catalog: 'canvacraft-catalog', project: id => `canvacraft-project-${id}` };
export const VIDEO_LOCKS: LockNames = { catalog: 'canvacraft-video-catalog', project: id => `canvacraft-video-project-${id}` };
// 애니메이션 편집기도 이름이 다른 잠금을 쓴다(애니메이션 계약 §6).
export const ANIMATION_LOCKS: LockNames = { catalog: 'canvacraft-animation-catalog', project: id => `canvacraft-animation-project-${id}` };

export type SessionLock = { readOnly: boolean; reason?: 'other-tab' | 'unsupported'; release: () => void };

function hold(name: string, mode: LockMode, ifAvailable: boolean) {
  return new Promise<{ held: boolean; release: () => void }>((resolve, reject) => {
    let release = () => undefined as void;
    const until = new Promise<void>(done => { release = done; });
    navigator.locks.request(name, { mode, ifAvailable }, lock => {
      if (!lock) { resolve({ held: false, release: () => undefined }); return undefined; }
      resolve({ held: true, release });
      return until;
    }).catch(reject);
  });
}

// 작품을 연 동안 잠금을 쥔다. 탭을 닫으면 브라우저가 풀어 준다. 잠금을 못 쓰는 브라우저에서는 쓰기를 허용하지 않는다.
export async function acquireSession(projectId: string, names: LockNames = SLIDE_LOCKS): Promise<SessionLock> {
  if (!navigator.locks) return { readOnly: true, reason: 'unsupported', release: () => undefined };
  const catalog = await hold(names.catalog, 'shared', false);
  const project = await hold(names.project(projectId), 'exclusive', true);
  return {
    readOnly: !project.held, reason: project.held ? undefined : 'other-tab',
    release: () => { project.release(); catalog.release(); },
  };
}

// 어떤 편집 세션도 없을 때만 실행한다. 공유 잠금을 쥔 채 호출하지 않는다.
export async function withExclusiveCatalog<T>(work: () => Promise<T>, names: LockNames = SLIDE_LOCKS): Promise<{ busy: true } | { busy: false; value: T }> {
  if (!navigator.locks) return { busy: true };
  return navigator.locks.request(names.catalog, { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock) return { busy: true as const };
    return { busy: false as const, value: await work() };
  });
}

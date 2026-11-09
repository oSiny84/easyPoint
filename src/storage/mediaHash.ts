// 영상 Media id(영상 계약 §2): 8MiB 조각마다 SHA-256을 구해 순서대로 이어 붙인 바이트의 SHA-256(64자리 hex).
// crypto.subtle.digest는 입력 전체를 메모리에 받으므로 2GiB 파일을 한 번에 해시할 수 없어 조각으로 나눈다.
// 슬라이드 사진 id(전체 SHA-256)와 계산법이 다르며 두 저장소는 id를 섞지 않는다.
export const HASH_CHUNK_BYTES = 8 * 1024 * 1024;

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');

// 조각 해시를 이어 붙여 최종 id를 만든다. 조각을 읽는 쪽(복사하면서 해시, 다 읽은 파일 해시)이 같은 함수를 쓴다.
export function createMediaHasher() {
  const digests: Uint8Array[] = [];
  return {
    async add(chunk: ArrayBuffer | Uint8Array) {
      // 마지막 조각을 빼고는 정확히 8MiB여야 같은 id가 나온다.
      digests.push(new Uint8Array(await crypto.subtle.digest('SHA-256', chunk as BufferSource)));
    },
    async finish() {
      const joined = new Uint8Array(digests.length * 32);
      digests.forEach((digest, index) => joined.set(digest, index * 32));
      return hex(await crypto.subtle.digest('SHA-256', joined));
    },
  };
}

export async function mediaId(blob: Blob, signal?: AbortSignal): Promise<string> {
  const hasher = createMediaHasher();
  for (let offset = 0; offset < blob.size || offset === 0; offset += HASH_CHUNK_BYTES) {
    signal?.throwIfAborted();
    await hasher.add(await blob.slice(offset, offset + HASH_CHUNK_BYTES).arrayBuffer());
    if (blob.size === 0) break;
  }
  return hasher.finish();
}

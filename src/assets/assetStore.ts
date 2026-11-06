// 사진 바이너리는 문서 밖에 둔다. 문서는 해시로만 참조한다.
export function createAssetStore(initial?: Map<string, Blob>) {
  const blobs = new Map(initial); const urls = new Map<string, string>();
  return {
    resolve: async (id: string) => blobs.get(id),
    put(id: string, blob: Blob) { blobs.set(id, blob); },
    // 화면 표시용 주소. 작품을 닫을 때 dispose로 해제한다.
    url(id: string) {
      const blob = blobs.get(id);
      if (!blob) return undefined;
      let url = urls.get(id);
      if (!url) { url = URL.createObjectURL(blob); urls.set(id, url); }
      return url;
    },
    dispose() { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); },
  };
}
export type AssetStore = ReturnType<typeof createAssetStore>;

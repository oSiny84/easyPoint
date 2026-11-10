// 화면에 보이는 시간: 분:초(0:05, 12:30). 숫자 입력 칸 대신 이 표시만 쓴다.
// 1시간 미만은 m:ss, 1시간 이상은 h:mm:ss.
export function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  const two = (value: number) => String(value).padStart(2, '0');
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}:${two(Math.floor((seconds % 3600) / 60))}:${two(seconds % 60)}`;
  return `${Math.floor(seconds / 60)}:${two(seconds % 60)}`;
}

// 원본 파일 크기 안내: 1MB 미만은 1MB로, 1GB 이상은 소수 한 자리 GB로.
export function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${Math.max(1, Math.round(mb))}MB`;
}

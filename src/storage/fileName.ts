// 작품 제목으로 다운로드 파일 이름을 만든다. 저장 데이터의 제목은 바꾸지 않는다(계약 §8).
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function downloadName(title: string, extension: string) {
  let name = title.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (!name) name = '내 작품';
  if (RESERVED.test(name)) name = `${name} 작품`;
  return `${name}.${extension}`;
}

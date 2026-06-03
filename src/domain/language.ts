const CJK_RE = /[\u3400-\u9fff]/

export function containsChineseText(value: string): boolean {
  return CJK_RE.test(value)
}

/** path が ancestor 自身か、その配下か。`a/b` と `a/bc` を取り違えないため前置一致では書かない */
export function isUnder(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`)
}

/**
 * 移動元と移動先ディレクトリから宛先パスを組む。ルートは toDir = '' で表す。
 * 移動が無意味（同じ親）か不正（フォルダを自分の中へ）なら null。
 */
export function moveDestination(fromPath: string, toDir: string): string | null {
  const name = fromPath.split('/').pop()
  if (!name) return null
  if (isUnder(toDir, fromPath)) return null

  const dest = toDir ? `${toDir}/${name}` : name
  if (dest === fromPath) return null
  return dest
}

/** 開いているパスを move/rename に追随させる。無関係ならそのまま返す。 */
export function remapOpenPath(
  openPath: string | null,
  from: string,
  to: string,
): string | null {
  if (openPath === null || !isUnder(openPath, from)) return openPath
  return `${to}${openPath.slice(from.length)}`
}

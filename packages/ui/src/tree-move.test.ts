import { describe, it, expect } from 'vitest'
import { isUnder, moveDestination, remapOpenPath } from './tree-move.js'

describe('isUnder', () => {
  it.each([
    ['自分自身', 'a/b', 'a/b', true],
    ['直下', 'a/b/c.md', 'a/b', true],
    ['孫', 'a/b/c/d.md', 'a/b', true],
    ['前置一致するだけの別フォルダ', 'a/bc.md', 'a/b', false],
    ['無関係', 'z/q.md', 'a/b', false],
    ['親を子孫扱いしない', 'a', 'a/b', false],
  ])('%s', (_name, path, ancestor, expected) => {
    expect(isUnder(path, ancestor)).toBe(expected)
  })
})

describe('moveDestination', () => {
  it.each([
    ['フォルダへ移動', 'a/b.md', 'x', 'x/b.md'],
    ['ルートへ移動', 'a/b.md', '', 'b.md'],
    ['ルートからフォルダへ移動', 'b.md', 'x', 'x/b.md'],
    ['フォルダごと移動', 'a/b', 'x', 'x/b'],
    ['前置一致するが別フォルダ', 'a/b', 'a/bc', 'a/bc/b'],
  ])('%s', (_name, from, toDir, expected) => {
    expect(moveDestination(from, toDir)).toBe(expected)
  })

  it.each([
    ['同じ親へ移動', 'a/b.md', 'a'],
    ['ルートのファイルをルートへ', 'b.md', ''],
    ['フォルダを自分自身へ', 'a/b', 'a/b'],
    ['フォルダを自分の子孫へ', 'a/b', 'a/b/c'],
  ])('%s は null', (_name, from, toDir) => {
    expect(moveDestination(from, toDir)).toBeNull()
  })
})

describe('remapOpenPath', () => {
  it('移動したファイル自身は新パスになる', () => {
    expect(remapOpenPath('a/b.md', 'a/b.md', 'x/b.md')).toBe('x/b.md')
  })

  it('祖先フォルダの移動に追随する', () => {
    expect(remapOpenPath('a/b/c.md', 'a/b', 'x/b')).toBe('x/b/c.md')
  })

  it('前置一致するだけの別パスは変わらない', () => {
    expect(remapOpenPath('a/bc.md', 'a/b', 'x/b')).toBe('a/bc.md')
  })

  it('無関係なパスは変わらない', () => {
    expect(remapOpenPath('z/q.md', 'a/b', 'x/b')).toBe('z/q.md')
  })

  it('未選択なら null のまま', () => {
    expect(remapOpenPath(null, 'a/b', 'x/b')).toBeNull()
  })
})

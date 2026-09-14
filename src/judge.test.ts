import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize, sameOutput, encodeShare, decodeShare } from './judge.ts'

test('output compare ignores CRLF, trailing spaces and trailing blank lines', () => {
  assert.ok(sameOutput('1 2\n3\n', '1 2   \r\n3\r\n\n\n'))
  assert.ok(sameOutput('', '\n'))
  assert.ok(!sameOutput('1 2', '1  2'), 'inner whitespace still matters')
  assert.ok(!sameOutput('a\n\nb', 'a\nb'), 'inner blank lines still matter')
  assert.ok(!sameOutput('5', ' 5'), 'leading space still matters')
  assert.equal(normalize('x \n y \n'), 'x\n y')
})

test('share link round-trips unicode, big code and empty tests', async () => {
  const state = {
    lang: 'cpp',
    code: '#include <bits/stdc++.h>\n// नमस्ते 🚀\n' + 'int x;\n'.repeat(3000),
    tests: [{ input: '2 3\n', expected: '5' }, { input: '', expected: '' }],
  }
  const hash = await encodeShare(state)
  assert.match(hash, /^[A-Za-z0-9_-]+$/, 'hash is url-safe')
  assert.ok(hash.length < 2000, `repetitive code compresses (${hash.length} chars)`)
  assert.deepEqual(await decodeShare(hash), state)
  assert.equal(await decodeShare('not-a-valid-share'), null)
})

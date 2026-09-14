import './style.css'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { Compartment, Prec } from '@codemirror/state'
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { python } from '@codemirror/lang-python'
import { prepare, type Lang, type Prepared, type RunResult } from './run.ts'
import { onCompilerDownload } from './runners/cpp.ts'
import { decodeShare, encodeShare, normalize, sameOutput, type Verdict } from './judge.ts'

type Test = { input: string; expected: string }
type Outcome = { verdict: Verdict | 'ran' | 'running'; result?: RunResult }

const NAMES: Record<Lang, string> = { cpp: 'C++', java: 'Java', python: 'Python' }
const TIME_LIMIT: Record<Lang, number> = { cpp: 2000, java: 5000, python: 5000 }
const TEMPLATES: Record<Lang, string> = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long a, b;
    cin >> a >> b;
    cout << a + b << "\\n";
}
`,
  java: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer(br.readLine());
        long a = Long.parseLong(st.nextToken());
        long b = Long.parseLong(st.nextToken());
        System.out.println(a + b);
    }
}
`,
  python: `import sys
input = sys.stdin.readline

a, b = map(int, input().split())
print(a + b)
`,
}
const VERDICT_TEXT: Record<Outcome['verdict'], string> = {
  AC: 'Accepted', WA: 'Wrong answer', TLE: 'Time limit exceeded', RE: 'Runtime error', CE: 'Compile error', ran: 'Finished', running: 'Running',
}

// ---- state (persisted per browser) ----
const load = <T>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem('loopback:' + key) ?? 'null') ?? fallback } catch { return fallback }
}
const save = (key: string, value: unknown) => localStorage.setItem('loopback:' + key, JSON.stringify(value))

let lang: Lang = load('lang', 'cpp')
const code: Record<Lang, string> = {
  cpp: load('code:cpp', TEMPLATES.cpp),
  java: load('code:java', TEMPLATES.java),
  python: load('code:python', TEMPLATES.python),
}
let tests: Test[] = load('tests', [{ input: '2 3\n', expected: '5\n' }])
let outcomes: (Outcome | undefined)[] = []
let cache: { key: string; prepared: Prepared } | undefined
let busy = false
const started = new Set<Lang>()

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const statusEl = $('#status')
const compileErrorEl = $('#compile-error')
const listEl = $('#test-list')
const setStatus = (text: string) => { statusEl.textContent = text }

// ---- editor ----
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.modifier, t.operatorKeyword], color: '#9cc8ff' },
  { tag: [t.string, t.character], color: '#a8e6b8' },
  { tag: [t.number, t.bool, t.null], color: '#f4e04d' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#6f8799', fontStyle: 'italic' },
  { tag: [t.typeName, t.className, t.namespace], color: '#d7b8ff' },
  { tag: [t.processingInstruction, t.macroName], color: '#ff9e8f' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: '#ffffff' },
])
const theme = EditorView.theme({
  '&': { color: '#e6edf2', backgroundColor: 'transparent', fontSize: '14px' },
  '.cm-content': { fontFamily: 'var(--font-code)', caretColor: '#f4e04d', padding: '12px 0' },
  '.cm-scroller': { fontFamily: 'var(--font-code)', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'transparent', color: '#4f6a80', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.035)' },
  '.cm-cursor': { borderLeftColor: '#f4e04d', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(244,224,77,0.2) !important' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(244,224,77,0.18)', outline: 'none' },
  '.cm-tooltip': { backgroundColor: '#0a1a28', border: '1px solid #24425c' },
}, { dark: true })

const language = new Compartment()
const languageFor = (l: Lang) => (l === 'cpp' ? cpp() : l === 'java' ? java() : python())

const view = new EditorView({
  doc: code[lang],
  parent: $('#editor'),
  extensions: [
    Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { runTests(); return true } }])),
    basicSetup,
    indentUnit.of('    '),
    language.of(languageFor(lang)),
    theme,
    syntaxHighlighting(highlight),
    EditorView.contentAttributes.of({ 'aria-label': 'Code' }),
    EditorView.updateListener.of((u) => {
      if (!u.docChanged) return
      code[lang] = u.state.doc.toString()
      save('code:' + lang, code[lang])
    }),
  ],
})

function setLang(next: Lang) {
  lang = next
  save('lang', lang)
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code[lang] }, effects: language.reconfigure(languageFor(lang)) })
  for (const b of document.querySelectorAll<HTMLButtonElement>('.langs button')) b.setAttribute('aria-checked', String(b.dataset.lang === lang))
  outcomes = []
  compileErrorEl.hidden = true
  renderTests()
  setStatus('')
}

// ---- tests ----
function firstDifference(expected: string, actual: string): string {
  const e = normalize(expected).split('\n')
  const a = normalize(actual).split('\n')
  const clip = (s = '') => (s.length > 60 ? s.slice(0, 57) + '...' : s)
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if (e[i] === undefined) return `Extra output from line ${i + 1}: "${clip(a[i])}"`
    if (a[i] === undefined) return `Output ends early. Line ${i + 1} should be "${clip(e[i])}"`
    if (e[i] !== a[i]) return `Line ${i + 1}: expected "${clip(e[i])}", got "${clip(a[i])}"`
  }
  return ''
}

function renderTests() {
  listEl.replaceChildren(...tests.map((test, i) => {
    const li = document.createElement('li')
    li.className = 'test'
    li.innerHTML = `
      <div class="test-head">
        <span class="test-name">Test ${i + 1}</span>
        <span class="verdict"></span>
        <span class="time"></span>
        <button type="button" class="run-one">Run</button>
        <button type="button" class="remove" aria-label="Remove test ${i + 1}">Remove</button>
      </div>
      <div class="io">
        <label>Input<textarea class="input" spellcheck="false"></textarea></label>
        <label>Expected output<textarea class="expected" spellcheck="false" placeholder="Optional"></textarea></label>
      </div>
      <div class="out" hidden>
        <div class="out-label">Output</div>
        <pre class="stdout"></pre>
        <pre class="stderr"></pre>
        <p class="diff" hidden></p>
      </div>`
    const input = li.querySelector<HTMLTextAreaElement>('.input')!
    const expected = li.querySelector<HTMLTextAreaElement>('.expected')!
    input.value = test.input
    expected.value = test.expected
    input.oninput = () => { test.input = input.value; save('tests', tests) }
    expected.oninput = () => { test.expected = expected.value; save('tests', tests) }
    li.querySelector<HTMLButtonElement>('.run-one')!.onclick = () => runTests([i])
    li.querySelector<HTMLButtonElement>('.remove')!.onclick = () => {
      tests.splice(i, 1)
      outcomes.splice(i, 1)
      save('tests', tests)
      renderTests()
    }
    return li
  }))
  outcomes.forEach((o, i) => o && showOutcome(i, o))
  setBusy(busy)
}

function showOutcome(i: number, o: Outcome) {
  outcomes[i] = o
  const li = listEl.children[i] as HTMLElement | undefined
  if (!li) return
  li.dataset.verdict = o.verdict
  li.querySelector('.verdict')!.textContent = VERDICT_TEXT[o.verdict]
  li.querySelector('.time')!.textContent = o.result && o.verdict !== 'TLE' ? `${Math.max(1, Math.round(o.result.ms))} ms` : ''
  const out = li.querySelector<HTMLElement>('.out')!
  out.hidden = !o.result
  if (!o.result) return
  li.querySelector('.stdout')!.textContent = o.result.stdout
  li.querySelector('.stderr')!.textContent = o.result.stderr
  const diff = li.querySelector<HTMLElement>('.diff')!
  diff.hidden = o.verdict !== 'WA'
  if (o.verdict === 'WA') diff.textContent = firstDifference(tests[i].expected, o.result.stdout)
}

function verdictOf(r: RunResult, expected: string): Outcome['verdict'] {
  if (r.status === 'timeout') return 'TLE'
  if (r.status === 'runtime_error') return 'RE'
  if (!expected.trim()) return 'ran'
  return sameOutput(expected, r.stdout) ? 'AC' : 'WA'
}

function setBusy(on: boolean) {
  busy = on
  for (const b of document.querySelectorAll<HTMLButtonElement>('#run-all, #add-test, .run-one, .remove, .langs button')) b.disabled = on
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

async function runTests(indices = tests.map((_, i) => i)) {
  if (busy || !indices.length) return
  setBusy(true)
  compileErrorEl.hidden = true
  for (const i of indices) showOutcome(i, { verdict: 'running' })
  const runLang = lang
  const source = code[runLang]
  try {
    const key = runLang + '\0' + source
    let prepared = cache?.key === key ? cache.prepared : undefined
    if (!prepared) {
      setStatus(started.has(runLang) ? `Compiling ${NAMES[runLang]}...`
        : runLang === 'java' ? 'Starting Java. The first run takes about 10 seconds.'
        : runLang === 'python' ? 'Starting Python...'
        : 'Compiling C++...')
      const t0 = performance.now()
      prepared = await prepare(runLang, source)
      started.add(runLang)
      cache = { key, prepared }
      if (!('compileError' in prepared)) setStatus(`Compiled in ${seconds(performance.now() - t0)} on this device. Running...`)
    }
    if ('compileError' in prepared) {
      compileErrorEl.textContent = prepared.compileError
      compileErrorEl.hidden = false
      for (const i of indices) showOutcome(i, { verdict: 'CE' })
      setStatus('Compile error. Fix the code and run again.')
      return
    }
    for (const i of indices) {
      const r = await prepared.run(tests[i].input, TIME_LIMIT[runLang])
      showOutcome(i, { verdict: verdictOf(r, tests[i].expected), result: r })
    }
    const judged = indices.filter((i) => tests[i].expected.trim())
    const accepted = judged.filter((i) => outcomes[i]?.verdict === 'AC').length
    const ran = indices.length === 1 ? 'Ran 1 test' : `Ran ${indices.length} tests`
    setStatus(judged.length ? `${ran}. ${accepted} of ${judged.length} accepted.` : `${ran}. Add expected output to check answers.`)
  } catch (e) {
    for (const i of indices) if (outcomes[i]?.verdict === 'running') outcomes[i] = undefined
    renderTests()
    setStatus(`The ${NAMES[runLang]} runner stopped unexpectedly: ${e instanceof Error ? e.message : e}. Reload the page to restart it.`)
  } finally {
    setBusy(false)
  }
}

onCompilerDownload(({ doneLength, totalLength }) => {
  if (doneLength < totalLength) setStatus(`Downloading the C++ compiler: ${Math.round((100 * doneLength) / totalLength)}% of ${Math.round(totalLength / 1e6)} MB. This happens once.`)
  else setStatus('Compiling C++...')
})

// ---- wiring ----
$('#run-all').onclick = () => runTests()
$('#add-test').onclick = () => {
  tests.push({ input: '', expected: '' })
  save('tests', tests)
  renderTests()
  listEl.lastElementChild?.querySelector('textarea')?.focus()
}
for (const b of document.querySelectorAll<HTMLButtonElement>('.langs button')) b.onclick = () => setLang(b.dataset.lang as Lang)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); runTests() }
})
if (/Mac|iPhone|iPad/.test(navigator.platform)) $('#run-hint').textContent = '⌘ + Enter'

$<HTMLButtonElement>('#share').onclick = async (e) => {
  const button = e.currentTarget as HTMLButtonElement
  const hash = await encodeShare({ lang, code: code[lang], tests })
  history.replaceState(null, '', '#' + hash)
  try {
    await navigator.clipboard.writeText(location.href)
    button.textContent = 'Link copied'
  } catch {
    button.textContent = 'Link is in the address bar'
  }
  setTimeout(() => { button.textContent = 'Copy share link' }, 2000)
}

// A share link overrides what this browser had saved.
const shared = location.hash.length > 1 ? await decodeShare(location.hash.slice(1)) : null
if (shared && shared.lang in NAMES) {
  code[shared.lang as Lang] = shared.code
  save('code:' + shared.lang, shared.code)
  tests = shared.tests
  save('tests', tests)
  lang = shared.lang as Lang
}
setLang(lang)

if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')

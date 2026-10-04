// End-to-end check against a deployed loopback. Usage: node spike/prod-test.mjs [baseURL]
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'https://loopback-seven.vercel.app/'

const PROGRAMS = {
  c: '#include <stdio.h>\nint main(void){long long a,b;scanf("%lld %lld",&a,&b);printf("%lld\\n",a+b);return 0;}',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\nint main(){long long a,b;cin>>a>>b;cout<<a+b<<"\\n";}',
  java: 'import java.util.*;\npublic class Main{public static void main(String[] a){Scanner s=new Scanner(System.in);System.out.println(s.nextLong()+s.nextLong());}}',
  python: 'a, b = map(int, input().split())\nprint(a + b)',
  js: 'const [a, b] = input().split(" ").map(Number);\nprint(a + b);',
  ts: 'const [a, b]: number[] = input()!.split(" ").map(Number);\nprint(a + b);',
  go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\tvar a, b int64\n\tfmt.Fscan(reader, &a, &b)\n\tfmt.Println(a + b)\n}',
  ruby: 'a, b = gets.split.map(&:to_i)\nputs a + b',
  php: '<?php\n[$a, $b] = array_map("intval", explode(" ", trim(fgets(STDIN))));\necho $a + $b, "\\n";',
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' })

async function openSeeded(context, lang, code, tests = [{ input: '2 3\n', expected: '5\n' }]) {
  const page = await context.newPage()
  await page.addInitScript((seed) => {
    localStorage.setItem('loopback:lang', JSON.stringify(seed.lang))
    localStorage.setItem(`loopback:code:${seed.lang}`, JSON.stringify(seed.code))
    localStorage.setItem('loopback:tests', JSON.stringify(seed.tests))
  }, { lang, code, tests })
  await page.goto(BASE)
  return page
}

for (const [lang, code] of Object.entries(PROGRAMS)) {
  const context = await browser.newContext()
  const page = await openSeeded(context, lang, code)
  const t = Date.now()
  await page.getByRole('button', { name: 'Run all tests' }).click()
  let verdict = 'NO RESULT', detail = ''
  try {
    await page.locator('#status').filter({ hasText: /^Ran 1 test|stopped|Compile error/ }).waitFor({ timeout: 180000 })
    verdict = (await page.locator('.verdict').first().textContent()) ?? '?'
    detail = ((await page.locator('.stderr').first().textContent()) || (await page.locator('.stdout').first().textContent()) || '').trim().slice(0, 90)
  } catch {
    detail = `timed out; status: ${await page.locator('#status').textContent()}`
  }
  console.log(`${lang.padEnd(7)} ${verdict.padEnd(16)} ${((Date.now() - t) / 1000).toFixed(1)}s  ${detail.replace(/\n/g, ' ')}`)
  await context.close()
}

// Share link, then offline, on one context
const context = await browser.newContext()
const page = await openSeeded(context, 'python', PROGRAMS.python, [{ input: '2 3\n', expected: '5\n' }, { input: '9 1\n', expected: '10\n' }])
await page.getByRole('button', { name: 'Run all tests' }).click()
await page.locator('#status').filter({ hasText: /Ran 2 tests/ }).waitFor({ timeout: 120000 })
console.log('\nshare   ', await page.locator('#status').textContent())
await page.getByRole('button', { name: 'Copy share link' }).click()
await page.waitForFunction(() => location.hash.length > 1)
const url = page.url()
const fresh = await (await browser.newContext()).newPage()
await fresh.goto(url)
console.log('share   ', `link ${url.length} chars -> language ${await fresh.locator('#lang').inputValue()}, ${await fresh.locator('#test-list > li').count()} tests`)

console.log('sw      ', await page.evaluate(async () => (await navigator.serviceWorker.ready).scope))
await context.setOffline(true)
await page.reload()
await page.getByRole('button', { name: 'Run all tests' }).click()
try {
  await page.locator('#status').filter({ hasText: /Ran 2 tests/ }).waitFor({ timeout: 120000 })
  console.log('offline ', await page.locator('#status').textContent())
} catch {
  console.log('offline  FAILED:', await page.locator('#status').textContent())
}
await browser.close()

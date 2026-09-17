// Throwaway: per-language cold (fresh profile, downloads the toolchain) and warm run times.
import { chromium } from '@playwright/test'

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
console.log('| Language | First run (cold, downloads toolchain) | Warm run |')
console.log('|---|---|---|')
for (const [lang, code] of Object.entries(PROGRAMS)) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.addInitScript((seed) => {
    localStorage.setItem('loopback:lang', JSON.stringify(seed.lang))
    localStorage.setItem(`loopback:code:${seed.lang}`, JSON.stringify(seed.code))
    localStorage.setItem('loopback:tests', JSON.stringify([{ input: '2 3\n', expected: '5\n' }]))
  }, { lang, code })
  await page.goto('http://127.0.0.1:5199/')
  const runOnce = async () => {
    const t = Date.now()
    await page.getByRole('button', { name: 'Run all tests' }).click()
    await page.locator('#status').filter({ hasText: /^Ran 1 test/ }).waitFor({ timeout: 300000 })
    const ms = Date.now() - t
    const ok = (await page.locator('.verdict').first().textContent()) === 'Accepted'
    return { ms, ok }
  }
  const cold = await runOnce()
  // Switching language and back clears the status line without cooling the toolchain down.
  await page.selectOption('#lang', lang === 'c' ? 'python' : 'c')
  await page.selectOption('#lang', lang)
  const warm = await runOnce()
  console.log(`| ${lang} | ${(cold.ms / 1000).toFixed(1)}s${cold.ok ? '' : ' (FAILED)'} | ${(warm.ms / 1000).toFixed(1)}s${warm.ok ? '' : ' (FAILED)'} |`)
  await context.close()
}
await browser.close()

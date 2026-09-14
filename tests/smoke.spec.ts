import { test, expect, type Page } from '@playwright/test'

type Lang = 'cpp' | 'java' | 'python'

// Reads "a b" and prints a+b, or spins forever when the first token is "loop".
const PROGRAMS: Record<Lang, { good: string; broken: string; brokenMessage: RegExp }> = {
  cpp: {
    good: `#include <bits/stdc++.h>
using namespace std;
int main() { string s; cin >> s; if (s == "loop") for (;;) {} long long b; cin >> b; cout << stoll(s) + b << "\\n"; }`,
    broken: 'int main() { return x; }',
    brokenMessage: /undeclared identifier 'x'/,
  },
  java: {
    good: `import java.util.*;
public class Main { public static void main(String[] args) { Scanner in = new Scanner(System.in); String s = in.next(); if (s.equals("loop")) while (true) {} System.out.println(Long.parseLong(s) + in.nextLong()); } }`,
    broken: 'public class Main { public static void main(String[] args) { return x; } }',
    brokenMessage: /Main\.java:1: error/,
  },
  python: {
    good: `a = input().split()
if a[0] == "loop":
    while True: pass
print(int(a[0]) + int(a[1]))`,
    broken: 'def f(:\n    pass',
    brokenMessage: /SyntaxError/,
  },
}

async function open(page: Page, lang: Lang, code: string, tests: { input: string; expected: string }[]) {
  await page.addInitScript((seed) => {
    if (location.port !== '5199' || location.hostname !== '127.0.0.1') return
    localStorage.setItem('loopback:lang', JSON.stringify(seed.lang))
    localStorage.setItem(`loopback:code:${seed.lang}`, JSON.stringify(seed.code))
    localStorage.setItem('loopback:tests', JSON.stringify(seed.tests))
  }, { lang, code, tests })
  await page.goto('/')
}

const verdict = (page: Page, i: number) => page.locator('#test-list > li').nth(i).locator('.verdict')

for (const lang of ['cpp', 'java', 'python'] as const) {
  test(`${lang}: accepted, wrong answer, time limit, then recovers`, async ({ page }) => {
    await open(page, lang, PROGRAMS[lang].good, [
      { input: '2 3\n', expected: '5\n' },
      { input: '40 2\n', expected: '41\n' },
      { input: 'loop\n', expected: '' },
      { input: '7 8\n', expected: '15\n' },
    ])
    await page.getByRole('button', { name: 'Run all tests' }).click()

    await expect(verdict(page, 0)).toHaveText('Accepted')
    await expect(verdict(page, 1)).toHaveText('Wrong answer')
    await expect(page.locator('#test-list > li').nth(1).locator('.diff')).toHaveText('Line 1: expected "41", got "42"')
    await expect(verdict(page, 2)).toHaveText('Time limit exceeded')
    await expect(verdict(page, 3)).toHaveText('Accepted')
    await expect(page.locator('#status')).toHaveText(/Ran 4 tests\. 2 of 3 accepted\./)
  })

  test(`${lang}: compile error is shown`, async ({ page }) => {
    await open(page, lang, PROGRAMS[lang].broken, [{ input: '1 1\n', expected: '2\n' }])
    await page.getByRole('button', { name: 'Run all tests' }).click()
    await expect(verdict(page, 0)).toHaveText('Compile error')
    await expect(page.locator('#compile-error')).toHaveText(PROGRAMS[lang].brokenMessage)
  })
}

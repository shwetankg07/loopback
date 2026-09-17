import { test, expect, type Page } from '@playwright/test'

type Lang = 'c' | 'cpp' | 'java' | 'python' | 'js' | 'ts' | 'go' | 'ruby' | 'php'

// Each program reads "a b" and prints a+b, or spins forever when the first token is "loop".
// Compiled languages report a broken program as a compile error; interpreters only fail once running.
const PROGRAMS: Record<Lang, { good: string; broken: string; brokenMessage: RegExp; brokenVerdict: 'Compile error' | 'Runtime error' }> = {
  c: {
    good: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int main(void) {
    char s[64];
    scanf("%63s", s);
    if (strcmp(s, "loop") == 0) for (;;) {}
    long long b;
    scanf("%lld", &b);
    printf("%lld\\n", atoll(s) + b);
    return 0;
}`,
    broken: 'int main(void) { return x; }',
    brokenMessage: /undeclared identifier 'x'/,
    brokenVerdict: 'Compile error',
  },
  cpp: {
    good: `#include <bits/stdc++.h>
using namespace std;
int main() { string s; cin >> s; if (s == "loop") for (;;) {} long long b; cin >> b; cout << stoll(s) + b << "\\n"; }`,
    broken: 'int main() { return x; }',
    brokenMessage: /undeclared identifier 'x'/,
    brokenVerdict: 'Compile error',
  },
  java: {
    good: `import java.util.*;
public class Main { public static void main(String[] args) { Scanner in = new Scanner(System.in); String s = in.next(); if (s.equals("loop")) while (true) {} System.out.println(Long.parseLong(s) + in.nextLong()); } }`,
    broken: 'public class Main { public static void main(String[] args) { return x; } }',
    brokenMessage: /Main\.java:1: error/,
    brokenVerdict: 'Compile error',
  },
  python: {
    good: `a = input().split()
if a[0] == "loop":
    while True: pass
print(int(a[0]) + int(a[1]))`,
    broken: 'def f(:\n    pass',
    brokenMessage: /SyntaxError/,
    brokenVerdict: 'Compile error',
  },
  js: {
    good: `const s = input();
if (s === "loop") { while (true) {} }
const [a, b] = s.split(" ").map(Number);
print(a + b);`,
    broken: 'function f( {',
    brokenMessage: /SyntaxError|Unexpected/,
    brokenVerdict: 'Compile error',
  },
  ts: {
    good: `const s: string = input()!;
if (s === "loop") { while (true) {} }
const [a, b]: number[] = s.split(" ").map(Number);
print(a + b);`,
    broken: 'const x: = 5;',
    brokenMessage: /Unexpected token/,
    brokenVerdict: 'Compile error',
  },
  go: {
    good: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	reader := bufio.NewReader(os.Stdin)
	var s string
	fmt.Fscan(reader, &s)
	if s == "loop" {
		for {
		}
	}
	var a, b int64
	fmt.Sscan(s, &a)
	fmt.Fscan(reader, &b)
	fmt.Println(a + b)
}`,
    broken: `package main

func main() { undefinedThing() }`,
    brokenMessage: /undefined/,
    brokenVerdict: 'Runtime error',
  },
  ruby: {
    good: `s = gets.split
loop { } if s[0] == "loop"
puts s.map(&:to_i).sum`,
    broken: 'def f(',
    brokenMessage: /SyntaxError|error/,
    brokenVerdict: 'Runtime error',
  },
  php: {
    good: `<?php
$line = trim(fgets(STDIN));
if ($line === "loop") { while (true) {} }
$p = array_map('intval', explode(' ', $line));
echo array_sum($p), "\\n";`,
    broken: '<?php echo ;',
    brokenMessage: /Parse error/,
    brokenVerdict: 'Runtime error',
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

for (const lang of Object.keys(PROGRAMS) as Lang[]) {
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

  test(`${lang}: a broken program reports ${PROGRAMS[lang].brokenVerdict}`, async ({ page }) => {
    await open(page, lang, PROGRAMS[lang].broken, [{ input: '1 1\n', expected: '2\n' }])
    await page.getByRole('button', { name: 'Run all tests' }).click()
    await expect(verdict(page, 0)).toHaveText(PROGRAMS[lang].brokenVerdict)
    // PHP's CGI build prints its errors to stdout, so that's where its message lands.
    const message = PROGRAMS[lang].brokenVerdict === 'Compile error'
      ? page.locator('#compile-error')
      : page.locator('#test-list > li').first().locator(lang === 'php' ? '.stdout' : '.stderr')
    await expect(message).toHaveText(PROGRAMS[lang].brokenMessage)
  })
}

test('java: every kind of stuck loop stops at the time limit, and System.exit works', async ({ page }) => {
    await open(page, 'java', `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        String s = in.next();
        if (s.equals("while")) while (true) {}
        if (s.equals("for")) for (;;);
        if (s.equals("do")) do {} while (true);
        if (s.equals("catch")) while (true) { try { while (true) {} } catch (Throwable t) {} }
        if (s.equals("exit")) { System.out.println("bye"); System.exit(0); }
        System.out.println(Long.parseLong(s) + in.nextLong());
    }
}`, [
      { input: 'while\n', expected: '' },
      { input: 'for\n', expected: '' },
      { input: 'do\n', expected: '' },
      { input: 'catch\n', expected: '' },
      { input: 'exit\n', expected: 'bye\n' },
      { input: '7 8\n', expected: '15\n' },
    ])
    await page.getByRole('button', { name: 'Run all tests' }).click()
    for (const i of [0, 1, 2, 3]) await expect(verdict(page, i)).toHaveText('Time limit exceeded')
    await expect(verdict(page, 4)).toHaveText('Accepted')
    await expect(verdict(page, 5)).toHaveText('Accepted')
  })

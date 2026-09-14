export type Verdict = 'AC' | 'WA' | 'TLE' | 'RE' | 'CE'

// Judges compare tokens-ish: ignore \r, trailing spaces on each line, and trailing blank lines.
export function normalize(s: string): string {
  return s.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').trimEnd()
}

export function sameOutput(expected: string, actual: string): boolean {
  return normalize(expected) === normalize(actual)
}

export type Shared = { lang: string; code: string; tests: { input: string; expected: string }[] }

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer())
}

export async function encodeShare(state: Shared): Promise<string> {
  return b64url(await pipe(new TextEncoder().encode(JSON.stringify(state)), new CompressionStream('deflate-raw')))
}

export async function decodeShare(hash: string): Promise<Shared | null> {
  try {
    return JSON.parse(new TextDecoder().decode(await pipe(unb64url(hash), new DecompressionStream('deflate-raw'))))
  } catch {
    return null
  }
}

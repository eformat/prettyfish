/**
 * HMAC-SHA256 utilities using the browser SubtleCrypto API.
 *
 * The clientSecret never leaves the browser — only its HMAC proof is ever
 * sent to the relay. The relay then signs every command it forwards with a
 * derived signature so the browser can reject commands from illegitimate callers.
 */

async function importKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Compute HMAC-SHA256(secret, message) → hex string */
export async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await importKey(secret)
  const enc = new TextEncoder()
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return bufToHex(sig)
}

/** Verify HMAC-SHA256(secret, message) === expectedHex (constant-time via SubtleCrypto) */
export async function hmacVerify(secret: string, message: string, expectedHex: string): Promise<boolean> {
  try {
    const key = await importKey(secret)
    const enc = new TextEncoder()
    const expected = new Uint8Array(expectedHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
    return crypto.subtle.verify('HMAC', key, expected, enc.encode(message))
  } catch {
    return false
  }
}

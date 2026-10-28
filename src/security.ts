/**
 * Input hardening. The game has no server, so the only untrusted inputs are what the browser hands back from storage
 * (localStorage / IndexedDB, which a user, an extension or another script on the same origin can edit) and files the
 * player uploads. Everything read from there is treated as data to be validated, never trusted: types are checked,
 * numbers are clamped, strings are length-limited and unknown keys are dropped.
 */
export const MAX_STORED_BYTES = 512 * 1024

/** Parses JSON from storage; returns null for anything that is missing, oversized, malformed or not a plain object. */
export function parseStored(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw || raw.length > MAX_STORED_BYTES) return null
  try {
    const v: unknown = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A finite number clamped to [lo, hi], or the fallback. */
export function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
}
export const int = (v: unknown, lo: number, hi: number, fallback: number) => Math.round(num(v, lo, hi, fallback))
export const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

/** A short plain string: control characters and angle brackets are removed, the length is capped. */
export function str(v: unknown, max: number, fallback = ''): string {
  if (typeof v !== 'string') return fallback
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, max)
}
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}
export function strArr(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (out.length >= maxItems) break
    if (typeof x === 'string' && x.length <= maxLen) out.push(str(x, maxLen))
  }
  return out
}
/** '' (keep the original colour) or a #rrggbb colour. */
export const hexColor = (v: unknown): string => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : '')
/** A {x, y?, z} position with finite, bounded numbers, or null. */
export function point(v: unknown, withY = true): { x: number; y: number; z: number } | null {
  if (!isObj(v)) return null
  const out = { x: num(v.x, -5000, 5000, NaN), y: withY ? num(v.y, -50, 500, 0) : 0, z: num(v.z, -5000, 5000, NaN) }
  return Number.isNaN(out.x) || Number.isNaN(out.z) ? null : out
}

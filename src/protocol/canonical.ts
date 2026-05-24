/**
 * Canonical JSON for signing: deterministic, lexicographically-sorted object keys,
 * no whitespace, UTF-8. Mirrors RFC 8785 (JCS) for the JSON types we use
 * (string / number / boolean / null / array / object). We disallow non-finite
 * numbers and undefined values, both of which JSON-stringify ambiguously.
 */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json | undefined };

export function canonicalize(value: Json): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`canonical JSON disallows non-finite number: ${value}`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = (value as Record<string, Json>)[k];
      if (v === undefined) continue;
      parts.push(`${JSON.stringify(k)}:${canonicalize(v)}`);
    }
    return `{${parts.join(',')}}`;
  }
  throw new TypeError(`unsupported value in canonical JSON: ${typeof value}`);
}

export function canonicalBytes(value: Json): Buffer {
  return Buffer.from(canonicalize(value), 'utf8');
}

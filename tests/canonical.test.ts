import { describe, expect, test } from 'vitest';
import { canonicalize } from '../src/protocol/canonical.js';

describe('canonical JSON', () => {
  test('object keys are sorted lexicographically', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ z: { y: 1, x: 2 }, a: 1 })).toBe('{"a":1,"z":{"x":2,"y":1}}');
  });

  test('arrays preserve order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  test('strings escape per JSON', () => {
    expect(canonicalize('a"b')).toBe('"a\\"b"');
    expect(canonicalize('a\nb')).toBe('"a\\nb"');
  });

  test('null/boolean/number primitives', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
    expect(canonicalize(0)).toBe('0');
    expect(canonicalize(-1.5)).toBe('-1.5');
  });

  test('throws on non-finite', () => {
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => canonicalize(Number.NaN)).toThrow();
  });

  test('undefined values in objects are omitted', () => {
    expect(canonicalize({ a: 1, b: undefined as unknown as null })).toBe('{"a":1}');
  });

  test('deterministic across re-orderings', () => {
    const a = canonicalize({ x: 1, y: { c: 2, a: 3, b: [4, 5] } });
    const b = canonicalize({ y: { b: [4, 5], a: 3, c: 2 }, x: 1 });
    expect(a).toBe(b);
  });
});

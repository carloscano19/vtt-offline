import { describe, it, expect } from 'vitest';
import { parseColor, colorToHex, rgbComponents } from '../src/utils/color';

describe('color utils - parseColor', () => {
  it('parses Dungeondraft 8-digit ARGB hex without # ("ffeccd8b")', () => {
    const result = parseColor('ffeccd8b');
    expect(result.rgb).toBe(0xeccd8b);
    expect(result.alpha).toBeCloseTo(1.0);
    expect(colorToHex(result.rgb)).toBe('#eccd8b');
  });

  it('parses 8-digit ARGB hex with # ("#80eccd8b") and calculates alpha correctly', () => {
    const result = parseColor('#80eccd8b');
    expect(result.rgb).toBe(0xeccd8b);
    expect(result.alpha).toBeCloseTo(128 / 255, 3);
    expect(colorToHex(result.rgb)).toBe('#eccd8b');
  });

  it('parses 6-digit hex with and without #', () => {
    const r1 = parseColor('#ffaa44');
    expect(r1.rgb).toBe(0xffaa44);
    expect(r1.alpha).toBe(1.0);

    const r2 = parseColor('ffaa44');
    expect(r2.rgb).toBe(0xffaa44);
    expect(r2.alpha).toBe(1.0);
  });

  it('parses 3-digit hex ("#f0a")', () => {
    const result = parseColor('#f0a');
    expect(result.rgb).toBe(0xff00aa);
    expect(result.alpha).toBe(1.0);
    expect(colorToHex(result.rgb)).toBe('#ff00aa');
  });

  it('parses number inputs in RGB range (0x000000 - 0xFFFFFF)', () => {
    const result = parseColor(0x38bdf8);
    expect(result.rgb).toBe(0x38bdf8);
    expect(result.alpha).toBe(1.0);
  });

  it('parses number inputs in 32-bit ARGB range (e.g. 4293709195 = 0xffeccd8b)', () => {
    const result = parseColor(4293709195);
    expect(result.rgb).toBe(0xeccd8b);
    expect(result.alpha).toBeCloseTo(1.0);
  });

  it('handles invalid strings, undefined and null without throwing', () => {
    const fallback = parseColor(null, 0xffaa44);
    expect(fallback.rgb).toBe(0xffaa44);
    expect(fallback.alpha).toBe(1.0);

    const undef = parseColor(undefined, 0x123456);
    expect(undef.rgb).toBe(0x123456);

    const invalid = parseColor('not-a-color', 0xff0000);
    expect(invalid.rgb).toBe(0xff0000);
    expect(invalid.alpha).toBe(1.0);
  });

  it('rgbComponents decomposes properly', () => {
    const comp = rgbComponents(0xeccd8b);
    expect(comp.r).toBe(0xec);
    expect(comp.g).toBe(0xcd);
    expect(comp.b).toBe(0x8b);
  });
});

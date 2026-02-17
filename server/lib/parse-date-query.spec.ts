import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseDateQuery } from './parse-date-query';

describe('parseDateQuery', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns today when value is undefined', () => {
    const fixed = new Date('2025-06-15T14:30:00');
    vi.useFakeTimers({ now: fixed.getTime() });
    const result = parseDateQuery(undefined);
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(5);
    expect(result!.getDate()).toBe(15);
    expect(result!.getHours()).toBe(0);
    expect(result!.getMinutes()).toBe(0);
  });

  it('returns today when value is empty string', () => {
    const fixed = new Date('2025-03-01T09:00:00');
    vi.useFakeTimers({ now: fixed.getTime() });
    const result = parseDateQuery('');
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(2);
    expect(result!.getDate()).toBe(1);
  });

  it('returns today when value is array with empty first element', () => {
    vi.useFakeTimers({ now: new Date('2025-01-10T12:00:00').getTime() });
    const result = parseDateQuery(['']);
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(10);
  });

  it('parses valid YYYY-MM-DD and returns start-of-day', () => {
    const result = parseDateQuery('2025-02-15');
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(1);
    expect(result!.getDate()).toBe(15);
    expect(result!.getHours()).toBe(0);
    expect(result!.getMinutes()).toBe(0);
  });

  it('accepts date as first element of array', () => {
    const result = parseDateQuery(['2025-12-31']);
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(11);
    expect(result!.getDate()).toBe(31);
  });

  it('returns null for non-YYYY-MM-DD format', () => {
    expect(parseDateQuery('15/02/2025')).toBeNull();
    expect(parseDateQuery('2025-2-15')).toBeNull();
    expect(parseDateQuery('not-a-date')).toBeNull();
    expect(parseDateQuery('20250215')).toBeNull();
  });

  it('returns null for invalid calendar date (Feb 31)', () => {
    expect(parseDateQuery('2025-02-31')).toBeNull();
  });

  it('returns null for invalid calendar date (month 13)', () => {
    expect(parseDateQuery('2025-13-01')).toBeNull();
  });

  it('returns null for invalid calendar date (day 0)', () => {
    expect(parseDateQuery('2025-06-00')).toBeNull();
  });

  it('returns null for invalid calendar date (Nov 31)', () => {
    expect(parseDateQuery('2025-11-31')).toBeNull();
  });

  it('accepts leap year Feb 29', () => {
    const result = parseDateQuery('2024-02-29');
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2024);
    expect(result!.getMonth()).toBe(1);
    expect(result!.getDate()).toBe(29);
  });

  it('returns null for Feb 29 in non-leap year', () => {
    expect(parseDateQuery('2025-02-29')).toBeNull();
  });
});

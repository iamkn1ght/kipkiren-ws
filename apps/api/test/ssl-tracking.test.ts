/**
 * SSL certificate state classification (KWS-S6-003) - pure-function tests.
 */

import { describe, expect, it } from 'vitest';
import { classifySslState, daysUntil, hostnameFromDomain } from '../src/services/ssl.js';

const NOW = new Date('2026-06-23T00:00:00.000Z');
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 24 * 3600_000);

describe('classifySslState', () => {
  it('unknown when expiry is null or unparseable', () => {
    expect(classifySslState(null, NOW)).toBe('unknown');
    expect(classifySslState(new Date('not-a-date'), NOW)).toBe('unknown');
  });

  it('expired when expiry is in the past', () => {
    expect(classifySslState(daysFromNow(-1), NOW)).toBe('expired');
  });

  it('expiring inside the 30-day window', () => {
    expect(classifySslState(daysFromNow(10), NOW)).toBe('expiring');
    expect(classifySslState(daysFromNow(30), NOW)).toBe('expiring');
  });

  it('valid beyond the window', () => {
    expect(classifySslState(daysFromNow(31), NOW)).toBe('valid');
    expect(classifySslState(daysFromNow(120), NOW)).toBe('valid');
  });

  it('honours a custom expiring window', () => {
    expect(classifySslState(daysFromNow(10), NOW, 7)).toBe('valid');
    expect(classifySslState(daysFromNow(5), NOW, 7)).toBe('expiring');
  });
});

describe('daysUntil', () => {
  it('floors to whole days and goes negative when past', () => {
    expect(daysUntil(daysFromNow(5), NOW)).toBe(5);
    expect(daysUntil(daysFromNow(-2), NOW)).toBe(-2);
  });
});

describe('hostnameFromDomain', () => {
  it('strips protocol, path and port', () => {
    expect(hostnameFromDomain('https://acme.co.ke/path')).toBe('acme.co.ke');
    expect(hostnameFromDomain('acme.co.ke:8443')).toBe('acme.co.ke');
    expect(hostnameFromDomain('  http://acme.co.ke  ')).toBe('acme.co.ke');
  });
});

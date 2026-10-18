import { describe, expect, it } from 'vitest';
import { interestEmail, mailtoUrl, readInterest, toRecord, validateInterest, type Interest } from './interest';

const base: Interest = {
  name: 'Ada Lovelace',
  email: 'ada@stadt-bochum.de',
  city: 'Bochum',
  organisation: '',
  role: 'City administration',
  message: '',
};

describe('interest form', () => {
  it('requires name, a valid email and a city', () => {
    expect(validateInterest(base)).toEqual({});
    const e = validateInterest({ ...base, name: '', email: 'ada@', city: '' });
    expect(Object.keys(e).sort()).toEqual(['city', 'email', 'name']);
  });

  it('trims fields and drops an unknown role', () => {
    const fd = new FormData();
    fd.set('name', '  Ada ');
    fd.set('role', 'Hacker');
    const i = readInterest(fd);
    expect(i.name).toBe('Ada');
    expect(i.role).toBe('');
    expect(i.city).toBe('');
  });

  it('fills subject and body, skipping empty fields', () => {
    const r = toRecord({ ...base, message: 'We plan 40 sites.' }, 'https://example.org/', new Date('2026-10-18T10:00:00Z'));
    const { subject, body } = interestEmail(r);
    expect(subject).toBe('Bring ElectriCity to Bochum');
    expect(body).toContain('Role: City administration');
    expect(body).not.toContain('Organisation');
    expect(body).toContain('We plan 40 sites.');
    expect(body).toContain('2026-10-18');
  });

  it('encodes the mailto link so mail apps read it back exactly', () => {
    const r = toRecord({ ...base, city: 'Castrop-Rauxel & Herne' }, 'x');
    const url = mailtoUrl(r, 'a@b.de');
    expect(url.startsWith('mailto:a@b.de?subject=')).toBe(true);
    const subject = decodeURIComponent(url.split('subject=')[1].split('&body=')[0]);
    expect(subject).toBe('Bring ElectriCity to Castrop-Rauxel & Herne');
    expect(url).not.toContain('+');
  });
});

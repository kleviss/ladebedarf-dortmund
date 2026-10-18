// "Bring ElectriCity to your city": the data a city or utility sends us, and how it is sent.
// For now a submission opens the visitor's email app with everything filled in. Once a backend
// exists, set VITE_INTEREST_ENDPOINT (for example /api/interest) and the same payload is POSTed
// there as JSON instead; the form and its validation stay as they are.

export const INTEREST_EMAIL = 'klevissxh@gmail.com';

export const ROLES = ['City administration', 'Utility or energy provider', 'Planning office', 'Other'] as const;
export type Role = (typeof ROLES)[number];

export interface Interest {
  name: string;
  email: string;
  city: string;
  organisation: string;
  role: Role | '';
  message: string;
}

/** What a backend would store: the form plus where and when it was sent. */
export interface InterestRecord extends Interest {
  submittedAt: string;
  page: string;
}

export type InterestErrors = Partial<Record<keyof Interest, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readInterest(data: FormData): Interest {
  const get = (k: keyof Interest) => String(data.get(k) ?? '').trim();
  const role = get('role');
  return {
    name: get('name'),
    email: get('email'),
    city: get('city'),
    organisation: get('organisation'),
    role: (ROLES as readonly string[]).includes(role) ? (role as Role) : '',
    message: get('message'),
  };
}

export function validateInterest(i: Interest): InterestErrors {
  const errors: InterestErrors = {};
  if (!i.name) errors.name = 'Enter your name.';
  if (!i.email) errors.email = 'Enter your email address.';
  else if (!EMAIL.test(i.email)) errors.email = 'Enter an email address like name@city.de.';
  if (!i.city) errors.city = 'Enter the city or municipality.';
  if (i.message.length > 2000) errors.message = 'Keep the message under 2,000 characters.';
  return errors;
}

export function toRecord(i: Interest, page: string, now = new Date()): InterestRecord {
  return { ...i, submittedAt: now.toISOString(), page };
}

export function interestEmail(r: InterestRecord): { subject: string; body: string } {
  const rows: [string, string][] = [
    ['Name', r.name],
    ['Email', r.email],
    ['City or municipality', r.city],
    ['Organisation', r.organisation],
    ['Role', r.role],
  ];
  const lines = rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (r.message) lines.push('', r.message);
  lines.push('', `Sent from ${r.page} on ${r.submittedAt.slice(0, 10)}`);
  return { subject: `Bring ElectriCity to ${r.city}`, body: lines.join('\n') };
}

export function mailtoUrl(r: InterestRecord, to = INTEREST_EMAIL): string {
  const { subject, body } = interestEmail(r);
  // encodeURIComponent, not URLSearchParams: mail apps read '+' literally
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export type SubmitResult = { via: 'email'; href: string } | { via: 'endpoint' };

/** Sends the record to the configured endpoint, or hands it to the email app. */
export async function submitInterest(
  r: InterestRecord,
  endpoint: string | undefined = import.meta.env.VITE_INTEREST_ENDPOINT,
): Promise<SubmitResult> {
  if (endpoint) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
    });
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    return { via: 'endpoint' };
  }
  const href = mailtoUrl(r);
  window.location.href = href;
  return { via: 'email', href };
}

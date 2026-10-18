// Wires the "Bring ElectriCity to your city" dialog: any [data-interest] button opens it,
// the form is checked here (with the messages from interest.ts) and handed to submitInterest.

import { INTEREST_EMAIL, readInterest, submitInterest, toRecord, validateInterest, type Interest } from './interest';

export function setupInterestForm() {
  const dialog = document.querySelector<HTMLDialogElement>('#interest');
  const form = dialog?.querySelector<HTMLFormElement>('form');
  if (!dialog || !form || typeof dialog.showModal !== 'function') return;
  const sent = dialog.querySelector<HTMLElement>('.interest-sent')!;
  const sentText = sent.querySelector<HTMLElement>('p')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const formError = form.querySelector<HTMLElement>('.interest-error')!;

  const showForm = () => {
    form.hidden = false;
    sent.hidden = true;
    formError.textContent = '';
  };

  document.querySelectorAll<HTMLElement>('[data-interest]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      showForm();
      dialog.showModal();
      form.querySelector<HTMLInputElement>('input')?.focus();
    }),
  );
  dialog.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
  // a click on the backdrop closes it; clicks inside the panel land on its children
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  const setError = (name: keyof Interest, msg?: string) => {
    const field = form.elements.namedItem(name) as HTMLInputElement | null;
    const out = form.querySelector<HTMLElement>(`#interest-${name}-error`);
    if (!field || !out) return;
    out.textContent = msg ?? '';
    field.toggleAttribute('aria-invalid', Boolean(msg));
  };

  form.addEventListener('input', (e) => {
    const name = (e.target as HTMLInputElement).name as keyof Interest;
    if ((e.target as HTMLElement).hasAttribute('aria-invalid')) setError(name, validateInterest(readInterest(new FormData(form)))[name]);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const interest = readInterest(new FormData(form));
    const errors = validateInterest(interest);
    (['name', 'email', 'city', 'message'] as const).forEach((k) => setError(k, errors[k]));
    const first = Object.keys(errors)[0] as keyof Interest | undefined;
    if (first) {
      (form.elements.namedItem(first) as HTMLElement).focus();
      return;
    }
    submit.disabled = true;
    formError.textContent = '';
    try {
      const result = await submitInterest(toRecord(interest, location.origin + location.pathname));
      sentText.innerHTML =
        result.via === 'email'
          ? `Your email app should now open with the details filled in. Press send there and we will get back to you. If nothing opened, write to <a href="${result.href}">${INTEREST_EMAIL}</a>.`
          : 'Thanks, we have your details and will get back to you.';
      form.reset();
      form.hidden = true;
      sent.hidden = false;
      sent.querySelector<HTMLButtonElement>('button')?.focus();
    } catch (err) {
      formError.textContent = `That didn't go through. ${(err as Error).message} Try again, or write to ${INTEREST_EMAIL}.`;
    } finally {
      submit.disabled = false;
    }
  });
}

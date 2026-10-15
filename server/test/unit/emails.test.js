import { describe, it, expect } from 'vitest';
import { renderEmail, TEMPLATE_NAMES, LANGUAGES, cleanSubject } from '../../src/emails/index.js';
import { formatterFor, escapeHtml, safeUrl } from '../../src/emails/format.js';
import { SAMPLES, rent, elec } from '../helpers/emailSamples.js';

describe('email templates (B11, R48)', () => {
  it('has exactly the 8 templates from the spec', () => {
    expect([...TEMPLATE_NAMES].sort()).toEqual([
      'admin-payment-notice', 'announcement', 'invite', 'password-reset', 'payment-received', 'payment-rejected',
      'refund-recorded', 'reminder',
    ]);
  });

  for (const template of Object.keys(SAMPLES)) {
    for (const lang of LANGUAGES) {
      it(`${template}.${lang} renders (snapshot) and its subject contains "iRent"`, () => {
        const out = renderEmail(template, lang, SAMPLES[template], { logoUrl: 'http://localhost:5173/logo.png' });
        expect(out.subject).toContain('iRent');
        expect(out.html).toContain(`<html lang="${lang}">`);
        expect(out.html).toContain('http://localhost:5173/logo.png');
        expect(out.text.length).toBeGreaterThan(20);
        expect({ subject: out.subject, text: out.text }).toMatchSnapshot();
      });
    }
  }

  it('money and dates use en-PH / fil-PH in Asia/Manila', () => {
    const en = renderEmail('reminder', 'en', SAMPLES.reminder);
    expect(en.text).toContain('₱4,500.00');
    expect(en.text).toContain('February 28, 2027');
    expect(en.text).toContain('October 2026 rent');
    const fil = renderEmail('reminder', 'fil', SAMPLES.reminder);
    expect(fil.text).toContain('₱4,500.00');
    expect(fil.text).toMatch(/Pebrero 28, 2027/);
    expect(fil.text).toContain('upa para sa Oktubre 2026');
  });

  it('the admin notice subject is flagged when the payment includes credit', () => {
    expect(renderEmail('admin-payment-notice', 'en', SAMPLES['admin-payment-notice']).subject).toContain('(includes ₱500.00 credit)');
    const noCredit = renderEmail('admin-payment-notice', 'en', { ...SAMPLES['admin-payment-notice'], credit_added: 0 });
    expect(noCredit.subject).not.toContain('includes');
  });

  it('payment-received lists credit added, the new balance and credit applied to other items', () => {
    const { text } = renderEmail('payment-received', 'en', SAMPLES['payment-received']);
    expect(text).toContain('Added to your credit: ₱500.00');
    expect(text).toContain('Credit balance now: ₱0.00');
    expect(text).toContain('₱500.00 of credit was used for October 2026 electricity bill.');
  });

  it('payment-rejected lists the reason, the credit removed and the reopened items; a negative balance is "owe"', () => {
    const { text } = renderEmail('payment-rejected', 'en', { ...SAMPLES['payment-rejected'], credit_balance: -200 });
    expect(text).toContain('> The screenshot does not match');
    expect(text).toContain('Credit removed: ₱500.00');
    expect(text).toContain('October 2026 electricity bill: ₱500.00 to pay again');
    expect(text).toContain('you owe ₱200.00');
  });

  it('reminder wording follows the reminder type', () => {
    const overdue = renderEmail('reminder', 'en', { ...SAMPLES.reminder, reminder_type: 'overdue_7' });
    expect(overdue.subject).toMatch(/^Overdue:/);
    expect(overdue.text).toContain('7 days overdue');
  });

  it('user-provided text is HTML-escaped (<script> never reaches the HTML)', () => {
    const evil = '<script>alert("x")</script> & <img src=x onerror=alert(1)>';
    const outs = [
      renderEmail('payment-rejected', 'en', { ...SAMPLES['payment-rejected'], reason: evil, name: evil }),
      renderEmail('announcement', 'fil', { ...SAMPLES.announcement, title: evil, body: evil }),
      renderEmail('admin-payment-notice', 'en', { ...SAMPLES['admin-payment-notice'], renter_name: evil, reference_no: evil }),
      renderEmail('refund-recorded', 'en', { ...SAMPLES['refund-recorded'], note: evil }),
    ];
    for (const { html } of outs) {
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;img');
    }
  });

  it('only http(s) links become buttons', () => {
    const js = renderEmail('invite', 'en', { name: 'X', link: 'javascript:alert(1)' });
    expect(js.html).not.toContain('javascript:');
    const quoteBreak = renderEmail('invite', 'en', { name: 'X', link: 'https://a.test/?q="><script>' });
    expect(quoteBreak.html).not.toContain('"><script>');
    expect(safeUrl('data:text/html,hi')).toBeUndefined();
    expect(safeUrl('not a url')).toBeUndefined();
  });

  it('multi-line bodies keep their line breaks, escaped', () => {
    const { html } = renderEmail('announcement', 'en', SAMPLES.announcement);
    expect(html).toContain('No water tomorrow<br>9:00 to 12:00.');
  });

  it('subjects are one clean line (no header injection)', () => {
    expect(cleanSubject('Hi\r\nBcc: x@y.z — iRent')).toBe('Hi Bcc: x@y.z — iRent');
    const s = renderEmail('announcement', 'en', { ...SAMPLES.announcement, title: 'A\nB' }).subject;
    expect(s).toBe('Urgent: A B — iRent');
  });

  it('falls back to English for an unknown language and rejects unknown templates', () => {
    expect(renderEmail('invite', 'xx', SAMPLES.invite).html).toContain('<html lang="en">');
    expect(() => renderEmail('nope', 'en', {})).toThrow(/Unknown email template/);
  });

  it('formatter helpers', () => {
    const f = formatterFor('en');
    expect(f.money(333.34)).toBe('₱333.34');
    expect(f.money(1000000)).toBe('₱1,000,000.00');
    expect(f.method('bpi')).toBe('BPI');
    expect(f.item(elec)).toBe('October 2026 electricity bill');
    expect(formatterFor('fil').item({ ...elec, bill_type: 'water' })).toBe('bayarin sa tubig para sa Oktubre 2026');
    // A timestamp late on Oct 31 UTC is Nov 1 in Manila.
    expect(f.date('2026-10-31T17:00:00Z')).toBe('November 1, 2026');
    expect(escapeHtml(`'"&<>`)).toBe('&#39;&quot;&amp;&lt;&gt;');
  });
});

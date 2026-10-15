/** payment-received (EN) — R22, R37 (OQ-8 = A), R52.
 *  data: { name, amount, item, method, reference_no?, remaining, item_status,
 *          credit_added, credit_applied: [{ item, amount }], credit_balance } */
export default (d, f) => {
  const rows = [
    ['Amount', f.money(d.amount)],
    ['For', f.item(d.item)],
    ['Method', f.method(d.method)],
  ];
  if (d.reference_no) rows.push(['Reference no.', d.reference_no]);
  rows.push(['Remaining balance', f.money(d.remaining)]);
  if (Number(d.credit_added) > 0) {
    rows.push(['Added to your credit', f.money(d.credit_added)]);
    rows.push(['Credit balance now', f.money(d.credit_balance)]);
  }
  const applied = (d.credit_applied || []).map((a) => `${f.money(a.amount)} of credit was used for ${f.item(a.item)}.`);
  return {
    subject: `Payment received: ${f.item(d.item)} — iRent`,
    heading: 'Payment received',
    blocks: [
      {
        p: `Hi ${d.name}, thank you! We received your payment of ${f.money(d.amount)} for ${f.item(d.item)}. ` +
          `It is now ${d.item_status === 'paid' ? 'paid' : 'partially paid'}.`,
      },
      { rows },
      applied.length ? { list: applied } : null,
      { note: 'The owner will still check your payment. If there is a problem, we will email you.' },
    ],
  };
};

/** refund-recorded (EN) — R57.
 *  data: { name, amount, method, reference_no?, refunded_at, credit_balance, note? } */
export default (d, f) => {
  const rows = [
    ['Amount', f.money(d.amount)],
    ['Method', f.method(d.method)],
    ['Date', f.date(d.refunded_at)],
  ];
  if (d.reference_no) rows.push(['Reference no.', d.reference_no]);
  rows.push(['Credit balance now', f.money(d.credit_balance)]);
  return {
    subject: `Refund recorded: ${f.money(d.amount)} — iRent`,
    heading: 'Refund recorded',
    blocks: [
      { p: `Hi ${d.name}, the owner recorded a refund of ${f.money(d.amount)} from your credit.` },
      { rows },
      d.note ? { quote: d.note } : null,
    ],
  };
};

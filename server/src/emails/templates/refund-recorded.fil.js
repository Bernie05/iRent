/** refund-recorded (FIL) — R57. Same data as the EN template.
 *  FIL copy is a developer draft, pending Bernie's review (OQ-15). */
export default (d, f) => {
  const rows = [
    ['Halaga', f.money(d.amount)],
    ['Paraan', f.method(d.method)],
    ['Petsa', f.date(d.refunded_at)],
  ];
  if (d.reference_no) rows.push(['Reference no.', d.reference_no]);
  rows.push(['Credit balance ngayon', f.money(d.credit_balance)]);
  return {
    subject: `Naitala ang refund: ${f.money(d.amount)} — iRent`,
    heading: 'Naitala ang refund',
    blocks: [
      { p: `Hi ${d.name}, nagtala ang may-ari ng refund na ${f.money(d.amount)} mula sa iyong credit.` },
      { rows },
      d.note ? { quote: d.note } : null,
    ],
  };
};

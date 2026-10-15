/** admin-payment-notice (FIL) — R22. Same data as the EN template.
 *  FIL copy is a developer draft, pending Bernie's review (OQ-15). */
export default (d, f) => {
  const credit = Number(d.credit_added) > 0 ? ` (kasama ang ${f.money(d.credit_added)} na credit)` : '';
  const rows = [
    ['Renter', d.renter_name],
    ['Para sa', f.item(d.item)],
    ['Halaga', f.money(d.amount)],
    ['Paraan', f.method(d.method)],
  ];
  if (d.reference_no) rows.push(['Reference no.', d.reference_no]);
  if (Number(d.credit_added) > 0) rows.push(['Sobrang napunta sa credit', f.money(d.credit_added)]);
  return {
    subject: `Bagong bayad mula kay ${d.renter_name}: ${f.money(d.amount)}${credit} — iRent`,
    heading: 'Bagong bayad na susuriin',
    blocks: [
      { p: `Nag-upload si ${d.renter_name} ng bayad. Awtomatiko itong minarkahang natanggap; pakisuri ang screenshot.` },
      { rows },
      d.review_url ? { button: { label: 'Buksan ang mga bayad na susuriin', url: d.review_url } } : null,
    ],
  };
};

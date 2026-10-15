/** admin-payment-notice (EN) — R22.
 *  data: { renter_name, item, amount, method, reference_no?, credit_added, review_url? }
 *  The subject gets "(includes ₱X credit)" when part of the payment became credit. */
export default (d, f) => {
  const credit = Number(d.credit_added) > 0 ? ` (includes ${f.money(d.credit_added)} credit)` : '';
  const rows = [
    ['Renter', d.renter_name],
    ['For', f.item(d.item)],
    ['Amount', f.money(d.amount)],
    ['Method', f.method(d.method)],
  ];
  if (d.reference_no) rows.push(['Reference no.', d.reference_no]);
  if (Number(d.credit_added) > 0) rows.push(['Excess to credit', f.money(d.credit_added)]);
  return {
    subject: `New payment from ${d.renter_name}: ${f.money(d.amount)}${credit} — iRent`,
    heading: 'New payment to review',
    blocks: [
      { p: `${d.renter_name} uploaded a payment. It was marked received automatically; please check the screenshot.` },
      { rows },
      d.review_url ? { button: { label: 'Open Payments to review', url: d.review_url } } : null,
    ],
  };
};

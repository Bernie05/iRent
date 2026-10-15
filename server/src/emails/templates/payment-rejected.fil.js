/** payment-rejected (FIL) — R38, BR-11. Same data as the EN template.
 *  FIL copy is a developer draft, pending Bernie's review (OQ-15). */
export default (d, f) => {
  const rows = [
    ['Halaga', f.money(d.amount)],
    ['Para sa', f.item(d.item)],
    ['Paraan', f.method(d.method)],
  ];
  if (d.reference_no) rows.push(['Reference no.', d.reference_no]);
  if (Number(d.credit_reversed) > 0) rows.push(['Tinanggal na credit', f.money(d.credit_reversed)]);
  const reopened = (d.items_reopened || []).map((r) => `${f.item(r.item)}: ${f.money(r.remaining)} ang babayaran muli`);
  const owes = Number(d.credit_balance) < 0;
  return {
    subject: `Hindi tinanggap ang bayad: ${f.item(d.item)} — iRent`,
    heading: 'Hindi tinanggap ang iyong bayad',
    blocks: [
      { p: `Hi ${d.name}, sinuri ng may-ari ang iyong bayad na ${f.money(d.amount)} at hindi ito matanggap. Ang dahilan:` },
      { quote: d.reason },
      { rows },
      reopened.length ? { p: 'Bukas muli ang mga ito:' } : null,
      reopened.length ? { list: reopened } : null,
      owes ? { p: `Negatibo na ang iyong credit balance: may utang kang ${f.money(Math.abs(Number(d.credit_balance)))}.` } : null,
      { note: 'Kung sa tingin mo ay may mali, makipag-ugnayan sa may-ari.' },
    ],
  };
};

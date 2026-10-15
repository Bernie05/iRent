/** payment-received (FIL) — R22, R37, R52. Same data as the EN template.
 *  FIL copy is a developer draft, pending Bernie's review (OQ-15). */
export default (d, f) => {
  const rows = [
    ['Halaga', f.money(d.amount)],
    ['Para sa', f.item(d.item)],
    ['Paraan', f.method(d.method)],
  ];
  if (d.reference_no) rows.push(['Reference no.', d.reference_no]);
  rows.push(['Natitirang balanse', f.money(d.remaining)]);
  if (Number(d.credit_added) > 0) {
    rows.push(['Idinagdag sa iyong credit', f.money(d.credit_added)]);
    rows.push(['Credit balance ngayon', f.money(d.credit_balance)]);
  }
  const applied = (d.credit_applied || []).map(
    (a) => `${f.money(a.amount)} ng credit ang ginamit para sa ${f.item(a.item)}.`,
  );
  return {
    subject: `Natanggap ang bayad: ${f.item(d.item)} — iRent`,
    heading: 'Natanggap ang bayad',
    blocks: [
      {
        p: `Hi ${d.name}, salamat! Natanggap namin ang iyong bayad na ${f.money(d.amount)} para sa ${f.item(d.item)}. ` +
          `Ito ay ${d.item_status === 'paid' ? 'bayad na' : 'bahagyang bayad pa lang'} ngayon.`,
      },
      { rows },
      applied.length ? { list: applied } : null,
      { note: 'Susuriin pa rin ng may-ari ang iyong bayad. Kung may problema, mag-e-email kami sa iyo.' },
    ],
  };
};

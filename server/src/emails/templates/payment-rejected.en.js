/** payment-rejected (EN) — R38, BR-11.
 *  data: { name, amount, item, method, reference_no?, reason, credit_reversed,
 *          items_reopened: [{ item, remaining }], credit_balance } */
export default (d, f) => {
  const rows = [
    ['Amount', f.money(d.amount)],
    ['For', f.item(d.item)],
    ['Method', f.method(d.method)],
  ];
  if (d.reference_no) rows.push(['Reference no.', d.reference_no]);
  if (Number(d.credit_reversed) > 0) rows.push(['Credit removed', f.money(d.credit_reversed)]);
  const reopened = (d.items_reopened || []).map((r) => `${f.item(r.item)}: ${f.money(r.remaining)} to pay again`);
  const owes = Number(d.credit_balance) < 0;
  return {
    subject: `Payment not accepted: ${f.item(d.item)} — iRent`,
    heading: 'Your payment was not accepted',
    blocks: [
      { p: `Hi ${d.name}, the owner checked your payment of ${f.money(d.amount)} and could not accept it. The reason given:` },
      { quote: d.reason },
      { rows },
      reopened.length ? { p: 'These items are open again:' } : null,
      reopened.length ? { list: reopened } : null,
      owes ? { p: `Your credit balance is now negative: you owe ${f.money(Math.abs(Number(d.credit_balance)))}.` } : null,
      { note: 'If you think this is a mistake, please contact the owner.' },
    ],
  };
};

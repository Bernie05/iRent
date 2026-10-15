/** reminder (FIL) — R43. Same data as the EN template.
 *  FIL copy is a developer draft, pending Bernie's review (OQ-15). */
const LEAD = {
  due_minus_3: (i, date) => `ang iyong ${i} ay dapat bayaran sa loob ng 3 araw, sa ${date}.`,
  due_today: (i) => `ang iyong ${i} ay dapat bayaran ngayong araw.`,
  overdue_1: (i, date) => `ang iyong ${i} ay dapat nabayaran noong ${date} at 1 araw na itong lampas.`,
  overdue_3: (i, date) => `ang iyong ${i} ay dapat nabayaran noong ${date} at 3 araw na itong lampas.`,
  overdue_7: (i, date) => `ang iyong ${i} ay dapat nabayaran noong ${date} at 7 araw na itong lampas.`,
};

export default (d, f) => {
  const item = f.item(d.item);
  const date = f.date(d.due_date);
  const overdue = String(d.reminder_type).startsWith('overdue');
  return {
    subject: overdue ? `Lampas na sa takdang araw: ${item} — iRent` : `Paalala: ${item}, takdang araw ${date} — iRent`,
    heading: overdue ? 'Lampas na sa takdang araw' : 'Paalala sa bayad',
    blocks: [
      { p: `Hi ${d.name}, ${(LEAD[d.reminder_type] ?? LEAD.due_today)(item, date)}` },
      { rows: [['Para sa', item], ['Halagang babayaran', f.money(d.remaining)], ['Takdang araw', date]] },
      d.pay_url ? { button: { label: 'Magbayad ngayon', url: d.pay_url } } : null,
      { note: 'Kung nakapagbayad ka na, balewalain lang ang paalalang ito.' },
    ],
  };
};

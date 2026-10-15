/** reminder (EN) — R43. data: { name, item, remaining, due_date, reminder_type, pay_url? } */
const LEAD = {
  due_minus_3: (i, date) => `your ${i} is due in 3 days, on ${date}.`,
  due_today: (i) => `your ${i} is due today.`,
  overdue_1: (i, date) => `your ${i} was due on ${date} and is now 1 day overdue.`,
  overdue_3: (i, date) => `your ${i} was due on ${date} and is now 3 days overdue.`,
  overdue_7: (i, date) => `your ${i} was due on ${date} and is now 7 days overdue.`,
};

export default (d, f) => {
  const item = f.item(d.item);
  const date = f.date(d.due_date);
  const overdue = String(d.reminder_type).startsWith('overdue');
  return {
    subject: overdue ? `Overdue: ${item} — iRent` : `Reminder: ${item} due ${date} — iRent`,
    heading: overdue ? 'Payment overdue' : 'Payment reminder',
    blocks: [
      { p: `Hi ${d.name}, ${(LEAD[d.reminder_type] ?? LEAD.due_today)(item, date)}` },
      { rows: [['For', item], ['Amount to pay', f.money(d.remaining)], ['Due date', date]] },
      d.pay_url ? { button: { label: 'Pay now', url: d.pay_url } } : null,
      { note: 'If you already paid, you can ignore this reminder.' },
    ],
  };
};

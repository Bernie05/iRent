/** invite (EN) — R15, D-10. data: { name, link } */
export default (d) => ({
  subject: 'Welcome to iRent — set your password',
  heading: `Welcome to iRent, ${d.name}!`,
  blocks: [
    { p: 'Your renter account is ready. Set your password to see your bed, balance, bills and payments, and to pay rent online.' },
    { button: { label: 'Set your password', url: d.link } },
    { note: 'This link works once and expires in 24 hours. If it has expired, use "Forgot password?" on the login page or ask the owner to resend your invite.' },
  ],
});

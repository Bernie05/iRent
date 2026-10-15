/** password-reset (EN) — R50. data: { name?, link } */
export default (d) => ({
  subject: 'Reset your iRent password',
  heading: 'Reset your password',
  blocks: [
    {
      p: d.name
        ? `Hi ${d.name}, we received a request to reset your iRent password.`
        : 'We received a request to reset your iRent password.',
    },
    { button: { label: 'Set a new password', url: d.link } },
    { note: "This link works once and expires in 24 hours. If you didn't ask for this, you can ignore this email; your password stays the same." },
  ],
});

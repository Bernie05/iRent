import en from "../locales/en.json";
import {
  V,
  addRenterSchema,
  adminPaymentSchema,
  billSchema,
  bedSchema,
  inquirySchema,
  loginSchema,
  forgotPasswordSchema,
  paymentUploadSchema,
  refundSchema,
  rejectReasonSchema,
  rentChargeEditSchema,
  setPasswordSchema,
  announcementSchema,
  settingsSchema,
  toFieldErrors,
} from ".";
import type { z } from "zod";

const TODAY = "2026-10-02";
const today = () => TODAY;

function errors(result: z.ZodSafeParseResult<unknown>) {
  return result.success ? {} : toFieldErrors(result.error);
}

function file(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("every validation message is an i18n key", () => {
  it.each(Object.values(V))("%s exists in en.json", (key) => {
    const [, name] = key.split(":");
    expect((en.validation as Record<string, string>)[name]).toBeTruthy();
  });
});

describe("Inquiry (R8)", () => {
  const schema = inquirySchema(today);

  it("accepts name and phone only (OQ-10 = A) and normalises the phone", () => {
    const result = schema.safeParse({
      name: "Maria",
      phone: "0917 123-4567",
      email: "",
      preferred_date: "",
      message: "",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "Maria", phone: "09171234567" });
  });

  it("accepts +63 numbers", () => {
    expect(
      schema.safeParse({ name: "Maria", phone: "+63 917 123 4567" }).success,
    ).toBe(true);
  });

  it.each([
    [{ name: "M", phone: "09171234567" }, { name: V.nameLength }],
    [{ name: "x".repeat(101), phone: "09171234567" }, { name: V.nameLength }],
    [{ name: "Maria", phone: "0817 123 4567" }, { phone: V.phoneInvalid }],
    [{ name: "Maria", phone: "" }, { phone: V.required }],
    [
      { name: "Maria", phone: "09171234567", email: "not-an-email" },
      { email: V.emailInvalid },
    ],
    [
      { name: "Maria", phone: "09171234567", preferred_date: "2026-10-01" },
      { preferred_date: V.dateInPast },
    ],
    [
      { name: "Maria", phone: "09171234567", preferred_date: "2027-01-01" },
      { preferred_date: V.dateTooFar },
    ],
    [
      { name: "Maria", phone: "09171234567", message: "x".repeat(1001) },
      { message: V.messageTooLong },
    ],
  ])("rejects %j", (input, expected) => {
    expect(errors(schema.safeParse(input))).toMatchObject(expected);
  });

  it("allows today and exactly 90 days ahead", () => {
    expect(
      schema.safeParse({
        name: "Maria",
        phone: "09171234567",
        preferred_date: TODAY,
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        name: "Maria",
        phone: "09171234567",
        preferred_date: "2027-01-01",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        name: "Maria",
        phone: "09171234567",
        preferred_date: "2026-12-31",
      }).success,
    ).toBe(true); // today + 90 days
  });
});

describe("Auth", () => {
  it("login needs a valid email and a password", () => {
    expect(errors(loginSchema.safeParse({ email: "x", password: "" }))).toEqual(
      { email: V.emailInvalid, password: V.required },
    );
  });

  it("forgot password needs a valid email of at most 254 characters", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "ana@irent.test" }).success,
    ).toBe(true);
    expect(
      errors(
        forgotPasswordSchema.safeParse({ email: `${"a".repeat(250)}@x.io` }),
      ),
    ).toEqual({ email: V.emailTooLong });
  });

  it.each(["short1", "abcdefgh", "12345678"])(
    "BR-13 rejects %s",
    (password) => {
      expect(
        errors(setPasswordSchema.safeParse({ password, confirm: password })),
      ).toEqual({ password: V.passwordRule });
    },
  );

  it("BR-13 accepts 8+ characters with a letter and a digit, and needs a matching confirmation", () => {
    expect(
      setPasswordSchema.safeParse({ password: "abcdefg1", confirm: "abcdefg1" })
        .success,
    ).toBe(true);
    expect(
      errors(
        setPasswordSchema.safeParse({
          password: "abcdefg1",
          confirm: "abcdefg2",
        }),
      ),
    ).toEqual({ confirm: V.passwordMismatch });
  });
});

describe("Payment upload (R20)", () => {
  const valid = {
    item_type: "charge",
    item_id: "c1",
    method: "gcash",
    amount: "4500",
    reference_no: " GC 1234-5678 ",
    proof: file("a.png", "image/png", 1000),
  };

  it("accepts a valid upload, trims the reference and allows more than the remaining balance (BR-9)", () => {
    const result = paymentUploadSchema.safeParse({
      ...valid,
      amount: "5000.50",
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      amount: 5000.5,
      reference_no: "GC 1234-5678",
    });
  });

  it.each([
    [{ amount: "0" }, { amount: V.amountPositive }],
    [{ amount: "" }, { amount: V.required }],
    [{ amount: "12.345" }, { amount: V.amountDecimals }],
    [{ amount: "1000000" }, { amount: V.amountTooLarge }],
    [{ amount: "abc" }, { amount: V.amountInvalid }],
    [{ reference_no: "ab" }, { reference_no: V.referenceFormat }],
    [{ reference_no: "GC#1234" }, { reference_no: V.referenceFormat }],
    [{ reference_no: "" }, { reference_no: V.referenceRequired }],
    [{ method: "cash" }, { method: V.choiceRequired }],
    [{ proof: undefined }, { proof: V.fileRequired }],
  ])("rejects %j", (patch, expected) => {
    expect(
      errors(paymentUploadSchema.safeParse({ ...valid, ...patch })),
    ).toMatchObject(expected);
  });

  it.each([
    ["a HEIC photo (E22)", file("a.heic", "image/heic", 1000)],
    ["a PDF (E22)", file("a.pdf", "application/pdf", 1000)],
    ["a PNG over 5 MB", file("a.png", "image/png", 5 * 1024 * 1024 + 1)],
  ])("rejects %s with the screenshot message", (_label, proof) => {
    expect(errors(paymentUploadSchema.safeParse({ ...valid, proof }))).toEqual({
      proof: V.screenshotInvalid,
    });
  });

  it("accepts a webp of exactly 5 MB", () => {
    expect(
      paymentUploadSchema.safeParse({
        ...valid,
        proof: file("a.webp", "image/webp", 5 * 1024 * 1024),
      }).success,
    ).toBe(true);
  });
});

describe("Admin record payment (R37)", () => {
  const schema = adminPaymentSchema(today);
  const base = {
    item_type: "charge",
    item_id: "c1",
    amount: 2000,
    paid_at: TODAY,
  };

  it("makes the reference optional for cash only", () => {
    expect(schema.safeParse({ ...base, method: "cash" }).success).toBe(true);
    for (const method of ["gcash", "maya", "bpi"]) {
      expect(errors(schema.safeParse({ ...base, method }))).toEqual({
        reference_no: V.referenceRequired,
      });
    }
    expect(
      schema.safeParse({ ...base, method: "bpi", reference_no: "BPI-778899" })
        .success,
    ).toBe(true);
  });

  it("rejects a date paid in the future", () => {
    expect(
      errors(
        schema.safeParse({ ...base, method: "cash", paid_at: "2026-10-03" }),
      ),
    ).toEqual({ paid_at: V.dateInFuture });
  });
});

describe("Refund (R57)", () => {
  it("rejects a refund above the credit balance (E37) and accepts the exact balance", () => {
    const schema = refundSchema(400, today);
    const base = { method: "cash", refunded_at: TODAY };
    expect(errors(schema.safeParse({ ...base, amount: "500" }))).toEqual({
      amount: V.refundExceeds,
    });
    expect(schema.safeParse({ ...base, amount: "400" }).success).toBe(true);
    expect(
      errors(
        schema.safeParse({
          ...base,
          amount: "100",
          reference_no: "x".repeat(41),
        }),
      ),
    ).toEqual({ reference_no: V.referenceTooLong });
  });

  it("allows no refund at all when the balance is zero or negative", () => {
    expect(
      errors(
        refundSchema(-250, today).safeParse({
          method: "cash",
          refunded_at: TODAY,
          amount: "0.01",
        }),
      ),
    ).toEqual({ amount: V.refundExceeds });
  });
});

describe("Admin forms", () => {
  it("bed: label, room, rate range and status (BR-6)", () => {
    const valid = {
      label: "Room 3 – Lower",
      room: "Room 3",
      bunk_type: "lower",
      monthly_rate: "4500",
      status: "vacant",
    };
    expect(bedSchema.safeParse(valid).success).toBe(true);
    expect(
      errors(bedSchema.safeParse({ ...valid, monthly_rate: "0" })),
    ).toEqual({ monthly_rate: V.rateRange });
    expect(
      errors(bedSchema.safeParse({ ...valid, monthly_rate: "100001" })),
    ).toEqual({ monthly_rate: V.rateRange });
    expect(
      errors(bedSchema.safeParse({ ...valid, status: "occupied" })),
    ).toEqual({ status: V.choiceRequired });
    expect(errors(bedSchema.safeParse({ ...valid, label: "" }))).toEqual({
      label: V.labelLength,
    });
  });

  it("add renter: move-in within 60 days of today, optional deposit up to ₱100,000", () => {
    const schema = addRenterSchema(today);
    const valid = {
      full_name: "Dan Reyes",
      email: "dan@irent.test",
      phone: "0917 222 3333",
      language: "fil",
      bed_id: "bed-4",
      move_in: "2026-10-01",
      deposit: "",
    };
    expect(schema.safeParse(valid).success).toBe(true);
    expect(
      errors(schema.safeParse({ ...valid, move_in: "2026-12-02" })),
    ).toEqual({ move_in: V.moveInRange });
    expect(
      errors(schema.safeParse({ ...valid, move_in: "2026-08-02" })),
    ).toEqual({ move_in: V.moveInRange });
    expect(
      errors(schema.safeParse({ ...valid, deposit: "100000.01" })),
    ).toEqual({ deposit: V.depositRange });
  });

  it("rent charge edit: amount cannot go below what was paid (compared in centavos)", () => {
    const schema = rentChargeEditSchema(1500.1);
    expect(
      errors(schema.safeParse({ amount: "1500.09", due_date: "2026-10-05" })),
    ).toEqual({ amount: V.amountBelowPaid });
    expect(
      schema.safeParse({ amount: "1500.10", due_date: "2026-10-05" }).success,
    ).toBe(true);
  });

  it("bill: shares must sum exactly to the total and stay at or above what was paid", () => {
    const bill = {
      type: "electricity",
      period: "2026-09-01",
      total_amount: 1000,
      due_date: "2026-09-30",
    };
    expect(
      billSchema.safeParse({
        ...bill,
        shares: [
          { id: "a", amount: 333.34 },
          { id: "b", amount: 333.33 },
          { id: "c", amount: 333.33 },
        ],
      }).success,
    ).toBe(true);
    expect(
      errors(
        billSchema.safeParse({
          ...bill,
          shares: [
            { id: "a", amount: 333.33 },
            { id: "b", amount: 333.33 },
            { id: "c", amount: 333.33 },
          ],
        }),
      ),
    ).toEqual({ shares: V.sharesSum });
    expect(
      errors(
        billSchema.safeParse({
          ...bill,
          shares: [
            { id: "a", amount: 100, paid_total: 200 },
            { id: "b", amount: 900 },
          ],
        }),
      ),
    ).toEqual({ "shares.0.amount": V.shareBelowPaid });
    expect(
      errors(billSchema.safeParse({ ...bill, period: "2026-09-15" })),
    ).toEqual({ period: V.dateInvalid });
  });

  it("reject reason: 1–500 characters", () => {
    expect(errors(rejectReasonSchema.safeParse({ reason: "   " }))).toEqual({
      reason: V.reasonLength,
    });
    expect(
      errors(rejectReasonSchema.safeParse({ reason: "x".repeat(501) })),
    ).toEqual({ reason: V.reasonLength });
    expect(
      rejectReasonSchema.safeParse({ reason: "Reference not found" }).success,
    ).toBe(true);
  });

  it("announcement: title ≤ 120, body ≤ 5,000", () => {
    const valid = {
      title: "Water",
      body: "Off on Saturday",
      priority: "urgent",
      pinned: false,
      send_email: true,
    };
    expect(announcementSchema().safeParse(valid).success).toBe(true);
    expect(
      errors(
        announcementSchema().safeParse({
          ...valid,
          title: "x".repeat(121),
          body: "",
        }),
      ),
    ).toEqual({ title: V.titleLength, body: V.bodyLength });
  });

  it("announcement D-25: maintenance dates and times, publish at (future, ≤ 90 days), Manila clock pinned", () => {
    const base = { title: "Water", body: "Off", priority: "normal", pinned: false, send_email: false };
    // 2026-10-15 23:30 Manila = 15:30Z; "today" is still Oct 15 in Manila.
    const now = Date.parse("2026-10-15T15:30:00Z");
    const schema = announcementSchema({ now: () => now, today: () => "2026-10-15" });
    const m = { ...base, kind: "maintenance", starts_on: "2026-10-15", ends_on: "2026-10-15" };

    expect(schema.safeParse(m).success).toBe(true); // one day, ending today (inclusive)
    expect(errors(schema.safeParse({ ...m, starts_on: "", ends_on: "" }))).toEqual({ starts_on: V.required, ends_on: V.required });
    expect(errors(schema.safeParse({ ...m, ends_on: "2026-10-14" }))).toEqual({ ends_on: V.endBeforeStart });
    expect(errors(schema.safeParse({ ...m, ends_on: "2026-11-15" }))).toEqual({ ends_on: V.maintenanceSpan });
    expect(schema.safeParse({ ...m, ends_on: "2026-11-14" }).success).toBe(true); // 31 days
    expect(errors(schema.safeParse({ ...m, starts_on: "2026-10-10", ends_on: "2026-10-14" }))).toEqual({ ends_on: V.dateInPast });
    expect(announcementSchema({ creating: false, now: () => now, today: () => "2026-10-15" }).safeParse({ ...m, starts_on: "2026-10-10", ends_on: "2026-10-14" }).success).toBe(true);
    expect(errors(schema.safeParse({ ...m, start_time: "09:00" }))).toEqual({ end_time: V.timePair });
    expect(errors(schema.safeParse({ ...m, start_time: "17:00", end_time: "09:00" }))).toEqual({ end_time: V.endTimeBeforeStart });
    expect(errors(schema.safeParse({ ...base, starts_on: "2026-10-15" }))).toEqual({ kind: V.choiceRequired });

    expect(errors(schema.safeParse({ ...base, publish_at: "2026-10-15T23:00:00+08:00" }))).toEqual({ publish_at: V.publishInPast });
    expect(schema.safeParse({ ...base, publish_at: "2026-10-16T00:00:00+08:00" }).success).toBe(true); // past Manila midnight
    expect(errors(schema.safeParse({ ...base, publish_at: "2027-01-14T08:00:00+08:00" }))).toEqual({ publish_at: V.dateTooFar });
    expect(errors(schema.safeParse({ ...base, publish_at: "2026-10-20T08:00" }))).toEqual({ publish_at: V.dateInvalid });
    expect(announcementSchema({ checkPublishAt: false, now: () => now }).safeParse({ ...base, publish_at: "2026-10-01T08:00:00+08:00" }).success).toBe(true);
  });

  it("settings: account name ≤ 80 and number ≤ 40", () => {
    const account = {
      method: "gcash",
      enabled: true,
      account_name: "x".repeat(81),
      account_number: "1".repeat(41),
    };
    expect(
      errors(
        settingsSchema.safeParse({
          reminders_enabled: true,
          reminder_types: ["due_today"],
          payment_accounts: [account],
        }),
      ),
    ).toEqual({
      "payment_accounts.0.account_name": V.accountNameTooLong,
      "payment_accounts.0.account_number": V.accountNumberTooLong,
    });
  });
});

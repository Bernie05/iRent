/** Builds multipart bodies for the multipart endpoints (payments, beds, announcements, settings). */
export type FormValue = string | number | boolean | Blob | null | undefined;

export function toFormData(fields: Record<string, FormValue>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Blob) form.append(key, value);
    else form.append(key, String(value));
  }
  return form;
}

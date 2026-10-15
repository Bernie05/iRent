import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAssignBedMutation, useGetBedsQuery, useGetRentersQuery } from '../../services/endpoints/admin';
import { isApiError, fieldErrors } from '../../services/errors';
import { useFormat } from '../../hooks/useFormat';
import { manilaToday } from '../../lib/time';
import type { Bed, RenterRow } from '../../types/api';
import { assignBedSchema } from '../../validation/admin';
import { toFieldErrors } from '../../validation/common';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { InlineAlert } from '../../ui/InlineAlert';
import { Modal } from '../../ui/Modal';
import { SelectField, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/ToastProvider';
import { Plus } from '../../ui/icons';

/**
 * Assign bed (R33), shared by the Renters page (renter known → pick a bed) and the Beds page (bed known → pick a renter
 * without a bed from a combobox). Same API either way: POST /tenancies.
 */
export function AssignBedModal({ renter, bed, onClose, onAddNew }: { renter?: RenterRow; bed?: Bed; onClose: () => void; onAddNew?: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const { data: beds } = useGetBedsQuery(undefined, { skip: !!bed });
  const [assignBed, { isLoading }] = useAssignBedMutation();
  const [picked, setPicked] = useState<RenterRow | null>(renter ?? null);
  const [form, setForm] = useState({ bed_id: bed?.id ?? '', move_in: bed ? manilaToday() : '', deposit: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const availableBeds = (beds ?? []).filter((b) => b.status === 'vacant' || b.status === 'reserved');
  const dueDay = /^\d{4}-\d{2}-\d{2}$/.test(form.move_in) ? Number(form.move_in.slice(8, 10)) : null;
  const err = (k: string) => (errors[k] ? t(errors[k]) : undefined);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    if (!picked) {
      setErrors({ renter: 'admin:assignBed.pickRenter' });
      return;
    }
    const parsed = assignBedSchema().safeParse(form);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await assignBed({ renter_id: picked.id, ...parsed.data }).unwrap();
      toast.show('success', bed ? t('admin:assignBed.savedTo', { name: picked.full_name, bed: bed.label }) : t('admin:assignBed.saved'));
      onClose();
    } catch (error) {
      if (isApiError(error) && error.code === 'VALIDATION_ERROR') setErrors(fieldErrors(error));
      else if (isApiError(error) && (error.code === 'BED_TAKEN' || error.code === 'RENTER_HAS_ACTIVE_TENANCY')) setFormError(t(`errors:${error.code}`));
      else setFormError(t('errors:UNKNOWN'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={bed ? t('admin:assignBed.titleFor', { bed: bed.label }) : t('admin:assignBed.title')}
      description={bed ? t('admin:assignBed.rate', { rate: f.peso(bed.monthly_rate, true) }) : renter?.full_name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="assign-bed-form" loading={isLoading} loadingText={t('common:saving')}>
            {t('common:save')}
          </Button>
        </>
      }
    >
      <form id="assign-bed-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
        {bed ? (
          <RenterPicker value={picked} onChange={setPicked} onAddNew={onAddNew} error={err('renter')} />
        ) : (
          <SelectField
            label={t('admin:assignBed.bed')}
            placeholder={t('admin:assignBed.bedPlaceholder')}
            value={form.bed_id}
            onChange={(e) => setForm((v) => ({ ...v, bed_id: e.target.value }))}
            options={availableBeds.map((b) => ({ value: b.id, label: `${b.label} — ${f.peso(b.monthly_rate, true)}` }))}
            error={err('bed_id')}
            required
          />
        )}
        {(!bed || picked) && (
          <>
            <TextField
              label={t('admin:assignBed.moveIn')}
              type="date"
              value={form.move_in}
              onChange={(e) => setForm((v) => ({ ...v, move_in: e.target.value }))}
              error={err('move_in')}
              helper={dueDay !== null ? t('admin:renters.dueDayHelper', { day: f.dueDay(dueDay) }) : undefined}
              required
            />
            <TextField
              label={t('admin:assignBed.deposit')}
              type="number"
              step="0.01"
              min="0"
              value={form.deposit}
              onChange={(e) => setForm((v) => ({ ...v, deposit: e.target.value }))}
              error={err('deposit')}
            />
          </>
        )}
      </form>
    </Modal>
  );
}

/** One line under a renter's name: phone · status · money, so the admin sees it before assigning. */
function useRenterSummary() {
  const { t } = useTranslation();
  const f = useFormat();
  return (r: RenterRow) =>
    [
      r.phone,
      r.tenancy ? r.tenancy.bed.label : r.last_move_out ? t('admin:assignBed.movedOutOn', { month: f.period(r.last_move_out) }) : t('admin:assignBed.noBedYet'),
      r.outstanding > 0 ? t('admin:assignBed.owes', { amount: f.peso(r.outstanding) }) : r.credit_balance > 0 ? t('admin:assignBed.credit', { amount: f.peso(r.credit_balance) }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
}

const ADD_NEW = '__add_new__';

/**
 * Full name combobox (APG combobox + listbox): focus or click opens the list of renters with no active tenancy; type to
 * filter; ↑/↓ move, Enter picks, Esc closes the list (a second Esc closes the modal). The last option adds a new renter.
 */
export interface RenterPickerText {
  /** Hint under the field, given how many renters can be picked. */
  hint: (count: number) => string;
  empty: string;
  listLabel: string;
  placeholder: string;
}

/**
 * Shared renter combobox (Assign bed: renters without a bed; Calendar: active renters). `filter` picks who is listed;
 * `text` overrides the Assign wording.
 */
export function RenterPicker({
  value,
  onChange,
  onAddNew,
  error,
  filter = (r: RenterRow) => !r.tenancy,
  text,
}: {
  value: RenterRow | null;
  onChange: (r: RenterRow | null) => void;
  onAddNew?: () => void;
  error?: string;
  filter?: (r: RenterRow) => boolean;
  text?: RenterPickerText;
}) {
  const { t } = useTranslation();
  const summary = useRenterSummary();
  const id = useId();
  const { data, isLoading } = useGetRentersQuery();
  const [query, setQuery] = useState(value?.full_name ?? '');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [overlay, setOverlay] = useState<{ host: Element; style: CSSProperties } | null>(null);

  // The list is an overlay anchored to the input (same width, max 18rem, its own scroll), portalled into the dialog
  // element, outside the modal body's overflow: it never resizes the field, pushes the form, or scrolls the modal.
  // Inside the dialog (not document.body) so it stays in the aria-modal tree for screen readers.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const input = inputRef.current;
      const host = input?.closest('[role="dialog"]');
      if (!input || !host) return;
      const r = input.getBoundingClientRect();
      // Below the field when there's room; otherwise flip above it. Max 18rem, capped to the space available.
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const flip = below < 200 && above > below;
      const maxHeight = Math.max(120, Math.min(288, flip ? above : below));
      setOverlay({ host, style: flip ? { position: 'fixed', bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width, maxHeight } : { position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, maxHeight } });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  const [active, setActive] = useState(0);
  const withoutBed = (data ?? []).filter(filter);
  const matches = withoutBed.filter((r) => r.full_name.toLowerCase().includes(query.trim().toLowerCase()));
  const options: (RenterRow | typeof ADD_NEW)[] = [...matches, ...(onAddNew ? [ADD_NEW as typeof ADD_NEW] : [])];
  const optionId = (i: number) => `${id}-opt-${i}`;

  function choose(option: RenterRow | typeof ADD_NEW) {
    if (option === ADD_NEW) {
      onAddNew?.();
      return;
    }
    onChange(option);
    setQuery(option.full_name);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => (options.length ? (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length : 0));
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation(); // close the list only, not the modal
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-input`} className="type-label-s text-primary">
        {t('admin:renters.fullName')}
        <span aria-hidden="true" className="text-danger">
          {' '}
          *
        </span>
      </label>
      <input
        ref={inputRef}
        id={`${id}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && options[active] ? optionId(active) : undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        autoComplete="off"
        placeholder={text?.placeholder ?? t('admin:assignBed.searchPlaceholder')}
        value={query}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
          if (value) onChange(null);
        }}
        onKeyDown={onKeyDown}
        className={`min-h-touch rounded-md border bg-surface px-3 type-body-m text-primary shadow-elevation-1 placeholder:text-tertiary hover:border-brand focus-visible:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${error ? 'border-danger' : 'border-strong'}`}
      />
      {open &&
        overlay &&
        createPortal(
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={text?.listLabel ?? t('admin:assignBed.listLabel')}
          style={overlay?.style}
          className="z-[70] overflow-y-auto rounded-md border bg-surface py-1 shadow-elevation-3"
        >
          {options.map((o, i) => (
            <li
              key={o === ADD_NEW ? ADD_NEW : o.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: keeps focus in the input so blur doesn't close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? 'bg-muted' : ''} ${o === ADD_NEW ? 'border-t' : ''}`}
            >
              {o === ADD_NEW ? (
                <span className="flex items-center gap-2 type-label-s text-primary">
                  <Plus className="h-icon-sm w-icon-sm" aria-hidden="true" />
                  {t('admin:assignBed.addNew')}
                </span>
              ) : (
                <>
                  <span aria-hidden="true">
                    <Avatar name={o.full_name} size="sm" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="type-body-s-strong text-primary">{o.full_name}</span>
                    <span className="type-caption text-secondary">{summary(o)}</span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
          ,
          overlay.host,
        )}
      <p id={`${id}-hint`} className="type-body-s text-tertiary">
        {isLoading
          ? t('common:loading')
          : withoutBed.length === 0
            ? (text?.empty ?? t('admin:assignBed.noRenters'))
            : (text?.hint(withoutBed.length) ?? t('admin:assignBed.hint', { count: withoutBed.length }))}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="type-body-s text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

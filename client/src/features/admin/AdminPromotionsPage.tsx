import { useState } from 'react';
import { ConfirmDelete } from '../../ui/ConfirmDialog';
import { useTranslation } from 'react-i18next';
import {
  useDeletePromotionMutation,
  useGetPromotionsQuery,
  useReorderPromotionsMutation,
  useSavePromotionMutation,
  useSetPromoSectionMutation,
  type PromotionInput,
} from '../../services/endpoints/admin';
import { fieldErrors } from '../../services/errors';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { useFormat } from '../../hooks/useFormat';
import { PROMO_STOCK } from '../../lib/demoPhotos';
import { promoStatus, type PromoStatus } from '../../lib/promotions';
import { manilaToday } from '../../lib/time';
import { PROMO_SECTIONS, type PromoAction, type PromoSection, type Promotion } from '../../types/api';
import { promotionSchema } from '../../validation/admin';
import { toFieldErrors } from '../../validation/common';
import { Button } from '../../ui/Button';
import { Switch } from '../../ui/Checkbox';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { FileUpload } from '../../ui/FileUpload';
import { IconButton } from '../../ui/IconButton';
import { InlineAlert } from '../../ui/InlineAlert';
import { Modal } from '../../ui/Modal';
import { Pagination, usePaged } from '../../ui/Pagination';
import { Skeleton } from '../../ui/Skeleton';
import { StatusBadge, type StatusTone } from '../../ui/StatusBadge';
import { Table, TableCell, TableHeaderCell } from '../../ui/Table';
import { SelectField, TextareaField, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/ToastProvider';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from '../../ui/icons';

const TONE: Record<PromoStatus, StatusTone> = { visible: 'success', hidden: 'neutral', scheduled: 'info', expired: 'warning' };
const ACTIONS: PromoAction[] = ['none', 'viewing', 'section'];

/** Proposed (promotions, 2026-10-14): section Show/Hide switch, ordered list with status, Add/Edit, Delete, Up/Down. */
export function AdminPromotionsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useGetPromotionsQuery();
  const [setSection, { isLoading: isSwitching }] = useSetPromoSectionMutation();
  const [reorder, { isLoading: isMoving }] = useReorderPromotionsMutation();
  const [remove, { isLoading: isDeleting }] = useDeletePromotionMutation();
  const [editing, setEditing] = useState<Promotion | null | undefined>(undefined); // undefined = closed, null = new
  const [deleting, setDeleting] = useState<Promotion | null>(null);
  const showSkeleton = useDelayedFlag(isLoading);
  const items = data?.items ?? [];
  const paged = usePaged(items, 10);
  const today = manilaToday();

  if (error && !isLoading) return <ErrorState message={t('admin:promotions.errorLoading')} onRetry={() => void refetch()} />;

  async function toggleSection(visible: boolean) {
    try {
      await setSection(visible).unwrap();
      toast.show('success', visible ? t('admin:promotions.sectionShownToast') : t('admin:promotions.sectionHiddenToast'));
    } catch {
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  async function move(index: number, by: -1 | 1) {
    const ids = items.map((p) => p.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    try {
      await reorder(ids).unwrap();
    } catch {
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  async function onDelete() {
    if (!deleting) return;
    try {
      await remove(deleting.id).unwrap();
      toast.show('success', t('admin:promotions.deleted'));
      setDeleting(null);
    } catch {
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  const dates = (p: Promotion) =>
    p.starts_on && p.ends_on
      ? t('admin:promotions.range', { from: f.date(p.starts_on), to: f.date(p.ends_on) })
      : p.starts_on
        ? t('admin:promotions.from', { date: f.date(p.starts_on) })
        : p.ends_on
          ? t('admin:promotions.until', { date: f.date(p.ends_on) })
          : t('admin:promotions.always');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="type-h2 text-primary">{t('admin:promotions.title')}</h1>
          <p className="type-body-s text-secondary">{t('admin:promotions.lead')}</p>
        </div>
        <Button iconLeft={<Plus className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setEditing(null)}>
          {t('admin:promotions.add')}
        </Button>
      </div>

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface px-5 py-3">
          <Switch
            id="promo-section"
            label={t('admin:promotions.sectionLabel')}
            checked={data.section_visible}
            disabled={isSwitching}
            onChange={(e) => void toggleSection(e.target.checked)}
          />
          <StatusBadge tone={data.section_visible ? 'success' : 'neutral'}>
            {data.section_visible ? t('admin:promotions.sectionOn') : t('admin:promotions.sectionOff')}
          </StatusBadge>
        </div>
      )}

      {isLoading ? (
        showSkeleton ? <Skeleton variant="row" /> : null
      ) : items.length === 0 ? (
        <EmptyState title={t('admin:promotions.empty')} />
      ) : (
        <Table>
          <caption className="sr-only">{t('admin:promotions.title')}</caption>
          <thead>
            <tr>
              <TableHeaderCell>{t('admin:promotions.col.order')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:promotions.col.promo')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:promotions.col.dates')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:promotions.col.status')}</TableHeaderCell>
              <TableHeaderCell>
                <span className="sr-only">{t('admin:promotions.editTitle')}</span>
              </TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((p) => {
              const index = items.indexOf(p);
              const status = promoStatus(p, today);
              return (
                <tr key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="w-5 tabular-nums text-secondary">{index + 1}</span>
                      <IconButton label={t('admin:promotions.moveUp', { title: p.title })} icon={<ChevronUp className="h-icon-sm w-icon-sm" aria-hidden="true" />} disabled={index === 0 || isMoving} onClick={() => void move(index, -1)} />
                      <IconButton label={t('admin:promotions.moveDown', { title: p.title })} icon={<ChevronDown className="h-icon-sm w-icon-sm" aria-hidden="true" />} disabled={index === items.length - 1 || isMoving} onClick={() => void move(index, 1)} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {p.image_url ? <img src={p.image_url} alt="" className="h-12 w-20 shrink-0 rounded-sm bg-muted object-cover" /> : <span className="h-12 w-20 shrink-0 rounded-sm bg-muted" aria-hidden="true" />}
                      <span className="flex min-w-0 flex-col">
                        <span className="type-body-s-strong text-primary">{p.title}</span>
                        {p.badge && <span className="type-caption text-tertiary">{p.badge}</span>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell variant="muted" className="whitespace-nowrap">
                    {dates(p)}
                  </TableCell>
                  <TableCell variant="badge">
                    <StatusBadge tone={TONE[status]}>{t(`admin:promotions.status.${status}`)}</StatusBadge>
                  </TableCell>
                  <TableCell variant="actions">
                    <div className="flex justify-end gap-1">
                      <IconButton label={t('admin:promotions.edit', { title: p.title })} icon={<Pencil className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setEditing(p)} />
                      <IconButton label={t('admin:promotions.delete', { title: p.title })} icon={<Trash2 className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setDeleting(p)} />
                    </div>
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('admin:promotions.title') })} />

      {editing !== undefined && <PromotionModal key={editing?.id ?? 'new'} editing={editing} onClose={() => setEditing(undefined)} />}

      <ConfirmDelete item={deleting?.title ?? null} busy={isDeleting} onCancel={() => setDeleting(null)} onConfirm={() => void onDelete()} />
    </div>
  );
}

const formOf = (p: Promotion | null): PromotionInput => ({
  title: p?.title ?? '',
  description: p?.description ?? '',
  badge: p?.badge ?? '',
  cta_action: p?.cta_action ?? 'viewing',
  cta_label: p?.cta_label ?? '',
  cta_section: p?.cta_section ?? '',
  starts_on: p?.starts_on ?? '',
  ends_on: p?.ends_on ?? '',
  visible: p?.visible ?? true,
  image_url: p ? (p.image_url ?? '') : PROMO_STOCK[0].url,
});

/** Add/Edit promo: title, description, badge, image (stock photo or upload), button, dates, visible. */
function PromotionModal({ editing, onClose }: { editing: Promotion | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [save, { isLoading }] = useSavePromotionMutation();
  const [form, setForm] = useState<PromotionInput>(() => formOf(editing));
  const [image, setImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof PromotionInput>(key: K, value: PromotionInput[K]) => setForm((v) => ({ ...v, [key]: value }));
  const err = (key: string) => (errors[key] ? t(errors[key]) : undefined);
  const stockIsCustom = Boolean(form.image_url) && !PROMO_STOCK.some((s) => s.url === form.image_url);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    const parsed = promotionSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      // An uploaded file wins; an unchanged custom (uploaded earlier) image is kept by not sending image_url.
      await save({ id: editing?.id, ...form, image_url: image || stockIsCustom ? undefined : form.image_url, image }).unwrap();
      toast.show('success', t('admin:promotions.saved'));
      onClose();
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else setFormError(t('errors:UNKNOWN'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('admin:promotions.editTitle') : t('admin:promotions.addTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="promotion-form" loading={isLoading} loadingText={t('common:saving')}>
            {t('common:save')}
          </Button>
        </>
      }
    >
      <form id="promotion-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
        <TextField label={t('admin:promotions.field.title')} value={form.title} maxLength={120} onChange={(e) => set('title', e.target.value)} error={err('title')} required />
        <TextareaField label={t('admin:promotions.field.description')} rows={3} maxLength={240} value={form.description} onChange={(e) => set('description', e.target.value)} error={err('description')} />
        <TextField label={t('admin:promotions.field.badge')} helper={t('admin:promotions.field.badgeHelper')} maxLength={30} value={form.badge} onChange={(e) => set('badge', e.target.value)} error={err('badge')} />
        <SelectField
          label={t('admin:promotions.field.image')}
          value={stockIsCustom ? '__custom' : form.image_url}
          onChange={(e) => set('image_url', e.target.value)}
          options={[
            { value: '', label: t('admin:promotions.field.imageNone') },
            ...PROMO_STOCK.map((s) => ({ value: s.url, label: s.label })),
            ...(stockIsCustom ? [{ value: '__custom', label: t('admin:promotions.field.imageUpload') }] : []),
          ]}
          error={err('image_url')}
        />
        <FileUpload label={t('admin:promotions.field.imageUpload')} value={image} onChange={setImage} error={err('image')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('admin:promotions.field.cta')}
            value={form.cta_action}
            onChange={(e) => set('cta_action', e.target.value as PromoAction)}
            options={ACTIONS.map((a) => ({ value: a, label: t(`admin:promotions.action.${a}`) }))}
          />
          {form.cta_action !== 'none' && (
            <TextField label={t('admin:promotions.field.ctaLabel')} maxLength={30} value={form.cta_label} onChange={(e) => set('cta_label', e.target.value)} error={err('cta_label')} required />
          )}
        </div>
        {form.cta_action === 'section' && (
          <SelectField
            label={t('admin:promotions.field.ctaSection')}
            placeholder={t('admin:promotions.field.ctaSectionPlaceholder')}
            value={form.cta_section}
            onChange={(e) => set('cta_section', e.target.value as PromoSection)}
            options={PROMO_SECTIONS.map((s) => ({ value: s, label: t(`admin:promotions.section.${s}`) }))}
            error={err('cta_section')}
            required
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('admin:promotions.field.startsOn')} type="date" value={form.starts_on} onChange={(e) => set('starts_on', e.target.value)} error={err('starts_on')} helper={t('admin:promotions.field.datesHelper')} />
          <TextField label={t('admin:promotions.field.endsOn')} type="date" value={form.ends_on} min={form.starts_on || undefined} onChange={(e) => set('ends_on', e.target.value)} error={err('ends_on')} />
        </div>
        <Switch id="promo-visible" label={t('admin:promotions.field.visible')} checked={form.visible} onChange={(e) => set('visible', e.target.checked)} />
      </form>
    </Modal>
  );
}

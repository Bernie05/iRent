import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';
import { Button, type ButtonVariant } from './Button';
import { IconButton } from './IconButton';
import { TextField, TextareaField, SelectField } from './TextField';
import { FileUpload } from './FileUpload';
import { Checkbox, Radio, Switch } from './Checkbox';
import { SegmentedControl } from './SegmentedControl';
import { StatusBadge, type StatusTone } from './StatusBadge';
import { Avatar } from './Avatar';
import { Tabs, FilterChip } from './Tabs';
import { Settings, Check, AlertTriangle, Home } from './icons';
import { Modal } from './Modal';
import { useToast } from './ToastProvider';
import { InlineAlert } from './InlineAlert';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';
import { Table, TableHeaderCell, TableCell, ListRow } from './Table';
import { StatCard } from './StatCard';
import { BedCard } from './BedCard';
import { AmenityCard } from './AmenityCard';
import { placeholderImage } from '../lib/placeholderImage';
import { RateCard } from './RateCard';
import { AnnouncementCard } from './AnnouncementCard';
import { BalanceCard } from './BalanceCard';

const BUTTON_VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'accent'];
const STATUS_TONES: StatusTone[] = ['brand', 'warning', 'success', 'danger', 'info', 'neutral'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-surface p-4 shadow-elevation-1">
      <h2 className="type-h3 text-primary">{title}</h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

/**
 * Dev-only UI kit gallery (F3). Shows every atom variant/state in the current theme for review and F25
 * reconciliation. Not part of the production route table beyond a dev-only path.
 */
export function DevKitPage() {
  const { t } = useTranslation();
  const { show } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState(true);
  const [tab, setTab] = useState('one');
  const [chipActive, setChipActive] = useState(true);
  const [segment, setSegment] = useState('a');
  const [modalOpen, setModalOpen] = useState(false);
  const longText = 'Sample longer pseudo-FIL na teksto para tignan ang haba'; // ~30% longer test string

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <Logo />
      <h1 className="type-h1 text-primary">UI kit — /dev/kit</h1>

      <Section title="Buttons">
        {BUTTON_VARIANTS.map((v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ))}
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
        <Button iconLeft={<Check className="h-icon-md w-icon-md" aria-hidden="true" />}>With icon</Button>
        <Button>{longText}</Button>
      </Section>

      <Section title="IconButton">
        <IconButton label="Settings" icon={<Settings className="h-icon-md w-icon-md" aria-hidden="true" />} />
        <IconButton variant="secondary" label="Settings" icon={<Settings className="h-icon-md w-icon-md" aria-hidden="true" />} />
        <IconButton label="Settings" disabled icon={<Settings className="h-icon-md w-icon-md" aria-hidden="true" />} />
      </Section>

      <Section title="TextField">
        <TextField label="Email" placeholder="you@example.com" />
        <TextField label="Amount" error={t('validation:amountPositive')} />
        <TextField label="Move-in date" type="date" />
        <TextareaField label="Message" helper="Up to 1,000 characters" />
        <SelectField label="Bunk type" options={[{ value: 'lower', label: 'Lower bunk' }, { value: 'upper', label: 'Upper bunk' }]} placeholder="Choose" />
      </Section>

      <Section title="FileUpload">
        <FileUpload label="Payment screenshot" value={file} onChange={setFile} required />
      </Section>

      <Section title="Checkbox / Switch / Radio">
        <Checkbox label="Pinned" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <Switch label="Reminders on" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <Radio label="Urgent" name="priority" checked readOnly />
        <Radio label="Normal" name="priority" checked={false} readOnly />
      </Section>

      <Section title="SegmentedControl">
        <SegmentedControl
          label="Theme"
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'a', label: t('theme.light') },
            { value: 'b', label: t('theme.dark') },
          ]}
        />
      </Section>

      <Section title="StatusBadge">
        {STATUS_TONES.map((tone) => (
          <StatusBadge key={tone} tone={tone}>
            {tone}
          </StatusBadge>
        ))}
        <StatusBadge tone="danger" icon={<AlertTriangle className="h-icon-sm w-icon-sm" aria-hidden="true" />}>
          Overdue
        </StatusBadge>
      </Section>

      <Section title="Avatar">
        <Avatar name="Bernie Baltazar" size="sm" />
        <Avatar name="Bernie Baltazar" size="md" />
        <Avatar name="Bernie Baltazar" size="lg" />
      </Section>

      <Section title="Tabs / FilterChip">
        <Tabs
          label="Sections"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'one', label: 'One' },
            { value: 'two', label: 'Two' },
          ]}
        />
        <FilterChip label="All" active={chipActive} onClick={() => setChipActive((v) => !v)} />
        <FilterChip label="Unpaid" active={!chipActive} onClick={() => setChipActive((v) => !v)} />
      </Section>

      <Section title="Modal / Toast">
        <Button onClick={() => setModalOpen(true)}>Open modal</Button>
        <Button variant="secondary" onClick={() => show('success', 'Saved')}>Show success toast</Button>
        <Button variant="danger" onClick={() => show('error', 'Something failed')}>Show error toast</Button>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Confirm" description="Are you sure?" footer={<Button onClick={() => setModalOpen(false)}>OK</Button>}>
          <p className="type-body-s text-secondary">Modal body content.</p>
        </Modal>
      </Section>

      <Section title="InlineAlert / EmptyState / ErrorState / Skeleton">
        <InlineAlert tone="success">Payment received.</InlineAlert>
        <InlineAlert tone="error">Something went wrong.</InlineAlert>
        <EmptyState title="No payments yet" description="Payments will appear here." />
        <ErrorState message="Couldn't load data." onRetry={() => undefined} />
        <div className="flex flex-col gap-2">
          <Skeleton variant="line" />
          <Skeleton variant="row" />
          <Skeleton variant="card" />
        </div>
      </Section>

      <Section title="Table / ListRow">
        <Table>
          <thead>
            <tr>
              <TableHeaderCell>Renter</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            <tr>
              <TableCell variant="strong">Juan Dela Cruz</TableCell>
              <TableCell>
                <StatusBadge tone="success">Paid</StatusBadge>
              </TableCell>
            </tr>
          </tbody>
        </Table>
        <ListRow title="Juan Dela Cruz" subtitle="Room A · Lower Bunk 1" trailing={<StatusBadge tone="warning">Due</StatusBadge>} />
      </Section>

      <Section title="Cards">
        <StatCard label="Occupied beds" value="4 / 6" icon={<Home className="h-icon-sm w-icon-sm" aria-hidden="true" />} />
        <BedCard room="Room A – Lower Bunk 1" bunkType="lower" rate={4500} status="vacant" />
        <AmenityCard
          photo={{ src: placeholderImage('Pool', 400, 500), width: 400, height: 500 }}
          alt="Pool placeholder"
          icon={<Home className="h-icon-sm w-icon-sm text-primary" aria-hidden="true" />}
          label="Pool"
          countLabel="4 photos"
          className="w-56"
        />
        <RateCard bunkType="lower" rate={4500} vacantCount={2} />
        <AnnouncementCard title="Water interruption" body="Water will be off tomorrow from 8am to 12pm for maintenance." priority="urgent" pinned unread createdAt="2026-09-25" />
        <BalanceCard status="due" outstanding={4500} nextDueDate="Oct 5, 2026" creditBalance={500} />
        <BalanceCard status="overdue" outstanding={4500} creditBalance={-200} />
      </Section>
    </main>
  );
}

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Greeting } from '../../types/api';
import { BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES } from '../../ui/Button';
import { ArrowRight, Cake } from '../../ui/icons';
import { isHttpUrl } from '../../validation/common';

/**
 * Proposed (birthday greeting): the admin's template, already filled in for this renter. Every field is rendered as
 * plain text (React escapes it; line breaks kept), the button only for an http(s) link. Also the Settings live preview.
 */
export function BirthdayGreeting({ greeting, heading: Heading = 'h2' }: { greeting: Greeting; heading?: 'h2' | 'h3' }) {
  const { t } = useTranslation();
  const id = useId();
  const showLink = Boolean(greeting.link_label && greeting.link_url && isHttpUrl(greeting.link_url));
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5 rounded-lg border border-strong bg-surface p-5 shadow-elevation-1 sm:flex-row sm:items-center sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-on-accent" aria-hidden="true">
          <Cake className="h-icon-md w-icon-md" />
        </span>
        <Heading id={id} className="break-words type-h2 text-primary">
          {greeting.title}
        </Heading>
        <p className="max-w-[60ch] whitespace-pre-line break-words type-body-m text-secondary">{greeting.message}</p>
        {showLink && (
          <a
            href={greeting.link_url!}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BUTTON_BASE_CLASSES} ${BUTTON_VARIANT_CLASSES.primary} mt-2 w-full sm:w-fit`}
          >
            {greeting.link_label}
            <ArrowRight className="h-icon-sm w-icon-sm" aria-hidden="true" />
          </a>
        )}
      </div>
      {greeting.image_url && (
        <img
          src={greeting.image_url}
          alt={t('portal:home.greetingImageAlt')}
          className="h-40 w-40 shrink-0 self-center rounded-md border bg-logo-tile object-contain"
        />
      )}
    </section>
  );
}

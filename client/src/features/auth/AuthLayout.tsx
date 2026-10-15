import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLockup } from '../../ui/Logo';

/** DESIGN.md S2: stacked brand lockup above a card form. Shared by Login, Set password, Forgot password. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
        <Link to="/" className="w-fit self-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <BrandLockup stacked />
        </Link>
        <div className="flex w-full flex-col gap-5 rounded-xl border bg-surface p-6 shadow-elevation-2 sm:p-10">
          <h1 className="type-h1 text-primary">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from './hooks';
import { selectAuthStatus, selectRole } from '../features/auth/authSlice';
import type { Role } from '../types/api';

const HOME_FOR_ROLE: Record<Role, string> = {
  renter: '/portal',
  admin: '/admin',
};

interface ProtectedRouteProps {
  role: Role;
  children: ReactNode;
}

/**
 * SC-10 guard: an unauthenticated visitor goes to /login?next=; a logged-in user who opens the other
 * role's area goes to their own home. `AppBootstrap` guarantees `status`/`profile` are settled first.
 */
export function ProtectedRoute({ role, children }: ProtectedRouteProps) {
  const status = useAppSelector(selectAuthStatus);
  const userRole = useAppSelector(selectRole);
  const location = useLocation();

  if (status !== 'authenticated') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (userRole && userRole !== role) {
    return <Navigate to={HOME_FOR_ROLE[userRole]} replace />;
  }
  return <>{children}</>;
}

/** /login redirects a logged-in user to their home (SC-10). */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const status = useAppSelector(selectAuthStatus);
  const userRole = useAppSelector(selectRole);
  const [params] = [new URLSearchParams(useLocation().search)];

  if (status === 'authenticated' && userRole) {
    const next = params.get('next');
    return <Navigate to={next && next.startsWith(`/${userRole === 'admin' ? 'admin' : 'portal'}`) ? next : HOME_FOR_ROLE[userRole]} replace />;
  }
  return <>{children}</>;
}

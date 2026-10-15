import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute, RedirectIfAuthenticated } from './ProtectedRoute';
import { renderWithApp } from '../test/utils';

function Guarded({ role }: { role: 'renter' | 'admin' }) {
  return (
    <Routes>
      <Route
        path="/portal"
        element={
          <ProtectedRoute role={role}>
            <div>Protected content</div>
          </ProtectedRoute>
        }
      />
      <Route path="/login" element={<div>Login page</div>} />
      <Route path="/admin" element={<div>Admin home</div>} />
    </Routes>
  );
}

describe('ProtectedRoute (F5, SC-10)', () => {
  it('sends an unauthenticated visitor to /login?next=', () => {
    renderWithApp(<Guarded role="renter" />, { route: '/portal' });
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('sends a logged-in user who opens the other role area to their own home', () => {
    renderWithApp(<Guarded role="renter" />, {
      route: '/portal',
      preloadedState: {
        auth: {
          status: 'authenticated',
          session: { userId: 'u1', email: 'admin@irent.test' },
          profile: { id: 'u1', full_name: 'Admin', email: 'admin@irent.test', phone: '0917', role: 'admin', language: 'en', tenancy: null },
          sessionExpired: false,
        },
      },
    });
    expect(screen.getByText('Admin home')).toBeInTheDocument();
  });

  it('renders the protected content for the matching role', () => {
    renderWithApp(<Guarded role="renter" />, {
      route: '/portal',
      preloadedState: {
        auth: {
          status: 'authenticated',
          session: { userId: 'u2', email: 'ana@irent.test' },
          profile: { id: 'u2', full_name: 'Ana', email: 'ana@irent.test', phone: '0917', role: 'renter', language: 'en', tenancy: null },
          sessionExpired: false,
        },
      },
    });
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});

describe('RedirectIfAuthenticated (F5, SC-10)', () => {
  it('redirects a logged-in user away from /login to their home', () => {
    renderWithApp(
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <div>Login page</div>
            </RedirectIfAuthenticated>
          }
        />
        <Route path="/portal" element={<div>Portal home</div>} />
      </Routes>,
      {
        route: '/login',
        preloadedState: {
          auth: {
            status: 'authenticated',
            session: { userId: 'u2', email: 'ana@irent.test' },
            profile: { id: 'u2', full_name: 'Ana', email: 'ana@irent.test', phone: '0917', role: 'renter', language: 'en', tenancy: null },
            sessionExpired: false,
          },
        },
      },
    );
    expect(screen.getByText('Portal home')).toBeInTheDocument();
  });

  it('shows the login page for a signed-out visitor', () => {
    renderWithApp(
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <div>Login page</div>
            </RedirectIfAuthenticated>
          }
        />
      </Routes>,
      { route: '/login' },
    );
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });
});

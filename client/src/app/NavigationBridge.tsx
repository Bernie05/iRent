import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerNavigator } from './navigation';

/** Registers the router's navigate() so the API layer can redirect without a full reload. */
export function NavigationBridge(): null {
  const navigate = useNavigate();
  useEffect(() => registerNavigator((to, options) => navigate(to, options)), [navigate]);
  return null;
}

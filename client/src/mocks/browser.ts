import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { mockControl } from './control';

/** Starts the MSW service worker (only when VITE_USE_MOCKS=true; see main.tsx). */
export async function startMockWorker(): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: 'bypass', quiet: false });
  (window as unknown as { __irentMocks: typeof mockControl }).__irentMocks = mockControl;
}

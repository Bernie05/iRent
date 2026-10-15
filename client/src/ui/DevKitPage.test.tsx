import { axe } from 'vitest-axe';
import { DevKitPage } from './DevKitPage';
import { renderWithApp } from '../test/utils';

describe('DevKitPage (F3)', () => {
  it('has no axe violations', async () => {
    const { container } = renderWithApp(<DevKitPage />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});

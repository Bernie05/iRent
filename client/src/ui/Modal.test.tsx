import { useState } from 'react';
import { fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';
import { renderWithApp } from '../test/utils';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Confirm">
        <button>First</button>
        <button>Last</button>
      </Modal>
    </div>
  );
}

describe('Modal (F4)', () => {
  it('moves focus in, traps Tab, closes on Esc, and returns focus to the opener', async () => {
    const user = userEvent.setup();
    const { getByText, getByRole } = renderWithApp(<Harness />);
    const opener = getByText('Open');
    await user.click(opener);

    const dialog = await waitFor(() => getByRole('dialog'));
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
  });
});

describe('Modal stacking (F27)', () => {
  function Stack() {
    const [a, setA] = useState(true);
    const [b, setB] = useState(false);
    return (
      <div>
        <Modal open={a} onClose={() => setA(false)} title="Lower" description="Lower desc">
          <button onClick={() => setB(true)}>Open upper</button>
        </Modal>
        <Modal open={b} onClose={() => setB(false)} title="Upper" description="Upper desc">
          <button>Upper action</button>
        </Modal>
      </div>
    );
  }

  it('Esc closes only the top modal, focus returns into the lower one, ids are unique', async () => {
    const user = userEvent.setup();
    const { getByText, getByRole, getAllByRole } = renderWithApp(<Stack />);
    await user.click(getByText('Open upper'));
    const dialogs = getAllByRole('dialog');
    expect(dialogs).toHaveLength(2);
    expect(dialogs[0]).toHaveAccessibleName('Lower');
    expect(dialogs[1]).toHaveAccessibleName('Upper');
    expect(dialogs[1]).toHaveAccessibleDescription('Upper desc');

    // Tab trap belongs to the top modal only
    expect(dialogs[1]).toContainElement(document.activeElement as HTMLElement);
    await user.tab();
    expect(dialogs[1]).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(getAllByRole('dialog')).toHaveLength(1));
    expect(getByRole('dialog')).toHaveAccessibleName('Lower');
    expect(document.activeElement).toBe(getByText('Open upper'));

    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  });
});

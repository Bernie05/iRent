import { useRef, useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Lightbox } from './Lightbox';
import { renderWithApp } from '../../test/utils';

const images = [
  { src: 'a.png', alt: 'Photo 1' },
  { src: 'b.png', alt: 'Photo 2' },
  { src: 'c.png', alt: 'Photo 3' },
];

function Harness() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={triggerRef} onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Lightbox images={images} index={index} onNavigate={setIndex} onClose={() => setOpen(false)} triggerRef={triggerRef} />
      )}
    </div>
  );
}

describe('Lightbox (F6, R4)', () => {
  it('navigates with arrow keys, closes on Esc, and returns focus to the trigger', async () => {
    const { getByText } = renderWithApp(<Harness />);
    const opener = getByText('Open');
    fireEvent.click(opener);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(await screen.findByText('Photo 2 of 3')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(await screen.findByText('Photo 1 of 3')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
  });

  it('wraps around at the ends', async () => {
    const { getByText } = renderWithApp(<Harness />);
    fireEvent.click(getByText('Open'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(await screen.findByText('Photo 3 of 3')).toBeInTheDocument();
  });
});

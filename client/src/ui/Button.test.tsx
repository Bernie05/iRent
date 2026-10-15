import { fireEvent } from '@testing-library/react';
import { Button } from './Button';
import { renderWithApp } from '../test/utils';

describe('Button (F3)', () => {
  it('blocks a second click while loading and shows the loading label', () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithApp(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Sending…');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('blocks clicks while disabled', () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithApp(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    fireEvent.click(getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires onClick when enabled', () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithApp(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

import { TextField } from './TextField';
import { renderWithApp } from '../test/utils';

describe('TextField (F3)', () => {
  it('links the error message with aria-describedby and aria-invalid', () => {
    const { getByLabelText, getByRole } = renderWithApp(<TextField label="Email" error="Enter a valid email address." />);
    const input = getByLabelText('Email');
    const error = getByRole('alert');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(error).toHaveTextContent('Enter a valid email address.');
  });

  it('links the helper text when there is no error', () => {
    const { getByLabelText, getByText } = renderWithApp(<TextField label="Amount" helper="In pesos" />);
    const input = getByLabelText('Amount');
    const helper = getByText('In pesos');
    expect(input.getAttribute('aria-describedby')).toBe(helper.id);
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});

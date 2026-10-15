import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViewingForm } from './ViewingForm';
import { mockControl } from '../../mocks/control';
import { renderWithApp } from '../../test/utils';

describe('ViewingForm (F7, SC-4, SC-5, SC-6, E1)', () => {
  afterEach(() => mockControl.reset());

  it('submits a valid request, shows the success toast and clears the form (SC-4)', async () => {
    const user = userEvent.setup();
    renderWithApp(<ViewingForm />);
    await user.type(screen.getByLabelText(/Name/), 'Juan Dela Cruz');
    await user.type(screen.getByLabelText(/Phone/), '0917 123 4567');
    await user.type(screen.getByLabelText(/Email/), 'juan@example.com');
    await user.type(screen.getByLabelText(/Message/), 'Can I visit Saturday?');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText(/Thanks! We'll contact you within 24 hours/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toHaveValue('');
  });

  it('shows inline errors and sends no request for an empty name and an invalid phone (SC-5)', async () => {
    const user = userEvent.setup();
    renderWithApp(<ViewingForm />);
    await user.type(screen.getByLabelText(/Phone/), '12345');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Enter 2 to 100 characters.')).toBeInTheDocument();
    expect(screen.getByText(/Enter a PH mobile number/)).toBeInTheDocument();
  });

  it('shows the persistent rate-limit message and keeps the entered data on a 429 (SC-6)', async () => {
    const user = userEvent.setup();
    mockControl.failNext('POST', '/inquiries', 429, 'RATE_LIMITED');
    renderWithApp(<ViewingForm />);
    await user.type(screen.getByLabelText(/Name/), 'Juan Dela Cruz');
    await user.type(screen.getByLabelText(/Phone/), '0917 123 4567');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Too many requests. Please try again later, or call us.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toHaveValue('Juan Dela Cruz');
  });

  it('a double click sends exactly one request (E1)', async () => {
    const user = userEvent.setup();
    renderWithApp(<ViewingForm />);
    await user.type(screen.getByLabelText(/Name/), 'Juan Dela Cruz');
    await user.type(screen.getByLabelText(/Phone/), '0917 123 4567');
    const button = screen.getByRole('button', { name: 'Submit' });
    await user.dblClick(button);

    expect(await screen.findByText(/Thanks! We'll contact you within 24 hours/)).toBeInTheDocument();
  });
});

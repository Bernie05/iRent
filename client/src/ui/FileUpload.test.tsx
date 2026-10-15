import { fireEvent } from '@testing-library/react';
import { FileUpload } from './FileUpload';
import { renderWithApp } from '../test/utils';

function makeFile(name: string, type: string, size: number): File {
  const file = new File([new Uint8Array(size)], name, { type });
  return file;
}

describe('FileUpload (F3)', () => {
  it('accepts a valid image under 5MB', () => {
    const onChange = vi.fn();
    const { getByLabelText } = renderWithApp(<FileUpload label="Payment screenshot" value={null} onChange={onChange} />);
    const input = getByLabelText('Payment screenshot', { selector: 'input' }) as HTMLInputElement;
    const file = makeFile('proof.png', 'image/png', 1024);
    fireEvent.change(input, { target: { files: [file] } });
    expect(onChange).toHaveBeenCalledWith(file);
  });

  it('rejects a file over 5MB and shows the error without calling onChange with it', () => {
    const onChange = vi.fn();
    const { getByLabelText, getByRole } = renderWithApp(<FileUpload label="Payment screenshot" value={null} onChange={onChange} />);
    const input = getByLabelText('Payment screenshot', { selector: 'input' }) as HTMLInputElement;
    const big = makeFile('proof.png', 'image/png', 6 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [big] } });
    expect(onChange).toHaveBeenCalledWith(null);
    expect(getByRole('alert')).toHaveTextContent('The file must be a JPG, PNG or WebP image under 5 MB.');
  });

  it('uses the invalidKey message when given (payment screenshot)', () => {
    const { getByLabelText, getByRole } = renderWithApp(
      <FileUpload label="Payment screenshot" value={null} onChange={vi.fn()} invalidKey="validation:screenshotInvalid" />,
    );
    const input = getByLabelText('Payment screenshot', { selector: 'input' }) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('p.pdf', 'application/pdf', 1024)] } });
    expect(getByRole('alert')).toHaveTextContent('The screenshot must be a JPG, PNG or WebP image under 5 MB.');
  });

  it('rejects a non-image file type', () => {
    const onChange = vi.fn();
    const { getByLabelText, getByRole } = renderWithApp(<FileUpload label="Payment screenshot" value={null} onChange={onChange} />);
    const input = getByLabelText('Payment screenshot', { selector: 'input' }) as HTMLInputElement;
    const pdf = makeFile('proof.pdf', 'application/pdf', 1024);
    fireEvent.change(input, { target: { files: [pdf] } });
    expect(onChange).toHaveBeenCalledWith(null);
    expect(getByRole('alert')).toBeInTheDocument();
  });
});

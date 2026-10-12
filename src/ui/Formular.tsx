import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { klassen } from './klassen';

export type TextfeldProps = InputHTMLAttributes<HTMLInputElement>;

/** Einzeiliges Feld (32 px, Rand #DAD6CF, Radius 6). */
export const Textfeld = forwardRef<HTMLInputElement, TextfeldProps>(function Textfeld({ className, type = 'text', ...rest }, ref) {
  return <input ref={ref} type={type} className={klassen('pw-textfeld', className)} {...rest} />;
});

export type TextbereichProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textbereich = forwardRef<HTMLTextAreaElement, TextbereichProps>(function Textbereich({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={klassen('pw-textbereich', className)} {...rest} />;
});

export interface FeldProps {
  /** sichtbares Label (12 px, ink-quiet) */
  label: ReactNode;
  /** bekommt die id für das Label */
  children: (id: string) => ReactNode;
  className?: string;
}

/** Label über einem Eingabefeld: <Feld label="Titel">{(id) => <Textfeld id={id} />}</Feld> */
export function Feld({ label, children, className }: FeldProps) {
  const id = useId();
  return (
    <div className={klassen('pw-feld', className)}>
      <label htmlFor={id} className="pw-feld__label">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

export interface AuswahlProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children: ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, AuswahlProps>(function Radio({ children, className, ...rest }, ref) {
  return (
    <label className={klassen('pw-auswahl', className)}>
      <input ref={ref} type="radio" {...rest} /> {children}
    </label>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, AuswahlProps>(function Checkbox({ children, className, ...rest }, ref) {
  return (
    <label className={klassen('pw-auswahl', className)}>
      <input ref={ref} type="checkbox" {...rest} /> {children}
    </label>
  );
});

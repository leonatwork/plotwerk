import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { klassen } from './klassen';

export type ButtonVariante = 'primaer' | 'sekundaer' | 'text' | 'leise' | 'gestrichelt';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primaer: ink gefüllt · sekundaer: weiß mit Rand · text: Link-Farbe („+ Eigenes Feld“) · leise: grau („+ Kapitel planen“) · gestrichelt: „+ Szene planen“ */
  variante?: ButtonVariante;
  /** klein = 26 px statt 30 px */
  klein?: boolean;
  breit?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variante = 'sekundaer', klein, breit, icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={klassen('pw-button', `pw-button--${variante}`, klein && 'pw-button--klein', breit && 'pw-button--breit', className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

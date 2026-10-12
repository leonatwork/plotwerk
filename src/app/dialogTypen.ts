/** Props, die jeder Feature-Dialog (default export) von src/app/dialoge.tsx bekommt. */
export interface DialogKomponentenProps {
  /** Parameter aus oeffneDialog(id, param) */
  param?: unknown;
  /** Dialog schließen (= store.schliesseDialog) */
  schliessen(): void;
}

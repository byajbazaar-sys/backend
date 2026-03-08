/** Configuration for a PDF table column */
export interface IPdfColumnConfig {
  /** Header label */
  header: string;
  /** Property path (e.g. 'id', 'customer.firstName') */
  key: string;
  /** Column width in points (optional) */
  width?: number;
  /** Formatter function for cell values */
  formatter?: (value: unknown) => string;
}

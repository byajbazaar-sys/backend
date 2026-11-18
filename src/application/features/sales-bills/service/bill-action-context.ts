/** Who did an operation and from where, for the bill history. */
export interface BillActionContext {
  performedBy?: string;
  /** web | mobile | api */
  channel?: string;
}

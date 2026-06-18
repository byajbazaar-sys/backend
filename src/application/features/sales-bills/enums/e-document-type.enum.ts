export enum EDocumentType {
  NormalBill = 'NORMAL_BILL',
  InformalBill = 'INFORMAL_BILL',
}

export const BILL_NUMBER_PREFIX: Record<EDocumentType, string> = {
  [EDocumentType.NormalBill]: 'INV',
  [EDocumentType.InformalBill]: 'INF',
};

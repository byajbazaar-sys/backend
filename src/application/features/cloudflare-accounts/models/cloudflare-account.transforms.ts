export const trimValue = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export interface LabelDesignerSettingsResponse {
  schemaVersion: number;
  templates: Record<string, unknown>[];
  printerProfiles: Record<string, unknown>[];
}

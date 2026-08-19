export class AppIntegrityOptions {
  constructor(
    public readonly googleCloudProjectNumber: string,
    public readonly androidPackageName: string,
    public readonly appleBundleId: string,
    public readonly appleTeamId: string,
    public readonly allowDevelopmentEnvironment: boolean,
    public readonly serviceAccountJson: string,
    public readonly serviceAccountSsmPath: string,
  ) {}

  get playIntegrityReady(): boolean {
    return Boolean(
      this.androidPackageName && (this.serviceAccountJson || this.serviceAccountSsmPath),
    );
  }

  get appAttestReady(): boolean {
    return Boolean(this.appleBundleId && this.appleTeamId);
  }
}

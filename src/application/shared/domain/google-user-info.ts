import { Expose } from 'class-transformer';

export class GoogleUserInfo {
  @Expose()
  public sub: string; // Google user ID

  @Expose()
  public email: string;

  @Expose()
  public aud: string; // Audience (client ID)

  @Expose()
  public iss: string; // Issuer

  @Expose()
  public exp?: number; // Expiration time

  @Expose()
  public iat?: number; // Issued at time

  @Expose()
  public given_name?: string;

  @Expose()
  public family_name?: string;

  @Expose()
  public picture?: string;

  @Expose()
  public email_verified?: boolean;
}

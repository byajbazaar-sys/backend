import { Expose } from 'class-transformer';

export class GoogleTokenResponse {
  @Expose()
  public access_token: string;

  @Expose()
  public token_type: string;

  @Expose()
  public expires_in: number;

  @Expose()
  public refresh_token?: string;

  @Expose()
  public id_token: string;

  @Expose()
  public scope?: string;
}

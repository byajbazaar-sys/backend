import { MigrationInterface, QueryRunner } from 'typeorm';
import { hashSync } from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared-libs';
import { SYSTEM_USER_ID } from '@shared-libs';

export class InsertSystemUser1730880000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const systemPasswordHash = hashSync('SystemUser@Secure1', BCRYPT_SALT_ROUNDS);
    await queryRunner.query(
      `INSERT INTO "users" ("id", "email", "password", "first_name", "last_name", "user_type", "is_email_verified")
       VALUES ($1, 'system@crowdsay.com', $2, 'System', 'User', 'admin', true)
       ON CONFLICT (id) DO NOTHING`,
      [SYSTEM_USER_ID, systemPasswordHash],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "users" WHERE "id" = $1`, [SYSTEM_USER_ID]);
  }
}

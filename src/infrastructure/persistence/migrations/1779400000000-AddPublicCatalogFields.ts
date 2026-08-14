import { buildCatalogSlug } from '@shared-libs';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublicCatalogFields1779400000000 implements MigrationInterface {
  name = 'AddPublicCatalogFields1779400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "catalog_slug" varchar(255),
        ADD COLUMN IF NOT EXISTS "catalog_enabled" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_catalog_slug"
        ON "users" ("catalog_slug")
        WHERE "catalog_slug" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD COLUMN IF NOT EXISTS "is_catalog_visible" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_items_catalog_visible"
        ON "inventory_items" ("created_by", "is_catalog_visible")
    `);

    const existingSlugRows: { catalog_slug: string }[] = await queryRunner.query(`
      SELECT "catalog_slug" FROM "users" WHERE "catalog_slug" IS NOT NULL
    `);
    const usedSlugs = new Set(existingSlugRows.map((r) => r.catalog_slug));

    const rows: { id: string; business_name: string | null }[] = await queryRunner.query(`
      SELECT "id", "business_name"
      FROM "users"
      WHERE "business_name" IS NOT NULL
        AND TRIM("business_name") <> ''
        AND "catalog_slug" IS NULL
      ORDER BY "created_at" ASC
    `);

    for (const row of rows) {
      const slug = buildCatalogSlug(row.business_name);
      if (!slug) continue;
      if (usedSlugs.has(slug)) continue;
      usedSlugs.add(slug);
      await queryRunner.query(`UPDATE "users" SET "catalog_slug" = $1 WHERE "id" = $2`, [slug, row.id]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_items_catalog_visible"`);
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "is_catalog_visible"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_catalog_slug"`);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "catalog_enabled",
        DROP COLUMN IF EXISTS "catalog_slug"
    `);
  }
}

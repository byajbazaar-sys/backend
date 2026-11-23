import { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreMetalRateOnSalesBillItems1795000000003 implements MigrationInterface {
  name = 'StoreMetalRateOnSalesBillItems1795000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bill_items"
      ADD COLUMN IF NOT EXISTS "rate_per_gram" numeric(12, 2)
    `);
    await queryRunner.query(`
      WITH bill_line_rates AS (
        SELECT
          line.id,
          bill.metal_rates,
          CASE
            WHEN upper(btrim(COALESCE(line.metal_type, ''))) IN ('GOLD', 'SILVER') THEN
              CASE
                WHEN NULLIF(btrim(COALESCE(line.purity, '')), '') IS NOT NULL
                  THEN upper(btrim(line.metal_type)) || ':' || upper(btrim(line.purity))
                ELSE NULL
              END
            ELSE NULLIF(upper(btrim(COALESCE(line.metal_type, ''))), '')
          END AS rate_key,
          CASE
            WHEN line.net_weight > 0 AND line.selling_price > 0
              THEN (line.selling_price - COALESCE(line.making_charges, 0)) / line.net_weight
            ELSE NULL
          END AS inferred_rate_per_gram,
          COALESCE(line.rate_per_gram_cleared, false) AS rate_was_cleared
        FROM "sales_bill_items" line
        INNER JOIN "sales_bills" bill ON bill.id = line.bill_id
      )
      UPDATE "sales_bill_items" line
      SET "rate_per_gram" = COALESCE(
        bill_line_rates.inferred_rate_per_gram,
        (bill_line_rates.metal_rates ->> bill_line_rates.rate_key)::numeric
      )
      FROM bill_line_rates
      WHERE line.id = bill_line_rates.id
        AND line.rate_per_gram IS NULL
        AND bill_line_rates.rate_was_cleared = false
        AND bill_line_rates.rate_key IS NOT NULL
        AND jsonb_typeof(bill_line_rates.metal_rates -> bill_line_rates.rate_key) = 'number'
    `);
    await queryRunner.query(`ALTER TABLE "sales_bill_items" DROP COLUMN IF EXISTS "rate_per_gram_cleared"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bill_items"
      ADD COLUMN IF NOT EXISTS "rate_per_gram_cleared" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE "sales_bill_items"
      SET "rate_per_gram_cleared" = true
      WHERE "rate_per_gram" IS NULL
    `);
    await queryRunner.query(`ALTER TABLE "sales_bill_items" DROP COLUMN IF EXISTS "rate_per_gram"`);
  }
}

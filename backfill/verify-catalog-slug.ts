/**
 * Verifies catalog slug utilities and duplicate-slug policy helpers.
 * Run: npm run verify:catalog
 */
import {
  buildCatalogSlug,
  CATALOG_SLUG_TAKEN_MESSAGE,
  isValidCatalogSlug,
  sanitizeCatalogSlugParam,
} from '../libs/catalog/catalog-slug.util';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${message}`);
}

assert(buildCatalogSlug('Shri R.K. Jewellers') === 'shri-rk-jewellers', 'slug from business name');
assert(buildCatalogSlug('') === '', 'empty business name');
assert(isValidCatalogSlug('shri-rk-jewellers'), 'valid slug');
assert(!isValidCatalogSlug('Bad Slug'), 'invalid slug with space');
assert(sanitizeCatalogSlugParam('Shri-RK') === 'shri-rk', 'sanitize param lowercases');
assert(sanitizeCatalogSlugParam('../etc') === null, 'reject unsafe slug');
assert(
  CATALOG_SLUG_TAKEN_MESSAGE.includes('unique business name'),
  'duplicate slug message is user-friendly',
);

console.log(`verify:catalog — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

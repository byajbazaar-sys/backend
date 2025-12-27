// eslint.config.mjs
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginUnusedImports from 'eslint-plugin-unused-imports';

export default [
  // Base JS rules
  js.configs.recommended,

  // TypeScript + ESLint recommended
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Apply Prettier last to disable conflicting rules
  prettierConfig,

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      prettier: eslintPluginPrettier,
      import: eslintPluginImport,
      'unused-imports': eslintPluginUnusedImports,
    },
    rules: {
      // --- General Code Quality ---
      'no-console': [
        'warn',
        {
          allow: ['warn', 'error'],
        },
      ],
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'object-shorthand': ['error', 'always'],
      'arrow-body-style': ['error', 'as-needed'],
      'prefer-arrow-callback': 'error',

      // --- TypeScript-specific ---
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      // Relax strict boolean checks (too noisy without pervasive null checks)
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      // Relax unsafe "any"-related rules for DX
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/unbound-method': 'off',

      // --- Unused imports/vars ---
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // --- Import order ---
      'import/order': [
        'error',
        {
          groups: [['builtin', 'external'], ['internal'], ['parent', 'sibling', 'index']],
          pathGroups: [
            {
              pattern: '@nestjs/**',
              group: 'external',
              position: 'before',
            },
            {
              pattern: '@app/**',
              group: 'internal',
              position: 'after',
            },
          ],
          // pathGroupsExcludedImportTypes: ['builtin'],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          'newlines-between': 'always',
        },
      ],

      // --- Prettier formatting as ESLint rule ---
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          semi: true,
          trailingComma: 'all',
          arrowParens: 'always',
          tabWidth: 2,
          printWidth: 120,
          quoteProps: 'as-needed',
          jsxSingleQuote: false,
          jsxBracketSameLine: true,
        },
      ],
    },
  },

  // Ignore build artifacts and env files
  {
    ignores: ['dist/**', 'node_modules/**', '*.js', '*.d.ts', '*.map', '.turbo/**', '.next/**', '*.env', './src/infrastructure/persistence/migrations/*'],
  },
];

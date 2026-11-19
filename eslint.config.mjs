import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const BACKEND_LAYERS = [
  'backend-domain',
  'backend-application',
  'backend-infrastructure',
  'backend-core',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/*.config.ts',
      '**/*.config.mjs',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'shared', pattern: 'shared/src/**' },
        { type: 'backend-domain', pattern: 'backend/src/*/domain/**' },
        { type: 'backend-application', pattern: 'backend/src/*/application/**' },
        { type: 'backend-infrastructure', pattern: 'backend/src/*/infrastructure/**' },
        { type: 'backend-core', pattern: 'backend/src/**' },
        { type: 'frontend', pattern: 'frontend/src/**' },
        { type: 'tests', pattern: 'backend/test/**' },
        { type: 'e2e', pattern: 'e2e/**' },
      ],
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: 'shared',
              disallow: [...BACKEND_LAYERS, 'frontend', 'tests'],
            },
            {
              from: 'backend-domain',
              disallow: ['backend-application', 'backend-infrastructure', 'frontend', 'tests'],
            },
            {
              from: 'backend-application',
              disallow: ['backend-infrastructure', 'frontend', 'tests'],
            },
            {
              from: 'frontend',
              disallow: [...BACKEND_LAYERS, 'tests'],
            },
            {
              from: 'e2e',
              disallow: [...BACKEND_LAYERS, 'frontend', 'tests'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'backend/src/**/*.ts',
      'backend/test/**/*.ts',
      'shared/src/**/*.ts',
      'frontend/src/**/*.{ts,tsx}',
      'e2e/**/*.ts',
    ],
    extends: [tseslint.configs.recommendedTypeChecked],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  prettier,
);

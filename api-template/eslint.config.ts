import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import functional from 'eslint-plugin-functional';

export default [
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  functional.configs.recommended,
  {
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      'functional/no-class': 'error',
      'functional/no-this': 'error',
    },
  },
];

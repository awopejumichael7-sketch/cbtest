const browser = Object.fromEntries(['window', 'document', 'localStorage', 'navigator', 'location', 'console', 'alert', 'confirm', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'addEventListener', 'URL', 'Blob', 'FileReader', 'FormData', 'Response', 'fetch', 'Promise'].map(k => [k, 'readonly']));
const worker = { self: 'readonly', caches: 'readonly', Response: 'readonly', fetch: 'readonly', URL: 'readonly', location: 'readonly' };
export default [
  { ignores: ['node_modules/**'] },
  { files: ['**/*.js', '**/*.mjs'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...browser, ...worker, process: 'readonly' } },
    rules: { 'no-undef': 'error', eqeqeq: ['error', 'always', { null: 'ignore' }], 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] } },
  { files: ['eslint.config.js'], languageOptions: { sourceType: 'module' } }
];

// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
  },
}).append({
  ignores: ['tests/fixtures/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
})

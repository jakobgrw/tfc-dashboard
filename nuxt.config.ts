// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  typescript: {
    strict: true,
  },
  app: {
    head: {
      htmlAttrs: { lang: 'de' },
      title: 'TFC Insight',
    },
  },
})

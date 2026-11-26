// Fails fast at server start when the configuration is incomplete.
export default defineNitroPlugin(() => {
  try {
    useEnv()
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
})

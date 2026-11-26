import { expect, test } from '@playwright/test'

test('start page renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TFC Insight' })).toBeVisible()
  await expect(page).toHaveTitle('TFC Insight')
})

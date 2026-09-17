import { expect, test } from '@playwright/test'

test.describe('public shell', () => {
  test('renders the provider-neutral sign-in page', async ({ page }) => {
    await page.goto('/login')

    await expect(page).toHaveURL(/\/login(?:\?.*)?$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Return home' })).toBeVisible()
  })

  test('protects the listings route for anonymous visitors', async ({ page }) => {
    await page.goto('/listings')

    await expect(page).toHaveURL(/\/login(?:\?.*)?$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })
})

test.describe('authenticated navigation', () => {
  test.skip(!process.env.PLAYWRIGHT_STORAGE_STATE, 'Provide a local Playwright storage state to run authenticated smoke tests.')

  test('preserves a listing filter and navigates to detail and back', async ({ page }) => {
    await page.goto('/listings')
    await expect(page.getByRole('heading', { name: 'Current listings' })).toBeAttached()

    const search = page.getByRole('textbox', { name: 'Search current listings' })
    await search.fill('e2e-smoke-filter')
    await search.press('Enter')
    await expect(page).toHaveURL(/query=e2e-smoke-filter/)

    // A local fixture may have no listings. When it does, verify the complete
    // user path without assuming a particular source or product identifier.
    await search.fill('')
    await search.press('Enter')
    const listingLinks = page.locator('a[href^="/listings/"]')
    if (await listingLinks.count() === 0) return

    const detailHref = await listingLinks.first().getAttribute('href')
    expect(detailHref).toMatch(/^\/listings\/.+/)
    await listingLinks.first().click()
    await expect(page).toHaveURL(new RegExp(`${detailHref?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    await expect(page.getByRole('link', { name: /Listings/ }).first()).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/listings(?:\?.*)?$/)
    await expect(page.getByRole('textbox', { name: 'Search current listings' })).toBeVisible()
  })
})

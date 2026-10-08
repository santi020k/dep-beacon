import { expect, test } from '@playwright/test'

const routes = [
  '/',
  '/docs',
  '/docs/installation',
  '/docs/configuration',
  '/docs/vscode-extension',
  '/docs/zed-extension',
  '/docs/pnpm-workspaces',
  '/docs/security',
  '/404'
]

for (const theme of ['light', 'dark']) {
  for (const width of [320, 375, 768, 1440]) {
    test(`${theme} pages remain readable at ${width}px`, async ({ page }) => {
      const errors: string[] = []

      page.on('pageerror', error => errors.push(error.message))

      await page.setViewportSize({ height: 900, width })

      await page.addInitScript(value => { localStorage.setItem('dep-beacon-theme', value); }, theme)

      for (const route of routes) {
        await page.goto(route)

        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

        const overflow = await page.evaluate(() => (
          document.documentElement.scrollWidth - document.documentElement.clientWidth
        ))

        expect(overflow, `${route} overflows at ${width}px in ${theme}`).toBeLessThanOrEqual(1)

        for (const link of await page.locator('a[target="_blank"]').all()) {
          await expect(link).toHaveAttribute('rel', /noopener/)

          await expect(link).toHaveAttribute('rel', /noreferrer/)
        }
      }

      expect(errors).toEqual([])
    })
  }
}

test('mobile navigation closes with Escape, restores focus, and survives page swaps', async ({ page }) => {
  await page.setViewportSize({ height: 812, width: 375 })

  await page.goto('/')

  const trigger = page.getByRole('button', { name: 'Open page navigation' })
  const menu = page.getByRole('dialog', { name: 'Find your next step.' })

  await trigger.click()

  await expect(menu).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(menu).not.toBeVisible()

  await expect(trigger).toBeFocused()

  await trigger.click()

  await menu.getByRole('link', { name: 'Configuration', exact: true }).click()

  await expect(page).toHaveURL(/\/docs\/configuration\/?$/)

  await expect(menu).not.toBeVisible()

  await trigger.click()

  await expect(menu.getByRole('link', { name: 'Configuration', exact: true })).toHaveAttribute('aria-current', 'page')

  await menu.getByRole('button', { name: 'Close', exact: true }).click()

  await expect(trigger).toBeFocused()
})

test('theme and current navigation remain accurate after a client route change', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 })

  await page.addInitScript(() => { localStorage.setItem('dep-beacon-theme', 'light'); })

  await page.goto('/')

  await page.locator('header').getByRole('button', { name: 'Toggle color theme' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', {
    exact: true,
    name: 'Zed'
  }).click()

  await expect(page).toHaveURL(/\/docs\/zed-extension\/?$/)

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', {
    exact: true,
    name: 'Zed'
  })).toHaveAttribute('aria-current', 'page')

  await page.keyboard.press('Tab')

  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
})

test('editor examples support keyboard selection and keep the preference after navigation', async ({ page }) => {
  await page.goto('/docs/configuration')

  const examples = page.getByRole('tablist', { name: 'Configuration by editor' })
  const vscode = examples.getByRole('tab', { name: 'VS Code', exact: true })
  const zed = examples.getByRole('tab', { name: 'Zed', exact: true })

  await vscode.focus()

  await page.keyboard.press('ArrowRight')

  await expect(zed).toBeFocused()

  await expect(zed).toHaveAttribute('aria-selected', 'true')

  await expect(page.getByRole('tabpanel', { name: 'Zed', exact: true })).toContainText('showUpdateDiagnostics')

  await page.reload()

  await expect(zed).toHaveAttribute('aria-selected', 'true')
})

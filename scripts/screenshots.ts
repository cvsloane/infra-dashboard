import { chromium } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SCREENSHOTS = [
  { name: 'dashboard-overview', path: '/', description: 'Main dashboard' },
  { name: 'coolify-deployments', path: '/coolify', description: 'Coolify deployments' },
  { name: 'queue-management', path: '/queues', description: 'BullMQ queues' },
  { name: 'postgres-metrics', path: '/postgres', description: 'PostgreSQL stats' },
]

async function takeScreenshots() {
  const outputDir = path.join(__dirname, '../docs/images')
  fs.mkdirSync(outputDir, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
  const password = process.env.DASHBOARD_PASSWORD

  // Login if password is set
  if (password) {
    console.log('Authenticating...')
    await page.goto(`${baseUrl}/login`)
    await page.waitForLoadState('networkidle')

    // Fill in password and submit
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')

    // Wait for redirect to dashboard
    await page.waitForURL(`${baseUrl}/`, { timeout: 10000 })
    console.log('Authenticated successfully')
  }

  // Wait for data to load on first page
  await page.waitForTimeout(2000)

  for (const screenshot of SCREENSHOTS) {
    try {
      await page.goto(`${baseUrl}${screenshot.path}`, { waitUntil: 'domcontentloaded' })
      // Wait for data to fully load (API calls, SSE updates, animations)
      await page.waitForTimeout(8000)
      await page.screenshot({
        path: path.join(outputDir, `${screenshot.name}.png`),
        fullPage: false
      })
      console.log(`Captured: ${screenshot.name}`)
    } catch (error) {
      console.error(`Failed to capture ${screenshot.name}:`, error)
    }
  }

  await browser.close()
  console.log('Screenshots complete!')
}

takeScreenshots()

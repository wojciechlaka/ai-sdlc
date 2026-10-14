import puppeteer from 'puppeteer'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const browser = await puppeteer.launch({ headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1700, height: 800, deviceScaleFactor: 2 })
await page.goto(`file://${path.join(__dirname, 'architecture-annotated.html')}`, { waitUntil: 'networkidle0' })

const height = await page.evaluate(() => document.body.scrollHeight)
await page.setViewport({ width: 1700, height, deviceScaleFactor: 2 })

await page.screenshot({
  path: path.join(__dirname, 'architecture-annotated.png'),
  fullPage: true,
})

await browser.close()
console.log('done')

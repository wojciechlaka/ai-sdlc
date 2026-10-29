import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openHookLog, parseToolEvent } from './hookLog'

describe('parseToolEvent', () => {
  it.each([
    ['{"kind":"used","tool":"Read","target":"a.ts","at":"x"}', { kind: 'used', tool: 'Read', target: 'a.ts' }],
    ['{"kind":"blocked","tool":"Bash","target":"rm x","reason":"nein"}', { kind: 'blocked', tool: 'Bash', target: 'rm x', reason: 'nein' }],
    ['{"kind":"used","tool":"Bash","target":"git status","exitCode":2}', { kind: 'used', tool: 'Bash', target: 'git status' }],
    ['{"kind":"other","tool":"Bash"}', null],
    ['{"kind":"used"}', null],
    ['kein json', null],
    ['', null],
  ])('parses %s', (line, expected) => {
    expect(parseToolEvent(line)).toEqual(expected)
  })
})

describe('openHookLog', () => {
  it('cleans up the log file and rethrows when it cannot be opened', async () => {
    const cleanup = vi.fn(async () => {})
    const missing = path.join(os.tmpdir(), `missing-hook-log-${process.pid}`, 'tools.jsonl')
    await expect(openHookLog({ path: missing, cleanup }, () => {})).rejects.toThrow(/ENOENT/)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('reports complete lines and cleans up on close', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-log-'))
    const file = path.join(dir, 'tools.jsonl')
    fs.writeFileSync(file, '')
    const cleanup = vi.fn(async () => fs.rmSync(dir, { recursive: true, force: true }))
    const events: unknown[] = []
    const log = await openHookLog({ path: file, cleanup }, (event) => events.push(event), 10)
    fs.appendFileSync(file, JSON.stringify({ kind: 'used', tool: 'Read', target: 'a' }) + '\n')
    await log.close()
    expect(events).toEqual([{ kind: 'used', tool: 'Read', target: 'a' }])
    expect(cleanup).toHaveBeenCalledOnce()
    expect(fs.existsSync(dir)).toBe(false)
  })
})

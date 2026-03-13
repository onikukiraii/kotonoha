import type { Handle } from '@sveltejs/kit'
import { initDb } from '$lib/db/index.js'
import { initOrCloneVault } from '$lib/server/git.js'
import { buildDifferentialIndex } from '$lib/server/indexer.js'
import { env } from '$lib/server/env.js'
import { gitPull } from '$lib/server/git.js'

let initialized = false
let autoPullTimer: ReturnType<typeof setInterval> | null = null

async function startup() {
  if (initialized) return
  initialized = true

  try {
    initDb()
    await initOrCloneVault()
    await buildDifferentialIndex()

    // Setup auto-pull
    if (env.AUTO_PULL_INTERVAL > 0) {
      autoPullTimer = setInterval(
        async () => {
          try {
            const result = await gitPull()
            if (result.updated) {
              await buildDifferentialIndex()
            }
          } catch (err) {
            console.error('Auto-pull failed:', err)
          }
        },
        env.AUTO_PULL_INTERVAL * 1000,
      )
    }

    console.log('kotonoha server initialized')
  } catch (err) {
    console.error('Startup error:', err)
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  await startup()
  return resolve(event)
}

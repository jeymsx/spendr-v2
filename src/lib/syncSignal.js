/**
 * Whether what is being written to this device's tables is the cloud's,
 * rather than yours.
 *
 * A pull writes rows into IndexedDB, and so does everything you do. The sync
 * that pushes your changes up has to be told about the second kind and must
 * never be told about the first, or a pull would start a push, whose echo
 * would start a pull, for ever. So the pull wraps its writes in
 * beginRemoteWrites / endRemoteWrites, and the watcher of local changes
 * (localChanges.js) stays quiet while any are open.
 *
 * A counter, not a flag, because a pull from the cloud and a pull for a
 * first sync can overlap in time.
 */

let open = 0

/** The cloud is about to write into this device's tables. */
export function beginRemoteWrites() {
  open += 1
}

/** The cloud is done writing. */
export function endRemoteWrites() {
  open = Math.max(0, open - 1)
}

/** Whether the writes happening now are the cloud's. */
export function isWritingRemote() {
  return open > 0
}

/**
 * Run something whose writes are the cloud's.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function asRemoteWrites(fn) {
  beginRemoteWrites()
  try {
    return await fn()
  } finally {
    endRemoteWrites()
  }
}

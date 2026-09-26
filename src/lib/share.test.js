// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Handing a picture over: the share sheet on a phone, a download elsewhere.
 *
 * The recap's picture goes out two ways. saveFile keeps it - the sheet only
 * on an iPhone, where "Save Image" lives in the sheet - and sendFile sends it
 * on, through the sheet on any phone that has one for files, because on
 * Android that is exactly where Instagram and the chats are. What the device
 * IS decides it (utils/platform), so that is what these vary.
 */

const platform = { ios: false, android: false }
vi.mock('../utils/platform', () => ({
  isIos: () => platform.ios,
  isAndroid: () => platform.android,
}))

const { canSendFiles, saveFile, sendFile } = await import('./share')

const blob = new Blob(['png'], { type: 'image/png' })
/** @type {import('vitest').Mock} */
let share
/** @type {import('vitest').Mock} */
let clicked

beforeEach(() => {
  platform.ios = false
  platform.android = false
  share = vi.fn(async () => {})
  clicked = vi.fn()
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
  URL.createObjectURL = vi.fn(() => 'blob:picture')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicked(this.download) })
})

afterEach(() => {
  vi.restoreAllMocks()
  delete navigator.share
  delete navigator.canShare
})

describe('sendFile', () => {
  it('opens the share sheet on an iPhone', async () => {
    platform.ios = true
    expect(await sendFile(blob, 'wrapped.png')).toBe('shared')
    expect(share).toHaveBeenCalledOnce()
    expect(share.mock.calls[0][0].files[0].name).toBe('wrapped.png')
    expect(clicked).not.toHaveBeenCalled()
  })

  it('opens the share sheet on Android too - that is where the apps to send it to are', async () => {
    platform.android = true
    expect(await sendFile(blob, 'wrapped.png')).toBe('shared')
    expect(share).toHaveBeenCalledOnce()
  })

  it('downloads on a desktop, even one whose browser has a share sheet', async () => {
    expect(await sendFile(blob, 'wrapped.png')).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
    expect(clicked).toHaveBeenCalledWith('wrapped.png')
  })

  it('takes a dismissed sheet as a decision, and does not download instead', async () => {
    platform.android = true
    share.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'AbortError' }))
    expect(await sendFile(blob, 'wrapped.png')).toBe('cancelled')
    expect(clicked).not.toHaveBeenCalled()
  })

  it('says so when the tap ran out before the sheet could open', async () => {
    platform.ios = true
    share.mockRejectedValueOnce(Object.assign(new Error('late'), { name: 'NotAllowedError' }))
    expect(await sendFile(blob, 'wrapped.png')).toBe('blocked')
    expect(clicked).not.toHaveBeenCalled()
  })

  it('falls back to a download on a phone whose sheet will not take files', async () => {
    platform.android = true
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true })
    expect(await sendFile(blob, 'wrapped.png')).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
  })
})

describe('saveFile', () => {
  it('keeps using the sheet only on an iPhone - on Android it downloads', async () => {
    platform.android = true
    expect(await saveFile(blob, 'wrapped.png')).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
  })
})

describe('canSendFiles', () => {
  it('is true on a phone whose sheet takes a picture', () => {
    platform.ios = true
    expect(canSendFiles()).toBe(true)
  })

  it('is false on a desktop, and on a phone without a sheet for files', () => {
    expect(canSendFiles()).toBe(false)
    platform.android = true
    delete navigator.canShare
    expect(canSendFiles()).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import {
  coolDaysFor, coolUntilFrom, readyAt, isReady, daysToGo, daysWaited, sortWishes, readyCount,
  keptTotal, cleanLink, readShared, wishBody, ASK_HOUR,
} from './wishes'

/** @param {number} y @param {number} m @param {number} d @param {number} [h] */
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h)

describe('how long a wish waits', () => {
  it('follows the price: a day for small things, a week for most, a month for big ones', () => {
    expect(coolDaysFor(350, 'PHP')).toBe(1)
    expect(coolDaysFor(999.99, 'PHP')).toBe(1)
    expect(coolDaysFor(1000, 'PHP')).toBe(7)
    expect(coolDaysFor(8990, 'PHP')).toBe(7)
    expect(coolDaysFor(10000, 'PHP')).toBe(30)
    expect(coolDaysFor(65000, 'PHP')).toBe(30)
  })

  it('compares another currency in pesos when there is a rate', () => {
    const rates = { base: 'PHP', rates: { PHP: 1, USD: 1 / 58 } }
    expect(coolDaysFor(25, 'USD', rates)).toBe(7)     // about ₱1,450
    expect(coolDaysFor(400, 'USD', rates)).toBe(30)   // about ₱23,200
  })

  it('ends on a day, counted from today', () => {
    expect(coolUntilFrom(7, at(2026, 10, 13))).toBe('2026-10-20')
    expect(coolUntilFrom(30, at(2026, 10, 13))).toBe('2026-11-12')
    expect(coolUntilFrom(1, at(2026, 12, 31))).toBe('2027-01-01')
  })

  it('asks at 9 that morning, like every other reminder', () => {
    const r = readyAt({ coolUntil: '2026-10-20' })
    expect([r.getFullYear(), r.getMonth(), r.getDate(), r.getHours()]).toEqual([2026, 9, 20, ASK_HOUR])
  })
})

describe('where a wish is', () => {
  const wish = { name: 'Earbuds', price: 8990, status: /** @type {const} */ ('waiting'), coolUntil: '2026-10-20', createdAt: at(2026, 10, 13).toISOString() }

  it('is ready from 9 on its day, and not before', () => {
    expect(isReady(wish, at(2026, 10, 20, 8))).toBe(false)
    expect(isReady(wish, at(2026, 10, 20, 9))).toBe(true)
    expect(isReady({ ...wish, status: 'skipped' }, at(2026, 10, 25))).toBe(false)
  })

  it('counts the days to go and the days waited in whole days', () => {
    expect(daysToGo(wish, at(2026, 10, 13, 23))).toBe(7)
    expect(daysToGo(wish, at(2026, 10, 19, 1))).toBe(1)
    expect(daysToGo(wish, at(2026, 10, 22))).toBe(0)
    expect(daysWaited(wish, at(2026, 10, 20, 9))).toBe(7)
    expect(daysWaited({ ...wish, decidedAt: at(2026, 10, 15).toISOString() }, at(2026, 11, 1))).toBe(2)
  })

  it('sorts into ready (longest wait first), cooling (soonest first) and decided (latest first)', () => {
    const now = at(2026, 10, 21)
    const list = [
      { ...wish, id: 1, coolUntil: '2026-10-25' },
      { ...wish, id: 2, coolUntil: '2026-10-19' },
      { ...wish, id: 3, coolUntil: '2026-10-21' },
      { ...wish, id: 4, coolUntil: '2026-10-22' },
      { ...wish, id: 5, status: 'skipped', decidedAt: '2026-10-10T00:00:00Z' },
      { ...wish, id: 6, status: 'bought', decidedAt: '2026-10-12T00:00:00Z' },
    ]
    const { ready, cooling, decided } = sortWishes(/** @type {any} */ (list), now)
    expect(ready.map(w => w.id)).toEqual([2, 3])
    expect(cooling.map(w => w.id)).toEqual([4, 1])
    expect(decided.map(w => w.id)).toEqual([6, 5])
    expect(readyCount(/** @type {any} */ (list), now)).toBe(2)
  })

  it('counts what skipping kept, in the ledger currency', () => {
    const list = [
      { price: 4500, status: 'skipped', currency: 'PHP' },
      { price: 10, status: 'skipped', currency: 'USD' },
      { price: 9000, status: 'bought', currency: 'PHP' },
      { price: 700, status: 'waiting', currency: 'PHP' },
    ]
    const rates = { base: 'PHP', rates: { PHP: 1, USD: 1 / 58 } }
    expect(keptTotal(/** @type {any} */ (list), 'PHP', rates)).toBeCloseTo(4500 + 580, 5)
  })

  it('says the price and how long it was parked, for the bell and the push', () => {
    expect(wishBody({ ...wish, currency: 'PHP' }, at(2026, 10, 20, 9))).toBe('₱8,990.00, parked 7 days ago')
    expect(wishBody({ ...wish, currency: 'PHP' }, at(2026, 10, 13, 9))).toBe('₱8,990.00')
  })
})

describe('a pasted link', () => {
  it('keeps web addresses only, and adds the scheme a bare one lacks', () => {
    expect(cleanLink('https://shopee.ph/x-i.1.2')).toBe('https://shopee.ph/x-i.1.2')
    expect(cleanLink('shopee.ph/x-i.1.2')).toBe('https://shopee.ph/x-i.1.2')
    expect(cleanLink('javascript:alert(1)')).toBeNull()
    expect(cleanLink('just some words')).toBeNull()
    expect(cleanLink('')).toBeNull()
  })

  it('finds the address inside a shop app\'s share text', () => {
    const shared = readShared('Check out Apple AirPods Pro (2nd gen) for ₱8,990.00. Get it on Shopee now! https://shp.ee/abc123')
    expect(shared).toEqual({ link: 'https://shp.ee/abc123', name: 'Apple AirPods Pro (2nd gen)', price: 8990 })
  })

  it('reads a name from a shop address when it carries one', () => {
    expect(readShared('https://shopee.ph/Logitech-MX-Master-3S-Mouse-i.123.456').name).toBe('Logitech MX Master 3S Mouse')
    expect(readShared('https://www.lazada.com.ph/products/xiaomi-redmi-buds-5-i4021-s1844.html').name).toBe('Xiaomi Redmi Buds 5')
    expect(readShared('https://www.amazon.com/Kindle-Paperwhite-Signature-Edition/dp/B0CFP')).toMatchObject({ name: 'Kindle Paperwhite Signature Edition', price: null })
  })

  it('takes the words ahead of the link in other shops\' share lines', () => {
    expect(readShared('I found this on Lazada: Xiaomi Redmi Buds 5 ₱1,299 https://s.lazada.com.ph/s.abc'))
      .toEqual({ link: 'https://s.lazada.com.ph/s.abc', name: 'Xiaomi Redmi Buds 5', price: 1299 })
    expect(readShared('Nike Pegasus 41 - https://www.nike.com/t/abc').name).toBe('Nike Pegasus 41')
  })

  it('leaves the name to you when the address says nothing', () => {
    expect(readShared('https://shp.ee/abc123')).toEqual({ link: 'https://shp.ee/abc123', name: '', price: null })
  })

  it('does not take a model name for a price', () => {
    expect(readShared('Check out Galaxy Buds P2 for ₱3,499 https://shp.ee/x').price).toBe(3499)
    expect(readShared('Galaxy Buds P2 https://shp.ee/x').price).toBeNull()
  })
})

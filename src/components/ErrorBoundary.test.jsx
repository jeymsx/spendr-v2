// @vitest-environment jsdom
/**
 * The crash screen: plain words for everybody, and the error's own message
 * and the way to send it only on the developer's device (lib/developer.js).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

function Boom() {
  throw new Error('Cannot read properties of undefined (reading "balance")')
}

beforeEach(() => {
  localStorage.clear()
  // React logs the error it is about to catch; the test has no use for it.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('ErrorBoundary', () => {
  it('tells an ordinary user their data is safe and offers to try again, and nothing technical', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText(/Your data is safe/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeTruthy()
    expect(screen.queryByText(/Cannot read properties/)).toBeNull()
    expect(screen.queryByText(/Send error details/)).toBeNull()
  })

  it('shows the developer the error and the way to send it', () => {
    localStorage.setItem('spendr-developer', '1')
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText(/Cannot read properties/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send error details' })).toBeTruthy()
  })
})

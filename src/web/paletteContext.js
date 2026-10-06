import { createContext, useContext } from 'react'

/**
 * The command palette's context, in a module of its own (CommandPalette.jsx
 * has the provider), for the reason addFlowContext.js gives: beside the
 * components it could not be Fast Refreshed, and an edit made a second one.
 */
export const PaletteContext = createContext({ openPalette: (/** @type {string} */ _q = '') => {} })
export const usePalette = () => useContext(PaletteContext)

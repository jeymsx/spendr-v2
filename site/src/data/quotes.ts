/**
 * What people have said about Spendr, in their own words, with their
 * permission. Empty until there are real ones: the home page shows the
 * "What people are saying" section only when this has something in it.
 *
 * { text: 'The quote, as they wrote it', name: 'Their name', where: 'optional: city, or where they said it' }
 */
export interface Quote { text: string; name: string; where?: string }

export const quotes: Quote[] = []

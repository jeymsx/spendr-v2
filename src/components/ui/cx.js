/**
 * Join class names, dropping anything falsy.
 *
 * Small enough not to be worth a dependency, and deliberately NOT a
 * tailwind-merge: nothing here resolves conflicts between two classes that
 * set the same property. The primitives own their colour, shape, press and
 * disabled states outright, and callers pass only layout - so a conflict
 * means a caller is reaching for something the variant should own, and it
 * should be visible rather than silently merged away.
 */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export default cx

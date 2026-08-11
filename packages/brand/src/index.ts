/**
 * Every user-facing string, color and URL of the product lives here.
 *
 * Rebranding this fork means editing this file — not grepping the app for
 * hardcoded names. `apps/editor` reads `brand` for page metadata and the
 * copilot UI reads `brand.copilot` for its labels.
 */

export type BrandColors = {
  /** Primary accent — copilot affordances, active states. */
  accent: string
  /** Accent for surfaces the accent sits on. */
  accentForeground: string
  /** Tint used while the agent is working. */
  working: string
  /** Tool call succeeded. */
  success: string
  /** Tool call failed or validation found an error. */
  danger: string
}

export type BrandLinks = {
  website: string
  repository: string
  upstream: string
  docs: string
  issues: string
}

export type CopilotCopy = {
  /** Panel title. */
  title: string
  /** One-line description under the title on the empty state. */
  subtitle: string
  /** Placeholder in the composer. */
  placeholder: string
  /** Shown when no provider key is configured. */
  missingKey: string
  /** Shown while the agent is thinking, before the first tool call. */
  thinking: string
  /** Example prompts on the empty state. */
  suggestions: string[]
}

export type Brand = {
  /** Product name, as shown to users. */
  name: string
  /** Lowercase machine-safe id: package scopes, storage keys, env prefixes. */
  id: string
  tagline: string
  description: string
  /** Emoji or short glyph used where a full logo does not fit. */
  mark: string
  /** Path to the logo inside `apps/editor/public`, or null to fall back to `mark`. */
  logo: string | null
  favicon: string
  colors: BrandColors
  links: BrandLinks
  copilot: CopilotCopy
  /** Attribution that must stay visible — see LICENSE. */
  attribution: {
    upstreamName: string
    upstreamUrl: string
    upstreamCopyright: string
    license: string
  }
}

export const brand: Brand = {
  name: 'Modela',
  id: 'modela',
  tagline: 'Architecture, designed by conversation',
  description:
    'An architectural 3D editor with an AI copilot that operates the scene directly — from text, images and your current selection.',
  mark: '◱',
  logo: null,
  favicon: '/favicon.ico',

  colors: {
    accent: '#2563eb',
    accentForeground: '#ffffff',
    working: '#8b5cf6',
    success: '#10b981',
    danger: '#ef4444',
  },

  links: {
    website: 'https://github.com/luismellizo/modela',
    repository: 'https://github.com/luismellizo/modela',
    upstream: 'https://github.com/pascalorg/editor',
    docs: 'https://github.com/luismellizo/modela/tree/main/docs',
    issues: 'https://github.com/luismellizo/modela/issues',
  },

  copilot: {
    title: 'Copilot',
    subtitle: 'Describe what you want to build. I work directly on the scene.',
    placeholder: 'Describe a space, a change, or drop a floor plan…',
    missingKey:
      'No AI provider configured. Add OPENROUTER_API_KEY to .env.local and restart the dev server.',
    thinking: 'Thinking…',
    suggestions: [
      'Design a 180 m² house on a 10 × 25 m lot with 3 bedrooms and 2 baths',
      'Add a window on the north wall of the living room',
      'What would you improve about this layout?',
    ],
  },

  attribution: {
    upstreamName: 'Pascal Editor',
    upstreamUrl: 'https://github.com/pascalorg/editor',
    upstreamCopyright: 'Copyright (c) 2026 Pascal Group Inc.',
    license: 'MIT',
  },
}

/** Page metadata for the Next.js app. */
export const brandMetadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: brand.description,
  applicationName: brand.name,
} as const

export default brand

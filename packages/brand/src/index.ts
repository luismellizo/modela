/**
 * Every user-facing string, color and URL of the product lives here.
 *
 * Rebranding this fork means editing this file — not grepping the app for
 * hardcoded names. `apps/editor` reads `brand` for page metadata and the
 * assistant UI reads `brand.assistant` for its labels.
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

export type AssistantCopy = {
  /** Panel title — the assistant's name, not the product's. */
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
  assistant: AssistantCopy
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

  assistant: {
    title: 'Estudio',
    subtitle: 'Describe lo que quieres construir. Trabajo directamente sobre la escena.',
    placeholder: 'Describe un espacio, un cambio, o suelta un plano…',
    missingKey:
      'Falta configurar el proveedor de IA. Añade OPENROUTER_API_KEY a .env.local y reinicia el servidor.',
    thinking: 'Pensando…',
    suggestions: [
      'Diseña una casa de 180 m² en un lote de 10 × 25 m con 3 habitaciones y 2 baños',
      'Añade una ventana en el muro norte de la sala',
      '¿Qué mejorarías de esta distribución?',
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

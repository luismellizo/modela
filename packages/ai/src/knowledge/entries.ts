import type { KnowledgeEntry } from './types'

/**
 * The starting reference set.
 *
 * Every entry states its `basis` so the agent can attribute a number instead of
 * asserting it. These are conventions in common residential practice — not code
 * requirements. See `types.ts` for why that distinction is load-bearing.
 */

const CONVENTION = 'Common residential practice; not a code requirement'

export const KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  {
    id: 'bedroom-size',
    topics: ['bedroom', 'dormitorio', 'habitación', 'room size', 'sleeping'],
    region: 'general',
    spaceType: 'bedroom',
    guidance:
      'A secondary bedroom works from about 9 m² with a 2.5 m short side — enough for a double bed, circulation on one side and a wardrobe. Below that the bed starts dictating everything else.',
    dimensions: {
      minimumSqM: 7.5,
      comfortableSqM: 11,
      minWidthM: 2.5,
      typicalRatio: '1:1.2 to 1:1.5',
      notes: 'Allow 60–70 cm of clear circulation along at least one side of the bed.',
    },
    adjacency: [
      { with: 'bathroom', reason: 'Short night-time route, ideally without crossing living space' },
    ],
    basis: CONVENTION,
  },
  {
    id: 'main-bedroom-size',
    topics: ['main bedroom', 'master bedroom', 'principal', 'suite'],
    region: 'general',
    spaceType: 'bedroom-main',
    guidance:
      'A main bedroom is comfortable from about 14 m², and from roughly 16 m² it absorbs a walk-in wardrobe or a small sitting corner without feeling tight.',
    dimensions: {
      minimumSqM: 11,
      comfortableSqM: 16,
      minWidthM: 3,
      typicalRatio: '1:1.2',
      notes: 'Add 4–6 m² if an en-suite opens off it.',
    },
    adjacency: [
      { with: 'bathroom', reason: 'En-suite is the expectation in most residential briefs' },
    ],
    basis: CONVENTION,
  },
  {
    id: 'bathroom-size',
    topics: ['bathroom', 'baño', 'wc', 'toilet', 'shower'],
    region: 'general',
    spaceType: 'bathroom',
    guidance:
      'A full bathroom with WC, basin and shower fits from about 3.5 m², with 1.5 m of clear width. A WC-and-basin cloakroom works from about 1.6 m².',
    dimensions: {
      minimumSqM: 3.2,
      comfortableSqM: 5,
      minWidthM: 1.5,
      notes: 'A bath needs 1.7 m of run. Allow 60 cm of clear space in front of every fixture.',
    },
    basis: CONVENTION,
  },
  {
    id: 'kitchen-size',
    topics: ['kitchen', 'cocina', 'cooking', 'galley'],
    region: 'general',
    spaceType: 'kitchen',
    guidance:
      'A workable kitchen starts around 7 m². Between two facing counter runs leave 1.1–1.2 m: under 1 m two people cannot pass, over 1.5 m the work triangle stretches and everything takes more steps.',
    dimensions: {
      minimumSqM: 6,
      comfortableSqM: 12,
      minWidthM: 2.4,
      notes: 'Counters are 60 cm deep. An island needs 1 m of clearance on every used side.',
    },
    adjacency: [{ with: 'dining', reason: 'Carrying food is the most repeated trip in a home' }],
    basis: CONVENTION,
  },
  {
    id: 'living-size',
    topics: ['living', 'sala', 'lounge', 'sitting room'],
    region: 'general',
    spaceType: 'living',
    guidance:
      'A living room for four to five people works from about 16 m², comfortable around 22 m². Seating wants a 2.5–3 m conversation distance — much further and people raise their voices.',
    dimensions: {
      minimumSqM: 14,
      comfortableSqM: 22,
      minWidthM: 3.2,
      typicalRatio: '1:1.3',
    },
    adjacency: [
      { with: 'dining', reason: 'Open-plan living-dining is the common contemporary arrangement' },
    ],
    basis: CONVENTION,
  },
  {
    id: 'dining-size',
    topics: ['dining', 'comedor', 'dining table', 'eating'],
    region: 'general',
    spaceType: 'dining',
    guidance:
      'Six seats need about 10 m². The dimension that matters is 90–100 cm from table edge to wall: below that a chair cannot be pushed back and walked around.',
    dimensions: {
      minimumSqM: 8,
      comfortableSqM: 12,
      minWidthM: 2.8,
      notes: 'A six-seat table is roughly 1.6 × 0.9 m. Allow 60 cm of table edge per person.',
    },
    basis: CONVENTION,
  },
  {
    id: 'circulation-width',
    topics: ['corridor', 'hallway', 'pasillo', 'circulation', 'passage', 'width'],
    region: 'general',
    spaceType: 'hallway',
    guidance:
      'A single-person corridor works at 0.9 m and is comfortable at 1.1 m. Two people passing need about 1.2 m. Below 0.8 m it stops being circulation and becomes a squeeze.',
    dimensions: {
      minimumSqM: 0,
      comfortableSqM: 0,
      minWidthM: 0.9,
      notes: 'Add 10–15 cm where doors open into the corridor.',
    },
    basis: CONVENTION,
  },
  {
    id: 'door-sizes',
    topics: ['door', 'puerta', 'doorway', 'opening', 'door width'],
    region: 'general',
    guidance:
      'Interior doors are typically 0.8 m wide, main entrance doors 0.9 m, bathrooms sometimes 0.7 m. Standard height is 2.1 m. Use 0.9 m wherever wheelchair access matters.',
    basis: CONVENTION,
  },
  {
    id: 'window-sizes',
    topics: ['window', 'ventana', 'glazing', 'daylight', 'sill'],
    region: 'general',
    guidance:
      "A common rule of thumb is glazing of roughly 10–20% of a room's floor area for habitable spaces. Sills sit at 0.9–1.0 m in living areas and 1.2 m or higher in bathrooms and above kitchen counters.",
    basis: `${CONVENTION}. Minimum glazing ratios are regulated in many jurisdictions — check locally`,
  },
  {
    id: 'ceiling-height',
    topics: ['ceiling', 'height', 'altura', 'storey', 'floor to floor'],
    region: 'general',
    guidance:
      'Residential ceilings are commonly 2.4–2.7 m clear, with 2.5 m a frequent default. Floor-to-floor is usually 2.8–3.0 m once the slab and finishes are counted.',
    dimensions: {
      minimumSqM: 0,
      comfortableSqM: 0,
      minWidthM: 0,
      notes: 'Warm climates often go higher for stack ventilation.',
    },
    basis: `${CONVENTION}. Minimum heights are regulated in most jurisdictions`,
  },
  {
    id: 'garage-size',
    topics: ['garage', 'garaje', 'car', 'parking', 'carport'],
    region: 'general',
    spaceType: 'garage-double',
    guidance:
      'One car needs about 2.7 × 5.5 m to park and open a door. Two cars side by side need roughly 5.5 × 5.5 m — around 30 m². Add 0.6 m of depth for storage along the back.',
    dimensions: {
      minimumSqM: 15,
      comfortableSqM: 32,
      minWidthM: 2.7,
      notes: 'A single garage door is 2.4–2.6 m wide; a double is 4.8–5.0 m.',
    },
    basis: CONVENTION,
  },
  {
    id: 'stair-dimensions',
    topics: ['stair', 'escalera', 'steps', 'riser', 'tread'],
    region: 'general',
    guidance:
      'Comfortable residential stairs use a 17–18 cm riser with a 27–30 cm tread. A straight flight for a 2.8 m floor-to-floor is about 4.5 m long and 0.9–1.0 m wide.',
    basis: `${CONVENTION}. Riser and tread limits are regulated almost everywhere — check locally`,
  },
  {
    id: 'orientation-daylight',
    topics: ['orientation', 'daylight', 'sun', 'orientación', 'light', 'solar'],
    region: 'general',
    guidance:
      'In the northern hemisphere, south-facing rooms get the most daylight; in the southern hemisphere it is north-facing. Put living spaces and main bedrooms on the sunny side, and services — bathrooms, laundry, storage, garage — on the opposite one.',
    basis: 'Solar geometry; the hemisphere reverses the direction, so confirm which one applies',
  },
  {
    id: 'adjacency-programme',
    topics: ['adjacency', 'layout', 'zoning', 'programme', 'distribution', 'circulation'],
    region: 'general',
    guidance:
      'Common residential zoning separates day from night: entry, living, dining and kitchen together; bedrooms grouped away from them. Reaching a bedroom should not mean crossing the living room, and a guest WC belongs near the entry rather than among the bedrooms.',
    adjacency: [
      { with: 'kitchen-dining', reason: 'Most repeated daily trip' },
      { with: 'entry-guest-wc', reason: 'Visitors should not enter the private zone' },
      { with: 'laundry-service', reason: 'Keeps noise and damp out of living space' },
    ],
    basis: CONVENTION,
  },
  {
    id: 'latam-residential',
    topics: ['colombia', 'latam', 'latin america', 'tropical', 'clima cálido'],
    region: 'latam',
    guidance:
      'In warm Latin American climates, cross ventilation matters more than insulation: openings on opposite façades, higher ceilings (2.7–3.0 m), and deep eaves or terraces for shade. Covered outdoor space is often treated as primary living area rather than an extra.',
    basis: 'Regional practice in warm climates; local codes and customs vary by city',
  },
]

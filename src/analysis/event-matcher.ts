// Event canonicalization: group equivalent Polymarket and Kalshi markets
// into a single CanonicalEvent representing the same real-world bet.

import { Market, CanonicalEvent } from '../types/market';

/**
 * Normalize raw market title text into a comparable form by lowercasing,
 * stripping punctuation, and collapsing whitespace.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return a normalized signature string for a market, used as the basis
 * for similarity comparisons.
 */
export function getMarketSignature(market: Market): string {
  return normalizeText(market.title);
}

/**
 * Compute Jaccard similarity between two normalized strings by comparing
 * their word-level token sets.  Returns a value in [0, 1].
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Match Polymarket and Kalshi markets into CanonicalEvents.
 *
 * Each Polymarket market is greedily paired with the best-scoring Kalshi
 * market whose Jaccard similarity meets `threshold`.  Unmatched markets
 * from either platform are included as solo events.
 *
 * @param polymarket  - Array of Polymarket Market objects
 * @param kalshi      - Array of Kalshi Market objects
 * @param threshold   - Minimum Jaccard similarity to treat two markets as
 *                      the same underlying event (default: 0.55)
 */
export function matchEvents(
  polymarket: Market[],
  kalshi: Market[],
  threshold = 0.55,
): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const usedKalshi = new Set<string>();

  for (const poly of polymarket) {
    const polySig = getMarketSignature(poly);

    let bestMatch: { market: Market; score: number } | null = null;

    for (const k of kalshi) {
      if (usedKalshi.has(k.id)) continue;
      const score = jaccardSimilarity(polySig, getMarketSignature(k));
      if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { market: k, score };
      }
    }

    if (bestMatch) {
      usedKalshi.add(bestMatch.market.id);
    }

    events.push({
      id: `event-poly-${poly.id}`,
      title: poly.title,
      normalizedTitle: polySig,
      category: poly.category !== 'other' ? poly.category : undefined,
      markets: {
        polymarket: poly,
        ...(bestMatch ? { kalshi: bestMatch.market } : {}),
      },
    });
  }

  // Include Kalshi markets that were not matched to any Polymarket market.
  for (const k of kalshi) {
    if (usedKalshi.has(k.id)) continue;
    events.push({
      id: `event-kalshi-${k.id}`,
      title: k.title,
      normalizedTitle: getMarketSignature(k),
      category: k.category !== 'other' ? k.category : undefined,
      markets: { kalshi: k },
    });
  }

  return events;
}
import type { GameState } from '../simulation/types';
import type { ActionResult } from '../jobs/workflow';
import { postTransaction } from '../economy/ledger';

export const MARKETING_CHANNELS = [
  { id: 'localServicesAds', name: 'Google Local Services Ads', description: 'Pay-per-lead placement above search results. Strong intent, needs reviews.', costHint: '≈ $45 per lead' },
  { id: 'searchAds', name: 'Google Search Ads', description: 'Keyword ads. More volume, more tire-kickers.', costHint: '≈ $70 per lead' },
  { id: 'neighborhoodFlyers', name: 'Neighborhood Marketing', description: 'Door hangers, yard signs and mailers around recent jobs.', costHint: 'Slow build, boosts brand recognition' },
] as const;

export type MarketingChannelId = (typeof MARKETING_CHANNELS)[number]['id'];

export function setMarketingBudget(state: GameState, channel: MarketingChannelId, dailyBudget: number): ActionResult {
  const value = Math.max(0, Math.min(2000, Math.round(dailyBudget)));
  state.marketing[channel] = value;
  return { ok: true };
}

/** Posts the day's marketing spend and grows brand recognition. */
export function runDailyMarketing(state: GameState): void {
  const m = state.marketing;
  const spend = m.localServicesAds + m.searchAds + m.neighborhoodFlyers;
  if (spend > 0) {
    postTransaction(state, { amount: -spend, category: 'marketing', memo: 'Daily marketing spend' });
  }
  const wrapped = Object.values(state.vehicles).filter((v) => v.upgrades.includes('full-wrap')).length;
  const growth = m.neighborhoodFlyers / 150 + wrapped * 0.15 + Math.max(0, state.company.reputation - 4) * 0.3 - 0.25;
  m.brandRecognition = Math.max(0, Math.min(100, m.brandRecognition + growth));
}

export function updateCompetition(state: GameState): void {
  const playerCapacity = Object.values(state.employees).filter((e) => e.role === 'technician' || e.role === 'installer').length * 3;
  const playerStrength = Math.max(0.2, state.company.reputation - 2.5) * 1.2 + state.marketing.brandRecognition / 25 + (state.marketing.localServicesAds + state.marketing.searchAds) / 400 + playerCapacity * 0.08;
  const strengths = state.competitors.map((c) => Math.max(0.2, c.reputation - 2.5) * 1.2 + c.marketingBudget / 400 + c.capacity * 0.08);
  const total = playerStrength + strengths.reduce((s, x) => s + x, 0);
  const targetPlayer = playerStrength / total;
  state.company.marketShare = Math.round((state.company.marketShare * 0.85 + targetPlayer * 0.15) * 1000) / 1000;
  state.competitors.forEach((c, i) => {
    const target = strengths[i] / total;
    c.marketShare = Math.round((c.marketShare * 0.85 + target * 0.15) * 1000) / 1000;
    // Competitors drift: reputations wobble and marketing responds to lost share.
    c.reputation = Math.max(2.5, Math.min(4.9, c.reputation + (state.clock.day % 7 === i ? 0.05 : 0) - (state.clock.day % 11 === i ? 0.08 : 0)));
    if (c.marketShare < target - 0.02) c.marketingBudget = Math.min(3000, c.marketingBudget + 60);
  });
}

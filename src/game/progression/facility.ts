import type { GameState } from '../simulation/types';
import type { ActionResult } from '../jobs/workflow';
import { HQ_UPGRADES, type HqUpgradeId } from './hqUpgrades';
import { postTransaction } from '../economy/ledger';
import { pushEvent } from '../simulation/events';

export function purchaseHqUpgrade(state: GameState, upgradeId: HqUpgradeId): ActionResult {
  const upgrade = HQ_UPGRADES.find((u) => u.id === upgradeId);
  if (!upgrade) return { ok: false, reason: 'Unknown upgrade.' };
  if (state.company.hqUpgrades.includes(upgradeId)) return { ok: false, reason: 'Already built.' };
  if (state.company.level < upgrade.level) return { ok: false, reason: `Requires company level ${upgrade.level}.` };
  for (const req of upgrade.requires ?? []) {
    if (!state.company.hqUpgrades.includes(req)) return { ok: false, reason: `Requires ${HQ_UPGRADES.find((u) => u.id === req)!.name} first.` };
  }
  if (state.finance.cash < upgrade.cost) return { ok: false, reason: 'Not enough cash.' };
  postTransaction(state, { amount: -upgrade.cost, category: 'facility', memo: `HQ upgrade — ${upgrade.name}` });
  state.company.hqUpgrades.push(upgradeId);
  pushEvent(state, { type: 'celebration', title: `Headquarters upgraded: ${upgrade.name}`, body: upgrade.effect, focus: { kind: 'lot', id: 'hq' } });
  return { ok: true };
}

import type { GameState } from './types';
import { acceptLoanOffer, closeCreditLine, drawCredit, extraLoanPayment, openCreditLine, payoffLoan, repayCredit } from '../economy/banking/banking';
import { acceptLead, chooseDiagnosis, declineLead, dispatchInstall, dispatchJob, submitQuote, type ActionResult, type QuoteRequest } from '../jobs/workflow';
import { fireEmployee, hireCandidate, startTraining } from '../employees/hr';
import { installUpgrade, purchaseVehicle, sellVehicle, type PurchaseRequest } from '../fleet/fleet';
import type { VehicleUpgradeId } from '../fleet/vehicleCatalog';
import { purchaseHqUpgrade } from '../progression/facility';
import type { HqUpgradeId } from '../progression/hqUpgrades';
import { setMarketingBudget, type MarketingChannelId } from '../marketing/marketing';
import { postTransaction } from '../economy/ledger';

/** Every player decision is an explicit, serializable action. */
export type GameAction =
  | { type: 'set-speed'; speed: 0 | 1 | 2 | 5 }
  | { type: 'accept-lead'; jobId: string }
  | { type: 'decline-lead'; jobId: string }
  | { type: 'dispatch'; jobId: string; technicianId: string; vehicleId: string }
  | { type: 'choose-diagnosis'; jobId: string; faultId: string }
  | { type: 'submit-quote'; jobId: string; quote: QuoteRequest }
  | { type: 'dispatch-install'; jobId: string; crewIds: string[]; vehicleId: string }
  | { type: 'hire'; candidateId: string }
  | { type: 'fire'; employeeId: string }
  | { type: 'train'; employeeId: string; programId: string }
  | { type: 'give-raise'; employeeId: string; amount: number }
  | { type: 'buy-vehicle'; request: PurchaseRequest }
  | { type: 'sell-vehicle'; vehicleId: string }
  | { type: 'upgrade-vehicle'; vehicleId: string; upgradeId: VehicleUpgradeId }
  | { type: 'rename-vehicle'; vehicleId: string; nickname: string }
  | { type: 'set-paint'; vehicleId: string; paint: 'ego-black' | 'arctic-white' | 'graphite' | 'desert-sand' }
  | { type: 'hq-upgrade'; upgradeId: HqUpgradeId }
  | { type: 'set-marketing'; channel: MarketingChannelId; dailyBudget: number }
  | { type: 'set-diagnostic-fee'; fee: number }
  | { type: 'dismiss-event'; eventId: number }
  // Business banking
  | { type: 'bank-accept-loan'; offerId: string; amount?: number }
  | { type: 'bank-loan-extra-payment'; loanId: string; amount: number }
  | { type: 'bank-loan-payoff'; loanId: string }
  | { type: 'bank-open-credit-line'; offerId: string }
  | { type: 'bank-credit-draw'; amount: number }
  | { type: 'bank-credit-repay'; amount: number }
  | { type: 'bank-close-credit-line' };

export function applyAction(state: GameState, action: GameAction): ActionResult {
  switch (action.type) {
    case 'set-speed':
      if (state.campaignComplete) return { ok: false, reason: 'The campaign is complete.' };
      state.speed = action.speed;
      return { ok: true };
    case 'accept-lead':
      return acceptLead(state, action.jobId);
    case 'decline-lead':
      return declineLead(state, action.jobId);
    case 'dispatch':
      return dispatchJob(state, action.jobId, action.technicianId, action.vehicleId);
    case 'choose-diagnosis':
      return chooseDiagnosis(state, action.jobId, action.faultId);
    case 'submit-quote':
      return submitQuote(state, action.jobId, action.quote);
    case 'dispatch-install':
      return dispatchInstall(state, action.jobId, action.crewIds, action.vehicleId);
    case 'hire':
      return hireCandidate(state, action.candidateId);
    case 'fire':
      return fireEmployee(state, action.employeeId);
    case 'train':
      return startTraining(state, action.employeeId, action.programId);
    case 'give-raise': {
      const e = state.employees[action.employeeId];
      if (!e || e.isOwner) return { ok: false, reason: 'Unknown employee.' };
      const amount = Math.max(0.5, Math.min(10, action.amount));
      e.hourlyWage = Math.round((e.hourlyWage + amount) * 2) / 2;
      e.morale = Math.min(100, e.morale + amount * 4);
      return { ok: true };
    }
    case 'buy-vehicle': {
      const r = purchaseVehicle(state, action.request);
      return r.ok ? { ok: true } : r;
    }
    case 'sell-vehicle': {
      const r = sellVehicle(state, action.vehicleId);
      return r.ok ? { ok: true } : { ok: false, reason: r.reason ?? 'Cannot sell.' };
    }
    case 'upgrade-vehicle': {
      const r = installUpgrade(state, action.vehicleId, action.upgradeId);
      return r.ok ? { ok: true } : { ok: false, reason: r.reason ?? 'Cannot upgrade.' };
    }
    case 'rename-vehicle': {
      const v = state.vehicles[action.vehicleId];
      if (!v) return { ok: false, reason: 'Unknown vehicle.' };
      v.nickname = action.nickname.slice(0, 24) || v.nickname;
      return { ok: true };
    }
    case 'set-paint': {
      const v = state.vehicles[action.vehicleId];
      if (!v) return { ok: false, reason: 'Unknown vehicle.' };
      if (v.status !== 'parked') return { ok: false, reason: 'Vehicle must be at headquarters.' };
      if (state.finance.cash < 900) return { ok: false, reason: 'Paint costs $900.' };
      if (v.paint === action.paint) return { ok: false, reason: 'Already that color.' };
      v.paint = action.paint;
      postTransaction(state, { amount: -900, category: 'vehicle-upgrade', memo: `Paint — ${v.nickname}` });
      return { ok: true };
    }
    case 'hq-upgrade':
      return purchaseHqUpgrade(state, action.upgradeId);
    case 'set-marketing':
      return setMarketingBudget(state, action.channel, action.dailyBudget);
    case 'bank-accept-loan':
      return acceptLoanOffer(state, action.offerId, action.amount);
    case 'bank-loan-extra-payment':
      return extraLoanPayment(state, action.loanId, action.amount);
    case 'bank-loan-payoff':
      return payoffLoan(state, action.loanId);
    case 'bank-open-credit-line':
      return openCreditLine(state, action.offerId);
    case 'bank-credit-draw':
      return drawCredit(state, action.amount);
    case 'bank-credit-repay':
      return repayCredit(state, action.amount);
    case 'bank-close-credit-line':
      return closeCreditLine(state);
    case 'set-diagnostic-fee': {
      const fee = Math.max(49, Math.min(199, Math.round(action.fee)));
      state.company.diagnosticFee = fee;
      return { ok: true };
    }
    case 'dismiss-event':
      state.events = state.events.filter((e) => e.id !== action.eventId);
      return { ok: true };
  }
}

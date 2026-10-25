import { useApp, useGame } from '@/app/store';
import { formatClock, weekdayName, CAMPAIGN_DAYS } from '@/game/simulation/time';
import { Icon, Money, Stars } from '../components/common';
import { openReceivablesTotal } from '@/game/economy/ledger';

const WEATHER = ['Sunny · 98°F', 'Sunny · 104°F', 'Clear · 92°F', 'Hazy · 101°F', 'Sunny · 107°F', 'Breezy · 95°F', 'Sunny · 99°F'];

export function TopHud() {
  const cash = useGame((s) => s.finance.cash);
  const receivables = useGame((s) => Math.round(openReceivablesTotal(s)));
  const level = useGame((s) => s.company.level);
  const reputation = useGame((s) => s.company.reputation);
  const reviews = useGame((s) => s.company.reviews.length);
  const day = useGame((s) => s.clock.day);
  const clock = useGame((s) => formatClock(s.clock));
  const speed = useGame((s) => s.speed);
  const company = useGame((s) => s.company.name);
  const share = useGame((s) => s.company.marketShare);
  const dispatch = useApp((s) => s.dispatch);
  const todayRevenue = useGame((s) => s.finance.today.revenue);
  const todayExpenses = useGame((s) => s.finance.today.expenses);
  const cashTone = cash < 2000 ? 'neg' : '';

  return (
    <div className="top-hud">
      <div className="glass hud-brand">
        <div className="hud-logo">E</div>
        <div className="hud-company">
          {company}
          <small>Level {level} · Summerlin Ridge · {Math.round(share * 100)}% share</small>
        </div>
      </div>
      <div className="glass hud-stats">
        <div className="hud-stat" data-testid="hud-cash">
          <span className="label">Cash</span>
          <span className={`value ${cashTone}`} style={{ color: cash < 2000 ? 'var(--red)' : undefined }}>
            <Money value={cash} />
          </span>
          <span className="sub">A/R <Money value={receivables} compact /></span>
        </div>
        <div className="hud-stat">
          <span className="label">Today</span>
          <span className="value"><Money value={todayRevenue - todayExpenses} signed compact /></span>
          <span className="sub">Rev <Money value={todayRevenue} compact /> · Exp <Money value={todayExpenses} compact /></span>
        </div>
        <div className="hud-stat">
          <span className="label">Reputation</span>
          <span className="value">{reputation.toFixed(1)}</span>
          <span className="sub"><Stars value={reputation} count={reviews} /></span>
        </div>
        <div className="hud-stat">
          <span className="label">Weather</span>
          <span className="value" style={{ fontSize: 13.5 }}>{WEATHER[(day - 1) % WEATHER.length]}</span>
          <span className="sub">Las Vegas, NV</span>
        </div>
      </div>
      <div className="glass hud-time">
        <div>
          <div className="clock" data-testid="hud-clock">{clock}</div>
          <div className="day">{weekdayName(day)} · Day {day} of {CAMPAIGN_DAYS}</div>
        </div>
        <div className="speed" data-testid="speed-controls">
          <button className={speed === 0 ? 'active' : ''} onClick={() => dispatch({ type: 'set-speed', speed: 0 })} title="Pause (Space)" aria-label="Pause">
            <Icon name="pause" />
          </button>
          {([1, 2, 5] as const).map((s) => (
            <button key={s} className={speed === s ? 'active' : ''} onClick={() => dispatch({ type: 'set-speed', speed: s })} data-testid={`speed-${s}`}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

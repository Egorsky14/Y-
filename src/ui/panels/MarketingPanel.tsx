import { useApp, useGame } from '@/app/store';
import { PanelShell } from './PanelShell';
import { MARKETING_CHANNELS } from '@/game/marketing/marketing';
import { directLeadRate, warrantyLeadRate } from '@/game/jobs/leads';
import { Money, Stars } from '../components/common';

export function MarketingPanel() {
  const marketing = useGame((s) => s.marketing);
  const competitors = useGame((s) => s.competitors);
  const share = useGame((s) => s.company.marketShare);
  const reputation = useGame((s) => s.company.reputation);
  const reviews = useGame((s) => s.company.reviews.slice().reverse().slice(0, 6));
  const direct = useGame((s) => directLeadRate(s));
  const warranty = useGame((s) => warrantyLeadRate(s));
  const fee = useGame((s) => s.company.diagnosticFee);
  const dispatch = useApp((s) => s.dispatch);
  const total = marketing.localServicesAds + marketing.searchAds + marketing.neighborhoodFlyers;
  const all = [{ name: 'EGO HVAC', share, color: '#19d3c5' }, ...competitors.map((c) => ({ name: c.name, share: c.marketShare, color: c.color }))];
  return (
    <PanelShell title="Marketing & Market" subtitle="Lead generation, reputation and competitors in Summerlin Ridge" testId="panel-marketing">
      <div className="panel-body split">
        <div className="col">
          <div className="stat-tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="tile"><div className="label">Daily spend</div><div className="value"><Money value={total} /></div></div>
            <div className="tile"><div className="label">Direct leads / day</div><div className="value">{direct.toFixed(1)}</div></div>
            <div className="tile"><div className="label">Warranty leads / day</div><div className="value">{warranty.toFixed(1)}</div></div>
          </div>
          <h4>Channels (daily budget)</h4>
          {MARKETING_CHANNELS.map((ch) => (
            <div key={ch.id} className="card col" style={{ gap: 6 }}>
              <div className="row between">
                <b>{ch.name}</b>
                <b><Money value={marketing[ch.id]} />/day</b>
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>{ch.description} · {ch.costHint}</div>
              <input className="range" type="range" min={0} max={600} step={10} value={marketing[ch.id]} onChange={(e) => dispatch({ type: 'set-marketing', channel: ch.id, dailyBudget: parseInt(e.target.value, 10) })} data-testid={`budget-${ch.id}`} />
            </div>
          ))}
          <div className="card col" style={{ gap: 6 }}>
            <div className="row between">
              <b>Diagnostic fee</b>
              <b><Money value={fee} /></b>
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>Direct customers pay this on every visit. Higher fees filter price shoppers but slow conversion.</div>
            <input className="range" type="range" min={49} max={199} step={5} value={fee} onChange={(e) => dispatch({ type: 'set-diagnostic-fee', fee: parseInt(e.target.value, 10) })} />
          </div>
          <div className="card">
            <div className="row between"><b>Brand recognition</b><b>{Math.round(marketing.brandRecognition)}</b></div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Grows with wrapped vehicles on the road, neighborhood marketing and a reputation above 4 stars.</div>
          </div>
        </div>
        <div className="col">
          <h4>Market share</h4>
          <div className="share-bar">
            {all.map((c) => (
              <span key={c.name} style={{ width: `${c.share * 100}%`, background: c.color }} title={`${c.name} ${Math.round(c.share * 100)}%`} />
            ))}
          </div>
          <div className="list">
            {all.map((c) => (
              <div key={c.name} className="list-item" style={{ cursor: 'default' }}>
                <div className="row"><span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, display: 'inline-block' }} /><span className="name">{c.name}</span></div>
                <b>{Math.round(c.share * 100)}%</b>
              </div>
            ))}
          </div>
          <h4>Competitors</h4>
          {competitors.map((c) => (
            <div key={c.id} className="card row between">
              <div>
                <b>{c.name}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>Pricing {Math.round(c.priceLevel * 100)}% · Marketing <Money value={c.marketingBudget} compact />/day · {c.capacity} techs</div>
              </div>
              <Stars value={c.reputation} />
            </div>
          ))}
          <h4>Reputation {reputation.toFixed(2)} · recent reviews</h4>
          {reviews.map((r) => (
            <div key={r.id} className="card" style={{ fontSize: 13 }}>
              <div className="row between"><b>{r.customerName}</b><Stars value={r.stars} /></div>
              <div className="muted" style={{ marginTop: 4 }}>{r.text}</div>
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

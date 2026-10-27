import { useState } from 'react';
import { useApp, useGame, useGameWith } from '@/app/store';
import { PanelShell, Tabs } from './PanelShell';
import { PAINT_OPTIONS, VEHICLE_SPECS, VEHICLE_UPGRADES, type PaintId, type VehicleClass } from '@/game/fleet/vehicleCatalog';
import { monthlyLoanPayment, resaleValue, vehicleCapacity, type FinancingChoice } from '@/game/fleet/fleet';
import { Bar, Money } from '../components/common';
import { rackCapacity, rackUsed, toolsHeldBy } from '@/game/equipment/inventory';
import { toolDef } from '@/game/equipment/catalog';
import { VehiclePreview } from './VehiclePreview';

type Tab = 'garage' | 'market';
const CLASSES: VehicleClass[] = ['compact-van', 'full-size-van', 'pickup', 'box-truck'];

export function FleetPanel() {
  const vehicles = useGame((s) => Object.values(s.vehicles));
  const listings = useGame((s) => s.usedListings);
  const capacity = useGame((s) => vehicleCapacity(s));
  const cash = useGame((s) => s.finance.cash);
  const dispatch = useApp((s) => s.dispatch);
  const [tab, setTab] = useState<Tab>('garage');
  const [selectedVehicle, setSelectedVehicle] = useState(vehicles[0]?.id ?? '');
  const [marketClass, setMarketClass] = useState<VehicleClass>('compact-van');
  const [listingId, setListingId] = useState<string | undefined>(undefined);
  const [financing, setFinancing] = useState<FinancingChoice>('loan');
  const vehicle = vehicles.find((v) => v.id === selectedVehicle) ?? vehicles[0];
  const spec = VEHICLE_SPECS[marketClass];
  const listing = listings.find((l) => l.id === listingId && l.classId === marketClass);
  const price = listing ? listing.price : spec.priceNew;
  const resale = useGame((s) => (vehicle ? resaleValue(s, vehicle) : 0));

  return (
    <PanelShell title="Fleet" subtitle={`${vehicles.length} of ${capacity} parking stalls used`} testId="panel-fleet" tabs={<Tabs value={tab} onChange={setTab} items={[{ id: 'garage', label: 'Garage' }, { id: 'market', label: 'Marketplace' }]} />}>
      {tab === 'garage' && (
        <div className="panel-body split">
          <div className="list">
            {vehicles.map((v) => (
              <div key={v.id} className={`list-item ${vehicle?.id === v.id ? 'selected' : ''}`} onClick={() => setSelectedVehicle(v.id)} data-testid={`vehicle-row-${v.id}`}>
                <div>
                  <div className="name">{v.nickname}</div>
                  <div className="sub">{VEHICLE_SPECS[v.classId].name} · {Math.round(v.condition)}% · {Math.round(v.mileage).toLocaleString()} mi</div>
                </div>
                <span className={`tag ${v.status === 'parked' ? 'green' : 'teal'}`}>{v.status}</span>
              </div>
            ))}
          </div>
          <div className="col">
            {vehicle && (
              <>
                <VehiclePreview classId={vehicle.classId} paint={vehicle.paint} upgrades={vehicle.upgrades} />
                <div className="row between">
                  <h3>{vehicle.nickname}</h3>
                  <span className="muted" style={{ fontSize: 12.5 }}>Resale <Money value={resale} /></span>
                </div>
                <div className="spec-grid">
                  <div><span>Cargo</span><b>{VEHICLE_SPECS[vehicle.classId].cargoCapacity} ft³</b></div>
                  <div><span>Seats</span><b>{VEHICLE_SPECS[vehicle.classId].seats}</b></div>
                  <div><span>Replacement</span><b>{VEHICLE_SPECS[vehicle.classId].canCarryReplacement ? 'Yes' : 'No'}</b></div>
                </div>
                <VehicleRack vehicleId={vehicle.id} />
                <h4>Upgrades &amp; customization</h4>
                <div className="col" style={{ gap: 6 }}>
                  {VEHICLE_UPGRADES.map((u) => {
                    const installed = vehicle.upgrades.includes(u.id);
                    const incompatible = u.id === 'liftgate' && !VEHICLE_SPECS[vehicle.classId].liftgateCompatible;
                    return (
                      <div key={u.id} className="row between card" style={{ padding: '8px 10px' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{u.name} {installed && <span className="tag teal" style={{ marginLeft: 6 }}>Installed</span>}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{u.effect}</div>
                        </div>
                        <button className="btn small" disabled={installed || incompatible || vehicle.status !== 'parked' || cash < u.cost} onClick={() => dispatch({ type: 'upgrade-vehicle', vehicleId: vehicle.id, upgradeId: u.id })}>
                          {incompatible ? 'N/A' : <Money value={u.cost} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="row between">
                  <span className="muted" style={{ fontSize: 12.5 }}>Paint ($900)</span>
                  <div className="chip-row">
                    {PAINT_OPTIONS.map((p) => (
                      <button key={p} className={`chip ${vehicle.paint === p ? 'active' : ''}`} onClick={() => dispatch({ type: 'set-paint', vehicleId: vehicle.id, paint: p as PaintId })} disabled={vehicle.status !== 'parked'}>
                        {p.replace('-', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn small" onClick={() => { useApp.getState().select({ kind: 'vehicle', id: vehicle.id }); useApp.getState().openPanel(null); useApp.getState().camera({ type: 'focus', target: vehicle.position, distance: 30 }); }}>Find in world</button>
                  <button className="btn small danger" disabled={vehicles.length <= 1 || vehicle.status !== 'parked'} onClick={() => dispatch({ type: 'sell-vehicle', vehicleId: vehicle.id })}>Sell for <Money value={resale} /></button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {tab === 'market' && (
        <div className="panel-body split">
          <div className="col">
            <div className="chip-row">
              {CLASSES.map((c) => (
                <button key={c} className={`chip ${marketClass === c ? 'active' : ''}`} onClick={() => { setMarketClass(c); setListingId(undefined); }} data-testid={`market-class-${c}`}>
                  {VEHICLE_SPECS[c].name}
                </button>
              ))}
            </div>
            <VehiclePreview classId={marketClass} paint="ego-black" upgrades={['full-wrap']} />
            <div className="muted" style={{ fontSize: 13 }}>{spec.description}</div>
            <div className="spec-grid">
              <div><span>Cargo</span><b>{spec.cargoCapacity} ft³</b></div>
              <div><span>Seats</span><b>{spec.seats}</b></div>
              <div><span>Tool slots</span><b>{spec.toolCapacity}</b></div>
              <div><span>Speed</span><b>{spec.speed} m/min</b></div>
              <div><span>Upkeep</span><b><Money value={spec.upkeepPerDay} />/day</b></div>
              <div><span>Carries system</span><b>{spec.canCarryReplacement ? 'Yes' : 'No'}</b></div>
            </div>
          </div>
          <div className="col">
            <h4>Condition</h4>
            <button className={`option ${!listingId ? 'selected' : ''}`} onClick={() => setListingId(undefined)} data-testid="market-new">
              <span>Brand new<small>Full condition, 0 miles</small></span>
              <b><Money value={spec.priceNew} /></b>
            </button>
            {listings.filter((l) => l.classId === marketClass).map((l) => (
              <button key={l.id} className={`option ${listingId === l.id ? 'selected' : ''}`} onClick={() => setListingId(l.id)} data-testid={`market-used-${l.id}`}>
                <span>Used · {l.condition}% condition<small>{l.mileage.toLocaleString()} miles</small></span>
                <b><Money value={l.price} /></b>
              </button>
            ))}
            {listings.filter((l) => l.classId === marketClass).length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No used {spec.name.toLowerCase()}s listed today. Listings refresh every few days.</div>}
            <h4>Financing</h4>
            <div className="grid3">
              {(['cash', 'loan', 'lease'] as FinancingChoice[]).map((f) => (
                <button key={f} className={`option ${financing === f ? 'selected' : ''}`} disabled={f === 'lease' && !!listing} onClick={() => setFinancing(f)} data-testid={`financing-${f}`}>
                  <span style={{ textTransform: 'capitalize' }}>
                    {f}
                    <small>{f === 'cash' ? 'Pay in full' : f === 'loan' ? '15% down · 8.9% APR · 60 mo' : 'New only · monthly'}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="card col" style={{ gap: 4, fontSize: 13 }}>
              {financing === 'cash' && <div className="row between"><span>Due today</span><b><Money value={price} /></b></div>}
              {financing === 'loan' && (
                <>
                  <div className="row between"><span>Down payment</span><b><Money value={Math.round(price * 0.15)} /></b></div>
                  <div className="row between"><span>Monthly (posts every 30 days)</span><b><Money value={monthlyLoanPayment(price - Math.round(price * 0.15), 8.9, 60)} /></b></div>
                </>
              )}
              {financing === 'lease' && <div className="row between"><span>Monthly lease</span><b><Money value={Math.round(price * 0.021)} /></b></div>}
              <div className="row between muted"><span>Cash on hand</span><span><Money value={cash} /></span></div>
            </div>
            <button
              className="btn primary block"
              disabled={vehicles.length >= capacity}
              onClick={() => dispatch({ type: 'buy-vehicle', request: { classId: marketClass, listingId, financing } })}
              data-testid="buy-vehicle"
            >
              {vehicles.length >= capacity ? 'No parking capacity — upgrade HQ' : `Buy ${spec.name}`}
            </button>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

/** The van's equipment rack (space is the tool capacity its shelving and storage upgrades add to). */
function VehicleRack({ vehicleId }: { vehicleId: string }) {
  const info = useGameWith((s) => {
    const v = s.vehicles[vehicleId];
    return v ? { used: rackUsed(s, v.id), cap: rackCapacity(v), names: toolsHeldBy(s, { kind: 'vehicle', id: v.id }).map((t) => toolDef(t.defId).name) } : null;
  }, [vehicleId]);
  if (!info) return null;
  return (
    <div className="card col" style={{ gap: 6 }} data-testid={`vehicle-rack-${vehicleId}`}>
      <div className="row between">
        <b style={{ fontSize: 13 }}>Equipment rack</b>
        <span className="muted" style={{ fontSize: 12 }}>{info.used} / {info.cap} space</span>
      </div>
      <Bar value={info.used} max={info.cap} tone={info.used >= info.cap ? 'amber' : undefined} />
      <div className="muted" style={{ fontSize: 12 }}>{info.names.length ? info.names.join(' · ') : 'Empty. Vacuum pumps, recovery machines and nitrogen kits ride here.'}</div>
      <button className="btn small" onClick={() => useApp.getState().openPanel('supply')}>Load equipment</button>
    </div>
  );
}

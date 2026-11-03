import { useApp, type ServiceCameraMode } from '@/app/store';
import { requestZoom, resetServiceZoom } from '@/world/scene/serviceZoom';

const MODES: { id: ServiceCameraMode; label: string; title: string }[] = [
  { id: 'property', label: 'Property', title: 'The house, the van, the unit and the technician' },
  { id: 'work', label: 'Watch work', title: 'The technician and the unit, close' },
  { id: 'detail', label: 'Detail', title: 'Hands, tools and the service panel' },
];

/**
 * Service camera bar: switches between the property shot, watching the work and the detail
 * close-up while the service camera is on (ServiceDirector frames each), and leaves it. Picking
 * another mode starts it at that mode's own distance. Beside it, zoom buttons for those without a
 * wheel or a free second finger, and a return to the shot's own framing. Hidden while a full panel is open.
 */
export function ServiceCameraBar() {
  const view = useApp((s) => s.serviceView);
  const panel = useApp((s) => s.panel);
  const setView = useApp((s) => s.setServiceView);
  if (!view || panel) return null;
  return (
    <>
      <div className="glass service-bar" data-testid="service-camera-bar" role="toolbar" aria-label="Service camera">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={view.mode === m.id ? 'active' : ''}
            aria-pressed={view.mode === m.id}
            title={m.title}
            data-testid={`service-view-${m.id}`}
            onClick={() => {
              if (m.id !== view.mode) resetServiceZoom();
              setView({ jobId: view.jobId, lotId: view.lotId, mode: m.id });
            }}
          >
            {m.label}
          </button>
        ))}
        <button className="service-bar-exit" aria-label="Leave the service camera" title="Leave the service camera" data-testid="service-view-exit" onClick={() => setView(null)}>
          ✕
        </button>
      </div>
      <div className="glass service-zoom" data-testid="service-zoom" role="group" aria-label="Zoom">
        <button aria-label="Zoom in" title="Zoom in" data-testid="service-zoom-in" onClick={() => requestZoom(1 / 1.3)}>
          +
        </button>
        <button aria-label="Zoom out" title="Zoom out" data-testid="service-zoom-out" onClick={() => requestZoom(1.3)}>
          −
        </button>
        <button
          className="service-zoom-reset"
          aria-label="Back to the default view"
          title="Back to the default view"
          data-testid="service-zoom-reset"
          onClick={() => {
            resetServiceZoom();
            setView({ jobId: view.jobId, lotId: view.lotId, mode: view.mode });
          }}
        >
          ⟲
        </button>
      </div>
    </>
  );
}

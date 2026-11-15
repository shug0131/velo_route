import { Pause, Play } from 'lucide-react';

export type AppSection = 'cockpit' | 'course' | 'hardware' | 'setup';

interface TopBarProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  isRiding: boolean;
  onToggleRide: () => void;
}

const NAV_ITEMS: Array<{ id: AppSection; label: string }> = [
  { id: 'cockpit', label: 'Ride Cockpit' },
  { id: 'course', label: 'Course & Video' },
  { id: 'hardware', label: 'Bluetooth Gear' },
  { id: 'setup', label: 'Rider Setup' },
];

export function TopBar({
  activeSection,
  onSelectSection,
  isRiding,
  onToggleRide,
}: TopBarProps) {
  return (
    <header className="h-14 border-b border-[#1C2333] bg-[#0B0E17] px-4 lg:px-6 flex items-center justify-between gap-8 shrink-0">
      {/* Zone 1: Single text element wordmark */}
      <button
        type="button"
        onClick={() => onSelectSection('cockpit')}
        className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400 rounded-sm"
      >
        VeloRoute
      </button>

      {/* Zone 2: Concise single-line navigation links */}
      <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                isActive ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-[11px] h-[2px] bg-cyan-400" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary action */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={onToggleRide}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
            isRiding
              ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
          }`}
        >
          {isRiding ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              Pause Ride
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Ride
            </>
          )}
        </button>
      </div>
    </header>
  );
}

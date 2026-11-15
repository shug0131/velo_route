import { RiderConfig } from '../types/simulator';

interface RiderSetupPanelProps {
  riderConfig: RiderConfig;
  onUpdateRiderConfig: (patch: Partial<RiderConfig>) => void;
  wattTolerance: number;
  onChangeWattTolerance: (val: number) => void;
  speedToleranceKmh: number;
  onChangeSpeedTolerance: (val: number) => void;
  onBackToCockpit: () => void;
}

export function RiderSetupPanel({
  riderConfig,
  onUpdateRiderConfig,
  wattTolerance,
  onChangeWattTolerance,
  speedToleranceKmh,
  onChangeSpeedTolerance,
  onBackToCockpit,
}: RiderSetupPanelProps) {
  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1C2333] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">
            Rider Physics & Coaching Tolerances
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure mass, aerodynamic drag, trainer difficulty, and target zone thresholds.
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToCockpit}
          className="px-4 py-2 rounded-md bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 transition-colors whitespace-nowrap self-start"
        >
          Return to Ride Cockpit
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Rider & Bike Mass / Aero */}
        <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-6 space-y-5">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Speed Physics Parameters
          </h2>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="rider-weight" className="text-slate-300">
                Rider Weight
              </label>
              <span className="font-mono text-cyan-400">{riderConfig.riderWeightKg} kg</span>
            </div>
            <input
              id="rider-weight"
              type="range"
              min={45}
              max={130}
              step={1}
              value={riderConfig.riderWeightKg}
              onChange={(e) => onUpdateRiderConfig({ riderWeightKg: Number(e.target.value) })}
              className="w-full h-1.5 accent-cyan-400 bg-slate-800 rounded cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="bike-weight" className="text-slate-300">
                Bike Weight
              </label>
              <span className="font-mono text-cyan-400">{riderConfig.bikeWeightKg.toFixed(1)} kg</span>
            </div>
            <input
              id="bike-weight"
              type="range"
              min={6}
              max={18}
              step={0.5}
              value={riderConfig.bikeWeightKg}
              onChange={(e) => onUpdateRiderConfig({ bikeWeightKg: Number(e.target.value) })}
              className="w-full h-1.5 accent-cyan-400 bg-slate-800 rounded cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="cda-slider" className="text-slate-300">
                Aerodynamic Drag Area (CdA)
              </label>
              <span className="font-mono text-cyan-400">{riderConfig.cda.toFixed(2)} m²</span>
            </div>
            <input
              id="cda-slider"
              type="range"
              min={0.22}
              max={0.45}
              step={0.01}
              value={riderConfig.cda}
              onChange={(e) => onUpdateRiderConfig({ cda: Number(e.target.value) })}
              className="w-full h-1.5 accent-cyan-400 bg-slate-800 rounded cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="trainer-difficulty" className="text-slate-300">
                KICKR Grade Difficulty Scale
              </label>
              <span className="font-mono text-cyan-400">
                {Math.round(riderConfig.gradeDifficultyScale * 100)}%
              </span>
            </div>
            <input
              id="trainer-difficulty"
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={riderConfig.gradeDifficultyScale}
              onChange={(e) =>
                onUpdateRiderConfig({ gradeDifficultyScale: Number(e.target.value) })
              }
              className="w-full h-1.5 accent-cyan-400 bg-slate-800 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Target Zone Coaching Thresholds */}
        <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-6 space-y-5">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Coaching Cue Tolerances
          </h2>
          <p className="text-xs text-slate-400">
            Adjust how tight your power and speed target bands are before VeloRoute prompts you to push harder or go easier.
          </p>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="watt-tol" className="text-slate-300">
                Power Target Tolerance
              </label>
              <span className="font-mono text-emerald-400">±{wattTolerance} W</span>
            </div>
            <input
              id="watt-tol"
              type="range"
              min={3}
              max={35}
              step={1}
              value={wattTolerance}
              onChange={(e) => onChangeWattTolerance(Number(e.target.value))}
              className="w-full h-1.5 accent-emerald-400 bg-slate-800 rounded cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="speed-tol" className="text-slate-300">
                Speed Target Tolerance
              </label>
              <span className="font-mono text-emerald-400">±{speedToleranceKmh.toFixed(1)} km/h</span>
            </div>
            <input
              id="speed-tol"
              type="range"
              min={0.3}
              max={5.0}
              step={0.1}
              value={speedToleranceKmh}
              onChange={(e) => onChangeSpeedTolerance(Number(e.target.value))}
              className="w-full h-1.5 accent-emerald-400 bg-slate-800 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

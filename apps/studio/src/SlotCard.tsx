import { ModelPreview } from "./ModelPreview";
import type { AssetOption } from "./slots";

/** One asset slot: a dropdown to assign a model + a live preview, or a clear
 *  "missing" state when nothing is chosen. */
export function SlotCard({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: AssetOption[];
  onChange: (value: string) => void;
}) {
  const selected = options.find((o) => o.value === value);
  const assigned = Boolean(selected);

  return (
    <div className={`card slot ${assigned ? "" : "is-missing"}`}>
      <div className="card-head">
        <span className="card-title">{label}</span>
        <span className={assigned ? "badge ok" : "badge miss"}>{assigned ? "✓ set" : "missing"}</span>
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— choose a model —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {assigned ? (
        <ModelPreview modelUrl={selected!.url} variant={selected!.variant} />
      ) : (
        <div className="missing-box">no model yet</div>
      )}
    </div>
  );
}

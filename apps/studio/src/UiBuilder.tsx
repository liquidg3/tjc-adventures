import { useEffect, useMemo, useState } from "react";
import {
  applyUiTheme,
  cloneTheme,
  DEFAULT_UI_THEME,
  loadUiAssets,
  mergeUiTheme,
  ROLE_KIND,
  UI_COLOR_LABELS,
  UI_COLOR_ORDER,
  UI_ROLE_LABELS,
  UI_ROLE_ORDER,
  boxJoin,
  type BarRole,
  type BoxValue,
  type CardRole,
  type ChromeRole,
  type OutlineRole,
  type UiAssetEntry,
  type UiChromeRoleId,
  type UiColorTokens,
  type UiTheme,
} from "./ui-theme-state";

const UI_THEME_URL = "/__ui-theme";
type UiBuilderTarget = "colors" | UiChromeRoleId;

/** Per-kind presets the user can stamp onto a role. */
const BAR_PRESETS: Array<{ label: string; slice: number; width: number }> = [
  { label: "bar_round_small", slice: 8, width: 8 },
  { label: "bar_round_large", slice: 12, width: 12 },
];
const CARD_PRESETS: Array<{ label: string; slice: BoxValue; width: BoxValue }> = [
  { label: "header (1x)", slice: { top: 28, right: 12, bottom: 12, left: 12 }, width: { top: 28, right: 12, bottom: 12, left: 12 } },
  { label: "header (2x)", slice: { top: 52, right: 24, bottom: 24, left: 24 }, width: { top: 26, right: 12, bottom: 12, left: 12 } },
  { label: "blade", slice: { top: 28, right: 12, bottom: 12, left: 12 }, width: { top: 28, right: 12, bottom: 12, left: 12 } },
];

export function UiBuilder() {
  const [theme, setTheme] = useState<UiTheme>(() => cloneTheme(DEFAULT_UI_THEME));
  const [savedTheme, setSavedTheme] = useState<UiTheme>(() => cloneTheme(DEFAULT_UI_THEME));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);
  const [assets, setAssets] = useState<UiAssetEntry[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<UiBuilderTarget>("colors");
  const [assetFilter, setAssetFilter] = useState("");

  useEffect(() => {
    fetch(UI_THEME_URL)
      .then((r) => r.json())
      .then((data) => {
        const next = mergeUiTheme(data);
        setTheme(next);
        setSavedTheme(cloneTheme(next));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    loadUiAssets().then(setAssets).catch(() => setAssets([]));
  }, []);

  useEffect(() => {
    if (loaded) applyUiTheme(theme);
  }, [loaded, theme]);

  const filteredAssets = useMemo(() => {
    const q = assetFilter.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((asset) => `${asset.pack}/${asset.name}`.toLowerCase().includes(q));
  }, [assets, assetFilter]);

  const selectedRole = selectedTarget === "colors" ? null : selectedTarget;
  const role = selectedRole ? theme.roles[selectedRole] : null;
  const kind = selectedRole ? ROLE_KIND[selectedRole] : null;
  const selectedAsset = role ? assets.find((asset) => asset.url === role.image) : undefined;
  const dirty = JSON.stringify(theme) !== JSON.stringify(savedTheme);

  function patchRole(id: UiChromeRoleId, patch: Partial<ChromeRole>) {
    setTheme((current) => {
      const role = current.roles[id];
      const next: ChromeRole = { ...role, ...patch } as ChromeRole;
      // When the image changes, derive a sane slice from the filename so the
      // user doesn't immediately hit a "middle = 0×0" garbage state. Only
      // overrides slice when the patch didn't include one explicitly.
      if (
        typeof patch.image === "string" &&
        patch.image !== role.image &&
        !("slice" in patch)
      ) {
        Object.assign(next, suggestSliceForImage(patch.image, next.kind));
      }
      return {
        ...current,
        roles: { ...current.roles, [id]: next },
      };
    });
  }

  function patchColors(patch: Partial<UiColorTokens>) {
    setTheme((current) => ({
      ...current,
      colors: { ...current.colors, ...patch },
    }));
  }

  function updateCursor(which: "default" | "pointer", patch: Partial<UiTheme["cursors"]["default"]>) {
    setTheme({
      ...theme,
      cursors: {
        ...theme.cursors,
        [which]: { ...theme.cursors[which], ...patch },
      },
    });
  }

  function resetTheme() {
    setTheme(cloneTheme(DEFAULT_UI_THEME));
    setPendingReset(false);
  }

  function discardChanges() {
    setTheme(cloneTheme(savedTheme));
  }

  function saveTheme() {
    setSaving(true);
    fetch(UI_THEME_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(theme, null, 2),
    })
      .then(() => {
        setSavedTheme(cloneTheme(theme));
        setSaving(false);
      })
      .catch(() => setSaving(false));
  }

  return (
    <div className="studio ui-builder">
      <header>
        <h1>UI Builder</h1>
        <p>
          Map Kenney UI assets to Studio chrome roles. Each role has its own
          kind ({" "}
          <code>bar</code>, <code>card</code>, <code>outline</code>) — controls
          shown match the kind so card knobs don't leak onto buttons.
          {" "}
          <span className="dim">
            {assets.length} assets · {dirty ? "unsaved changes" : "saved"}
          </span>
        </p>
      </header>

      <div className="ui-builder-layout">
        <aside className="ui-role-list">
          <h3>Theme</h3>
          <button
            className={`ui-role-button ${selectedTarget === "colors" ? "on" : ""}`}
            onClick={() => setSelectedTarget("colors")}
          >
            System colors <span className="dim">· tokens</span>
          </button>
          <h3>Roles</h3>
          {UI_ROLE_ORDER.map((id) => (
            <button
              key={id}
              className={`ui-role-button ${selectedTarget === id ? "on" : ""}`}
              onClick={() => setSelectedTarget(id)}
            >
              {UI_ROLE_LABELS[id]} <span className="dim">· {ROLE_KIND[id]}</span>
            </button>
          ))}
          <button className="lb-reset" onClick={() => setPendingReset(true)}>
            Reset theme
          </button>
          <button disabled={!dirty || saving} onClick={saveTheme}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button disabled={!dirty || saving} onClick={discardChanges}>
            Revert
          </button>
          {pendingReset && (
            <div className="confirm-box ui-confirm-box">
              <div className="confirm-title">Reset Theme</div>
              <p>
                Replace the current draft with the default sci-fi theme. Stays
                local until you Save.
              </p>
              <div className="confirm-actions">
                <button className="panel-save" onClick={() => setPendingReset(false)}>
                  Cancel
                </button>
                <button className="panel-save confirm-accept" onClick={resetTheme}>
                  Reset
                </button>
              </div>
            </div>
          )}
        </aside>

        <section className="ui-editor-panel">
          <div className="ui-editor-head">
            <div>
              <h2>{selectedRole ? UI_ROLE_LABELS[selectedRole] : "System colors"}</h2>
              <p className="dim">
                {selectedRole
                  ? `kind: ${kind} · ${selectedAsset ? `${selectedAsset.pack}/${selectedAsset.name}` : role?.image}`
                  : "Shared semantic colors for builder controls, field labels, focus, selection, and preview checkerboards."}
              </p>
            </div>
            {/* Render the role through the SAME real chrome that the right
                column shows — no inline styles, no min-height cheats. What
                you see here is what every other instance looks like. */}
            <div className="ui-editor-head-preview">
              {selectedRole ? renderExample(selectedRole, UI_ROLE_LABELS[selectedRole]) : <SystemColorPreview />}
            </div>
          </div>

          {selectedTarget === "colors" && (
            <>
              <p className="ui-role-hint">
                <span>
                  These are system-level color decisions. Use them for Studio
                  chrome and editor controls; keep role editors focused on
                  image slicing, padding, and per-role text/fill exceptions.
                </span>
              </p>
              <ColorTokensEditor colors={theme.colors} onPatch={patchColors} />
            </>
          )}

          {role && kind === "card" && (
            <p className="ui-role-hint">
              <span>
                <b>Header band height = slice top</b> ({(role as CardRole).slice.top}px).
                The title element matches it via <code>min-height</code>; the body sits below.
              </span>
            </p>
          )}
          {role && kind === "outline" && (
            <p className="ui-role-hint">
              <span>
                Outline-only: the middle of the source image is not painted. Use <code>fillColor</code> on the caller (e.g. <code>.lb-grid</code>) for a solid background.
              </span>
            </p>
          )}

          {role && selectedRole && (
            <>
              <label className="ui-field">
                <span>Asset search</span>
                <input
                  value={assetFilter}
                  onChange={(e) => setAssetFilter(e.target.value)}
                  placeholder="bar, header, blade, grey..."
                />
                <span className="dim">
                  Showing {filteredAssets.length} of {assets.length}
                </span>
              </label>

              <div className="ui-asset-strip">
                {filteredAssets.map((asset) => (
                  <button
                    key={asset.url}
                    className={`ui-asset-tile raw ${asset.url === role.image ? "selected" : ""}`}
                    onClick={() => patchRole(selectedRole, { image: asset.url })}
                    title={`${asset.pack}/${asset.name}`}
                  >
                    <img src={asset.url} alt="" />
                  </button>
                ))}
              </div>

              <SlicePreview role={role} />
            </>
          )}

          {role && selectedRole && kind === "bar" && (
            <BarEditor role={role as BarRole} onPatch={(p) => patchRole(selectedRole, p)} />
          )}
          {role && selectedRole && kind === "card" && (
            <CardEditor role={role as CardRole} onPatch={(p) => patchRole(selectedRole, p)} />
          )}
          {role && selectedRole && kind === "outline" && (
            <OutlineEditor role={role as OutlineRole} onPatch={(p) => patchRole(selectedRole, p)} />
          )}
        </section>

        <aside className="ui-preview-panel">
          <h3>Examples</h3>
          <p className="dim">One per role. Click any to edit; the selected role is outlined here and highlighted in the left list.</p>
          <div className="ui-preview-wall">
            {UI_ROLE_ORDER.map((id) => (
              <PreviewExample
                key={id}
                id={id}
                selected={selectedTarget === id}
                onClick={() => setSelectedTarget(id)}
              />
            ))}
          </div>

          <h3>Cursors</h3>
          <label className="ui-field">
            <span>Default cursor</span>
            <select
              value={theme.cursors.default.image}
              onChange={(e) => updateCursor("default", { image: e.target.value })}
            >
              {assets.map((asset) => (
                <option key={asset.url} value={asset.url}>
                  {asset.pack}/{asset.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ui-field">
            <span>Pointer cursor</span>
            <select
              value={theme.cursors.pointer.image}
              onChange={(e) => updateCursor("pointer", { image: e.target.value })}
            >
              {assets.map((asset) => (
                <option key={asset.url} value={asset.url}>
                  {asset.pack}/{asset.name}
                </option>
              ))}
            </select>
          </label>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-kind editors
// ---------------------------------------------------------------------------

function BarEditor({ role, onPatch }: { role: BarRole; onPatch: (p: Partial<BarRole>) => void }) {
  return (
    <div className="ui-control-grid">
      <div className="ui-preset-row">
        {BAR_PRESETS.map((p) => (
          <button key={p.label} onClick={() => onPatch({ slice: p.slice, width: p.width })}>
            {p.label}
          </button>
        ))}
      </div>
      <NumberField label="Slice (px)" value={role.slice} min={0} max={128} onChange={(slice) => onPatch({ slice })} />
      <NumberField label="Border width (px)" value={role.width} min={0} max={80} onChange={(width) => onPatch({ width })} />
      <BoxField label="Padding" value={role.padding} min={0} max={80} onChange={(padding) => onPatch({ padding })} />
      <ColorField label="Text color" value={role.textColor} onChange={(textColor) => onPatch({ textColor })} />
      <ColorField label="Fill color" value={role.fillColor} onChange={(fillColor) => onPatch({ fillColor })} />
      <CheckField label="Uppercase" value={role.uppercase} onChange={(uppercase) => onPatch({ uppercase })} />
      <TextField label="Letter spacing" value={role.letterSpacing} onChange={(letterSpacing) => onPatch({ letterSpacing })} placeholder="0.05em" />
    </div>
  );
}

function CardEditor({ role, onPatch }: { role: CardRole; onPatch: (p: Partial<CardRole>) => void }) {
  return (
    <div className="ui-control-grid">
      <div className="ui-preset-row">
        {CARD_PRESETS.map((p) => (
          <button key={p.label} onClick={() => onPatch({ slice: p.slice, width: p.width })}>
            {p.label}
          </button>
        ))}
      </div>
      <BoxField label="Slice (px)" value={role.slice} min={0} max={128} onChange={(slice) => onPatch({ slice })} />
      <BoxField label="Border width (px)" value={role.width} min={0} max={128} onChange={(width) => onPatch({ width })} />
      <BoxField label="Header padding" value={role.padHeader} min={0} max={80} onChange={(padHeader) => onPatch({ padHeader })} />
      <BoxField label="Body padding" value={role.padBody} min={0} max={120} onChange={(padBody) => onPatch({ padBody })} />
      <ColorField label="Header text color" value={role.headerTextColor} onChange={(headerTextColor) => onPatch({ headerTextColor })} />
      <ColorField label="Body text color" value={role.bodyTextColor} onChange={(bodyTextColor) => onPatch({ bodyTextColor })} />
      <ColorField label="Fill color" value={role.fillColor} onChange={(fillColor) => onPatch({ fillColor })} />
      <CheckField label="Uppercase title" value={role.headerUppercase} onChange={(headerUppercase) => onPatch({ headerUppercase })} />
      <TextField label="Letter spacing" value={role.letterSpacing} onChange={(letterSpacing) => onPatch({ letterSpacing })} placeholder="0.05em" />
    </div>
  );
}

function OutlineEditor({ role, onPatch }: { role: OutlineRole; onPatch: (p: Partial<OutlineRole>) => void }) {
  return (
    <div className="ui-control-grid">
      <NumberField label="Slice (px)" value={role.slice} min={0} max={128} onChange={(slice) => onPatch({ slice })} />
      <NumberField label="Border width (px)" value={role.width} min={0} max={80} onChange={(width) => onPatch({ width })} />
      <BoxField label="Padding" value={role.padding} min={0} max={80} onChange={(padding) => onPatch({ padding })} />
      <ColorField label="Text color" value={role.textColor} onChange={(textColor) => onPatch({ textColor })} />
      <ColorField label="Fill color" value={role.fillColor} onChange={(fillColor) => onPatch({ fillColor })} />
    </div>
  );
}

function ColorTokensEditor({
  colors, onPatch,
}: { colors: UiColorTokens; onPatch: (p: Partial<UiColorTokens>) => void }) {
  return (
    <div className="ui-control-grid ui-color-token-grid">
      {UI_COLOR_ORDER.map((id) => (
        <ColorField
          key={id}
          label={UI_COLOR_LABELS[id]}
          value={colors[id]}
          onChange={(value) => onPatch({ [id]: value } as Partial<UiColorTokens>)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny form fields
// ---------------------------------------------------------------------------

function NumberField({
  label, value, min, max, onChange,
}: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="ui-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(clamp(Number.parseInt(e.target.value || "0", 10), min, max))}
      />
    </label>
  );
}

function BoxField({
  label, value, min, max, onChange,
}: { label: string; value: BoxValue; min: number; max: number; onChange: (b: BoxValue) => void }) {
  const set = (key: keyof BoxValue, n: number) =>
    onChange({ ...value, [key]: clamp(Math.round(n), min, max) });
  return (
    <fieldset className="ui-box-editor">
      <legend>{label}</legend>
      {(["top", "right", "bottom", "left"] as const).map((key) => (
        <label key={key}>
          <span>{key[0].toUpperCase()}</span>
          <input
            type="number"
            min={min}
            max={max}
            step={1}
            value={value[key]}
            onChange={(e) => set(key, Number.parseInt(e.target.value || "0", 10))}
          />
        </label>
      ))}
    </fieldset>
  );
}

function ColorField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  const v = normalizeColor(value);
  return (
    <label className="ui-field ui-color-field">
      <span>{label}</span>
      <span className="ui-color-row">
        <input
          type="color"
          value={v}
          onChange={(e) => onChange(e.target.value)}
        />
        <code className="ui-color-hex">{v}</code>
      </span>
    </label>
  );
}

function CheckField({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="ui-check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function TextField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="ui-field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

/**
 * One example chrome per role, labelled with the role name so left-side
 * buttons and right-side examples line up 1:1. Clicking an example also
 * selects it for editing — bridges the gap between "what does this role do"
 * and "how do I tweak it".
 */
function PreviewExample({
  id, selected, onClick,
}: { id: UiChromeRoleId; selected: boolean; onClick: () => void }) {
  const label = UI_ROLE_LABELS[id];
  const node = renderExample(id, label);
  return (
    <div
      className={`ui-preview-example ${selected ? "is-selected" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <span className="ui-preview-example-label">{label}</span>
      <div className="ui-preview-example-stage">{node}</div>
    </div>
  );
}

/** Per-role example chrome — what the role looks like in real Studio markup. */
function renderExample(id: UiChromeRoleId, label: string) {
  switch (id) {
    case "button-default":
      return <button>{label}</button>;
    case "button-hover":
      // Faked: real :hover requires pointer. Show hover-painted via class hook.
      return <button className="is-hover-preview">{label}</button>;
    case "button-active":
      return <button className="on">{label}</button>;
    case "button-critical":
      return <button className="critical">{label}</button>;
    case "button-disabled":
      return <button disabled>{label}</button>;
    case "input":
      return <input value={label} readOnly />;
    case "toolbar":
      return <div className="ui-preview-toolbar">{label}</div>;
    case "badge-default":
      return <span className="badge">{label}</span>;
    case "card-home":
      return (
        <div className="ui-preview-card-home">
          <span className="studio-card-title">{label}</span>
          <div className="studio-card-body">
            <span className="studio-card-desc">Home-page launcher card.</span>
            <span className="studio-card-badge">Ready</span>
          </div>
        </div>
      );
    case "card-content":
      return (
        <div className="ui-preview-card-content">
          <span className="studio-card-title">{label}</span>
          <div className="studio-card-body">
            <span className="studio-card-desc">Slot / pack / preview card with copy.</span>
          </div>
        </div>
      );
    case "grid-outline":
      return <div className="ui-preview-grid">{label}</div>;
    default:
      return <span>{label}</span>;
  }
}

function SystemColorPreview() {
  return (
    <div className="ui-system-color-preview">
      <span className="ui-system-color-title">Controls</span>
      <span className="ui-system-color-muted">Labels, borders, focus, selection</span>
      <span className="ui-system-color-pill">Selected</span>
    </div>
  );
}

function SlicePreview({ role }: { role: ChromeRole }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const slice: BoxValue =
    role.kind === "card"
      ? role.slice
      : { top: role.slice, right: role.slice, bottom: role.slice, left: role.slice };
  const top = size.h ? clampPct((slice.top / size.h) * 100) : 0;
  const right = size.w ? clampPct(100 - (slice.right / size.w) * 100) : 100;
  const bottom = size.h ? clampPct(100 - (slice.bottom / size.h) * 100) : 100;
  const left = size.w ? clampPct((slice.left / size.w) * 100) : 0;
  const middleW = size.w ? size.w - slice.left - slice.right : 0;
  const middleH = size.h ? size.h - slice.top - slice.bottom : 0;
  const invalid = size.w > 0 && (middleW <= 0 || middleH <= 0);
  return (
    <div className="ui-slice-preview">
      <div className="ui-slice-stage">
        <img
          src={role.image}
          alt=""
          onLoad={(e) => {
            const img = e.currentTarget;
            setSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />
        {size.w > 0 && (
          <>
            <span className="ui-slice-line x" style={{ top: `${top}%` }} />
            <span className="ui-slice-line x" style={{ top: `${bottom}%` }} />
            <span className="ui-slice-line y" style={{ left: `${left}%` }} />
            <span className="ui-slice-line y" style={{ left: `${right}%` }} />
          </>
        )}
      </div>
      <span className={`dim ui-slice-info ${invalid ? "ui-slice-info-bad" : ""}`}>
        Source {size.w || "?"}×{size.h || "?"} · slice {boxJoin(slice)}
        {role.kind === "outline" ? " (outline)" : " fill"}
        {size.w > 0 && (
          <>
            {" · middle "}
            <b>{middleW}×{middleH}px</b>
            {invalid &&
              " — edges overlap, body has no source pixels to stretch. Reduce slice top/bottom or left/right."}
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Cheap filename-based slice recommendation. Pure heuristic, runs synchronously
 * the moment the user clicks an asset. Picks values that leave a healthy middle
 * band for the Kenney sci-fi families we ship — beats letting the user inherit
 * the previous role's slice and end up with overlapping edges.
 */
function suggestSliceForImage(url: string, kind: ChromeRole["kind"]): Partial<ChromeRole> {
  const name = url.split("/").pop()?.toLowerCase() ?? "";
  const isDouble = /\/double\//i.test(url) || /_2x\b/i.test(name);
  const mul = isDouble ? 2 : 1;
  if (kind === "card") {
    // Header band height varies by header variant; bottom row is always ~6-8 px
    // of screw decoration. Source cards are 192×64 (Double = 384×128).
    let top = 22;
    if (name.includes("header_large")) top = 24;
    else if (name.includes("header_notch")) top = 24;
    else if (name.includes("header_small")) top = 12;
    else if (name.includes("header_blade")) top = 22;
    else if (name.includes("panel_glass")) top = 12;
    const slice = {
      top: top * mul,
      right: 12 * mul,
      bottom: 8 * mul,
      left: 12 * mul,
    };
    return {
      slice,
      width: { top: top * mul, right: 12 * mul, bottom: 8 * mul, left: 12 * mul },
    } as Partial<ChromeRole>;
  }
  if (kind === "bar") {
    // bar_round_small = 96×16 → slice 8; bar_round_large = 96×24 → slice 12
    const small = name.includes("small");
    const slice = small ? 8 : 12;
    return { slice, width: slice } as Partial<ChromeRole>;
  }
  // outline: keep current numeric slice; not derived from filename
  return {};
}

function clampPct(value: number) {
  return Math.max(0, Math.min(100, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
}

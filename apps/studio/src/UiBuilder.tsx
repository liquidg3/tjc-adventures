import { useEffect, useMemo, useState } from "react";
import {
  applyUiTheme,
  cloneTheme,
  DEFAULT_UI_THEME,
  loadUiAssets,
  mergeUiTheme,
  UI_ROLE_LABELS,
  UI_ROLE_ORDER,
  type UiAssetEntry,
  type UiChromeRole,
  type UiChromeRoleId,
  type UiTheme,
} from "./ui-theme-state";

const UI_THEME_URL = "/__ui-theme";

const SLICE_PRESETS = [
  { label: "Small bar", slice: "8", width: "8px", fill: true },
  { label: "Large bar", slice: "12", width: "12px", fill: true },
  { label: "Header card", slice: "28 12 12 12", width: "28px 12px 12px 12px", fill: true },
  { label: "Header 2x", slice: "52 24 24 24", width: "26px 12px 12px 12px", fill: true },
  { label: "Outline", slice: "12", width: "12px", fill: false },
];

const BUTTON_VARIANT_ROLES: UiChromeRoleId[] = [
  "button-hover",
  "button-active",
  "button-disabled",
];

const HEADER_CARD_ROLES: UiChromeRoleId[] = [
  "card-home",
  "card-content",
  "panel-side",
];

export function UiBuilder() {
  const [theme, setTheme] = useState<UiTheme>(() => cloneTheme(DEFAULT_UI_THEME));
  const [savedTheme, setSavedTheme] = useState<UiTheme>(() => cloneTheme(DEFAULT_UI_THEME));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);
  const [assets, setAssets] = useState<UiAssetEntry[]>([]);
  const [selectedRole, setSelectedRole] = useState<UiChromeRoleId>("button-default");
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

  const role = theme.roles[selectedRole];
  const selectedAsset = assets.find((asset) => asset.url === role.image);
  const dirty = JSON.stringify(theme) !== JSON.stringify(savedTheme);

  function updateRole(id: UiChromeRoleId, patch: Partial<UiChromeRole>) {
    setTheme({
      ...theme,
      roles: {
        ...theme.roles,
        [id]: { ...theme.roles[id], ...patch },
      },
    });
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

  function matchButtonGeometry(id: UiChromeRoleId) {
    const base = theme.roles["button-default"];
    updateRole(id, {
      slice: base.slice,
      width: base.width,
      padding: base.padding,
      headerPadding: base.headerPadding,
      bodyPadding: base.bodyPadding,
      uppercase: base.uppercase,
      letterSpacing: base.letterSpacing,
    });
  }

  function setHeaderPaddingFromSlice(id: UiChromeRoleId) {
    const role = theme.roles[id];
    const slice = parseBox(role.slice, "");
    const padding = parseBox(role.headerPadding, "px");
    updateRole(id, {
      headerPadding: formatBox({ ...padding, top: Math.max(slice.top, padding.top) }, "px"),
    });
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
          Map imported UI pack images onto Studio chrome roles.
          {" "}
          <span className="dim">
            {assets.length} assets · {dirty ? "unsaved changes" : "saved"}
          </span>
        </p>
      </header>

      <div className="ui-builder-layout">
        <aside className="ui-role-list">
          <h3>Roles</h3>
          {UI_ROLE_ORDER.map((id) => (
            <button
              key={id}
              className={`ui-role-button ${selectedRole === id ? "on" : ""}`}
              onClick={() => setSelectedRole(id)}
            >
              {UI_ROLE_LABELS[id]}
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
                Replace the current draft with the default sci-fi theme. This
                will stay local until you hit Save.
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
              <h2>{UI_ROLE_LABELS[selectedRole]}</h2>
              <p className="dim">{selectedAsset ? `${selectedAsset.pack}/${selectedAsset.name}` : role.image}</p>
            </div>
            <RolePreview label={UI_ROLE_LABELS[selectedRole]} role={role} />
          </div>

          {BUTTON_VARIANT_ROLES.includes(selectedRole) && (
            <div className="ui-role-hint">
              <span>Button variants should use the same slice and padding as Button.</span>
              <button onClick={() => matchButtonGeometry(selectedRole)}>
                Match Button geometry
              </button>
            </div>
          )}

          {HEADER_CARD_ROLES.includes(selectedRole) && (
            <div className="ui-role-hint">
              <span>
                Header cards need top padding high enough to move content below the header band.
              </span>
              <button onClick={() => setHeaderPaddingFromSlice(selectedRole)}>
                Use slice as header
              </button>
            </div>
          )}

          <label className="ui-field">
            <span>Asset search</span>
            <input
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              placeholder="button, header, bar, grey..."
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
                onClick={() => updateRole(selectedRole, { image: asset.url })}
                title={`${asset.pack}/${asset.name}`}
              >
                <img src={asset.url} alt="" />
              </button>
            ))}
          </div>

          <SlicePreview role={role} />

          <div className="ui-preset-row">
            {SLICE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() =>
                  updateRole(selectedRole, {
                    slice: preset.slice,
                    width: preset.width,
                    fill: preset.fill,
                  })
                }
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="ui-control-grid">
            <BoxNumberEditor
              label="Slice"
              value={role.slice}
              unit=""
              min={0}
              max={128}
              onChange={(slice) => updateRole(selectedRole, { slice })}
            />
            <BoxNumberEditor
              label="Border width"
              value={role.width}
              unit="px"
              min={0}
              max={80}
              onChange={(width) => updateRole(selectedRole, { width })}
            />
            <BoxNumberEditor
              label="Padding"
              value={role.padding}
              unit="px"
              min={0}
              max={80}
              onChange={(padding) => updateRole(selectedRole, { padding })}
            />
            {HEADER_CARD_ROLES.includes(selectedRole) && (
              <>
                <BoxNumberEditor
                  label="Header padding"
                  value={role.headerPadding}
                  unit="px"
                  min={0}
                  max={120}
                  onChange={(headerPadding) => updateRole(selectedRole, { headerPadding })}
                />
                <BoxNumberEditor
                  label="Body padding"
                  value={role.bodyPadding}
                  unit="px"
                  min={0}
                  max={120}
                  onChange={(bodyPadding) => updateRole(selectedRole, { bodyPadding })}
                />
              </>
            )}
            <label className="ui-field">
              <span>Text color</span>
              <input
                type="color"
                value={normalizeColor(role.textColor)}
                onChange={(e) => updateRole(selectedRole, { textColor: e.target.value })}
              />
            </label>
            <label className="ui-field">
              <span>Fill color</span>
              <input
                type="color"
                value={normalizeColor(role.fillColor)}
                onChange={(e) => updateRole(selectedRole, { fillColor: e.target.value })}
              />
            </label>
            <label className="ui-check">
              <input
                type="checkbox"
                checked={role.fill}
                onChange={(e) => updateRole(selectedRole, { fill: e.target.checked })}
              />
              Fill center
            </label>
            <label className="ui-check">
              <input
                type="checkbox"
                checked={role.uppercase}
                onChange={(e) => updateRole(selectedRole, { uppercase: e.target.checked })}
              />
              Uppercase
            </label>
            <label className="ui-field">
              <span>Letter spacing</span>
              <input
                value={role.letterSpacing}
                onChange={(e) => updateRole(selectedRole, { letterSpacing: e.target.value })}
                placeholder="0.05em"
              />
            </label>
          </div>
        </section>

        <aside className="ui-preview-panel">
          <h3>Preview</h3>
          <div className="ui-preview-wall">
            <button>Default</button>
            <button className="on">Active</button>
            <button disabled>Disabled</button>
            <input value="Input field" readOnly />
            <div className="ui-preview-badges">
              <span className="badge">Default</span>
              <span className="badge ok">Set</span>
              <span className="badge miss">Missing</span>
              <span className="badge kind-3d">3D</span>
              <span className="badge kind-ui">UI</span>
            </div>
            <div className="ui-preview-toolbar">Toolbar</div>
            <div className="ui-preview-card-home">
              <strong>Vertical Shooter Level Builder</strong>
              <span>Paint scenery and altitude onto a top-down grid for the scroller.</span>
              <em>Ready</em>
            </div>
            <div className="ui-preview-card-content">
              <strong>Content Card</strong>
              <span>
                Pack, slot, and preview card shell with enough copy to wrap over
                multiple lines.
              </span>
            </div>
            <div className="ui-preview-side">
              <strong>Side Panel</strong>
              <span>
                Inspector and palette chrome with stacked controls and wrapped
                helper text.
              </span>
            </div>
            <div className="ui-preview-grid">Grid outline</div>
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

function BoxNumberEditor({
  label,
  value,
  unit,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  unit: string;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  const box = parseBox(value, unit);
  const set = (key: keyof BoxValue, next: number) => {
    onChange(formatBox({ ...box, [key]: clamp(Math.round(next), min, max) }, unit));
  };
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
            value={box[key]}
            onChange={(e) => set(key, Number(e.target.value))}
          />
        </label>
      ))}
    </fieldset>
  );
}

function RolePreview({ label, role }: { label: string; role: UiChromeRole }) {
  return (
    <div
      className="ui-role-preview"
      style={{
        borderImageSource: `url(${role.image})`,
        borderImageSlice: `${role.slice}${role.fill ? " fill" : ""}`,
        borderImageWidth: role.width,
        padding: role.padding,
        color: role.textColor,
        backgroundColor: role.fillColor,
        textTransform: role.uppercase ? "uppercase" : "none",
        letterSpacing: role.letterSpacing,
      }}
    >
      {label}
    </div>
  );
}

function SlicePreview({ role }: { role: UiChromeRole }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const slices = parseSlice(role.slice);
  const top = size.h ? clampPct((slices.top / size.h) * 100) : 0;
  const right = size.w ? clampPct(100 - (slices.right / size.w) * 100) : 100;
  const bottom = size.h ? clampPct(100 - (slices.bottom / size.h) * 100) : 100;
  const left = size.w ? clampPct((slices.left / size.w) * 100) : 0;
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
      <span className="dim">
        Source {size.w || "?"}×{size.h || "?"} · slice {role.slice}
        {role.fill ? " fill" : " outline"}
      </span>
    </div>
  );
}

function parseSlice(value: string) {
  const nums = value
    .split(/\s+/)
    .map((part) => Number.parseFloat(part))
    .filter((n) => Number.isFinite(n));
  const [a = 0, b = a, c = a, d = b] = nums;
  return { top: a, right: b, bottom: c, left: d };
}

interface BoxValue {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function parseBox(value: string, unit: string): BoxValue {
  const nums = value
    .split(/\s+/)
    .map((part) => Number.parseFloat(unit ? part.replace(unit, "") : part))
    .filter((n) => Number.isFinite(n));
  const [a = 0, b = a, c = a, d = b] = nums;
  return { top: a, right: b, bottom: c, left: d };
}

function formatBox(box: BoxValue, unit: string) {
  const values = [box.top, box.right, box.bottom, box.left].map((v) => `${v}${unit}`);
  if (box.top === box.right && box.top === box.bottom && box.top === box.left) return values[0];
  if (box.top === box.bottom && box.right === box.left) return `${values[0]} ${values[1]}`;
  if (box.right === box.left) return `${values[0]} ${values[1]} ${values[2]}`;
  return values.join(" ");
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

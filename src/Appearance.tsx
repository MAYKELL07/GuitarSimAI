import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { X, RotateCcw, SlidersHorizontal } from "lucide-react";
export type AppearanceSettings = {
  accent: string;
  contrast: string;
  compact: boolean;
  sidebar: boolean;
  assistant: boolean;
  sidebarWidth: number;
  assistantWidth: number;
  scale: number;
};
const defaults: AppearanceSettings = {
  accent: "#ffb454",
  contrast: "black",
  compact: true,
  sidebar: true,
  assistant: true,
  sidebarWidth: 208,
  assistantWidth: 292,
  scale: 100,
};
export function useAppearance() {
  const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("selah-appearance") ?? "{}",
      );
      return {
        ...defaults,
        ...saved,
        scale: Math.max(85, Math.min(125, Number(saved.scale) || 100)),
        sidebarWidth: Math.max(
          170,
          Math.min(290, Number(saved.sidebarWidth) || 208),
        ),
        assistantWidth: Math.max(
          250,
          Math.min(430, Number(saved.assistantWidth) || 292),
        ),
        accent: /^#[0-9a-f]{6}$/i.test(saved.accent)
          ? saved.accent
          : defaults.accent,
      };
    } catch {
      return defaults;
    }
  });
  useEffect(() => {
    localStorage.setItem("selah-appearance", JSON.stringify(appearance));
  }, [appearance]);
  const style = {
    "--accent": appearance.accent,
    "--lime": appearance.accent,
    "--sidebar-width": appearance.sidebar
      ? `${appearance.sidebarWidth}px`
      : "0px",
    "--assistant-width": `${appearance.assistantWidth}px`,
    "--ui-zoom": appearance.scale / 100,
  } as CSSProperties;
  return { appearance, setAppearance, style };
}
export default function Appearance({
  value,
  setValue,
  onClose,
}: {
  value: AppearanceSettings;
  setValue: (v: AppearanceSettings) => void;
  onClose: () => void;
}) {
  const patch = (v: Partial<AppearanceSettings>) =>
    setValue({ ...value, ...v });
  return (
    <div className="appearance-backdrop" onClick={onClose}>
      <section
        className="appearance-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Customize workspace"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <span>
            <SlidersHorizontal size={17} /> Workspace preferences
          </span>
          <button aria-label="Close workspace preferences" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <p>
          Make the workspace fit your screen and the way you play. Changes save
          on this device.
        </p>
        <label>
          Accent color
          <div className="accent-options">
            {[
              "#ffb454",
              "#67c8ff",
              "#b7df69",
              "#c6a0ff",
              "#ee8b9b",
              "#eeeeee",
            ].map((color) => (
              <button
                key={color}
                aria-label={`Use ${color} accent`}
                aria-pressed={value.accent === color}
                style={{ background: color }}
                onClick={() => patch({ accent: color })}
              />
            ))}
            <input
              aria-label="Custom accent color"
              type="color"
              value={value.accent}
              onChange={(e) => patch({ accent: e.target.value })}
            />
          </div>
        </label>
        <label>
          Surface
          <select
            value={value.contrast}
            onChange={(e) => patch({ contrast: e.target.value })}
          >
            <option value="black">Studio black</option>
            <option value="graphite">Graphite</option>
          </select>
        </label>
        <label className="preference-toggle">
          <input
            type="checkbox"
            checked={value.compact}
            onChange={(e) => patch({ compact: e.target.checked })}
          />{" "}
          Compact device spacing
        </label>
        <label className="preference-toggle">
          <input
            type="checkbox"
            checked={value.sidebar}
            onChange={(e) => patch({ sidebar: e.target.checked })}
          />{" "}
          Show browser sidebar
        </label>
        <label className="preference-toggle">
          <input
            type="checkbox"
            checked={value.assistant}
            onChange={(e) => patch({ assistant: e.target.checked })}
          />{" "}
          Show ChatGPT companion
        </label>
        {[
          {
            key: "scale",
            label: "Interface scale",
            min: 85,
            max: 125,
            unit: "%",
          },
          {
            key: "sidebarWidth",
            label: "Sidebar width",
            min: 170,
            max: 290,
            unit: "px",
          },
          {
            key: "assistantWidth",
            label: "Companion width",
            min: 250,
            max: 430,
            unit: "px",
          },
        ].map((item) => (
          <label key={item.key}>
            {item.label}
            <span>
              {value[item.key as "scale"]} {item.unit}
            </span>
            <input
              aria-label={item.label}
              type="range"
              min={item.min}
              max={item.max}
              value={value[item.key as "scale"]}
              onChange={(e) => patch({ [item.key]: +e.target.value })}
            />
          </label>
        ))}
        <button className="button" onClick={() => setValue(defaults)}>
          <RotateCcw size={14} /> Reset workspace
        </button>
      </section>
    </div>
  );
}

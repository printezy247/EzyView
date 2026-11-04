import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";
import { Select } from "../ui";

interface Props {
  draft: ChartSettings;
  setDraft: Dispatch<SetStateAction<ChartSettings>>;
}

export function CanvasSettingsTab({ draft, setDraft }: Props) {
  return (
    <div className="space-y-4">
      <div className="font-semibold text-ev-strong">Background & Grids</div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span>Background</span>
          <div className="flex items-center gap-2">
            <Select
              label="Background"
              size="sm"
              value={draft.canvas.backgroundType}
              onChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  canvas: {
                    ...d.canvas,
                    backgroundType: v as "solid" | "gradient",
                  },
                }))
              }
              options={[
                { value: "solid", label: "Solid" },
                { value: "gradient", label: "Gradient" },
              ]}
            />
            <input
              type="color"
              value={draft.canvas.backgroundColor}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  canvas: { ...d.canvas, backgroundColor: e.target.value },
                }))
              }
              className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
            />
            {draft.canvas.backgroundType === "gradient" && (
              <input
                type="color"
                value={draft.canvas.backgroundGradientColor}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    canvas: { ...d.canvas, backgroundGradientColor: e.target.value },
                  }))
                }
                className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.canvas.vertGridLines}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  canvas: { ...d.canvas, vertGridLines: e.target.checked },
                }))
              }
              className="accent-ev-accent"
            />
            <span>Vert grid lines</span>
          </label>
          <input
            type="color"
            value={draft.canvas.vertGridColor}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                canvas: { ...d.canvas, vertGridColor: e.target.value },
              }))
            }
            className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.canvas.horzGridLines}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  canvas: { ...d.canvas, horzGridLines: e.target.checked },
                }))
              }
              className="accent-ev-accent"
            />
            <span>Horz grid lines</span>
          </label>
          <input
            type="color"
            value={draft.canvas.horzGridColor}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                canvas: { ...d.canvas, horzGridColor: e.target.value },
              }))
            }
            className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
          />
        </div>

        <div className="flex items-center justify-between">
          <span>Crosshair</span>
          <div className="flex items-center gap-2">
            <Select
              label="Crosshair"
              size="sm"
              value={draft.canvas.crosshairStyle}
              onChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  canvas: {
                    ...d.canvas,
                    crosshairStyle: v as "dashed" | "dotted" | "solid",
                  },
                }))
              }
              options={[
                { value: "dashed", label: "Dashed" },
                { value: "dotted", label: "Dotted" },
                { value: "solid", label: "Solid" },
              ]}
            />
            <input
              type="color"
              value={draft.canvas.crosshairColor}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  canvas: { ...d.canvas, crosshairColor: e.target.value },
                }))
              }
              className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.canvas.watermark}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                canvas: { ...d.canvas, watermark: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Watermark (Symbol & interval)</span>
        </label>

        <div className="flex items-center justify-between">
          <span>Scales font size</span>
          <Select
            label="Scales font size"
            size="sm"
            value={String(draft.canvas.scalesFontSize)}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                canvas: { ...d.canvas, scalesFontSize: Number(v) },
              }))
            }
            options={[10, 11, 12, 14, 16].map((s) => ({ value: String(s), label: `${s} px` }))}
          />
        </div>
      </div>

      <div className="my-3 border-t border-ev-raised" />

      <div className="font-semibold text-ev-strong">Margins</div>
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-micro text-ev-muted">Top (%)</span>
          <input
            type="number"
            min={0}
            max={50}
            value={draft.canvas.topMarginPct}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                canvas: { ...d.canvas, topMarginPct: Number(e.target.value) },
              }))
            }
            className="w-full rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-micro text-ev-muted">Bottom (%)</span>
          <input
            type="number"
            min={0}
            max={50}
            value={draft.canvas.bottomMarginPct}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                canvas: { ...d.canvas, bottomMarginPct: Number(e.target.value) },
              }))
            }
            className="w-full rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-micro text-ev-muted">Right (bars)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={draft.canvas.rightMarginBars}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                canvas: { ...d.canvas, rightMarginBars: Number(e.target.value) },
              }))
            }
            className="w-full rounded border border-ev-line bg-ev-panel px-2 py-1 text-dense text-ev-strong"
          />
        </label>
      </div>
    </div>
  );
}

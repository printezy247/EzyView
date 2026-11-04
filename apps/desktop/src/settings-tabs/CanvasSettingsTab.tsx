import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";
import { Checkbox, ColorInput, NumberInput, Select } from "../ui";

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
            <ColorInput label="Background colour" value={draft.canvas.backgroundColor} onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  canvas: { ...d.canvas, backgroundColor: value },
                }))} />
            {draft.canvas.backgroundType === "gradient" && (
              <ColorInput label="Gradient colour" value={draft.canvas.backgroundGradientColor} onChange={(value) =>
                  setDraft((d) => ({
                    ...d,
                    canvas: { ...d.canvas, backgroundGradientColor: value },
                  }))} />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Checkbox label="Vert grid lines" checked={draft.canvas.vertGridLines} onChange={(checked) =>
                setDraft((d) => ({
                  ...d,
                  canvas: { ...d.canvas, vertGridLines: checked },
                }))} />
          <ColorInput label="Vertical grid colour" value={draft.canvas.vertGridColor} onChange={(value) =>
              setDraft((d) => ({
                ...d,
                canvas: { ...d.canvas, vertGridColor: value },
              }))} />
        </div>

        <div className="flex items-center justify-between">
          <Checkbox label="Horz grid lines" checked={draft.canvas.horzGridLines} onChange={(checked) =>
                setDraft((d) => ({
                  ...d,
                  canvas: { ...d.canvas, horzGridLines: checked },
                }))} />
          <ColorInput label="Horizontal grid colour" value={draft.canvas.horzGridColor} onChange={(value) =>
              setDraft((d) => ({
                ...d,
                canvas: { ...d.canvas, horzGridColor: value },
              }))} />
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
            <ColorInput label="Crosshair colour" value={draft.canvas.crosshairColor} onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  canvas: { ...d.canvas, crosshairColor: value },
                }))} />
          </div>
        </div>

        <Checkbox label="Watermark (Symbol & interval)" checked={draft.canvas.watermark} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                canvas: { ...d.canvas, watermark: checked },
              }))} />

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
        <NumberInput
          label="Top (%)"
          min={0}
          max={50}
          value={draft.canvas.topMarginPct}
          onValueChange={(v) => setDraft((d) => ({ ...d, canvas: { ...d.canvas, topMarginPct: v ?? 0 } }))}
        />
        <NumberInput
          label="Bottom (%)"
          min={0}
          max={50}
          value={draft.canvas.bottomMarginPct}
          onValueChange={(v) => setDraft((d) => ({ ...d, canvas: { ...d.canvas, bottomMarginPct: v ?? 0 } }))}
        />
        <NumberInput
          label="Right (bars)"
          min={0}
          max={100}
          value={draft.canvas.rightMarginBars}
          onValueChange={(v) => setDraft((d) => ({ ...d, canvas: { ...d.canvas, rightMarginBars: v ?? 0 } }))}
        />
      </div>
    </div>
  );
}

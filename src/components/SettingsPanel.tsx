import React from "react";
import { MarginPresetOption, PdfOptions } from "../types";
import { mmToPt, PAGE_SIZES_PT } from "../lib/layout";

interface SettingsPanelProps {
  options: PdfOptions;
  onChange: (options: PdfOptions) => void;
  disabled: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  options,
  onChange,
  disabled,
}) => {
  const updateOption = <K extends keyof PdfOptions>(key: K, value: PdfOptions[K]) => {
    onChange({
      ...options,
      [key]: value,
    });
  };

  // Check margin validation for standard sizes
  let marginValidationError = "";
  if (options.pageSize !== "Original") {
    const std = PAGE_SIZES_PT[options.pageSize];
    let pw: number = std.width;
    let ph: number = std.height;
    if (options.orientation === "Landscape") {
      pw = Math.max(std.width, std.height);
      ph = Math.min(std.width, std.height);
    }
    const [topMm, rightMm, bottomMm, leftMm] =
      options.marginPreset === "Custom"
        ? options.customMargins
        : [options.marginMm, options.marginMm, options.marginMm, options.marginMm];

    const hMarginsPt = mmToPt(leftMm + rightMm);
    const vMarginsPt = mmToPt(topMm + bottomMm);

    if (pw - hMarginsPt <= 0 || ph - vMarginsPt <= 0) {
      marginValidationError = `Margins (${(leftMm + rightMm).toFixed(1)}mm H, ${(topMm + bottomMm).toFixed(1)}mm V) exceed page dimensions.`;
    }
  }

  return (
    <section className="panel settings-panel">
      <div className="section-head">
        <div>
          <h2>PDF Settings</h2>
          <p className="panel-subtitle">Configure page layout and export quality</p>
        </div>
        <span className="step-badge">02</span>
      </div>

      <fieldset disabled={disabled} className="settings-fieldset">
        {/* Output Filename */}
        <label className="setting-control">
          <span className="setting-title">Output Filename</span>
          <div className="filename-input-group">
            <input
              type="text"
              maxLength={80}
              value={options.filename}
              onChange={(e) => updateOption("filename", e.target.value)}
              placeholder="document"
              className="text-input"
            />
            <span className="filename-ext">.pdf</span>
          </div>
        </label>

        {/* Page Size */}
        <label className="setting-control">
          <span className="setting-title">Page Size</span>
          <select
            value={options.pageSize}
            onChange={(e) =>
              updateOption("pageSize", e.target.value as PdfOptions["pageSize"])
            }
            className="setting-select"
          >
            <option value="A4">A4 (210 × 297 mm)</option>
            <option value="Letter">US Letter (8.5 × 11 in)</option>
            <option value="Original">Original (Image-sized pages)</option>
          </select>
          <span className="setting-hint">
            {options.pageSize === "Original"
              ? "Each page matches the unscaled point dimensions of its image."
              : "Standard document sheet size."}
          </span>
        </label>

        {/* Orientation */}
        <label className="setting-control">
          <span className="setting-title">Orientation</span>
          <select
            value={options.orientation}
            disabled={options.pageSize === "Original"}
            onChange={(e) =>
              updateOption(
                "orientation",
                e.target.value as PdfOptions["orientation"]
              )
            }
            className="setting-select"
          >
            <option value="Auto">Auto (matches image shape)</option>
            <option value="Portrait">Portrait</option>
            <option value="Landscape">Landscape</option>
          </select>
        </label>

        {/* Fitting */}
        <label className="setting-control">
          <span className="setting-title">Image Fit</span>
          <select
            value={options.fit}
            onChange={(e) =>
              updateOption("fit", e.target.value as PdfOptions["fit"])
            }
            className="setting-select"
          >
            <option value="Contain">Contain (show entire image)</option>
            <option value="Cover">Cover (fill printable area, crop overflow)</option>
            <option value="Original">Original (1:1 native points)</option>
          </select>
          <span className="setting-hint">
            {options.fit === "Contain" &&
              "Preserves the full image without cropping; adds uniform letterboxing if needed."}
            {options.fit === "Cover" &&
              "Fills the printable area without white borders; crops overflowing edges."}
            {options.fit === "Original" &&
              "Places image at unscaled point resolution centered on page."}
          </span>
        </label>

        {/* Quality Profile */}
        <label className="setting-control">
          <span className="setting-title">Quality Profile</span>
          <select
            value={options.profile}
            onChange={(e) =>
              updateOption("profile", e.target.value as PdfOptions["profile"])
            }
            className="setting-select"
          >
            <option value="Screen/Mobile">Screen & Mobile (150 DPI · Compact)</option>
            <option value="Print">Print (300 DPI · High resolution)</option>
            <option value="Original">Original (Preserve native source pixels)</option>
          </select>
          <span className="setting-hint">
            {options.profile === "Screen/Mobile" &&
              "Downscales images above 1654px for fast viewing, email, and messaging."}
            {options.profile === "Print" &&
              "Downscales images above 3508px for crisp physical printing."}
            {options.profile === "Original" &&
              "Preserves source pixel resolution without downscaling."}
          </span>
        </label>

        {/* Margin Preset */}
        <label className="setting-control">
          <span className="setting-title">Margins</span>
          <select
            value={options.marginPreset}
            onChange={(e) => {
              const preset = e.target.value as MarginPresetOption;
              let mm = options.marginMm;
              if (preset === "None") mm = 0;
              else if (preset === "Small") mm = 5;
              else if (preset === "Medium") mm = 10;
              else if (preset === "Large") mm = 20;

              onChange({
                ...options,
                marginPreset: preset,
                marginMm: mm,
                customMargins: [mm, mm, mm, mm],
              });
            }}
            className="setting-select"
          >
            <option value="None">None · 0 mm</option>
            <option value="Small">Small · 5 mm</option>
            <option value="Medium">Medium · 10 mm</option>
            <option value="Large">Large · 20 mm</option>
            <option value="Custom">Custom margins…</option>
          </select>
        </label>

        {/* Custom Margins Input Grid */}
        {options.marginPreset === "Custom" && (
          <div className="custom-margins-box">
            <span className="custom-margins-legend">Custom Margins (mm)</span>
            <div className="custom-margins-grid">
              {(["Top", "Right", "Bottom", "Left"] as const).map((side, i) => (
                <label key={side} className="margin-side-label">
                  <span>{side}</span>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    step={1}
                    value={options.customMargins[i]}
                    onChange={(e) => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      const next = [...options.customMargins] as [
                        number,
                        number,
                        number,
                        number,
                      ];
                      next[i] = val;
                      updateOption("customMargins", next);
                    }}
                    className="margin-input"
                  />
                </label>
              ))}
            </div>

            <button
              type="button"
              className="copy-margins-btn"
              onClick={() => {
                const topVal = options.customMargins[0];
                updateOption("customMargins", [topVal, topVal, topVal, topVal]);
              }}
            >
              Set all sides to Top value ({options.customMargins[0]} mm)
            </button>
          </div>
        )}

        {/* Margin Validation Warning */}
        {marginValidationError && (
          <div className="validation-alert" role="alert">
            ⚠ {marginValidationError}
          </div>
        )}
      </fieldset>

      <div className="privacy-card">
        <span className="privacy-icon">🔒</span>
        <div>
          <strong>Zero-Upload Guarantee</strong>
          <p>
            Your files are processed in your browser and are not uploaded by this application.
          </p>
        </div>
      </div>
    </section>
  );
};

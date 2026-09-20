import { Options } from "./api";
export default function Settings({
  tool,
  value,
  onChange,
  disabled,
  inputPassword,
  setInputPassword,
  outputPassword,
  setOutputPassword,
}: {
  tool: string;
  value: Options;
  onChange: (o: Options) => void;
  disabled: boolean;
  inputPassword: string;
  setInputPassword: (v: string) => void;
  outputPassword: string;
  setOutputPassword: (v: string) => void;
}) {
  const set = (key: keyof Options, v: unknown) =>
    onChange({ ...value, [key]: v });
  const select = (key: keyof Options, label: string, items: string[]) => (
    <label>
      {label}
      <select
        value={String(value[key])}
        onChange={(e) => set(key, e.target.value)}
      >
        {items.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  const number = (
    key: keyof Options,
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(value[key])}
        onChange={(e) => set(key, Number(e.target.value))}
      />
    </label>
  );
  return (
    <fieldset disabled={disabled} className="settings-fields">
      <label>
        Output name
        <input
          maxLength={100}
          value={value.filename}
          onChange={(e) => set("filename", e.target.value)}
        />
      </label>
      {tool === "images" && (
        <>
          {select("page_size", "Page size", ["A4", "Letter", "Original"])}
          {select("orientation", "Orientation", [
            "Auto",
            "Portrait",
            "Landscape",
          ])}
          {select("fit", "Image fit", ["Contain", "Cover", "Original"])}
          <label>
            Output profile
            <select
              value={value.profile || "Screen/Mobile"}
              onChange={(e) => set("profile", e.target.value)}
            >
              <option value="Screen/Mobile">Screen & Mobile (Fast viewing · 150 DPI)</option>
              <option value="Print">Print (High resolution · 300 DPI)</option>
              <option value="Original">Original (Preserve quality)</option>
            </select>
          </label>
          {select("quality", "Image quality", [
            "Original",
            "Maximum",
            "High",
            "Medium",
            "Small File",
          ])}
          <label>
            Margin preset
            <select
              value={value.margins ? "Custom" : String(value.margin)}
              onChange={(e) =>
                e.target.value === "Custom"
                  ? set("margins", [
                      value.margin,
                      value.margin,
                      value.margin,
                      value.margin,
                    ])
                  : onChange({
                      ...value,
                      margin: Number(e.target.value),
                      margins: null,
                    })
              }
            >
              <option value="0">None · 0 mm</option>
              <option value="5">Small · 5 mm</option>
              <option value="10">Medium · 10 mm</option>
              <option value="20">Large · 20 mm</option>
              <option>Custom</option>
            </select>
          </label>
          {value.margins && (
            <div className="margin-grid">
              {["Top", "Right", "Bottom", "Left"].map((side, i) => (
                <label key={side}>
                  {side} (mm)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={value.margins![i]}
                    onChange={(e) =>
                      set(
                        "margins",
                        value.margins!.map((v, n) =>
                          i === n ? Number(e.target.value) : v,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={() => set("margins", Array(4).fill(value.margins![0]))}
              >
                Use top value for all
              </button>
            </div>
          )}
          <p className="hint">
            Contain keeps the entire image. Cover crops overflow. Original
            preserves pixels; High downsizes large images. Transparent areas
            become white.
          </p>
        </>
      )}
      {tool !== "images" && (
        <>
          <label>
            Input PDF password (if needed)
            <input
              autoComplete="off"
              type="password"
              value={inputPassword}
              onChange={(e) => setInputPassword(e.target.value)}
            />
          </label>
          <p className="hint">
            Document passwords stay in memory and must be re-entered after
            refresh. Editing signed PDFs can invalidate signatures.
          </p>
        </>
      )}
      {["extract", "split", "render", "numbers", "watermark"].includes(
        tool,
      ) && (
        <label>
          Page range (blank = all)
          <input
            placeholder="1-5, 8, 12-15"
            value={value.ranges}
            onChange={(e) => set("ranges", e.target.value)}
          />
        </label>
      )}
      {tool === "split" && (
        <label>
          Groups, separated by semicolons
          <input
            placeholder="1-3; 4-6; 7,9"
            value={value.groups}
            onChange={(e) => set("groups", e.target.value)}
          />
          <small>Blank creates one file per selected page.</small>
        </label>
      )}
      {tool === "render" && (
        <>
          {select("image_format", "Image format", ["PNG", "JPEG"])}
          {number("dpi", "Resolution (DPI)", 36, 300)}
        </>
      )}
      {tool === "compress" && (
        <>
          {select("compression", "Compression", ["lossless", "lossy"])}
          <p className="hint">
            Lossy mode recompresses eligible opaque images and keeps text. If
            size does not improve, the original is retained.
          </p>
        </>
      )}
      {["numbers", "watermark"].includes(tool) && (
        <>
          {select("position", "Position", [
            "top-left",
            "top-center",
            "top-right",
            "center",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ])}
          {number("font_size", "Font size (pt)", 6, 144)}
          <label>
            Color
            <input
              type="color"
              value={value.color}
              onChange={(e) => set("color", e.target.value)}
            />
          </label>
        </>
      )}
      {tool === "numbers" && (
        <>
          {number("start_number", "Starting number", 0, 1000000)}
          {select("numbering", "Number format", ["number", "Page X of Y"])}
        </>
      )}
      {tool === "watermark" && (
        <>
          <label>
            Watermark text
            <input
              maxLength={200}
              value={value.text}
              onChange={(e) => set("text", e.target.value)}
            />
          </label>
          {number("opacity", "Opacity", 0, 1, 0.05)}
          {number("angle", "Angle", -180, 180)}
        </>
      )}
      {tool === "protect" && (
        <label>
          New output password
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={outputPassword}
            onChange={(e) => setOutputPassword(e.target.value)}
          />
          <small>
            At least 12 characters. Save it securely; it cannot be recovered.
          </small>
        </label>
      )}
    </fieldset>
  );
}

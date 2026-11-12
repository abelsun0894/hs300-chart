import type { SaveStatus, Tool } from "../types";

const SWATCHES = ["#58a6ff", "#ef5350", "#26a69a", "#f5d76e", "#c39bd3", "#e6edf3", "#ff8c42"];

export default function Toolbar({
  tool,
  color,
  canDelete,
  saveStatus,
  onTool,
  onColor,
  onDelete,
  onSave,
}: {
  tool: Tool;
  color: string;
  canDelete: boolean;
  saveStatus: SaveStatus;
  onTool: (t: Tool) => void;
  onColor: (c: string) => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const statusText =
    saveStatus === "saving"
      ? "保存中…"
      : saveStatus === "saved"
        ? "已保存"
        : saveStatus === "dirty"
          ? "未保存"
          : saveStatus === "error"
            ? "保存失败"
            : "";

  return (
    <div className="toolbar">
      <button
        type="button"
        className={`btn ${tool === "line" ? "active" : ""}`}
        onClick={() => onTool(tool === "line" ? "none" : "line")}
      >
        画线
      </button>
      <button
        type="button"
        className={`btn ${tool === "box" ? "active" : ""}`}
        onClick={() => onTool(tool === "box" ? "none" : "box")}
      >
        画框
      </button>
      <button type="button" className="btn danger" disabled={!canDelete} onClick={onDelete}>
        删除
      </button>
      <div className="color-wrap">
        <span>颜色</span>
        <input
          type="color"
          value={color.length === 7 ? color : "#58a6ff"}
          onChange={(e) => onColor(e.target.value)}
          aria-label="改颜色"
        />
        <div className="swatches">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${c.toLowerCase() === color.toLowerCase() ? "selected" : ""}`}
              style={{ ["--c" as string]: c }}
              onClick={() => onColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <button type="button" className="btn primary" onClick={onSave}>
        保存
      </button>
      <div className={`save-status ${saveStatus}`}>{statusText}</div>
    </div>
  );
}

import React from "react";
import { MarkerDot } from "./markerUtils";
import { VectorLayer } from "./vectors";
import { chartById, chartImage, markerView, usedViews } from "./charts";

// One body-region chart with its points (static). `markers` is the whole list, so
// labels keep their running numbers; only the points of `view` are drawn.
export function ChartFigure({ markers, view = "face", facePhoto, size = 200, dotSize = 15, fontSize = 8, praepCount = 1, onClick, className = "", style }) {
  const all = markers || [];
  const own = all.filter((m) => markerView(m) === view);
  return (
    <div
      className={`relative border border-[#DFE3EB] rounded-lg overflow-hidden select-none flex-shrink-0 ${onClick ? "cursor-pointer hover:border-blue-300 transition" : ""} ${className}`}
      style={{ width: size, maxWidth: "100%", aspectRatio: "1", background: "#ffffff", ...style }}
      onClick={onClick}
      title={onClick ? "Klicken zum Bearbeiten" : undefined}
    >
      <img src={chartImage(view, facePhoto)} alt={chartById(view).label} className="w-full h-full object-contain pointer-events-none" draggable={false} />
      <VectorLayer markers={own} />
      {all.map((m, idx) => markerView(m) === view && (
        <div key={m.id ?? idx} className="absolute flex items-center justify-center" style={{ left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)", zIndex: 10 }}>
          <MarkerDot marker={m} idx={idx} size={dotSize} fontSize={fontSize} shadow praepCount={praepCount} />
        </div>
      ))}
    </div>
  );
}

// Every chart that has points, each with its region name when there is more than one
export function ChartFigures({ markers, facePhoto, size, dotSize, fontSize, praepCount, onClick, gap = "gap-3" }) {
  const views = usedViews(markers);
  if (views.length === 1) {
    return <ChartFigure markers={markers} view={views[0]} facePhoto={facePhoto} size={size} dotSize={dotSize} fontSize={fontSize} praepCount={praepCount} onClick={onClick} />;
  }
  return (
    <div className={`flex flex-wrap ${gap}`}>
      {views.map((v) => (
        <figure key={v} className="m-0">
          <ChartFigure markers={markers} view={v} facePhoto={facePhoto} size={size} dotSize={dotSize} fontSize={fontSize} praepCount={praepCount} onClick={onClick} />
          <figcaption className="text-[11px] text-gray-500 mt-1">{chartById(v).label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { evalAmount } from "../../utils/helpers";
import { CHARTS, chartById, chartImage, markerView, usedViews } from "./charts";
import { ChartFigures } from "./ChartFigure";
import { trackEvent } from "../../lib/analytics";
import { MarkerDot, ColorSwatches, DoseChips, PraeparatChips, PraeparatBadge, LiveTotal, DEFAULT_MARKER_COLOR, markerColor, nextMarkerColor, sameAmount } from "./markerUtils";
import { markerPraepIdx } from "../../utils/praeparate";
import { isGuide, addMarker, treatmentPoints } from "../../utils/markers";
import { useVectorTools, VectorToolbar, VectorLayer, VectorDrawingBar, VectorSummary, VectorLegend, isVector, vectorInstruction, EditorRow, EDITOR_LABEL_WIDTH } from "./vectors";

// ═══════════════════ Treatment Map ═══════════════════

export function compressImage(file, maxSize = 400, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const result = canvas.toDataURL("image/jpeg", quality);
        resolve(result);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TreatmentMap({ markers, setMarkers, einheit, readOnly, notes, autoOpen, onAutoSave, onAutoCancel, facePhoto, onFacePhotoChange, planMode, praeparate }) {
  // Body region shown in the editor; new points belong to it (marker.v, absent = face)
  const [view, setViewRaw] = React.useState(() => usedViews(markers)[0]);
  const inView = (m) => markerView(m) === view;
  // Several Präparate on one document: each point belongs to one of them (marker.p)
  const praepList = Array.isArray(praeparate) ? praeparate : [];
  const praepCount = praepList.length;
  const multiPraep = praepCount > 1;
  // Defaults for new points come from the last point; Markierungen carry no dose, colour or Präparat
  const lastPoint = treatmentPoints(markers).slice(-1)[0];
  const [activePraep, setActivePraep] = React.useState(lastPoint ? markerPraepIdx(lastPoint, praepCount || Infinity) : 0);
  React.useEffect(() => { if (praepCount > 0 && activePraep > praepCount - 1) setActivePraep(praepCount - 1); }, [praepCount]); // eslint-disable-line react-hooks/exhaustive-deps
  // Unit shown for a point: its Präparat's unit, else the document unit
  const unitFor = (m) => (multiPraep ? (praepList[markerPraepIdx(m, praepCount)]?.einheit || einheit) : einheit);
  const activeEinheit = multiPraep ? (praepList[activePraep]?.einheit || einheit) : einheit;
  const photoInputRef = React.useRef(null);
  const [modalOpen, setModalOpen] = React.useState(!!autoOpen);
  const [saved, setSaved] = React.useState(markers.length > 0);
  React.useEffect(() => { if (markers.length > 0) setSaved(true); }, [markers]);
  const modalRef = React.useRef(null);
  // Colour applied to newly placed points; starts with the colour of the last existing point
  const [activeColor, setActiveColor] = React.useState(lastPoint ? markerColor(lastPoint) : DEFAULT_MARKER_COLOR);
  // Dose applied to newly placed points; starts with the dose of the last existing point
  const [activeAmount, setActiveAmount] = React.useState(lastPoint ? (lastPoint.amount || "") : "");

  // Picking a dose that already exists on the face adopts that dose's colour,
  // so one region keeps one colour without re-selecting it every time
  const selectDose = (val, { typed = false } = {}) => {
    setActiveAmount(val);
    // Only a chip click picks up the colour of earlier points with that dose; typing must not flicker the colour
    if (!val || typed) return;
    const existing = [...markers].reverse().find((m) => sameAmount(m.amount, val));
    if (existing) setActiveColor(markerColor(existing));
  };

  // Lines and fans (needle/cannula vectors) next to single points
  const vt = useVectorTools({ markers, setMarkers, color: activeColor, amount: activeAmount, praep: multiPraep ? activePraep : 0, view });
  const setView = (v) => { vt.finish(); setViewRaw(v); setZoom(1); setPan({ x: 0, y: 0 }); };
  const facePos = (e) => {
    const rect = modalRef.current.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
  };

  // Pinch-to-zoom state for the modal face map
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const lastTouchDist = React.useRef(null);
  const lastTouchCenter = React.useRef(null);
  const isPinching = React.useRef(false);
  const justPinched = React.useRef(false);

  const boxRef = React.useRef(null);
  const zoomRef = React.useRef(1);
  const panRef = React.useRef({ x: 0, y: 0 });
  zoomRef.current = zoom;
  panRef.current = pan;
  const justDragged = React.useRef(false);
  const dragRef = React.useRef(null);
  const MAX_ZOOM = 5;
  // Below 100 % for an overview of the whole chart while placing points
  const MIN_ZOOM = 0.5;

  // Keep the zoomed image covering the box: pan at most half the overflow on each side.
  // Zoomed out (below 100 %) there is no overflow, so the chart stays centred.
  const clampPanPx = (p, z) => {
    const size = boxRef.current ? boxRef.current.clientWidth : 500;
    const maxP = Math.max(0, ((z - 1) * size) / 2);
    return { x: Math.min(maxP, Math.max(-maxP, p.x)), y: Math.min(maxP, Math.max(-maxP, p.y)) };
  };
  // Zoom by a factor while the point `s` (offset from the box centre, in px) stays under the cursor
  const zoomAt = (factor, s = { x: 0, y: 0 }) => {
    const z = zoomRef.current, p = panRef.current;
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
    if (nz === z) return;
    const np = clampPanPx({ x: s.x - (nz * (s.x - p.x)) / z, y: s.y - (nz * (s.y - p.y)) / z }, nz);
    zoomRef.current = nz; panRef.current = np;
    setZoom(nz); setPan(np);
  };
  // The +/− buttons step through fixed levels so 80 % and 100 % are reachable exactly
  const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.5, 2, 3, 4, 5];
  const stepZoom = (dir) => {
    const z = zoomRef.current;
    const target = dir > 0 ? ZOOM_STEPS.find((v) => v > z + 0.001) : [...ZOOM_STEPS].reverse().find((v) => v < z - 0.001);
    if (target) zoomAt(target / z);
  };
  const resetZoom = () => { zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; setZoom(1); setPan({ x: 0, y: 0 }); };

  // Mouse wheel and trackpad pinch (ctrlKey) zoom at the cursor. Needs a non-passive listener.
  React.useEffect(() => {
    const box = boxRef.current;
    if (!modalOpen || !box) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      const s = { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) };
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), s);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [modalOpen, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dragging moves the zoomed image; a drag never places a point
  const handleMouseDown = (e) => {
    if (e.button !== 0 || zoomRef.current <= 1) return;
    dragRef.current = { x: e.clientX, y: e.clientY, pan: panRef.current, moved: false };
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      const np = clampPanPx({ x: d.pan.x + dx, y: d.pan.y + dy }, zoomRef.current);
      panRef.current = np;
      setPan(np);
    };
    const onUp = () => {
      if (dragRef.current?.moved) { justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 0); }
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Reset zoom when modal opens
  React.useEffect(() => { if (modalOpen) { setZoom(1); setPan({ x: 0, y: 0 }); } }, [modalOpen]);

  // Keep saved in sync when markers change externally (e.g. loading existing data)
  React.useEffect(() => { if (markers.length > 0 && !modalOpen) setSaved(true); }, []);

  const getTouchDist = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  const getTouchCenter = (t1, t2) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      isPinching.current = true;
      lastTouchDist.current = getTouchDist(e.touches[0], e.touches[1]);
      lastTouchCenter.current = getTouchCenter(e.touches[0], e.touches[1]);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && isPinching.current) {
      e.preventDefault();
      const newDist = getTouchDist(e.touches[0], e.touches[1]);
      const newCenter = getTouchCenter(e.touches[0], e.touches[1]);
      if (lastTouchDist.current) {
        const scale = newDist / lastTouchDist.current;
        setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * scale)));
      }
      if (lastTouchCenter.current) {
        const dx = newCenter.x - lastTouchCenter.current.x;
        const dy = newCenter.y - lastTouchCenter.current.y;
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
      lastTouchDist.current = newDist;
      lastTouchCenter.current = newCenter;
    }
  };

  const handleTouchEnd = (e) => {
    if (isPinching.current) {
      isPinching.current = false;
      justPinched.current = true;
      setTimeout(() => { justPinched.current = false; }, 300);
      lastTouchDist.current = null;
      lastTouchCenter.current = null;
      // Clamp pan to keep face visible
      setPan((p) => clampPanPx(p, zoom));
    }
  };

  const handleClick = (e) => {
    if (!modalRef.current || justPinched.current || justDragged.current) return;
    const rect = modalRef.current.getBoundingClientRect();
    // Account for zoom and pan: convert screen coords to face % coords
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    const faceW = rect.width;
    const faceH = rect.height;
    const x = (rawX / faceW) * 100;
    const y = (rawY / faceH) * 100;
    // With a selection, a click on the empty chart only deselects
    if (selected && !vt.drawing) { setSelectedId(null); return; }
    if (vt.handleClick(x, y)) return;
    const point = { id: Date.now(), x, y, amount: activeAmount, color: activeColor };
    if (multiPraep && activePraep > 0) point.p = activePraep;
    if (view !== "face") point.v = view;
    setMarkers(addMarker(markers, point));
  };

  const setPraep = (id, p) => {
    setMarkers(markers.map((m) => (m.id === id ? { ...m, p } : m)));
  };

  const updateAmount = (id, val) => {
    setMarkers(markers.map((m) => (m.id === id ? { ...m, amount: val } : m)));
  };

  const cycleColor = (id) => {
    setMarkers(markers.map((m) => (m.id === id ? { ...m, color: nextMarkerColor(markerColor(m)) } : m)));
  };

  const removeMarker = (id) => {
    setMarkers(markers.filter((m) => m.id !== id));
    if (id === selectedId) setSelectedId(null);
  };

  // Clicking a point, line or Markierung on the chart selects it for editing (not while drawing)
  const [selectedId, setSelectedId] = React.useState(null);
  const selected = selectedId != null ? markers.find((m) => m.id === selectedId) || null : null;
  const selectedIdx = selected ? markers.indexOf(selected) : -1;
  const selectMarker = (id) => {
    if (vt.drawing || justDragged.current || justPinched.current) return;
    setSelectedId((cur) => (cur === id ? null : id));
  };
  // Delete or Backspace removes the selection, Escape deselects (captured so the dialog stays open)
  React.useEffect(() => {
    if (!selected || !modalOpen) return undefined;
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); removeMarker(selected.id); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSelectedId(null); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the selected row of the point list in view
  React.useEffect(() => {
    if (selectedId == null) return;
    const row = document.querySelector(`[data-marker-row="${selectedId}"]`);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
  }, [selectedId]);
  React.useEffect(() => { setSelectedId(null); }, [modalOpen, view]);

  const handleSave = () => {
    vt.finish();
    setSaved(true);
    setModalOpen(false);
    if (onAutoSave) onAutoSave(markers);
  };

  // Window width as state, so rotating a tablet or resizing the window switches the layout live
  const [winW, setWinW] = React.useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  React.useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isMobile = winW < 640;
  // Phones and portrait tablets (< 900px wide): one scroll column, controls above the chart, the chart as
  // wide as the screen allows. Wider screens: the chart fills the height next to a side column (measured).
  const SIDE_COLUMN_PX = 320;
  const sideLayout = !isMobile && winW >= 900;
  const [chartPx, setChartPx] = React.useState(0);
  const chartAreaEl = React.useRef(null);
  const measureChart = React.useCallback(() => {
    const el = chartAreaEl.current;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
    const px = Math.max(260, Math.floor(Math.min(el.clientWidth, el.clientHeight)));
    setChartPx((prev) => (prev === px ? prev : px));
  }, []);
  // Callback ref: (re)attaches a ResizeObserver whenever the chart cell mounts (dialog resized by content)
  const chartObserver = React.useRef(null);
  const chartAreaRef = React.useCallback((el) => {
    if (chartObserver.current) { chartObserver.current.disconnect(); chartObserver.current = null; }
    chartAreaEl.current = el;
    if (!el) return;
    measureChart();
    const ro = new ResizeObserver(measureChart);
    ro.observe(el);
    chartObserver.current = ro;
  }, [measureChart]);
  // Also measure right after every layout change (window resize, rotation), without waiting for a frame
  React.useLayoutEffect(() => { if (modalOpen && sideLayout) measureChart(); });
  React.useEffect(() => () => chartObserver.current?.disconnect(), []);
  const faceSize = isMobile
    ? "min(calc(100vw - 2rem), 460px)"
    : sideLayout ? `${chartPx || 480}px` : "max(320px, min(calc(100vw - 6rem), calc(100vh - 440px), 760px))";
  // Points, labels and lines keep their size on screen at any zoom
  const markerSize = 21 / zoom;
  const markerFontSize = 11 / zoom;

  // ── Read-only view (viewing existing Behandlungen) ──
  if (readOnly) {
    return (
      <div className="flex flex-col sm:flex-row gap-4" style={{ alignItems: "flex-start" }}>
        <div className="flex-shrink-0" style={{ maxWidth: 520 }}>
          <ChartFigures markers={markers} facePhoto={facePhoto} size={250} dotSize={17} fontSize={9} praepCount={praepCount} />
          <VectorLegend markers={markers} className="mt-1.5" />
        </div>
        {(markers.length > 0 || notes) && (
          <div className="flex gap-6" style={{ alignItems: "flex-start" }}>
            {treatmentPoints(markers).length > 0 && (
              <div className="space-y-1.5" style={{ minWidth: 140 }}>
                {treatmentPoints(markers).map((m, idx) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-5 text-right flex-shrink-0">{idx + 1}.</span>
                    <MarkerDot marker={m} idx={idx} size={20} fontSize={10} praepCount={praepCount} />
                    <input type="text" inputMode="decimal" className="w-20 px-2 py-1 text-sm border border-[#DFE3EB] rounded bg-gray-50" value={m.amount} readOnly />
                    <span className="text-xs text-gray-400">{unitFor(m)}</span>
                    <VectorSummary marker={m} />
                  </div>
                ))}
              </div>
            )}
            {notes && (
              <div style={{ maxWidth: 220 }}>
                <span className="text-xs font-medium text-gray-500">Notizen: </span>
                <span className="text-xs text-gray-600">{notes}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Editable view ──
  return (
    <div>
      {/* Trigger button or saved state (hidden when autoOpen — only modal needed) */}
      {!autoOpen && (
        saved && markers.length > 0 ? (() => {
          const totalUnits = Math.round(markers.reduce((s, m) => s + evalAmount(m.amount), 0) * 100) / 100;
          const nPoints = treatmentPoints(markers).length;
          const nGuides = markers.length - nPoints;
          const summary = [
            nPoints > 0 ? `${nPoints} ${nPoints === 1 ? "Punkt" : "Punkte"}` : "",
            nGuides > 0 ? `${nGuides} ${nGuides === 1 ? "Markierung" : "Markierungen"}` : "",
          ].filter(Boolean).join(" · ");
          const totalStr = totalUnits % 1 === 0 ? totalUnits.toString() : totalUnits.toFixed(2).replace(/0+$/, "").replace(".", ",");
          return (
          <div className="flex items-center gap-4 flex-wrap">
            <ChartFigures markers={markers} facePhoto={facePhoto} size={132} dotSize={12} fontSize={7} praepCount={praepCount} onClick={() => setModalOpen(true)} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">{summary} dokumentiert</p>
              {totalUnits > 0 && !multiPraep && <p className="text-sm text-gray-500 mt-0.5">Gesamt {totalStr} {einheit}</p>}
              <button className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium" onClick={() => setModalOpen(true)}>Bearbeiten</button>
            </div>
          </div>
          );
        })() : (
          <button className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 text-sm text-blue-600 font-medium transition py-4" onClick={() => setModalOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {planMode ? "Injektionspunkte planen" : "Injektionspunkte setzen"}
          </button>
        )
      )}

      {/* Large modal for precise placement */}
      {modalOpen && createPortal(
        <div data-stacked-dialog className="fixed inset-0 bg-black/40 z-[60] sm:flex sm:items-center sm:justify-center sm:p-4" onClick={() => { setModalOpen(false); if (onAutoCancel) onAutoCancel(); }}>
          <div className="bg-white sm:rounded-xl shadow-2xl flex flex-col w-full h-full sm:h-auto" style={isMobile ? { maxHeight: "100vh" } : { maxWidth: 1240, height: "min(96vh, 1100px)" }} onClick={(e) => e.stopPropagation()}>
            {/* Header like the other dialogs (Modal.jsx) */}
            <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">{planMode ? "Injektionspunkte planen" : "Injektionspunkte setzen"}</h2>
              <button className="ml-auto p-1.5 -mr-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition" aria-label="Schließen" onClick={() => { setModalOpen(false); if (onAutoCancel) onAutoCancel(); }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {!readOnly && (
              <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const compressed = await compressImage(file);
                  if (onFacePhotoChange) onFacePhotoChange(compressed);
                  trackEvent("face_photo_uploaded");
                } catch (err) { console.error("Photo compress error", err); }
                e.target.value = "";
              }} />
            )}
            {/* Phones: one scroll column (controls, chart, points). Tablets and desktops: the chart takes the full
                height left of a side column with the controls on top and the point list below. */}
            <div className="flex-1 min-h-0 px-4 sm:px-5 pt-4 pb-4" style={{ overflowY: sideLayout ? "hidden" : "auto", display: "grid", gap: isMobile ? 16 : 20, gridTemplateColumns: sideLayout ? `minmax(0, 1fr) ${SIDE_COLUMN_PX}px` : "minmax(0, 1fr)", gridTemplateRows: sideLayout ? "auto minmax(0, 1fr)" : "auto auto auto", gridTemplateAreas: sideLayout ? '"chart controls" "chart points"' : '"controls" "chart" "points"' }}>
              <div style={{ gridArea: "controls" }}>
                <div className="space-y-2 mb-3">
                  <EditorRow label="Region">
                    <div className="flex flex-wrap gap-1">
                      {CHARTS.map((c) => {
                        const n = markers.filter((m) => markerView(m) === c.id).length;
                        const active = view === c.id;
                        return (
                          <button key={c.id} type="button" onClick={() => setView(c.id)}
                            className={`inline-flex items-center gap-1.5 px-2.5 text-xs rounded-md transition font-medium ${active ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                            style={{ height: 26 }}>
                            {c.label}
                            {n > 0 && <span className={`text-[10px] font-semibold rounded-full px-1.5 ${active ? "bg-white/20" : "bg-white text-gray-700"}`}>{n}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </EditorRow>
                  <VectorToolbar vt={vt} />
                  {multiPraep && <PraeparatChips praeparate={praepList} value={activePraep} onChange={setActivePraep} label="Präparat" labelWidth={EDITOR_LABEL_WIDTH} />}
                  <DoseChips value={activeAmount} onChange={selectDose} einheit={activeEinheit} color={activeColor} label="Dosis" labelWidth={EDITOR_LABEL_WIDTH} />
                  <ColorSwatches value={activeColor} onChange={setActiveColor} label="Farbe" labelWidth={EDITOR_LABEL_WIDTH} />
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {vectorInstruction(vt)}
                  <span className="text-gray-400"><span className="sm:hidden"> Zwei Finger zum Zoomen.</span><span className="hidden sm:inline"> Zoomen mit Mausrad oder +/−, gezoomt lässt sich das Bild ziehen.</span></span>
                </p>
              </div>
              {/* Side layout: the chart sits absolutely inside its cell so its size never feeds back into the row heights it is measured from */}
              {/* min-h-0 only in the side layout: in the single column it would let the auto rows shrink below
                  their content, so the point list and photo button slid under the chart instead of scrolling */}
              <div ref={sideLayout ? chartAreaRef : undefined} className={`min-w-0 ${sideLayout ? "min-h-0" : ""}`} style={{ gridArea: "chart", position: sideLayout ? "relative" : "static" }}>
                <div className="flex items-start justify-center" style={sideLayout ? { position: "absolute", inset: 0 } : undefined}>
                <div
                  ref={boxRef}
                  className="relative border border-[#DFE3EB] rounded-lg overflow-hidden select-none"
                  style={{ width: faceSize, height: faceSize, cursor: "crosshair", background: "#ffffff", touchAction: "none" }}
                  onMouseDown={handleMouseDown}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div
                    ref={modalRef}
                    onClick={handleClick}
                    onMouseMove={(e) => { if (modalRef.current && (vt.lineStart || vt.activeFan)) { const p = facePos(e); vt.handleMove(p.x, p.y); } }}
                    className="relative w-full h-full"
                    style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: "center center", transition: isMobile && !isPinching.current ? "transform 0.15s ease-out" : "none" }}
                  >
                    <img src={chartImage(view, facePhoto)} alt={chartById(view).label} className="w-full h-full object-contain pointer-events-none" draggable={false} />
                    <VectorLayer markers={markers.filter(inView)} preview={vt.preview} scale={1 / zoom} onSelect={vt.drawing ? undefined : selectMarker} selectedId={selectedId} />
                    {vt.lineStart && (
                      <div className="absolute rounded-full border-2 border-gray-500 bg-white pointer-events-none" style={{ left: `${vt.lineStart.x}%`, top: `${vt.lineStart.y}%`, width: 12 / zoom, height: 12 / zoom, transform: "translate(-50%, -50%)", zIndex: 11 }} />
                    )}
                    {markers.map((m, idx) => inView(m) && !isGuide(m) && (
                      <div key={m.id} className="absolute flex items-center justify-center" style={{ left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)", zIndex: 10, cursor: vt.drawing ? "crosshair" : "pointer", borderRadius: 999, outline: m.id === selectedId ? `${2.5 / zoom}px solid #2563eb` : "none", outlineOffset: 2 / zoom }}
                        onClick={(e) => { if (vt.drawing) return; e.stopPropagation(); selectMarker(m.id); }}>
                        <MarkerDot marker={m} idx={idx} size={markerSize} fontSize={markerFontSize} shadow praepCount={praepCount} />
                      </div>
                    ))}
                  </div>
                  <VectorDrawingBar vt={vt} />
                  {selected && !vt.drawing && (
                    <div className="absolute left-1/2 top-2 -translate-x-1/2 flex items-center gap-2 rounded-xl bg-white shadow-lg ring-1 ring-black/5 px-2.5 py-1.5 text-xs text-gray-700"
                      style={{ zIndex: 30, cursor: "default", maxWidth: "calc(100% - 16px)" }}
                      onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                      {isGuide(selected) ? (
                        <VectorSummary marker={selected} className="text-xs font-medium text-gray-700" />
                      ) : (
                        <>
                          <span className="font-medium whitespace-nowrap">{isVector(selected) ? (selected.kind === "fan" ? "Fächer" : "Linie") : `Punkt ${selectedIdx + 1}`}</span>
                          <button type="button" className="flex-shrink-0 rounded-full" title="Farbe ändern" onClick={() => cycleColor(selected.id)}>
                            <MarkerDot marker={selected} idx={selectedIdx} size={18} fontSize={9} praepCount={praepCount} />
                          </button>
                          <PraeparatBadge marker={selected} praeparate={praepList} onCycle={(p) => setPraep(selected.id, p)} />
                          <input type="text" inputMode="text" aria-label="Menge" className="w-16 px-2 py-1 text-sm border border-[#DFE3EB] rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={selected.amount || ""} onChange={(e) => updateAmount(selected.id, e.target.value)} />
                          <span className="text-gray-400">{unitFor(selected)}</span>
                        </>
                      )}
                      <button type="button" className="ml-1 px-2 py-1 rounded-md text-red-600 hover:bg-red-50 font-medium whitespace-nowrap" onClick={() => removeMarker(selected.id)}>Löschen</button>
                      <button type="button" className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label="Auswahl aufheben" onClick={() => setSelectedId(null)}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 flex items-center rounded-lg bg-white/95 shadow-md text-gray-600" style={{ zIndex: 20, cursor: "default" }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                    <button type="button" className="w-8 h-8 text-lg leading-none hover:text-gray-900 disabled:opacity-30" disabled={zoom <= MIN_ZOOM} onClick={() => stepZoom(-1)} aria-label="Verkleinern" title="Verkleinern">&minus;</button>
                    <button type="button" className="px-1 min-w-[3rem] h-8 text-xs tabular-nums hover:text-gray-900" onClick={resetZoom} title="Zurück auf 100 %">{Math.round(zoom * 100)} %</button>
                    <button type="button" className="w-8 h-8 text-lg leading-none hover:text-gray-900 disabled:opacity-30" disabled={zoom >= MAX_ZOOM} onClick={() => stepZoom(1)} aria-label="Vergrößern" title="Vergrößern">+</button>
                  </div>
                  {!readOnly && facePhoto && view === "face" && (
                    <button
                      className="absolute bottom-2 right-2 rounded-full bg-white bg-opacity-90 shadow-md hover:bg-opacity-100 transition flex items-center justify-center"
                      style={{ width: 36, height: 36, zIndex: 20 }}
                      title="Foto entfernen"
                      onClick={(e) => { e.stopPropagation(); onFacePhotoChange?.(""); }}
                    >
                      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
                </div>
              </div>
              <div className={sideLayout ? "min-h-0" : ""} style={{ gridArea: "points", overflowY: sideLayout ? "auto" : "visible", paddingRight: sideLayout ? 4 : 0 }}>
                <VectorLegend markers={markers.filter(inView)} force={vt.mode === "linie" || vt.mode === "faecher"} forceGuide={vt.mode === "markierung"} className="mb-2" />
                <p className="text-xs font-medium text-gray-500 mb-1.5">{chartById(view).label}</p>
                <div className="space-y-1.5">
                  {markers.map((m, idx) => inView(m) && (isGuide(m) ? (
                    <div key={m.id} data-marker-row={m.id} className={`flex items-center gap-1.5 rounded-md ${m.id === selectedId ? "bg-blue-50 ring-1 ring-blue-200" : ""}`}>
                      <span className="w-4 flex-shrink-0" />
                      <span className="flex-1 min-w-0"><VectorSummary marker={m} className="text-sm text-gray-600" /></span>
                      <button className="p-1 rounded border border-[#DFE3EB] text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition flex-shrink-0" onClick={() => { if (vt.activeGuide?.id === m.id) vt.finish(); removeMarker(m.id); }} title="Markierung löschen">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ) : (
                    <React.Fragment key={m.id}>
                    <div data-marker-row={m.id} className={`flex items-center gap-1.5 rounded-md ${m.id === selectedId ? "bg-blue-50 ring-1 ring-blue-200" : ""}`}>
                      <span className="text-[10px] text-gray-400 w-4 text-right flex-shrink-0">{idx + 1}.</span>
                      <button type="button" className="flex-shrink-0 rounded-full" title="Farbe ändern (klicken)" onClick={() => cycleColor(m.id)}>
                        <MarkerDot marker={m} idx={idx} size={18} fontSize={9} praepCount={praepCount} />
                      </button>
                      <PraeparatBadge marker={m} praeparate={praepList} onCycle={(p) => setPraep(m.id, p)} />
                      <input type="text" inputMode="text" className="w-20 px-2 py-1 text-sm border border-[#DFE3EB] rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={m.amount} placeholder={idx % 2 === 0 ? "z.B. 1,90" : "z.B. 2x3"} onChange={(e) => updateAmount(m.id, e.target.value)} />
                      <span className="text-xs text-gray-400">{unitFor(m)}</span>
                      <button className="p-1 rounded border border-[#DFE3EB] text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition flex-shrink-0" onClick={() => { if (vt.activeFan?.id === m.id) vt.finish(); removeMarker(m.id); }} title="Löschen">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                    {isVector(m) && <div className="pl-6 -mt-1"><VectorSummary marker={m} /></div>}
                    </React.Fragment>
                  )))}
                </div>
                {!markers.some(inView) && <p className="text-sm text-gray-400 pt-1">Noch keine Punkte in dieser Region.</p>}
                <LiveTotal markers={markers} praeparate={multiPraep ? praepList : null} einheit={einheit} />
                {!readOnly && view === "face" && (
                  <div className="mt-3">
                    {facePhoto ? (
                      <button
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 border border-[#DFE3EB] rounded-lg transition"
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" /></svg>
                        Foto ändern
                      </button>
                    ) : (
                      <button
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" /></svg>
                        <span className="sm:hidden">Patient:innenfoto aufnehmen</span><span className="hidden sm:inline">Patient:innenfoto hochladen</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* Fixed footer */}
            <div className="flex-shrink-0 flex justify-end p-4 sm:px-5 sm:pb-5 pt-3 border-t border-gray-100">
              <button className="px-4 py-1.5 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition" onClick={handleSave}>{onAutoSave ? "Speichern" : "Fertig"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


import React, { useState, useRef, useEffect } from "react";
import { evalAmount } from "../../utils/helpers";
import { FACE_IMAGE_B64 } from "../../constants";
import { MarkerDot, ColorSwatches, DEFAULT_MARKER_COLOR, markerColor, nextMarkerColor } from "./markerUtils";

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

export default function TreatmentMap({ markers, setMarkers, einheit, readOnly, notes, autoOpen, onAutoSave, onAutoCancel, facePhoto, onFacePhotoChange, planMode }) {
  const faceImg = facePhoto || FACE_IMAGE_B64;
  const photoInputRef = React.useRef(null);
  const [modalOpen, setModalOpen] = React.useState(!!autoOpen);
  const [saved, setSaved] = React.useState(markers.length > 0);
  React.useEffect(() => { if (markers.length > 0) setSaved(true); }, [markers]);
  const modalRef = React.useRef(null);
  // Colour applied to newly placed points; starts with the colour of the last existing point
  const [activeColor, setActiveColor] = React.useState(markers.length > 0 ? markerColor(markers[markers.length - 1]) : DEFAULT_MARKER_COLOR);

  // Pinch-to-zoom state for the modal face map
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const lastTouchDist = React.useRef(null);
  const lastTouchCenter = React.useRef(null);
  const isPinching = React.useRef(false);
  const justPinched = React.useRef(false);

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
        setZoom((z) => Math.min(5, Math.max(1, z * scale)));
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
      setPan((p) => clampPan(p, zoom));
    }
  };

  const clampPan = (p, z) => {
    if (z <= 1) return { x: 0, y: 0 };
    const maxP = ((z - 1) / z) * 150; // rough limit
    return { x: Math.min(maxP, Math.max(-maxP, p.x)), y: Math.min(maxP, Math.max(-maxP, p.y)) };
  };

  const handleClick = (e) => {
    if (!modalRef.current || justPinched.current) return;
    const rect = modalRef.current.getBoundingClientRect();
    // Account for zoom and pan: convert screen coords to face % coords
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    const faceW = rect.width;
    const faceH = rect.height;
    const x = (rawX / faceW) * 100;
    const y = (rawY / faceH) * 100;
    setMarkers([...markers, { id: Date.now(), x, y, amount: "", color: activeColor }]);
  };

  const updateAmount = (id, val) => {
    setMarkers(markers.map((m) => (m.id === id ? { ...m, amount: val } : m)));
  };

  const cycleColor = (id) => {
    setMarkers(markers.map((m) => (m.id === id ? { ...m, color: nextMarkerColor(markerColor(m)) } : m)));
  };

  const removeMarker = (id) => {
    setMarkers(markers.filter((m) => m.id !== id));
  };

  const handleSave = () => {
    setSaved(true);
    setModalOpen(false);
    if (onAutoSave) onAutoSave(markers);
  };

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const faceSize = isMobile ? "min(85vw, 340px)" : "min(85vh - 100px, 700px)";
  const markerSize = isMobile ? Math.max(10, 21 / zoom) : 21;
  const markerFontSize = isMobile ? Math.max(6, 11 / zoom) : 11;

  // ── Read-only view (viewing existing Behandlungen) ──
  if (readOnly) {
    return (
      <div className="flex flex-col sm:flex-row gap-4" style={{ alignItems: "flex-start" }}>
        <div className="relative border border-[#DFE3EB] rounded-lg overflow-hidden select-none flex-shrink-0" style={{ width: 250, height: 250, background: "#fafafa" }}>
          <img src={faceImg} alt="Gesicht" className="w-full h-full object-contain pointer-events-none" draggable={false} />
          {markers.map((m, idx) => (
            <div key={m.id} className="absolute flex items-center justify-center" style={{ left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)", zIndex: 10 }}>
              <MarkerDot marker={m} idx={idx} size={17} fontSize={9} shadow />
            </div>
          ))}
        </div>
        {(markers.length > 0 || notes) && (
          <div className="flex gap-6" style={{ alignItems: "flex-start" }}>
            {markers.length > 0 && (
              <div className="space-y-1.5" style={{ minWidth: 140 }}>
                {markers.map((m, idx) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-5 text-right flex-shrink-0">{idx + 1}.</span>
                    <MarkerDot marker={m} idx={idx} size={20} fontSize={10} />
                    <input type="text" inputMode="decimal" className="w-20 px-2 py-1 text-sm border border-[#DFE3EB] rounded bg-gray-50" value={m.amount} readOnly />
                    <span className="text-xs text-gray-400">{einheit}</span>
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
          const totalStr = totalUnits % 1 === 0 ? totalUnits.toString() : totalUnits.toFixed(2).replace(/0+$/, "").replace(".", ",");
          return (
          <div>
            <div className="relative border border-[#DFE3EB] rounded-lg overflow-hidden select-none cursor-pointer hover:opacity-90 transition" style={{ width: 200, height: 200, background: "#fafafa" }} onClick={() => setModalOpen(true)} title="Klicken zum Bearbeiten">
              <img src={faceImg} alt="Gesicht" className="w-full h-full object-contain pointer-events-none" draggable={false} />
              {markers.map((m, idx) => (
                <div key={m.id} className="absolute flex items-center justify-center" style={{ left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)", zIndex: 10 }}>
                  <MarkerDot marker={m} idx={idx} size={15} fontSize={8} shadow />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span className="text-xs text-gray-500">{markers.length} {markers.length === 1 ? "Punkt" : "Punkte"}{totalUnits > 0 && ` · ${totalStr} ${einheit}`} dokumentiert</span>
              <button className="text-xs text-blue-500 hover:text-blue-700" onClick={() => setModalOpen(true)}>Bearbeiten</button>
            </div>
          </div>
          );
        })() : (
          <button className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700 font-medium transition py-1.5" onClick={() => setModalOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {planMode ? "Injektionspunkte planen" : "Injektionspunkte dokumentieren"}
          </button>
        )
      )}

      {/* Large modal for precise placement */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 sm:flex sm:items-center sm:justify-center sm:p-4" onClick={() => { setModalOpen(false); if (onAutoCancel) onAutoCancel(); }}>
          <div className="bg-white sm:rounded-xl shadow-2xl flex flex-col w-full h-full sm:h-auto" style={{ maxWidth: 1100, maxHeight: isMobile ? "100vh" : "95vh" }} onClick={(e) => e.stopPropagation()}>
            {/* Fixed header on mobile */}
            <div className="flex-shrink-0 p-4 sm:p-5 pb-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Injektionspunkte setzen</h3>
                <button className="p-1 text-gray-400 hover:text-gray-600" onClick={() => { setModalOpen(false); if (onAutoCancel) onAutoCancel(); }}>
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
              <p className="text-xs text-gray-400 mb-1">
                <span className="hidden sm:inline">Klicke auf das Gesicht, um Injektionspunkte zu setzen.</span>
                <span className="sm:hidden">Tippe auf das Gesicht um Punkte zu setzen. Zwei Finger zum Zoomen.</span>
              </p>
              <p className="text-xs text-amber-500 mb-2">Die eingegebenen Mengen werden automatisch als Gesamtmenge des Präparats übernommen. In den Punkten werden die Einheiten angezeigt.</p>
              <div className="mb-3"><ColorSwatches value={activeColor} onChange={setActiveColor} /></div>
              {zoom > 1 && (
                <button className="text-xs text-blue-500 hover:text-blue-700 mb-2 sm:hidden" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Zoom zurücksetzen</button>
              )}
            </div>
            {/* Single scrollable area on mobile, side-by-side on desktop */}
            <div className="flex-1 overflow-y-auto sm:overflow-y-auto px-4 sm:px-5">
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">
                <div className="flex-shrink-0">
                  <div
                    className="relative border border-[#DFE3EB] rounded-lg overflow-hidden select-none"
                    style={{ width: faceSize, height: faceSize, cursor: "crosshair", background: "#fafafa", touchAction: "none" }}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div
                      ref={modalRef}
                      onClick={handleClick}
                      className="relative w-full h-full"
                      style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: "center center", transition: isPinching.current ? "none" : "transform 0.15s ease-out" }}
                    >
                      <img src={faceImg} alt="Gesicht" className="w-full h-full object-contain pointer-events-none" draggable={false} />
                      {markers.map((m, idx) => (
                        <div key={m.id} className="absolute flex items-center justify-center" style={{ left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)", zIndex: 10 }}>
                          <MarkerDot marker={m} idx={idx} size={markerSize} fontSize={markerFontSize} shadow />
                        </div>
                      ))}
                    </div>
                    {!readOnly && facePhoto && (
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
                  {!readOnly && (
                    <div className="mt-2">
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
                <div className="flex-shrink-0 sm:overflow-y-auto" style={{ width: isMobile ? "100%" : 220, maxHeight: isMobile ? "none" : faceSize }}>
                  <div className="space-y-1.5">
                    {markers.map((m, idx) => (
                      <div key={m.id} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 w-4 text-right flex-shrink-0">{idx + 1}.</span>
                        <button type="button" className="flex-shrink-0 rounded-full" title="Farbe ändern (klicken)" onClick={() => cycleColor(m.id)}>
                          <MarkerDot marker={m} idx={idx} size={18} fontSize={9} />
                        </button>
                        <input type="text" inputMode="text" className="w-20 px-2 py-1 text-sm border border-[#DFE3EB] rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={m.amount} placeholder={idx % 2 === 0 ? "z.B. 1,90" : "z.B. 2x3"} onChange={(e) => updateAmount(m.id, e.target.value)} />
                        <span className="text-xs text-gray-400">{einheit}</span>
                        <button className="p-1 rounded border border-[#DFE3EB] text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition flex-shrink-0" onClick={() => removeMarker(m.id)} title="Löschen">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Fixed footer */}
            <div className="flex-shrink-0 flex justify-end p-4 sm:px-5 sm:pb-5 pt-3 border-t border-gray-100">
              <button className="px-4 py-1.5 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition" onClick={handleSave}>Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


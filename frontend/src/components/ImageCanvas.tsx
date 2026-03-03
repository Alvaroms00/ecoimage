/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stage, Layer, Image as KonvaImage, Line, Circle } from "react-konva";
import type Konva from "konva";
import { buildApiUrl } from "../lib/env";

type LocationState = {
  dataUrl?: string;
  file?: File | null;
};

type Point = { x: number; y: number };

export default function ImageCanvas() {
  const location = useLocation() as { state: LocationState };
  const navigate = useNavigate();
  const locationState = location.state || {};
  const dataUrl = locationState.dataUrl || null;
  const navFile = locationState.file || null;

  const _useState1 = useState<string | null>(null);
  const displayUrl = _useState1[0];
  const setDisplayUrl = _useState1[1];
  const _useState2 = useState<Blob | null>(null);
  const originalBlob = _useState2[0];
  const setOriginalBlob = _useState2[1];
  const lastObjectUrl = useRef<string | null>(null);

  // Flag para evitar re-procesamiento
  const hasInitialized = useRef(false);

  const revokeLastObjectUrl = useCallback(function () {
    if (lastObjectUrl.current) {
      URL.revokeObjectURL(lastObjectUrl.current);
      lastObjectUrl.current = null;
    }
  }, []);

  const _useState3 = useState<HTMLImageElement | null>(null);
  const imageElem = _useState3[0];
  const setImageElem = _useState3[1];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const _useState4 = useState<Point[]>([]);
  const points = _useState4[0];
  const setPoints = _useState4[1];
  const _useState5 = useState(false);
  const isClosed = _useState5[0];
  const setIsClosed = _useState5[1];
  const _useState6 = useState(false);
  const loading = _useState6[0];
  const setLoading = _useState6[1];
  const _useState7 = useState<number | null>(null);
  const meanIntensity = _useState7[0];
  const setMeanIntensity = _useState7[1];
  const _useState8 = useState<number | null>(null);
  const areaPixels = _useState8[0];
  const setAreaPixels = _useState8[1];
  const _useState9 = useState<number | null>(null);
  const minIntensity = _useState9[0];
  const setMinIntensity = _useState9[1];
  const _useState10 = useState<number | null>(null);
  const maxIntensity = _useState10[0];
  const setMaxIntensity = _useState10[1];
  const _useState11 = useState<number[] | null>(null);
  const histogram = _useState11[0];
  const setHistogram = _useState11[1];

  const _useState12 = useState<Point | null>(null);
  const hoverPos = _useState12[0];
  const setHoverPos = _useState12[1];
  const CLOSE_DISTANCE = 10;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const _useState13 = useState<{
    idx: number;
    value: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const hoveredBar = _useState13[0];
  const setHoveredBar = _useState13[1];

  useEffect(
    function () {
      // Evitar re-ejecución (especialmente por StrictMode de React)
      if (hasInitialized.current) {
        return;
      }
      
      if (!dataUrl && !navFile) {
        return;
      }
      
      hasInitialized.current = true;

      // Caso 1: Tenemos un File directamente
      if (navFile instanceof File) {
        setOriginalBlob(navFile);
        revokeLastObjectUrl();
        const url = URL.createObjectURL(navFile);
        lastObjectUrl.current = url;
        setDisplayUrl(url);
        return;
      }

      // Caso 2: Tenemos un dataUrl (ya procesado por ImageSelector)
      if (dataUrl) {
        // Usar el dataUrl directamente - ImageSelector ya lo convirtió si era necesario
        setDisplayUrl(dataUrl);
        
        // También obtener el blob para análisis posterior (ROI)
        fetch(dataUrl)
          .then(function (resp) {
            return resp.blob();
          })
          .then(function (blob) {
            setOriginalBlob(blob);
          })
          .catch(function (err) {
            console.error("Error obteniendo blob:", err);
          });
      }
    },
    [dataUrl, navFile, revokeLastObjectUrl, setDisplayUrl, setOriginalBlob]
  );

  useEffect(
    function () {
      if (!displayUrl) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = displayUrl;
      const onload = function () {
        setImageElem(img);
      };
      const onerr = function () {
        setImageElem(null);
      };
      img.addEventListener("load", onload);
      img.addEventListener("error", onerr);
      return function () {
        img.removeEventListener("load", onload);
        img.removeEventListener("error", onerr);
      };
    },
    [displayUrl, setImageElem]
  );

  useEffect(
    function () {
      return function () {
        revokeLastObjectUrl();
      };
    },
    [revokeLastObjectUrl]
  );

  const handleClick = useCallback(
    function () {
      if (!imageElem || isClosed || !stageRef.current) return;
      const stage = stageRef.current;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const x = Math.max(0, Math.min(pos.x, stage.width()));
      const y = Math.max(0, Math.min(pos.y, stage.height()));

      if (points.length > 0) {
        const first = points[0];
        const dx = x - first.x;
        const dy = y - first.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= CLOSE_DISTANCE) {
          setIsClosed(true);
          setHoverPos(null);
          return;
        }
      }

      setPoints(function (p) {
        const newPoints = p.slice();
        newPoints.push({ x: x, y: y });
        return newPoints;
      });
    },
    [imageElem, isClosed, points, setHoverPos, setIsClosed, setPoints]
  );

  const handleMouseMove = useCallback(function () {
    if (!stageRef.current) {
      setHoverPos(null);
      return;
    }
    const pos = stageRef.current.getPointerPosition();
    if (!pos) {
      setHoverPos(null);
      return;
    }
    setHoverPos({ x: pos.x, y: pos.y });
  }, [setHoverPos]);

  function handleUndo() {
    setPoints(function (p) {
      if (p.length === 0) return p;
      return p.slice(0, -1);
    });
    setIsClosed(false);
  }

  function handleClear() {
    setPoints([]);
    setIsClosed(false);
    setMeanIntensity(null);
    setMinIntensity(null);
    setMaxIntensity(null);
    setAreaPixels(null);
    setHistogram(null);
    setHoveredBar(null);
  }

  function handleCalculate() {
    if (!isClosed || points.length < 3) {
      alert("Cierra la forma antes de calcular la media.");
      return;
    }
    setLoading(true);

    const stage = stageRef.current;
    if (!stage || !imageElem) {
      alert("Stage o imagen no disponible.");
      setLoading(false);
      return;
    }

    const scaleX = imageElem.width / stage.width();
    const scaleY = imageElem.height / stage.height();

    const roiScaled: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      roiScaled.push({
        x: Math.round(points[i].x * scaleX),
        y: Math.round(points[i].y * scaleY),
      });
    }

    const form = new FormData();
    if (originalBlob) {
      form.append("image", originalBlob, "upload");
    } else {
      alert("No hay imagen original disponible.");
      setLoading(false);
      return;
    }

    const roiPolygon: number[] = [];
    for (let j = 0; j < roiScaled.length; j++) {
      roiPolygon.push(Math.round(roiScaled[j].x));
      roiPolygon.push(Math.round(roiScaled[j].y));
    }
    roiPolygon.push(Math.round(roiScaled[0].x));
    roiPolygon.push(Math.round(roiScaled[0].y));
    form.append("roi", JSON.stringify(roiPolygon));

    const url = buildApiUrl("api/roi/mean");
    fetch(url, { method: "POST", body: form })
      .then(function (resp) {
        if (!resp.ok) {
          return resp.text().then(function (txt) {
            throw new Error(txt);
          });
        }
        return resp.json();
      })
      .then(function (json) {
        setMeanIntensity(typeof json.mean === "number" ? json.mean : null);
        setMinIntensity(typeof json.min === "number" ? json.min : null);
        setMaxIntensity(typeof json.max === "number" ? json.max : null);
        setAreaPixels(
          typeof json.area === "number" ? Math.round(json.area) : null
        );
        setHistogram(
          Array.isArray(json.histogram)
            ? json.histogram.map(function (v: any) {
                return Number(v) || 0;
              })
            : null
        );
        setLoading(false);
      })
      .catch(function (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        alert("Error calculando en servidor: " + msg);
        setLoading(false);
      });
  }

  const naturalW = imageElem ? imageElem.width : 800;
  const naturalH = imageElem ? imageElem.height : 500;
  const containerWidth =
    containerRef.current && containerRef.current.clientWidth > 0
      ? containerRef.current.clientWidth
      : naturalW;

  const desiredW = Math.min(containerWidth, naturalW);
  const scale = desiredW / naturalW;
  const stageWidth = Math.max(1, Math.round(naturalW * scale));
  const stageHeight = Math.max(1, Math.round(naturalH * scale));

  if (!dataUrl && !navFile) {
    return (
      <div
        style={{
          padding: "12px",
          textAlign: "center",
          margin: "0 auto",
          maxWidth: "768px",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: 600,
            marginBottom: "16px",
          }}
        >
          Imagen no seleccionada
        </h2>
        <p style={{ marginBottom: "16px", fontSize: "16px" }}>
          Vuelve a la página de inicio para seleccionar una imagen.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={function () {
              navigate("/");
            }}
            style={{
              padding: "8px 16px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              borderRadius: "4px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }

  const flatPoints: number[] = [];
  for (let i = 0; i < points.length; i++) {
    flatPoints.push(points[i].x);
    flatPoints.push(points[i].y);
  }

  let previewLine = null;
  if (points.length > 0 && hoverPos && !isClosed) {
    const lastPt = points[points.length - 1];
    previewLine = (
      <Line
        points={[lastPt.x, lastPt.y, hoverPos.x, hoverPos.y]}
        stroke="cyan"
        strokeWidth={1}
        dash={[4, 4]}
      />
    );
  }

  let firstCircle = null;
  if (!isClosed && points.length > 0) {
    const first = points[0];
    let nearFirst = false;
    if (hoverPos) {
      const dx = hoverPos.x - first.x;
      const dy = hoverPos.y - first.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      nearFirst = dist <= CLOSE_DISTANCE;
    }
    firstCircle = (
      <Circle
        x={first.x}
        y={first.y}
        radius={CLOSE_DISTANCE}
        fill={nearFirst ? "rgba(16,185,129,0.12)" : "rgba(96,165,250,0.06)"}
        stroke={nearFirst ? "#10b981" : "#60a5fa"}
        strokeWidth={2}
      />
    );
  }

  const pointCircles = points.map(function (p, idx) {
    return (
      <Circle
        key={idx}
        x={p.x}
        y={p.y}
        radius={4}
        fill="#fff"
        stroke="#2563eb"
        strokeWidth={2}
      />
    );
  });

  const hasResults =
    areaPixels !== null ||
    meanIntensity !== null ||
    minIntensity !== null ||
    maxIntensity !== null;

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
      <div style={{ textAlign: "center", marginBottom: "16px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600 }}>
          Dibuja una forma (polígono) y calcula la media
        </h2>
      </div>

      <div
        ref={containerRef}
        style={{
          border: "1px solid #d1d5db",
          borderRadius: "4px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          overflow: "auto",
        }}
      >
        <div style={{ width: stageWidth, height: stageHeight }}>
          <Stage
            width={stageWidth}
            height={stageHeight}
            onMouseDown={handleClick}
            onMouseMove={handleMouseMove}
            ref={stageRef}
            style={{ cursor: "crosshair" }}
          >
            <Layer>
              {imageElem && (
                <KonvaImage
                  image={imageElem}
                  width={stageWidth}
                  height={stageHeight}
                />
              )}

              {points.length > 0 && (
                <Line
                  points={flatPoints}
                  stroke={isClosed ? "#f43f5e" : "cyan"}
                  strokeWidth={2}
                  closed={isClosed}
                  tension={0}
                  dash={[6, 4]}
                  fill={
                    isClosed ? "rgba(244,63,94,0.12)" : "rgba(0,255,255,0.06)"
                  }
                />
              )}

              {previewLine}
              {firstCircle}
              {pointCircles}
            </Layer>
          </Stage>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: "16px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          <button
            onClick={function () {
              navigate("/");
            }}
            style={{
              padding: "8px 12px",
              backgroundColor: "#e5e7eb",
              color: "#111827",
              borderRadius: "4px",
              marginRight: "8px",
              marginBottom: "8px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Volver
          </button>
          <button
            onClick={handleClear}
            style={{
              padding: "8px 12px",
              backgroundColor: "#ef4444",
              color: "#ffffff",
              borderRadius: "4px",
              marginRight: "8px",
              marginBottom: "8px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Limpiar
          </button>
          <button
            onClick={handleUndo}
            style={{
              padding: "8px 12px",
              backgroundColor: "#eab308",
              color: "#ffffff",
              borderRadius: "4px",
              marginRight: "8px",
              marginBottom: "8px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Deshacer
          </button>

          <button
            onClick={handleCalculate}
            disabled={loading || !isClosed}
            style={{
              padding: "8px 12px",
              backgroundColor: loading || !isClosed ? "#86efac" : "#10b981",
              color: "#ffffff",
              borderRadius: "4px",
              marginRight: "8px",
              marginBottom: "8px",
              border: "none",
              cursor: loading || !isClosed ? "not-allowed" : "pointer",
              opacity: loading || !isClosed ? 0.5 : 1,
            }}
          >
            {loading ? "Calculando..." : "Calcular media"}
          </button>
        </div>

        {hasResults && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              flexDirection: "column",
              alignItems: "center",
              marginTop: "12px",
              width: "100%",
            }}
          >
            <table
              style={{
                minWidth: "460px",
                backgroundColor: "#ffffff",
                boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                borderRadius: "4px",
                overflow: "hidden",
                border: "1px solid #e5e7eb",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f3f4f6" }}>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontSize: "14px",
                      color: "#374151",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    Área (px)
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontSize: "14px",
                      color: "#374151",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    Media intensidad
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontSize: "14px",
                      color: "#374151",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    Mín
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontSize: "14px",
                      color: "#374151",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    Máx
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    style={{
                      padding: "12px",
                      fontWeight: "bold",
                      color: "#111827",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    {areaPixels !== null
                      ? areaPixels.toLocaleString() + " px"
                      : "-"}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      fontWeight: "bold",
                      color: "#111827",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    {meanIntensity !== null ? meanIntensity.toFixed(2) : "-"}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      fontWeight: "bold",
                      color: "#111827",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    {minIntensity !== null ? minIntensity.toFixed(2) : "-"}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      fontWeight: "bold",
                      color: "#111827",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    {maxIntensity !== null ? maxIntensity.toFixed(2) : "-"}
                  </td>
                </tr>
              </tbody>
            </table>

            {histogram && histogram.length > 0 && (
              <div
                style={{
                  marginTop: "12px",
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <div style={{ width: "640px", position: "relative" }}>
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#374151",
                      marginBottom: "4px",
                      textAlign: "center",
                    }}
                  >
                    Histograma de intensidad (0 = negro, 255 = blanco)
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "220px",
                      position: "relative",
                    }}
                  >
                    <svg
                      ref={svgRef}
                      width="100%"
                      height="100%"
                      viewBox="0 0 640 220"
                      preserveAspectRatio="xMidYMid meet"
                      style={{ display: "block", backgroundColor: "#ffffff" }}
                    >
                      {(function () {
                        const bins = histogram;
                        const W = 640;
                        const H = 220;
                        const marginLeft = 44;
                        const marginTop = 8;
                        const marginBottom = 28;
                        const plotW = W - marginLeft - 8;
                        const plotH = H - marginTop - marginBottom;
                        const maxC = Math.max.apply(Math, bins.concat([1]));
                        const barW = Math.max(0.6, plotW / bins.length);

                        const yTicks = 4;
                        const grid = [];
                        for (let j = 0; j <= yTicks; j++) {
                          const frac = j / yTicks;
                          const y = marginTop + plotH * (1 - frac);
                          const val = Math.round(maxC * frac);
                          grid.push(
                            <g key={"grid-" + j}>
                              <line
                                x1={marginLeft}
                                x2={marginLeft + plotW}
                                y1={y}
                                y2={y}
                                stroke="#e6e7eb"
                                strokeWidth={1}
                              />
                              <text
                                x={marginLeft - 8}
                                y={y + 4}
                                fontSize={11}
                                fill="#374151"
                                textAnchor="end"
                              >
                                {val}
                              </text>
                            </g>
                          );
                        }

                        const xLabels = [
                          { idx: 0, label: "0" },
                          { idx: 64, label: "64" },
                          { idx: 128, label: "128" },
                          { idx: 192, label: "192" },
                          { idx: 255, label: "255" },
                        ];
                        const xTicks = xLabels.map(function (xl, k) {
                          const x =
                            marginLeft + (xl.idx / (bins.length - 1)) * plotW;
                          return (
                            <g key={"xt-" + k}>
                              <line
                                x1={x}
                                x2={x}
                                y1={marginTop + plotH}
                                y2={marginTop + plotH + 6}
                                stroke="#9ca3af"
                                strokeWidth={1}
                              />
                              <text
                                x={x}
                                y={marginTop + plotH + 20}
                                fontSize={11}
                                fill="#374151"
                                textAnchor="middle"
                              >
                                {xl.label}
                              </text>
                            </g>
                          );
                        });

                        const bars = bins.map(function (c, idx) {
                          const x = marginLeft + idx * barW;
                          const h = Math.round((c / maxC) * plotH);
                          const y = marginTop + (plotH - h);
                          return (
                            <rect
                              key={"bar-" + idx}
                              x={x}
                              y={y}
                              width={Math.max(1, Math.floor(barW))}
                              height={Math.max(0, h)}
                              fill="#2563eb"
                              opacity={0.9}
                              onMouseEnter={function (
                                e: React.MouseEvent<SVGRectElement>
                              ) {
                                setHoveredBar({
                                  idx: idx,
                                  value: c,
                                  clientX: e.clientX,
                                  clientY: e.clientY,
                                });
                              }}
                              onMouseLeave={function () {
                                setHoveredBar(null);
                              }}
                            />
                          );
                        });

                        return (
                          <g>
                            <rect
                              x={0}
                              y={0}
                              width={W}
                              height={H}
                              fill="transparent"
                            />
                            {grid}
                            <g>{bars}</g>
                            {xTicks}
                            <line
                              x1={marginLeft}
                              x2={marginLeft + plotW}
                              y1={marginTop + plotH}
                              y2={marginTop + plotH}
                              stroke="#9ca3af"
                              strokeWidth={1}
                            />
                          </g>
                        );
                      })()}
                    </svg>

                    {hoveredBar &&
                      (function () {
                        const containerRect = containerRef.current
                          ? containerRef.current.getBoundingClientRect()
                          : null;
                        const left = containerRect
                          ? hoveredBar.clientX - containerRect.left + 8
                          : hoveredBar.clientX;
                        const top = containerRect
                          ? hoveredBar.clientY - containerRect.top - 28
                          : hoveredBar.clientY;
                        return (
                          <div
                            style={{
                              left: left + "px",
                              top: top + "px",
                              position: "absolute",
                              pointerEvents: "none",
                              backgroundColor: "#111827",
                              color: "#ffffff",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                              whiteSpace: "nowrap",
                              transform: "translate(-50%, -100%)",
                            }}
                          >
                            <div style={{ fontWeight: "bold" }}>
                              {hoveredBar.value.toLocaleString()}
                            </div>
                            <div style={{ fontSize: "11px", opacity: 0.9 }}>
                              Bin {hoveredBar.idx}
                            </div>
                          </div>
                        );
                      })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

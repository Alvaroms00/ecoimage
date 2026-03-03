/* eslint-disable @typescript-eslint/no-unused-vars */
import { useRef, useState } from "react";
import { buildApiUrl } from "../lib/env";

type Props = {
  onImageSelected?: (file: File, dataUrl: string) => void;
  maxSizeBytes?: number;
};

type DicomInfo = {
  dimensions: number;
  shape: number[];
  is_multi_slice: boolean;
  num_slices: number;
  is_color: boolean;
  color_type?: string;
};

type ValidationResult = {
  is_valid: boolean;
  format: string;
  needs_conversion: boolean;
  is_dicom: boolean;
  dicom_info?: DicomInfo;
  error?: string;
};

const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|tif|tiff|dcm|dicom)$/i;

function parseServerError(errorText: string): string {
  try {
    const errorObj = JSON.parse(errorText);
    const message = errorObj.error || errorText;

    if (message.indexOf("No se pudo abrir") !== -1) {
      return "No se pudo procesar este archivo. Asegúrate de que sea un archivo válido.";
    }

    if (message.indexOf("DICOM") !== -1) {
      return "Error al procesar el archivo DICOM: " + message;
    }

    return message;
  } catch (e) {
    return errorText;
  }
}

export default function ImageSelector(props: Props) {
  const onImageSelected = props.onImageSelected;
  const maxSizeBytes =
    props.maxSizeBytes !== undefined ? props.maxSizeBytes : 10000000;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const _useState1 = useState<File | null>(null);
  const file = _useState1[0];
  const setFile = _useState1[1];
  const _useState2 = useState<string | null>(null);
  const preview = _useState2[0];
  const setPreview = _useState2[1];
  const _useState3 = useState<string | null>(null);
  const error = _useState3[0];
  const setError = _useState3[1];
  const _useState4 = useState(false);
  const loading = _useState4[0];
  const setLoading = _useState4[1];
  const _useState5 = useState<DicomInfo | null>(null);
  const dicomInfo = _useState5[0];
  const setDicomInfo = _useState5[1];
  const _useState6 = useState<number>(0);
  const selectedSlice = _useState6[0];
  const setSelectedSlice = _useState6[1];
  const _useState7 = useState(false);
  const dragActive = _useState7[0];
  const setDragActive = _useState7[1];

  function validateFileWithServer(origFile: File): void {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("image", origFile);

    const url = buildApiUrl("api/validate");

    fetch(url, {
      method: "POST",
      body: formData,
    })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            const parsedError = parseServerError(text);
            throw new Error(parsedError);
          });
        }
        return response.json();
      })
      .then(function (result: ValidationResult) {
        if (!result.is_valid) {
          throw new Error(result.error || "Formato de archivo no válido");
        }

        if (result.is_dicom && result.dicom_info) {
          setDicomInfo(result.dicom_info);

          if (result.dicom_info.is_multi_slice) {
            const middleSlice = Math.floor(result.dicom_info.num_slices / 2);
            setSelectedSlice(middleSlice);
          }
        }

        if (result.needs_conversion) {
          convertImage(origFile);
        } else {
          loadImageDirectly(origFile);
        }
      })
      .catch(function (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setLoading(false);
        setFile(null);
        setPreview(null);
        setDicomInfo(null);
      });
  }

  function convertImage(origFile: File, sliceIndex?: number): void {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("image", origFile);

    if (sliceIndex !== undefined && sliceIndex !== null) {
      formData.append("slice_index", String(sliceIndex));
    }

    const url = buildApiUrl("api/convert");

    fetch(url, {
      method: "POST",
      body: formData,
    })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (errorText) {
            const parsedError = parseServerError(errorText);
            throw new Error(parsedError);
          });
        }
        return response.blob();
      })
      .then(function (blob) {
        const reader = new FileReader();
        reader.onload = function () {
          setPreview(reader.result as string);
          setFile(origFile);
          setLoading(false);
        };
        reader.onerror = function () {
          throw new Error("Error al leer la imagen convertida");
        };
        reader.readAsDataURL(blob);
      })
      .catch(function (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setLoading(false);
        setFile(null);
        setPreview(null);
      });
  }

  function loadImageDirectly(f: File): void {
    const reader = new FileReader();
    reader.onload = function () {
      setPreview(reader.result as string);
      setFile(f);
      setLoading(false);
    };
    reader.onerror = function () {
      setError("No se pudo leer el archivo");
      setLoading(false);
    };
    reader.readAsDataURL(f);
  }

  function validateAndLoad(f: File): void {
    setError(null);
    setLoading(true);
    setDicomInfo(null);

    const fileName = f.name.toLowerCase();

    if (f.size > maxSizeBytes) {
      const maxMB = Math.round(maxSizeBytes / 1000000);
      setError(
        "El archivo excede el tamaño máximo permitido (" + maxMB + " MB).",
      );
      setLoading(false);
      return;
    }

    if (!ACCEPTED_EXTENSIONS.test(fileName)) {
      setError("Formato no válido. Solo se aceptan: JPEG, PNG, TIFF y DICOM.");
      setLoading(false);
      return;
    }

    validateFileWithServer(f);
  }

  function handleSliceChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const newSlice = parseInt(e.target.value, 10);
    setSelectedSlice(newSlice);

    if (file) {
      convertImage(file, newSlice);
    }
  }

  function handleFileSelect(files: FileList | null): void {
    if (files && files.length > 0) {
      const selectedFile = files[0];
      validateAndLoad(selectedFile);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    handleFileSelect(e.target.files);
  }

  function handleClear(): void {
    setFile(null);
    setPreview(null);
    setError(null);
    setDicomInfo(null);
    setSelectedSlice(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleConfirm(): void {
    if (file && preview && onImageSelected) {
      onImageSelected(file, preview);
    }
  }

  function handleClickSelectFile(): void {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  function handleDrag(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragIn(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  }

  function handleDragOut(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  }

  const isConfirmDisabled = !file || !preview || !!error || loading;
  const isClearDisabled = !file && !preview && !loading;

  return (
    <div
      style={{
        padding: "24px",
        margin: "0 auto",
        width: "100%",
        maxWidth: "768px",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <h1
          style={{
            fontSize: "24px",
            fontWeight: "bold",
            color: "#1f2937",
          }}
        >
          Analizador de Imágenes Médicas
        </h1>
        <p style={{ color: "#4b5563", marginTop: "8px" }}>
          Selecciona una imagen para comenzar el análisis
        </p>
      </div>

      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "8px",
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
          border: "1px solid #e5e7eb",
          padding: "24px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <p style={{ fontSize: "14px", color: "#4b5563" }}>
            Formatos soportados:{" "}
            <span style={{ fontWeight: 600 }}>JPEG, PNG, TIFF, DICOM</span>
          </p>
          <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            Tamaño máximo: {Math.round(maxSizeBytes / 1000000)} MB
          </p>
          <p
            style={{
              fontSize: "11px",
              color: "#10b981",
              marginTop: "4px",
              fontStyle: "italic",
            }}
          >
            ✓ Compatible con DICOM 2D y 3D (múltiples slices)
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <button
            type="button"
            onClick={handleClickSelectFile}
            disabled={loading}
            style={{
              padding: "10px 24px",
              backgroundColor: loading ? "#93c5fd" : "#2563eb",
              color: "#ffffff",
              borderRadius: "8px",
              fontWeight: 500,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              fontSize: "14px",
            }}
            onMouseOver={function (e) {
              if (!loading) {
                e.currentTarget.style.backgroundColor = "#1d4ed8";
              }
            }}
            onMouseOut={function (e) {
              if (!loading) {
                e.currentTarget.style.backgroundColor = "#2563eb";
              }
            }}
          >
            Seleccionar archivo
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={isClearDisabled}
            style={{
              padding: "10px 24px",
              backgroundColor: isClearDisabled ? "#e5e7eb" : "#e5e7eb",
              color: "#374151",
              borderRadius: "8px",
              fontWeight: 500,
              border: "none",
              cursor: isClearDisabled ? "not-allowed" : "pointer",
              opacity: isClearDisabled ? 0.5 : 1,
              fontSize: "14px",
            }}
            onMouseOver={function (e) {
              if (!isClearDisabled) {
                e.currentTarget.style.backgroundColor = "#d1d5db";
              }
            }}
            onMouseOut={function (e) {
              if (!isClearDisabled) {
                e.currentTarget.style.backgroundColor = "#e5e7eb";
              }
            }}
          >
            Limpiar
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.tif,.tiff,.dcm,.dicom,image/jpeg,image/png,image/tiff,application/dicom"
          onChange={handleInputChange}
          style={{ display: "none" }}
          aria-label="Selector de archivo de imagen"
        />

        {loading && (
          <div
            style={{
              marginTop: "16px",
              padding: "16px",
              backgroundColor: "#dbeafe",
              border: "1px solid #93c5fd",
              borderRadius: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#1e40af",
              }}
            >
              <svg
                style={{
                  animation: "spin 1s linear infinite",
                  height: "20px",
                  width: "20px",
                  marginRight: "12px",
                }}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  style={{ opacity: 0.25 }}
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  style={{ opacity: 0.75 }}
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span style={{ fontWeight: 500 }}>
                {preview ? "Procesando imagen..." : "Validando archivo..."}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: "16px",
              padding: "16px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              <span style={{ color: "#dc2626", marginRight: "8px" }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#991b1b",
                  }}
                >
                  Error
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#b91c1c",
                    marginTop: "4px",
                    lineHeight: "1.5",
                  }}
                >
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}

        {dicomInfo && dicomInfo.is_multi_slice && preview && (
          <div
            style={{
              marginTop: "16px",
              padding: "16px",
              backgroundColor: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
            }}
          >
            <p
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#1e40af",
                marginBottom: "12px",
              }}
            >
              📊 DICOM 3D detectado - Selecciona el slice a analizar:
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="range"
                min="0"
                max={dicomInfo.num_slices - 1}
                value={selectedSlice}
                onChange={handleSliceChange}
                disabled={loading}
                style={{
                  flex: 1,
                  height: "6px",
                  cursor: loading ? "not-allowed" : "pointer",
                  width: "100%",
                  borderRadius: "4px",
                  outline: "none",
                }}
              />
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#1e40af",
                  minWidth: "80px",
                  textAlign: "right",
                }}
              >
                {selectedSlice + 1} / {dicomInfo.num_slices}
              </span>
            </div>
            <p
              style={{
                fontSize: "11px",
                color: "#6b7280",
                marginTop: "8px",
                fontStyle: "italic",
              }}
            >
              Dimensiones:{" "}
              {dicomInfo.shape
                .map(function (dim) {
                  return String(dim);
                })
                .join(" × ")}
              {dicomInfo.is_color ? " (convertido a escala de grises)" : ""}
            </p>
          </div>
        )}

        {preview && file && (
          <div style={{ marginTop: "16px" }}>
            <div
              style={{
                border: "2px solid #e5e7eb",
                borderRadius: "8px",
                overflow: "hidden",
                backgroundColor: "#f9fafb",
                padding: "16px",
              }}
            >
              <img
                src={preview}
                alt="Vista previa de la imagen seleccionada"
                style={{
                  margin: "0 auto",
                  maxWidth: "100%",
                  maxHeight: "320px",
                  objectFit: "contain",
                  borderRadius: "4px",
                  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                  display: "block",
                }}
              />
            </div>

            <div
              style={{
                marginTop: "16px",
                backgroundColor: "#f0fdf4",
                borderRadius: "8px",
                padding: "16px",
                border: "1px solid #bbf7d0",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontSize: "12px",
                  color: "#15803d",
                  fontWeight: 500,
                  marginBottom: "4px",
                }}
              >
                ✓ ARCHIVO SELECCIONADO
              </p>
              <p
                style={{
                  fontSize: "14px",
                  color: "#166534",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </p>
            </div>
          </div>
        )}

        {!preview && !loading && !error && (
          <div
            onDragEnter={handleDragIn}
            onDragLeave={handleDragOut}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            style={{
              marginTop: "16px",
              padding: "32px",
              border: dragActive ? "2px dashed #2563eb" : "2px dashed #d1d5db",
              borderRadius: "8px",
              textAlign: "center",
              backgroundColor: dragActive ? "#eff6ff" : "transparent",
              transition: "all 0.2s ease",
            }}
          >
            <div
              style={{
                color: dragActive ? "#2563eb" : "#9ca3af",
                marginBottom: "8px",
                transition: "color 0.2s ease",
              }}
            >
              <svg
                style={{
                  margin: "0 auto",
                  height: "48px",
                  width: "48px",
                  display: "block",
                }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p
              style={{
                color: dragActive ? "#1e40af" : "#6b7280",
                fontSize: "14px",
                fontWeight: dragActive ? 600 : 400,
                transition: "color 0.2s ease",
              }}
            >
              {dragActive
                ? "Suelta la imagen aquí"
                : "No hay imagen seleccionada"}
            </p>
            <p
              style={{
                color: "#9ca3af",
                fontSize: "12px",
                marginTop: "4px",
              }}
            >
              {dragActive
                ? ""
                : 'Haz clic en "Seleccionar archivo" o arrastra una imagen aquí'}
            </p>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: "24px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isConfirmDisabled}
          style={{
            padding: "12px 32px",
            backgroundColor: isConfirmDisabled ? "#86efac" : "#16a34a",
            color: "#ffffff",
            borderRadius: "8px",
            fontWeight: 600,
            border: "none",
            cursor: isConfirmDisabled ? "not-allowed" : "pointer",
            opacity: isConfirmDisabled ? 0.5 : 1,
            boxShadow: isConfirmDisabled
              ? "none"
              : "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            fontSize: "14px",
          }}
          onMouseOver={function (e) {
            if (!isConfirmDisabled) {
              e.currentTarget.style.backgroundColor = "#15803d";
              e.currentTarget.style.boxShadow =
                "0 10px 15px -3px rgba(0, 0, 0, 0.1)";
            }
          }}
          onMouseOut={function (e) {
            if (!isConfirmDisabled) {
              e.currentTarget.style.backgroundColor = "#16a34a";
              e.currentTarget.style.boxShadow =
                "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
            }
          }}
        >
          Continuar
        </button>
      </div>

      <style>
        {`
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          input[type="range"] {
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
            background: #e5e7eb;
          }

          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #2563eb;
            cursor: pointer;
            border: 2px solid #ffffff;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
          }

          input[type="range"]::-moz-range-thumb {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #2563eb;
            cursor: pointer;
            border: 2px solid #ffffff;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
          }

          input[type="range"]::-ms-thumb {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #2563eb;
            cursor: pointer;
            border: 2px solid #ffffff;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
          }

          input[type="range"]:disabled::-webkit-slider-thumb {
            background: #9ca3af;
            cursor: not-allowed;
          }

          input[type="range"]:disabled::-moz-range-thumb {
            background: #9ca3af;
            cursor: not-allowed;
          }

          input[type="range"]:disabled::-ms-thumb {
            background: #9ca3af;
            cursor: not-allowed;
          }

          input[type="range"]:focus {
            outline: none;
          }

          input[type="range"]:focus::-webkit-slider-thumb {
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
          }

          input[type="range"]:focus::-moz-range-thumb {
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
          }

          input[type="range"]:focus::-ms-thumb {
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
          }
        `}
      </style>
    </div>
  );
}

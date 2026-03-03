"""API para análisis de imágenes médicas y conversión de formatos"""

from io import BytesIO
import json
import numpy as np

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image, ImageDraw, UnidentifiedImageError
import pydicom

app = Flask(__name__)
# Configuración CORS mejorada
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": ["*"],
            "methods": ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
            "allow_headers": ["Content-Type", "Authorization", "Accept"],
            "supports_credentials": False,
            "max_age": 3600,
        }
    },
    supports_credentials=False,
)
API_URL = "http://tea.uv.es:5300/api"


def is_dicom(file_bytes: bytes) -> bool:
    """Verificar si los bytes corresponden a un archivo DICOM"""
    if len(file_bytes) < 132:
        return False

    # Verificar marca DICM en posición 128-131
    if file_bytes[128:132] == b"DICM":
        return True

    # Verificar inicio alternativo (sin preámbulo)
    if len(file_bytes) >= 8:
        # Verificar si empieza con un Group Length válido
        if file_bytes[0] == 0x08 or file_bytes[0] == 0x02:
            return True

    return False


def validate_file_format(file_bytes: bytes) -> dict:
    """
    Validar formato de archivo y determinar si necesita conversión.
    Retorna información sobre el archivo.
    """
    # Verificar si es DICOM
    if is_dicom(file_bytes):
        try:
            info = get_dicom_info(file_bytes)
            return {
                "is_valid": True,
                "format": "DICOM",
                "needs_conversion": True,
                "is_dicom": True,
                "dicom_info": info,
            }
        except (ValueError, IOError, OSError) as e:
            return {
                "is_valid": False,
                "format": "DICOM",
                "error": f"Error procesando DICOM: {str(e)}",
            }

    # Verificar JPEG
    if len(file_bytes) >= 2 and file_bytes[0] == 0xFF and file_bytes[1] == 0xD8:
        return {
            "is_valid": True,
            "format": "JPEG",
            "needs_conversion": False,
            "is_dicom": False,
        }

    # Verificar PNG
    if len(file_bytes) >= 8 and file_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return {
            "is_valid": True,
            "format": "PNG",
            "needs_conversion": False,
            "is_dicom": False,
        }

    # Verificar TIFF (Intel y Motorola byte order)
    if len(file_bytes) >= 4:
        if (file_bytes[:2] == b"II" and file_bytes[2:4] == b"\x2a\x00") or (
            file_bytes[:2] == b"MM" and file_bytes[2:4] == b"\x00\x2a"
        ):
            return {
                "is_valid": True,
                "format": "TIFF",
                "needs_conversion": True,
                "is_dicom": False,
            }

    # Intentar abrir con PIL como último recurso
    try:
        img = Image.open(BytesIO(file_bytes))
        img_format = img.format or "UNKNOWN"
        img.close()

        needs_conversion = img_format.upper() in ["TIFF", "TIF"]

        return {
            "is_valid": True,
            "format": img_format,
            "needs_conversion": needs_conversion,
            "is_dicom": False,
        }
    except (UnidentifiedImageError, OSError, ValueError) as e:
        return {
            "is_valid": False,
            "format": "UNKNOWN",
            "error": f"Formato no reconocido: {str(e)}",
        }


def dicom_to_image(file_bytes: bytes, slice_index: int = None) -> Image.Image:
    """
    Convertir archivo DICOM a imagen PIL.
    Para imágenes 3D, extrae un slice específico o el central si no se especifica.
    """
    try:
        dicom_data = pydicom.dcmread(BytesIO(file_bytes))
        pixel_array = dicom_data.pixel_array

        ndim = pixel_array.ndim
        shape = pixel_array.shape

        if ndim == 2:
            slice_2d = pixel_array
        elif ndim == 3:
            if shape[2] == 3:
                slice_2d = (
                    pixel_array[:, :, 0] * 0.299
                    + pixel_array[:, :, 1] * 0.587
                    + pixel_array[:, :, 2] * 0.114
                ).astype(pixel_array.dtype)
            else:
                num_slices = shape[0]
                if slice_index is not None:
                    if 0 <= slice_index < num_slices:
                        slice_2d = pixel_array[slice_index, :, :]
                    else:
                        raise ValueError(
                            f"Slice index {slice_index} fuera de rango (0-{num_slices-1})"
                        )
                else:
                    middle_slice = num_slices // 2
                    slice_2d = pixel_array[middle_slice, :, :]
        elif ndim == 4:
            num_frames = shape[0]
            if slice_index is not None:
                if 0 <= slice_index < num_frames:
                    frame = pixel_array[slice_index, :, :, :]
                else:
                    raise ValueError(
                        f"Frame index {slice_index} fuera de rango (0-{num_frames-1})"
                    )
            else:
                middle_frame = num_frames // 2
                frame = pixel_array[middle_frame, :, :, :]

            slice_2d = (
                frame[:, :, 0] * 0.299 + frame[:, :, 1] * 0.587 + frame[:, :, 2] * 0.114
            ).astype(pixel_array.dtype)
        else:
            raise ValueError(f"Dimensiones no soportadas: {ndim}D con shape {shape}")

        pixel_min = slice_2d.min()
        pixel_max = slice_2d.max()

        if pixel_max > pixel_min:
            normalized = (
                (slice_2d - pixel_min) / (pixel_max - pixel_min) * 255
            ).astype(np.uint8)
        else:
            normalized = np.zeros_like(slice_2d, dtype=np.uint8)

        if hasattr(dicom_data, "WindowCenter") and hasattr(dicom_data, "WindowWidth"):
            try:
                raw_center = dicom_data.WindowCenter
                raw_width = dicom_data.WindowWidth

                if isinstance(raw_center, (list, pydicom.multival.MultiValue)):
                    raw_center = raw_center[0]
                if isinstance(raw_width, (list, pydicom.multival.MultiValue)):
                    raw_width = raw_width[0]

                window_center = float(raw_center)
                window_width = float(raw_width)

                img_min = window_center - window_width / 2
                img_max = window_center + window_width / 2

                windowed = np.clip(slice_2d, img_min, img_max)
                normalized = ((windowed - img_min) / (img_max - img_min) * 255).astype(
                    np.uint8
                )
            except (ValueError, TypeError, AttributeError):
                pass

        if hasattr(dicom_data, "PhotometricInterpretation"):
            if dicom_data.PhotometricInterpretation == "MONOCHROME1":
                normalized = 255 - normalized

        return Image.fromarray(normalized, mode="L")

    except Exception as e:
        raise ValueError(f"Error procesando archivo DICOM: {str(e)}") from e


def get_dicom_info(file_bytes: bytes) -> dict:
    """Obtener información sobre un archivo DICOM"""
    try:
        dicom_data = pydicom.dcmread(BytesIO(file_bytes))
        pixel_array = dicom_data.pixel_array
        shape = pixel_array.shape
        ndim = pixel_array.ndim

        info = {
            "dimensions": ndim,
            "shape": list(shape),
            "is_multi_slice": False,
            "num_slices": 1,
            "is_color": False,
        }

        if ndim == 3:
            if shape[2] == 3:
                info["is_color"] = True
                info["color_type"] = "RGB"
            else:
                info["is_multi_slice"] = True
                info["num_slices"] = shape[0]
        elif ndim == 4:
            info["is_multi_slice"] = True
            info["num_slices"] = shape[0]
            info["is_color"] = True
            info["color_type"] = "RGB multi-frame"

        return info
    except Exception as e:
        raise ValueError(f"Error leyendo información DICOM: {str(e)}") from e


def polygon_stats(image: Image.Image, polygon: list[tuple[float, float]]) -> dict:
    """Calcular estadísticas de píxeles dentro del polígono en la imagen"""
    gray = image.convert("L")
    arr = np.array(gray)

    mask = Image.new("L", gray.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, outline=255, fill=255)
    mask_arr = np.array(mask) > 0

    pixels = arr[mask_arr]
    area = int(pixels.size)

    if area == 0:
        return {
            "mean": 0.0,
            "min": None,
            "max": None,
            "area": 0,
            "histogram": [0] * 256,
        }

    mean_val = float(pixels.mean())
    min_val = float(pixels.min())
    max_val = float(pixels.max())

    counts, _ = np.histogram(pixels, bins=256, range=(0, 255))
    counts = counts.astype(int).tolist()

    return {
        "mean": mean_val,
        "min": min_val,
        "max": max_val,
        "area": area,
        "histogram": counts,
    }


@app.route("/api/validate", methods=["POST"])
def validate_file():
    """Validar formato de archivo y obtener información"""
    if "image" not in request.files:
        return jsonify({"error": "No se ha subido ninguna imagen (campo 'image')"}), 400

    file_storage = request.files["image"]
    file_bytes = file_storage.read()

    # Validar tamaño
    max_size = 10 * 1024 * 1024  # 10 MB
    if len(file_bytes) > max_size:
        return (
            jsonify(
                {
                    "error": f"El archivo excede el tamaño máximo permitido ({max_size // (1024*1024)} MB)"
                }
            ),
            400,
        )

    try:
        validation_result = validate_file_format(file_bytes)
        return jsonify(validation_result)
    except (ValueError, TypeError, OSError) as e:
        return jsonify({"error": f"Error validando archivo: {str(e)}"}), 500


@app.route("/api/dicom/info", methods=["POST"])
def dicom_info():
    """Obtener información sobre un archivo DICOM"""
    if "image" not in request.files:
        return jsonify({"error": "No se ha subido ninguna imagen (campo 'image')"}), 400

    file_storage = request.files["image"]
    file_bytes = file_storage.read()

    if not is_dicom(file_bytes):
        return jsonify({"error": "El archivo no es un DICOM válido"}), 400

    try:
        info = get_dicom_info(file_bytes)
        return jsonify(info)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/roi/mean", methods=["POST"])
def roi_mean():
    """Calcular estadísticas de una región de interés en la imagen subida"""
    if "image" not in request.files:
        return jsonify({"error": "No se ha subido ninguna imagen (campo 'image')"}), 400

    file_storage = request.files["image"]
    file_bytes = file_storage.read()

    slice_index = request.form.get("slice_index")
    slice_idx = None
    if slice_index:
        try:
            slice_idx = int(slice_index)
        except ValueError:
            pass

    try:
        if is_dicom(file_bytes):
            orig = dicom_to_image(file_bytes, slice_index=slice_idx)
        else:
            orig = Image.open(BytesIO(file_bytes))
    except (UnidentifiedImageError, OSError, ValueError) as e:
        return jsonify({"error": "No se pudo abrir la imagen: " + str(e)}), 400

    try:
        if (orig.format or "").upper() == "TIFF":
            img_for_analysis = orig
        else:
            tiff_buf = BytesIO()
            img = orig.convert("RGB") if orig.mode != "RGB" else orig
            img.save(tiff_buf, format="TIFF")
            tiff_buf.seek(0)
            img_for_analysis = Image.open(tiff_buf)
    except (UnidentifiedImageError, OSError):
        img_for_analysis = orig

    roi_raw = request.form.get("roi")
    if not roi_raw:
        return jsonify({"error": "Falta campo 'roi'"}), 400

    try:
        roi_list = json.loads(roi_raw)
        if not isinstance(roi_list, list) or len(roi_list) < 6:
            raise ValueError(
                "ROI debe ser una lista de coordenadas [x1,y1,x2,y2,...] con al menos 3 puntos"
            )
        polygon = [
            (float(roi_list[i]), float(roi_list[i + 1]))
            for i in range(0, len(roi_list), 2)
        ]
    except (ValueError, TypeError, json.JSONDecodeError) as e:
        return jsonify({"error": "Formato de 'roi' inválido: " + str(e)}), 400

    try:
        stats = polygon_stats(img_for_analysis, polygon)
        return jsonify(stats)
    except (ValueError, TypeError, OSError) as e:
        return jsonify({"error": "Error procesando la imagen: " + str(e)}), 500
    finally:
        try:
            orig.close()
        except (OSError, ValueError, AttributeError):
            pass
        try:
            if img_for_analysis is not orig:
                img_for_analysis.close()
        except (OSError, ValueError, AttributeError):
            pass


@app.route("/api/convert", methods=["POST"])
def convert_image():
    """Convertir imagen subida a JPEG (incluyendo DICOM)"""
    if "image" not in request.files:
        return jsonify({"error": "No se ha subido ninguna imagen (campo 'image')"}), 400

    file_storage = request.files["image"]
    file_bytes = file_storage.read()

    if len(file_bytes) >= 2 and file_bytes[0] == 0xFF and file_bytes[1] == 0xD8:
        return send_file(
            BytesIO(file_bytes), mimetype="image/jpeg", download_name="image.jpg"
        )

    slice_index = request.form.get("slice_index")
    slice_idx = None
    if slice_index:
        try:
            slice_idx = int(slice_index)
        except ValueError:
            pass

    try:
        if is_dicom(file_bytes):
            img = dicom_to_image(file_bytes, slice_index=slice_idx)
        else:
            img = Image.open(BytesIO(file_bytes))
    except (UnidentifiedImageError, OSError, ValueError) as e:
        return jsonify({"error": "No se pudo abrir la imagen: " + str(e)}), 400

    try:
        if getattr(img, "n_frames", 1) > 1:
            try:
                img.seek(0)
                img = img.copy()
            except (EOFError, OSError):
                pass

        if img.mode != "RGB":
            img = img.convert("RGB")

        out = BytesIO()
        img.save(out, format="JPEG", quality=85, optimize=True)
        out.seek(0)
        return send_file(out, mimetype="image/jpeg", download_name="image.jpg")
    except (OSError, ValueError) as e:
        return jsonify({"error": "Error convirtiendo a JPEG: " + str(e)}), 500
    finally:
        try:
            img.close()
        except (OSError, ValueError, AttributeError):
            pass


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5300, debug=True)

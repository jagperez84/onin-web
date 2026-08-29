import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import {
  listMeasurementPhotos,
  removeMeasurementPhoto,
  uploadMeasurementPhoto,
  type MeasurementPhoto,
} from "../../services/measurements/measurementRepository";
import { confirmDialog } from "../../components/ui/ConfirmDialog";

type Props = { measurementId: number; canEdit: boolean };

function formatPhotoDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/"))
    throw new Error("El archivo seleccionado no es una imagen.");
  const bitmap = await createImageBitmap(file);
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob) throw new Error("No se pudo comprimir la imagen.");
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export function MeasurementPhotos({ measurementId, canEdit }: Props) {
  const [photos, setPhotos] = useState<MeasurementPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  async function loadPhotos() {
    setLoading(true);
    setError("");
    try {
      setPhotos(await listMeasurementPhotos(measurementId));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudieron cargar las fotografías.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPhotos();
  }, [measurementId]);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of files) {
        const compressed = await compressImage(file);
        await uploadMeasurementPhoto(measurementId, compressed);
      }
      await loadPhotos();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo adjuntar la fotografía.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: MeasurementPhoto) {
    if (!(await confirmDialog({ title: "¿Eliminar esta fotografía?", danger: true }))) return;
    setBusy(true);
    setError("");
    try {
      await removeMeasurementPhoto(measurementId, photo.path);
      setPhotos((current) =>
        current.filter((item) => item.path !== photo.path),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo eliminar la fotografía.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel measurement-photos-panel">
      <div className="panel-head">
        <div>
          <h2>Fotografías</h2>
          <p>Imágenes de la visita y del lugar de instalación.</p>
        </div>
        <Camera size={19} />
      </div>
      {canEdit && (
        <div className="measurement-photo-actions">
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFiles}
            hidden
          />
          <input
            ref={galleryInput}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            hidden
          />
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => cameraInput.current?.click()}
          >
            <Camera size={16} /> Tomar foto
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => galleryInput.current?.click()}
          >
            <ImagePlus size={16} /> Galería
          </button>
          <span className="measurement-photo-hint">
            Las fotos se comprimen antes de subirlas.
          </span>
        </div>
      )}
      {error && <div className="measurement-photo-error">{error}</div>}
      {loading ? (
        <div className="measurement-photo-empty">
          <LoaderCircle className="spin" size={18} /> Cargando fotografías…
        </div>
      ) : photos.length === 0 ? (
        <div className="measurement-photo-empty">
          Todavía no hay fotografías adjuntas.
        </div>
      ) : (
        <div className="measurement-photo-grid">
          {photos.map((photo) => (
            <figure key={photo.path} className="measurement-photo-card">
              <a href={photo.signedUrl} target="_blank" rel="noreferrer">
                <img
                  src={photo.signedUrl}
                  alt="Fotografía de la medición"
                  loading="lazy"
                />
              </a>
              <figcaption>
                <span>{formatPhotoDate(photo.createdAt)}</span>
                {canEdit && (
                  <button
                    type="button"
                    title="Eliminar fotografía"
                    disabled={busy}
                    onClick={() => void remove(photo)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

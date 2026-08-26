import { Save } from "lucide-react";
import "./profile-ui.css";

type ProfileSaveBarProps = {
  onSave: () => void;
  saving?: boolean;
  label?: string;
};

export function ProfileSaveBar({
  onSave,
  saving = false,
  label = "Guardar",
}: ProfileSaveBarProps) {
  return (
    <div className="profile-save-bar">
      <button
        type="button"
        className="primary-button"
        onClick={onSave}
        disabled={saving}
      >
        <Save size={16} />
        {saving ? "Guardando…" : label}
      </button>
    </div>
  );
}

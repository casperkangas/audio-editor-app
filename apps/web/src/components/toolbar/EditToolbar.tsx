/**
 * components/toolbar/EditToolbar.tsx
 *
 * Buttons for applying edit operations to the current selection.
 * All actions are passed in as callbacks; this component is pure UI.
 */

interface EditToolbarProps {
  hasSelection:  boolean;
  canUndo:       boolean;
  canRedo:       boolean;
  onTrim:        () => void;
  onCut:         () => void;
  onFadeIn:      () => void;
  onFadeOut:     () => void;
  onVolumeUp:    () => void;
  onVolumeDown:  () => void;
  onUndo:        () => void;
  onRedo:        () => void;
  disabled?:     boolean;
}

interface ToolbarButtonProps {
  onClick:   () => void;
  disabled?: boolean;
  label:     string;
  title?:    string;
  variant?:  'default' | 'danger' | 'subtle';
}

function ToolbarBtn({ onClick, disabled, label, title, variant = 'default' }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={title ?? label}
      className={`toolbar-btn toolbar-btn--${variant}`}
    >
      {label}
    </button>
  );
}

export default function EditToolbar({
  hasSelection,
  canUndo,
  canRedo,
  onTrim,
  onCut,
  onFadeIn,
  onFadeOut,
  onVolumeUp,
  onVolumeDown,
  onUndo,
  onRedo,
  disabled = false,
}: EditToolbarProps) {
  const selDisabled = disabled || !hasSelection;

  return (
    <div className="edit-toolbar" role="toolbar" aria-label="Edit operations">
      <div className="toolbar-group">
        <ToolbarBtn label="Trim"     onClick={onTrim}    disabled={selDisabled} title="Keep selected region only" />
        <ToolbarBtn label="Cut"      onClick={onCut}     disabled={selDisabled} title="Remove selected region" variant="danger" />
        <ToolbarBtn label="Fade In"  onClick={onFadeIn}  disabled={selDisabled} title="Fade in over selection" />
        <ToolbarBtn label="Fade Out" onClick={onFadeOut} disabled={selDisabled} title="Fade out over selection" />
      </div>

      <div className="toolbar-group">
        <ToolbarBtn label="Vol +"    onClick={onVolumeUp}   disabled={selDisabled} title="Increase volume of selection (+20%)" />
        <ToolbarBtn label="Vol −"    onClick={onVolumeDown} disabled={selDisabled} title="Decrease volume of selection (−20%)" />
      </div>

      <div className="toolbar-group toolbar-group--history">
        <ToolbarBtn label="↩ Undo" onClick={onUndo} disabled={disabled || !canUndo} variant="subtle" title="Undo last action" />
        <ToolbarBtn label="↪ Redo" onClick={onRedo} disabled={disabled || !canRedo} variant="subtle" title="Redo last undone action" />
      </div>
    </div>
  );
}

import { useId } from 'react'

// Labelled text input. `hint` shows under the field; `error` replaces it in red.
export default function TextField({ label, hint, error, className = '', id, ...inputProps }) {
  const autoId = useId()
  const fieldId = id || autoId
  const noteId = `${fieldId}-note`
  const note = error || hint
  return (
    <div className={`ui-field ${className}`}>
      <label className="ui-field__label" htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        className={`ui-input ${error ? 'ui-input--error' : ''}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={note ? noteId : undefined}
        {...inputProps}
      />
      {note && (
        <span id={noteId} className={`ui-field__note ${error ? 'ui-field__note--error' : ''}`}>
          {note}
        </span>
      )}
    </div>
  )
}

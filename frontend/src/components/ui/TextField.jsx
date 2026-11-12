import { useId } from 'react'

// Labelled text input. `hint` shows under the field; `error` replaces it in red.
// `trailing` renders inside the field on the right (e.g. a show-password toggle).
export default function TextField({ label, hint, error, trailing, className = '', id, ...inputProps }) {
  const autoId = useId()
  const fieldId = id || autoId
  const noteId = `${fieldId}-note`
  const note = error || hint
  return (
    <div className={`ui-field ${className}`}>
      <label className="ui-field__label" htmlFor={fieldId}>{label}</label>
      <div className="ui-input-wrap">
        <input
          id={fieldId}
          className={`ui-input ${error ? 'ui-input--error' : ''} ${trailing ? 'ui-input--trailing' : ''}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={note ? noteId : undefined}
          {...inputProps}
        />
        {trailing && <span className="ui-input__trailing">{trailing}</span>}
      </div>
      {note && (
        <span id={noteId} className={`ui-field__note ${error ? 'ui-field__note--error' : ''}`}>
          {note}
        </span>
      )}
    </div>
  )
}

import React from 'react';

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
}

interface MultiSelectFilterProps {
  id: string;
  label: string;
  allLabel: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  id,
  label,
  allLabel,
  options,
  selected,
  onChange,
}) => {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selecionados`;

  return (
    <div className="filter-input-group multi-select" ref={wrapRef}>
      <label htmlFor={id}>{label}</label>
      <button
        id={id}
        type="button"
        className={`multi-select-trigger${selected.length > 0 ? ' has-value' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="multi-select-summary">{summary}</span>
        <span className="multi-select-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="multi-select-popover" role="listbox" aria-multiselectable="true">
          <div className="multi-select-actions">
            <button type="button" onClick={() => onChange(options.map((o) => o.value))}>
              Selecionar todos
            </button>
            <button type="button" onClick={() => onChange([])}>
              Limpar
            </button>
          </div>
          <ul className="multi-select-list">
            {options.map((option) => (
              <li key={option.value}>
                <label className="multi-select-option">
                  <input
                    type="checkbox"
                    checked={selected.includes(option.value)}
                    onChange={() => toggle(option.value)}
                  />
                  <span className="multi-select-option-label">{option.label}</span>
                  {option.count != null && <span className="multi-select-count">{option.count}</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

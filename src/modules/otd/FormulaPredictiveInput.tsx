import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Sliders,
  ChevronDown,
  ChevronUp,
  Tag,
  Zap,
  Calculator,
  X,
  CornerDownLeft,
} from 'lucide-react';
import './otd.css';

export interface TokenItem {
  code: string;
  name: string;
  type: 'INPUT' | 'VARIABLE' | 'FUNCTION' | 'OPERATOR';
  detail?: string | null;
  is_dimension?: boolean;
}

interface FormulaPredictiveInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  helperText?: string;
  availableInputs?: Array<{ code: string; name: string; is_dimension?: boolean; selection_type?: string }>;
  availableVariables?: Array<{ code: string; name: string; expression?: string | null }>;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

const MATH_FUNCTIONS: TokenItem[] = [
  { code: 'CEIL()', name: 'Redondeo hacia arriba', type: 'FUNCTION', detail: 'CEIL(n) · Ej. CEIL(ANCHO / 1000)' },
  { code: 'ROUND()', name: 'Redondeo estándar al entero más próximo', type: 'FUNCTION', detail: 'ROUND(n) · Ej. ROUND(SALIDA / 500)' },
  { code: 'FLOOR()', name: 'Redondeo hacia abajo', type: 'FUNCTION', detail: 'FLOOR(n) · Ej. FLOOR(ANCHO / 1000)' },
  { code: 'MAX()', name: 'Valor máximo entre dos expresiones', type: 'FUNCTION', detail: 'MAX(a, b) · Ej. MAX(ANCHO, 2000)' },
  { code: 'MIN()', name: 'Valor mínimo entre dos expresiones', type: 'FUNCTION', detail: 'MIN(a, b) · Ej. MIN(SALIDA, 3000)' },
];

const MATH_OPERATORS = [
  { label: '+', value: ' + ' },
  { label: '-', value: ' - ' },
  { label: '×', value: ' * ' },
  { label: '÷', value: ' / ' },
  { label: '(', value: '(' },
  { label: ')', value: ')' },
];

export function FormulaPredictiveInput({
  value,
  onChange,
  placeholder = 'Ej. ANCHO / 1000 o SUPERFICIE',
  label,
  required,
  helperText,
  availableInputs = [],
  availableVariables = [],
  disabled = false,
  className = '',
  compact = false,
}: FormulaPredictiveInputProps) {
  const [showAssistant, setShowAssistant] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentWord, setCurrentWord] = useState('');
  const [wordRange, setWordRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // All catalog items for search
  const allTokens = useMemo<TokenItem[]>(() => {
    const list: TokenItem[] = [];

    // Inputs (Entradas de oficina)
    for (const inp of availableInputs) {
      if (inp.code?.trim()) {
        list.push({
          code: inp.code.trim().toUpperCase(),
          name: inp.name?.trim() || inp.code.trim(),
          type: 'INPUT',
          is_dimension: Boolean(inp.is_dimension),
          detail: inp.selection_type ? `Entrada ${inp.selection_type}` : 'Entrada oficina',
        });
      }
    }

    // Variables (Variables técnicas calculadas)
    for (const v of availableVariables) {
      if (v.code?.trim()) {
        list.push({
          code: v.code.trim().toUpperCase(),
          name: v.name?.trim() || v.code.trim(),
          type: 'VARIABLE',
          detail: v.expression ? `= ${v.expression}` : 'Variable calculada',
        });
      }
    }

    // Functions
    list.push(...MATH_FUNCTIONS);

    return list;
  }, [availableInputs, availableVariables]);

  // Filtered suggestions based on typed word
  const suggestions = useMemo(() => {
    if (!currentWord || currentWord.trim().length === 0) return [];
    const q = currentWord.trim().toUpperCase();

    // Match code prefix or includes
    return allTokens.filter(t => {
      const c = t.code.toUpperCase();
      const n = t.name.toUpperCase();
      return c.includes(q) || n.includes(q);
    }).slice(0, 8);
  }, [allTokens, currentWord]);

  // Click outside to close suggestions & assistant
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update predictive suggestions on cursor / input change
  function detectWordAtCursor(inputEl: HTMLInputElement) {
    const pos = inputEl.selectionStart ?? inputEl.value.length;
    const text = inputEl.value;

    // Find start of word (alphanumeric or underscore)
    let start = pos;
    while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) {
      start--;
    }

    // Find end of word
    let end = pos;
    while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) {
      end++;
    }

    const word = text.slice(start, end);
    setCurrentWord(word);
    setWordRange({ start, end });

    if (word.length >= 1) {
      setShowSuggestions(true);
      setActiveIndex(0);
    } else {
      setShowSuggestions(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newVal = e.target.value;
    onChange(newVal);
    detectWordAtCursor(e.target);
  }

  function handleKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      detectWordAtCursor(e.currentTarget);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestions[activeIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }
  }

  function applySuggestion(item: TokenItem) {
    if (!inputRef.current) return;
    const text = value || '';
    const { start, end } = wordRange;

    let insertion = item.code;
    let newCursorPos = start + insertion.length;

    // Handle functions like CEIL()
    if (item.type === 'FUNCTION') {
      insertion = item.code; // e.g. "CEIL()"
      newCursorPos = start + insertion.length - 1; // inside the parenthesis
    }

    const nextValue = text.slice(0, start) + insertion + text.slice(end);
    onChange(nextValue);
    setShowSuggestions(false);
    setCurrentWord('');

    // Restore focus and cursor position
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  }

  // Insert token from Assistant Tool
  function insertTokenFromAssistant(tokenCode: string, isFunc = false) {
    if (!inputRef.current) {
      const cur = (value || '').trim();
      onChange(cur ? `${cur} * ${tokenCode}` : tokenCode);
      return;
    }

    const inputEl = inputRef.current;
    const start = inputEl.selectionStart ?? value.length;
    const end = inputEl.selectionEnd ?? value.length;
    const text = value || '';

    let toInsert = tokenCode;
    let newCursor = start + toInsert.length;

    if (isFunc) {
      toInsert = `${tokenCode}()`;
      newCursor = start + tokenCode.length + 1; // inside ()
    }

    const nextVal = text.slice(0, start) + toInsert + text.slice(end);
    onChange(nextVal);

    setTimeout(() => {
      inputEl.focus();
      inputEl.setSelectionRange(newCursor, newCursor);
    }, 10);
  }

  return (
    <div className={`otd-formula-field-container ${className}`} ref={containerRef}>
      {/* Label and Assistant Toggle Button */}
      {label && (
        <div className="otd-formula-field-head">
          <span className="field-label">
            {label} {required && <span className="req-star">*</span>}
          </span>
          <button
            type="button"
            className={`otd-assistant-toggle-btn ${showAssistant ? 'active' : ''}`}
            onClick={() => setShowAssistant(!showAssistant)}
            title={showAssistant ? 'Ocultar herramienta de cálculo' : 'Mostrar asistente de fórmulas'}
          >
            <Sparkles size={11} />
            <span>{showAssistant ? 'Ocultar' : 'Asistente'}</span>
            {showAssistant ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
      )}

      {/* Main Input Box with Autocomplete dropdown */}
      <div className="otd-predictive-input-wrap">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyUp={handleKeyUp}
          onKeyDown={handleKeyDown}
          onFocus={e => detectWordAtCursor(e.target)}
          placeholder={placeholder}
          disabled={disabled}
          className="otd-predictive-input"
          autoComplete="off"
          spellCheck={false}
        />

        {!label && (
          <button
            type="button"
            className={`otd-assistant-inline-toggle ${showAssistant ? 'active' : ''}`}
            onClick={() => setShowAssistant(!showAssistant)}
            title="Herramienta de variables y fórmulas"
          >
            <Sparkles size={13} />
          </button>
        )}

        {/* Predictive Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="otd-suggestions-dropdown" role="listbox">
            <div className="otd-suggestions-head">
              <span>Sugerencias para "{currentWord}"</span>
              <small>
                <CornerDownLeft size={10} /> Enter para insertar
              </small>
            </div>
            <div className="otd-suggestions-list">
              {suggestions.map((item, idx) => {
                const isSelected = idx === activeIndex;
                return (
                  <button
                    key={`${item.type}-${item.code}`}
                    type="button"
                    className={`otd-suggestion-item ${isSelected ? 'selected' : ''} ${item.type.toLowerCase()}`}
                    onMouseDown={e => {
                      e.preventDefault();
                      applySuggestion(item);
                    }}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <div className="sugg-left">
                      {item.type === 'INPUT' && <Tag size={13} className="sugg-icon input" />}
                      {item.type === 'VARIABLE' && <Zap size={13} className="sugg-icon var" />}
                      {item.type === 'FUNCTION' && <Calculator size={13} className="sugg-icon func" />}
                      <span className="sugg-code">{item.code}</span>
                      <span className="sugg-name">{item.name}</span>
                    </div>
                    <div className="sugg-right">
                      {item.type === 'INPUT' && (
                        <span className="sugg-badge input">
                          {item.is_dimension ? 'Dimensión' : 'Entrada'}
                        </span>
                      )}
                      {item.type === 'VARIABLE' && <span className="sugg-badge var">Variable</span>}
                      {item.type === 'FUNCTION' && <span className="sugg-badge func">Función</span>}
                      {item.detail && <span className="sugg-detail">{item.detail}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {helperText && <span className="otd-field-hint">{helperText}</span>}

      {/* Hidden-by-default Collapsible Formula Assistant */}
      {showAssistant && (
        <div className={`otd-formula-assistant-drawer ${compact ? 'compact' : ''}`}>
          <div className="otd-assistant-drawer-head">
            <div className="drawer-title">
              <Sliders size={13} />
              <strong>Herramienta de Fórmulas y Variables</strong>
              <span>(Haz clic en cualquier elemento para insertarlo)</span>
            </div>
            <button
              type="button"
              className="icon-btn small"
              onClick={() => setShowAssistant(false)}
              title="Cerrar asistente"
            >
              <X size={13} />
            </button>
          </div>

          <div className="otd-assistant-drawer-body">
            {/* Section: Office Inputs */}
            <div className="assistant-group">
              <span className="assistant-group-title">
                <Tag size={12} /> Entradas de oficina (Sec. 2)
              </span>
              <div className="assistant-chips">
                {availableInputs.map(inp => (
                  <button
                    key={inp.code}
                    type="button"
                    className="otd-assistant-chip input-chip"
                    onClick={() => insertTokenFromAssistant(inp.code)}
                    title={`${inp.name} (${inp.code})`}
                  >
                    🏷️ {inp.code}
                  </button>
                ))}
                {availableInputs.length === 0 && (
                  <span className="assistant-empty-note">No hay entradas definidas</span>
                )}
              </div>
            </div>

            {/* Section: Calculated Variables */}
            <div className="assistant-group">
              <span className="assistant-group-title">
                <Zap size={12} /> Variables calculadas (Sec. 4)
              </span>
              <div className="assistant-chips">
                {availableVariables.map(v => (
                  <button
                    key={v.code}
                    type="button"
                    className="otd-assistant-chip var-chip"
                    onClick={() => insertTokenFromAssistant(v.code)}
                    title={`${v.name} (${v.code}) ${v.expression ? `= ${v.expression}` : ''}`}
                  >
                    ⚡ {v.code}
                  </button>
                ))}
                {availableVariables.length === 0 && (
                  <span className="assistant-empty-note">No hay variables definidas</span>
                )}
              </div>
            </div>

            {/* Section: Operators & Functions */}
            <div className="assistant-group math-group">
              <span className="assistant-group-title">
                <Calculator size={12} /> Operadores y Funciones
              </span>
              <div className="assistant-chips">
                {MATH_OPERATORS.map(op => (
                  <button
                    key={op.label}
                    type="button"
                    className="otd-assistant-chip op-chip"
                    onClick={() => insertTokenFromAssistant(op.value)}
                    title={`Operador ${op.label}`}
                  >
                    {op.label}
                  </button>
                ))}
                {['CEIL', 'ROUND', 'FLOOR', 'MAX', 'MIN'].map(fn => (
                  <button
                    key={fn}
                    type="button"
                    className="otd-assistant-chip func-chip"
                    onClick={() => insertTokenFromAssistant(fn, true)}
                    title={`Función ${fn}()`}
                  >
                    {fn}()
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

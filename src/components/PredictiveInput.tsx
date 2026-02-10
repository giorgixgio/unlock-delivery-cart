import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { type Suggestion } from "@/lib/addressPredictor";

interface PredictiveInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: Suggestion) => void;
  getSuggestions: (input: string) => Suggestion[];
  placeholder?: string;
  type?: string;
  className?: string;
  error?: string;
}

const PredictiveInput = ({
  value,
  onChange,
  onSelect,
  getSuggestions,
  placeholder,
  type = "text",
  className = "",
  error,
}: PredictiveInputProps) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [justSelected, setJustSelected] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Compute suggestions on input change
  const updateSuggestions = useCallback(
    (text: string) => {
      if (justSelected) return;
      if (!text || text.length < 1) {
        setSuggestions([]);
        setIsOpen(false);
        return;
      }
      const results = getSuggestions(text);
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setActiveIndex(-1);
    },
    [getSuggestions, justSelected]
  );

  const handleChange = (newValue: string) => {
    setJustSelected(false);
    onChange(newValue);
    // Debounce suggestions
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateSuggestions(newValue), 150);
  };

  const handleSelect = (suggestion: Suggestion) => {
    setJustSelected(true);
    onChange(suggestion.text);
    onSelect?.(suggestion);
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on blur (with delay to allow click)
  const handleBlur = () => {
    setTimeout(() => {
      if (wrapperRef.current && !wrapperRef.current.contains(document.activeElement)) {
        setIsOpen(false);
      }
    }, 200);
  };

  const getConfidenceLabel = (confidence: number): string | null => {
    if (confidence >= 0.85) return null;
    if (confidence >= 0.6) return "შემოთავაზება";
    return null;
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        ref={inputRef}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value && !justSelected) updateSuggestions(value);
        }}
        onBlur={handleBlur}
        className={`h-12 text-base rounded-lg ${className}`}
        autoComplete="off"
      />
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}

      {/* Suggestions dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-150 max-h-52 overflow-y-auto">
          {suggestions.map((suggestion, idx) => {
            const label = getConfidenceLabel(suggestion.confidence);
            const isActive = idx === activeIndex;
            return (
              <button
                key={`${suggestion.text}-${idx}`}
                type="button"
                className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors text-sm ${
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-muted/60 text-foreground"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur before click
                  handleSelect(suggestion);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{suggestion.text}</span>
                  {suggestion.region && suggestion.source === "onway" && (
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      ({suggestion.region})
                    </span>
                  )}
                </div>
                {label && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-2 flex-shrink-0">
                    {label}
                  </span>
                )}
                {suggestion.source === "history" && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-2 flex-shrink-0">
                    ისტორია
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PredictiveInput;

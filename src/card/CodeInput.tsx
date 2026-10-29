import { useRef } from "react";

// Six digit boxes over one real input: iPhone and Android can fill it from
// the texted code ("one-time-code"), paste works, and the boxes show where
// the next digit goes.
export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");
  return (
    <div className="rde-code" onClick={() => input.current?.focus()}>
      <input
        ref={input}
        className="rde-code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        value={value}
        disabled={disabled}
        aria-label="6-digit code"
        autoFocus
        onChange={(e) => {
          const code = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(code);
          if (code.length === 6) onComplete(code);
        }}
      />
      {digits.map((d, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`rde-code-box${d.trim() ? " is-filled" : ""}${i === Math.min(value.length, 5) && !disabled ? " is-active" : ""}`}
        >
          {d.trim()}
        </span>
      ))}
    </div>
  );
}

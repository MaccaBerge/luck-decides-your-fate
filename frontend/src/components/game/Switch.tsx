interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-[54px] shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-ink-muted/50"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block size-6 rounded-full bg-white transition-transform ${
          checked ? "translate-x-[26px]" : "translate-x-1"
        }`}
      />
    </button>
  );
}

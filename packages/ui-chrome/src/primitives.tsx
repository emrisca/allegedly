import { Children, isValidElement, useRef } from "react";
import type { ChangeEvent, ComponentProps, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui-sdk/react/select";
import { Button } from "@ui-sdk/react/button";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";

/**
 * Shared Allegedly UI primitives modeled on https://www.shadcn.io/ui patterns
 * and backed by @ui-sdk/react headless ARIA / keyboard / focus-trap semantics.
 *
 * Always import UiSwitch, UiButton, UiInput, UiSelect, and UiSettingRow from here
 * rather than writing ad-hoc Tailwind classes on raw @ui-sdk/react slots.
 */

export interface UiSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "default";
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

export function UiSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  size: _size = "default",
  id,
  className = "",
  ...aria
}: UiSwitchProps) {
  const trackSize = "h-[17px] w-[30px]";
  const thumbSize = "h-[13px] w-[13px] data-checked:translate-x-[13px]";

  return (
    <Switch
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      {...aria}
      className={[
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-[2px] transition-colors duration-150",
        "bg-white/[0.12] hover:bg-white/[0.18] data-checked:bg-[#e4e4e7] data-checked:hover:bg-white",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        trackSize,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <SwitchThumb
        className={[
          "pointer-events-none block rounded-full bg-[#a1a1aa] data-checked:bg-[#0e1014] transition-transform duration-150 translate-x-0",
          thumbSize,
        ].join(" ")}
      />
    </Switch>
  );
}

export type UiButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
export type UiButtonSize = "xs" | "sm" | "md" | "icon" | "icon-sm";

export type UiButtonProps = ComponentProps<typeof Button> & {
  variant?: UiButtonVariant;
  size?: UiButtonSize;
};

const BUTTON_VARIANT_CLS: Record<UiButtonVariant, string> = {
  default:
    "bg-[#ededed] text-[#0d0f12] hover:bg-white",
  secondary:
    "border border-white/[0.09] bg-white/[0.05] text-[#e4e4e7] hover:border-white/[0.16] hover:bg-white/[0.09]",
  outline:
    "border border-white/[0.09] bg-white/[0.05] text-[#e4e4e7] hover:border-white/[0.16] hover:bg-white/[0.09]",
  ghost:
    "bg-transparent text-[#8b8f9c] hover:bg-white/[0.06] hover:text-[#f4f4f5]",
  destructive:
    "border border-[#47252c] bg-[#2a151a] text-[#f27983] hover:bg-[#3b1c23] hover:text-[#fda4af]",
};

const BUTTON_SIZE_CLS: Record<UiButtonSize, string> = {
  xs: "h-7 px-2.5 text-[11px] rounded-md",
  sm: "h-7 px-3 text-[12px] rounded-[6px]",
  md: "h-[30px] px-3 text-[12px] rounded-[6px]",
  icon: "h-8 w-8 rounded-md p-0",
  "icon-sm": "h-7 w-7 rounded-md p-0",
};

export function UiButton({
  variant = "outline",
  size = "sm",
  className = "",
  type = "button",
  ...rest
}: UiButtonProps) {
  return (
    <Button
      type={type}
      data-ui-variant={variant}
      {...rest}
      className={[
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-[color,background-color,border-color,transform] active:scale-[0.99]",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/50",
        "disabled:pointer-events-none disabled:opacity-45",
        BUTTON_VARIANT_CLS[variant],
        BUTTON_SIZE_CLS[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function UiInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={[
        "h-[30px] w-full rounded-[6px] border border-white/[0.09] bg-[#0d0f14] px-2.5 text-[12px] text-[#f4f4f5] tabular-nums",
        "placeholder:text-[#5c6270] transition-colors",
        "focus:border-white/30 focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function UiSelect({ className = "", children, value, defaultValue, onChange, disabled, id, name, required, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const options = Children.toArray(children).filter(isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>);
  const items = options.map((option) => ({
    value: String(option.props.value ?? option.props.children ?? ""),
    label: String(option.props.children ?? option.props.value ?? ""),
    disabled: option.props.disabled,
  }));
  return (
    <Select
      items={items}
      value={value === undefined ? undefined : String(value)}
      defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
      disabled={disabled}
      required={required}
      onValueChange={(next) => {
        const select = selectRef.current;
        if (!select || next === null) return;
        select.value = String(next);
        onChange?.({ target: select, currentTarget: select } as ChangeEvent<HTMLSelectElement>);
      }}
    >
      <select ref={selectRef} name={name} tabIndex={-1} aria-hidden="true" hidden defaultValue={value ?? defaultValue}>
        {children}
      </select>
      <SelectTrigger
        id={id}
        aria-label={rest["aria-label"]}
        aria-labelledby={rest["aria-labelledby"]}
        className={`inline-flex h-[30px] min-w-0 items-center justify-between gap-2 rounded-[6px] border border-white/[0.09] bg-[#0d0f14] px-2.5 text-left text-[12px] text-[#f4f4f5] focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/50 disabled:opacity-50 ${className}`}
      >
        <SelectValue className="min-w-0 flex-1 truncate" />
        <span aria-hidden="true" className="shrink-0 text-[#9ca3af]">▾</span>
      </SelectTrigger>
      <SelectContent className="z-[100] max-h-64 min-w-[var(--anchor-width)] overflow-y-auto rounded-[6px] border border-white/[0.10] bg-[var(--app-surface-bg,#16181f)] p-1 text-[12px] text-[#f4f4f5] shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
        {items.map((item) => <SelectItem key={item.value} value={item.value} disabled={item.disabled} className="flex min-h-7 cursor-pointer items-center rounded px-2 data-highlighted:bg-white/[0.08] data-selected:bg-white/[0.10] data-disabled:opacity-40">{item.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function UiSettingRow({
  labelId,
  label,
  description,
  control,
}: {
  labelId: string;
  label: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-3.5 py-2.5 hover:bg-white/[0.03]">
      <div className="min-w-0">
        <div id={labelId} className="text-[12.5px] font-medium text-[#e6e8ee]">
          {label}
        </div>
        {description && (
          <div className="mt-0.5 text-[11px] text-[#868993]">{description}</div>
        )}
      </div>
      {control}
    </div>
  );
}

/** Authentic Lucide / shadcn toothed Settings gear cog (replaces sun-ray/hex icons). */
export function SettingsCogIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

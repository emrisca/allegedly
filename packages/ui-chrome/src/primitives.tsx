import type { ComponentProps, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
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
  size = "default",
  id,
  className = "",
  ...aria
}: UiSwitchProps) {
  const isSm = size === "sm";
  const trackSize = isSm ? "h-[18px] w-[32px]" : "h-[20px] w-[36px]";
  const thumbSize = isSm
    ? "h-[14px] w-[14px] data-checked:translate-x-[14px]"
    : "h-[16px] w-[16px] data-checked:translate-x-[16px]";

  return (
    <Switch
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      {...aria}
      className={[
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-[2px] transition-colors duration-150",
        "bg-[#2d3240] hover:bg-[#383e4f] data-checked:bg-[var(--app-accent,#2962ff)] data-checked:hover:bg-[#1e53e5]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent,#2962ff)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface-bg,#1e222d)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        trackSize,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <SwitchThumb
        className={[
          "pointer-events-none block rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.45)] transition-transform duration-150 translate-x-0",
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
    "bg-[var(--app-accent,#2962ff)] text-white hover:bg-[#1e53e5] shadow-xs",
  secondary:
    "bg-[#252a36] text-[#f0f3fa] hover:bg-[#303645]",
  outline:
    "border border-[var(--app-border,#323642)] bg-[var(--app-panel-bg,#181a20)] text-[#d1d4dc] hover:bg-[#23262f] hover:text-white",
  ghost:
    "bg-transparent text-[#b2b5be] hover:bg-[#2a2e39] hover:text-white",
  destructive:
    "border border-[#47252c] bg-[#2a151a] text-[#f27983] hover:bg-[#3b1c23] hover:text-[#fda4af]",
};

const BUTTON_SIZE_CLS: Record<UiButtonSize, string> = {
  xs: "h-7 px-2.5 text-[11px] rounded-md",
  sm: "h-8 px-3 text-[12px] rounded-md",
  md: "h-9 px-4 text-[13px] rounded-lg",
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
      {...rest}
      className={[
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent,#2962ff)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--app-surface-bg,#1e222d)]",
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
        "h-8 w-full rounded-md border border-[var(--app-border,#323642)] bg-[#111318] px-2.5 text-[12px] text-[#f0f3fa]",
        "placeholder:text-[#5c6270] transition-colors",
        "focus:border-[var(--app-accent,#2962ff)] focus:outline-none focus:ring-1 focus:ring-[var(--app-accent,#2962ff)]/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function UiSelect({ className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={[
        "h-8 rounded-md border border-[var(--app-border,#323642)] bg-[#111318] px-2.5 text-[12px] text-[#f0f3fa]",
        "transition-colors focus:border-[var(--app-accent,#2962ff)] focus:outline-none focus:ring-1 focus:ring-[var(--app-accent,#2962ff)]/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
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
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--app-border,#262a34)] bg-[var(--app-panel-bg,#181a20)] px-3.5 py-2.5">
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

import { useId, useState } from "react";
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@ui-sdk/react/dialog";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { ColorPickerButton, UiButton, UiSelect, UiSettingRow, UiSwitch } from "@allegedly/ui-chrome";
import { TPO_COLOR_FIELDS, type TpoSettings } from "../render/tpo-settings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: TpoSettings;
  onChange: (settings: TpoSettings) => void;
  days: number[];
  merges: readonly number[];
  onMergesChange: (merges: number[]) => void;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeZone: "UTC",
});
const tabClass = "rounded-md px-3 py-1.5 text-sm text-[#b8becd] hover:text-white data-selected:bg-[var(--app-panel-bg,#252932)] data-selected:text-white focus-visible:ring-2 focus-visible:ring-[var(--app-accent,#2962ff)]";

export function TpoSettingsDialog({ open, onOpenChange, settings, onChange, days, merges, onMergesChange }: Props) {
  const id = useId();
  const [day, setDay] = useState<number>();
  const candidates = days.slice(1).reverse();
  const selectedDay = day !== undefined && candidates.includes(day) ? day : candidates[0];
  const isMerged = merges.includes(selectedDay);
  const patch = (change: Partial<TpoSettings>) => onChange({ ...settings, ...change });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} closeOnOutsidePress={false}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/65" />
      <DialogContent className="fixed left-1/2 top-1/2 z-50 w-[min(460px,92vw)] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[var(--app-border,#2a2e39)] bg-[var(--app-surface-bg,#16181f)] text-[#e6e8ee] shadow-xl">
        <header className="flex items-center justify-between gap-3 px-5 py-3">
          <DialogTitle className="text-base font-semibold">TPO Market Profile settings</DialogTitle>
          <DialogDescription className="sr-only">Configure the calculation, session merges, colors and visibility.</DialogDescription>
          <DialogClose aria-label="Close TPO settings" render={<UiButton variant="ghost" />}>×</DialogClose>
        </header>
        <Tabs defaultValue="inputs">
          <TabsList aria-label="TPO settings sections" className="flex gap-1 border-b border-[var(--app-border,#2a2e39)] px-5 pb-2">
            <TabsTab value="inputs" className={tabClass}>Inputs</TabsTab>
            <TabsTab value="style" className={tabClass}>Style</TabsTab>
            <TabsTab value="visibility" className={tabClass}>Visibility</TabsTab>
          </TabsList>
          <TabsPanel value="inputs" className="space-y-2 p-5">
            <UiSettingRow labelId={`${id}-block`} label="Time per letter" control={
              <UiSelect aria-labelledby={`${id}-block`} value={settings.blockMinutes} onChange={(e) => patch({ blockMinutes: Number(e.target.value) })}>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
                <option value={240}>4 hours</option>
              </UiSelect>
            } />
            <UiSettingRow labelId={`${id}-area`} label="Value area" description="Share of TPOs included around the point of control." control={
              <UiSelect aria-labelledby={`${id}-area`} value={settings.valueArea} onChange={(e) => patch({ valueArea: Number(e.target.value) })}>
                {[50, 60, 68, 70, 75, 80, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
              </UiSelect>
            } />
            <UiSettingRow labelId={`${id}-profile`} label="Profile to merge" description="Select a UTC session to combine with the previous profile." control={
              <UiSelect aria-labelledby={`${id}-profile`} disabled={selectedDay === undefined} value={selectedDay ?? ""} onChange={(e) => setDay(Number(e.target.value))}>
                {selectedDay === undefined && <option value="">No adjacent profiles</option>}
                {candidates.map((candidate) => <option key={candidate} value={candidate}>{dateFormatter.format(candidate * 1000)}</option>)}
              </UiSelect>
            } />
            <div className="flex flex-wrap gap-2">
              <UiButton variant="secondary" disabled={selectedDay === undefined} onClick={() => {
                if (selectedDay === undefined) return;
                onMergesChange(isMerged ? merges.filter((key) => key !== selectedDay) : [...merges, selectedDay]);
              }}>{isMerged ? "Split at session" : "Merge with previous"}</UiButton>
              <UiButton variant="ghost" disabled={!merges.length} onClick={() => onMergesChange([])}>Reset merges</UiButton>
            </div>
          </TabsPanel>
          <TabsPanel value="style" className="space-y-2 p-5">
            {TPO_COLOR_FIELDS.map(([key, label]) => (
              <UiSettingRow key={key} labelId={`${id}-${key}`} label={label} control={
                <ColorPickerButton ariaLabel={`${label} color`} value={settings[key]} onChange={(color) => patch({ [key]: color })} />
              } />
            ))}
          </TabsPanel>
          <TabsPanel value="visibility" className="space-y-2 p-5">
            {([
              ["letters", "Letters when zoomed in"],
              ["pocLine", "Point of control line"],
              ["valueAreaLines", "VAH and VAL lines"],
              ["intradayOnly", "Show on intraday charts only"],
            ] as const).map(([key, label]) => (
              <UiSettingRow key={key} labelId={`${id}-${key}`} label={label} control={
                <UiSwitch aria-labelledby={`${id}-${key}`} checked={settings[key]} onCheckedChange={(checked) => patch({ [key]: checked })} />
              } />
            ))}
          </TabsPanel>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

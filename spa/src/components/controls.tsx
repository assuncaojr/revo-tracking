import { useId, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type Option<T extends string = string> = { value: T; label: ReactNode };

// O Select do Radix não aceita valor vazio; "" (todos, acumulado) vira este marcador por dentro.
const EMPTY = "__empty__";

/** Seleção com rótulo ao lado. `value` pode ser "" (opção "todos"). */
export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
  placeholder,
}: {
  label?: ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  className?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      {label && (
        <Label htmlFor={id} className="text-muted-foreground">
          {label}
        </Label>
      )}
      <Select value={value === "" ? EMPTY : value} onValueChange={(v) => onChange((v === EMPTY ? "" : v) as T)}>
        <SelectTrigger id={id} className={cn("bg-card", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value === "" ? EMPTY : o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Escolha entre poucas vistas (períodos, seções). Rola para o lado no celular. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "default",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  className?: string;
  size?: "sm" | "default";
}) {
  return (
    <div className={cn("max-w-full overflow-x-auto [scrollbar-width:none]", className)}>
      <ToggleGroup
        type="single"
        variant="outline"
        size={size}
        value={value}
        onValueChange={(v) => v && onChange(v as T)}
        className="bg-card"
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            className="px-3 whitespace-nowrap data-[state=on]:bg-secondary data-[state=on]:font-semibold"
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/** Legenda de cores dos dados. */
export function Legend({
  items,
  className,
}: {
  items: { color: string; label: ReactNode; outline?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("legend text-muted-foreground", className)}>
      {items.map((it, k) => (
        <span key={k}>
          <i style={{ background: it.color, outline: it.outline ? `1px solid ${it.outline}` : undefined }} /> {it.label}
        </span>
      ))}
    </div>
  );
}

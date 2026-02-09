'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, ChevronUp, Plus, RotateCcw, X } from 'lucide-react';
import { DEFAULT_PINNED_WIDGET_IDS, MAX_VISIBLE_WIDGETS, type WidgetId, WIDGET_DEFINITIONS } from './registry';

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export interface WidgetPickerProps {
  selected: WidgetId[];
  onChange: (next: WidgetId[]) => void;
  className?: string;
}

export function WidgetPicker({ selected, onChange, className }: WidgetPickerProps) {
  const selectedSet = new Set(selected);
  const unselected = WIDGET_DEFINITIONS.filter((w) => !selectedSet.has(w.id));

  const hiddenCount = Math.max(0, selected.length - MAX_VISIBLE_WIDGETS);

  const handleAdd = (id: WidgetId) => onChange([...selected, id]);
  const handleRemove = (id: WidgetId) => onChange(selected.filter((x) => x !== id));
  const handleReset = () => onChange(DEFAULT_PINNED_WIDGET_IDS);

  const handleMoveUp = (id: WidgetId) => {
    const idx = selected.indexOf(id);
    if (idx <= 0) return;
    onChange(moveItem(selected, idx, idx - 1));
  };

  const handleMoveDown = (id: WidgetId) => {
    const idx = selected.indexOf(id);
    if (idx < 0 || idx >= selected.length - 1) return;
    onChange(moveItem(selected, idx, idx + 1));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-2', className)}>
          Customize
          {hiddenCount > 0 && (
            <span className="text-xs text-muted-foreground">+{hiddenCount}</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>
          Pinned widgets
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Showing first {Math.min(MAX_VISIBLE_WIDGETS, selected.length)}/{selected.length || 0}
          </span>
        </DropdownMenuLabel>

        {selected.length === 0 && (
          <div className="px-2 py-2 text-sm text-muted-foreground">No widgets pinned</div>
        )}

        {selected.map((id) => {
          const def = WIDGET_DEFINITIONS.find((w) => w.id === id);
          if (!def) return null;
          const isVisible = selected.indexOf(id) < MAX_VISIBLE_WIDGETS;
          return (
            <DropdownMenuItem
              key={id}
              onSelect={(e) => e.preventDefault()}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Check className={cn('h-4 w-4 shrink-0', isVisible ? 'opacity-100' : 'opacity-30')} />
                <span className={cn('truncate', !isVisible && 'text-muted-foreground')}>
                  {def.label}
                </span>
                {!isVisible && (
                  <span className="text-xs text-muted-foreground shrink-0">hidden</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleMoveUp(id);
                  }}
                  aria-label={`Move ${def.label} up`}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleMoveDown(id);
                  }}
                  aria-label={`Move ${def.label} down`}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRemove(id);
                  }}
                  aria-label={`Unpin ${def.label}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Available</DropdownMenuLabel>

        {unselected.length === 0 && (
          <div className="px-2 py-2 text-sm text-muted-foreground">All widgets pinned</div>
        )}

        {unselected.map((def) => (
          <DropdownMenuItem
            key={def.id}
            onSelect={(e) => {
              e.preventDefault();
              handleAdd(def.id);
            }}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{def.label}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleReset();
          }}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4 text-muted-foreground" />
          Reset defaults
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


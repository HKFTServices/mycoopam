import { useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { GripVertical, RotateCcw, Settings2 } from "lucide-react";
import type { DashboardWidget } from "@/hooks/useDashboardWidgets";

interface SortableWidgetItemProps {
  widget: DashboardWidget;
  onToggle: (id: string) => void;
}

const SortableWidgetItem = ({ widget, onToggle }: SortableWidgetItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-xl border bg-card p-3 transition-shadow ${
        isDragging ? "shadow-lg ring-2 ring-primary/20 z-50" : "shadow-sm"
      }`}
    >
      <button
        className="touch-none cursor-grab active:cursor-grabbing p-1 rounded-md hover:bg-muted text-muted-foreground"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${widget.label}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{widget.label}</p>
        <p className="text-xs text-muted-foreground truncate">{widget.description}</p>
      </div>

      <Switch
        checked={widget.visible}
        onCheckedChange={() => onToggle(widget.id)}
        aria-label={`Toggle ${widget.label}`}
      />
    </div>
  );
};

interface DashboardCustomizerProps {
  widgets: DashboardWidget[];
  onToggle: (id: string) => void;
  onReorder: (widgets: DashboardWidget[]) => void;
  onReset: () => void;
  replayTour?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  triggerMode?: "button" | "icon";
}

export const DashboardCustomizerTrigger = ({
  onClick,
  mode = "button",
}: {
  onClick: () => void;
  mode?: "button" | "icon";
}) => (
  mode === "icon" ? (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className="h-9 w-9 text-muted-foreground hover:text-foreground"
      aria-label="Customize dashboard"
    >
      <Settings2 className="h-5 w-5" />
    </Button>
  ) : (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2"
    >
      <Settings2 className="h-4 w-4" />
      <span className="hidden sm:inline">Customize</span>
    </Button>
  )
);

const DashboardCustomizer = ({
  widgets,
  onToggle,
  onReorder,
  onReset,
  replayTour,
  open,
  onOpenChange,
  hideTrigger,
  triggerMode = "button",
}: DashboardCustomizerProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = typeof open === "boolean" && typeof onOpenChange === "function";
  const isOpen = isControlled ? (open as boolean) : uncontrolledOpen;
  const setOpen = isControlled ? (onOpenChange as (open: boolean) => void) : setUncontrolledOpen;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    const reordered = arrayMove(widgets, oldIndex, newIndex);
    onReorder(reordered);
  };

  return (
    <>
      {!hideTrigger && (
        <DashboardCustomizerTrigger onClick={() => setOpen(true)} mode={triggerMode} />
      )}

      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Customize Dashboard
            </SheetTitle>
            <SheetDescription>
              Drag to reorder and toggle widgets on or off. Changes are saved per device.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-4 -mx-6 px-6">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={widgets.map((w) => w.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {widgets.map((widget) => (
                    <SortableWidgetItem
                      key={widget.id}
                      widget={widget}
                      onToggle={onToggle}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          <SheetFooter className="border-t pt-4 flex-row justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="gap-2 text-muted-foreground"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to default
            </Button>
            {replayTour && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setOpen(false); setTimeout(replayTour, 300); }}
                className="gap-2"
              >
                <HelpCircle className="h-4 w-4" />
                Replay Tour
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default DashboardCustomizer;

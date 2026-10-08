"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useState } from "react";

export interface TileState {
  index: number;
  /** This is the copy that follows the pointer while dragging. */
  isOverlay: boolean;
  /** This is the original slot, left behind while its copy is being dragged. */
  isDragging: boolean;
}

interface Props<T extends { id: string }> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, state: TileState) => ReactNode;
  className?: string;
  /** Label for screen readers, e.g. "Pages". */
  label: string;
}

function SortableTile({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, attributes: { role: "listitem" } });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // `manipulation` keeps pinch/scroll working; dragging on touch starts only after a short hold.
      className="touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-volt-400"
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

/**
 * A drag-to-reorder grid. Mouse drags start after a few pixels, touch drags after a short
 * press (so scrolling still works), and the keyboard works too (Space, arrows, Space).
 */
export function SortableGrid<T extends { id: string }>({ items, onReorder, renderItem, className = "", label }: Props<T>) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? items.find((i) => i.id === activeId) : undefined;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const from = items.findIndex((i) => i.id === a.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div role="list" aria-label={label} className={className}>
          {items.map((item, index) => (
            <SortableTile key={item.id} id={item.id}>
              {renderItem(item, { index, isOverlay: false, isDragging: item.id === activeId })}
            </SortableTile>
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 160 }}>
        {active ? <div className="cursor-grabbing opacity-95 drop-shadow-2xl">{renderItem(active, { index: items.indexOf(active), isOverlay: true, isDragging: false })}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

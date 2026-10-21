"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type Header,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type TouchEvent,
} from "react";

import { DataGridSkeleton } from "@/components/DataGridSkeleton";

type RowIdentity = string | number;

export type SortDirection = "asc" | "desc";

export interface DataGridSort<T extends object> {
  key: Extract<keyof T, string>;
  direction: SortDirection;
}

export interface DataGridColumn<T extends object> {
  key: Extract<keyof T, string>;
  title: ReactNode;
  "aria-label"?: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  align?: "start" | "center" | "end";
  sortable?: boolean;
  renderCell?: (value: T[Extract<keyof T, string>], row: T) => ReactNode;
}

export interface DataGridProps<T extends object> {
  name: string;
  id?: string;
  data: readonly T[];
  columns: readonly DataGridColumn<T>[];
  getRowId: (row: T) => RowIdentity;
  eyebrow?: ReactNode;
  toolbar?: ReactNode;
  totalCount?: number;
  sort?: DataGridSort<T> | null;
  onSortChange?: (sort: DataGridSort<T>) => void;
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: Error | null;
  hasMore?: boolean;
  autoLoadMore?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onVisibleRowsChange?: (rowIds: RowIdentity[]) => void;
  highlightChanges?: boolean;
  rowHeight?: number;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  emptyMessage?: string;
}

interface CellPosition {
  row: number;
  column: number;
}

const headerRow = -1;
const overscan = 10;
const autoLoadThreshold = 20;
const keyboardResizeStep = 10;
const defaultWidth = 150;
const flashDurationMs = 900;

function flashCell(element: HTMLElement) {
  if (typeof element.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const accent = getComputedStyle(element).getPropertyValue("--color-accent").trim() || "#255be3";

  element.animate(
    [{ backgroundColor: `color-mix(in srgb, ${accent} 24%, transparent)` }, { backgroundColor: "transparent" }],
    { duration: flashDurationMs, easing: "ease-out" },
  );
}

const alignClass = { start: "text-left", center: "text-center", end: "text-right tabular-nums" } as const;
const cellBase =
  "h-11 overflow-hidden border-b border-border-subtle px-4 align-middle text-[0.85rem] text-ink text-ellipsis whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-sm:px-3";
const stickyFirstColumn = "sticky left-0 z-[1] shadow-[1px_0_0_var(--color-border)]";
const buttonClass =
  "cursor-pointer rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-accent-soft hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const footerClass =
  "flex min-h-[52px] items-center justify-center gap-3 border-t border-border px-6 py-2.5 text-xs text-muted max-sm:px-4";

function cx(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

function Spinner() {
  return (
    <span
      className="size-3.5 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:[animation-duration:2s]"
      aria-hidden="true"
    />
  );
}

export function DataGrid<T extends object>({
  name,
  id,
  data,
  columns,
  getRowId,
  eyebrow,
  toolbar,
  totalCount,
  sort = null,
  onSortChange,
  isLoading = false,
  isRefreshing = false,
  error = null,
  hasMore = false,
  autoLoadMore = false,
  onLoadMore,
  onRetry,
  onVisibleRowsChange,
  highlightChanges = true,
  rowHeight = 44,
  className,
  style,
  "aria-label": ariaLabel,
  emptyMessage = "No records found.",
}: DataGridProps<T>) {
  const generatedId = useId();
  const gridId = id ?? generatedId;
  const titleId = `${gridId}-title`;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [activeCell, setActiveCell] = useState<CellPosition>({ row: headerRow, column: 0 });
  const pendingFocus = useRef(false);
  const suppressHeaderClick = useRef(false);

  const columnDefs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((column) => ({
        id: column.key,
        accessorKey: column.key,
        header: () => column.title,
        size: column.width ?? defaultWidth,
        minSize: column.minWidth ?? 40,
        maxSize: column.maxWidth ?? Number.MAX_SAFE_INTEGER,
        enableSorting: column.sortable ?? false,
        meta: column,
      })),
    [columns],
  );

  const table = useReactTable({
    data: data as T[],
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(getRowId(row)),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    manualSorting: true,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;
  const firstMounted = virtualRows[0]?.index ?? -1;
  const lastMounted = virtualRows[virtualRows.length - 1]?.index ?? -1;

  const visibleIdsKey = useMemo(() => {
    const range = virtualizer.range;

    if (!range || rows.length === 0) {
      return "";
    }

    return rows
      .slice(range.startIndex, range.endIndex + 1)
      .map((row) => row.id)
      .join("\u0000");
    // The range object is derived from the virtual items, so it is already covered by that dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, virtualizer, firstMounted, lastMounted]);

  useEffect(() => {
    onVisibleRowsChange?.(visibleIdsKey ? visibleIdsKey.split("\u0000") : []);
  }, [visibleIdsKey, onVisibleRowsChange]);

  const requestedLoadForLength = useRef(-1);

  useEffect(() => {
    const nearEnd = rows.length > 0 && lastMounted >= rows.length - autoLoadThreshold;

    if (
      autoLoadMore &&
      hasMore &&
      !isLoading &&
      !isRefreshing &&
      !error &&
      nearEnd &&
      onLoadMore &&
      requestedLoadForLength.current !== rows.length
    ) {
      requestedLoadForLength.current = rows.length;
      onLoadMore();
    }
  }, [autoLoadMore, hasMore, isLoading, isRefreshing, error, rows.length, lastMounted, onLoadMore]);

  const lastSeenValues = useRef(new Map<string, Record<string, unknown>>());

  useEffect(() => {
    const seen = lastSeenValues.current;
    const mountedIds = new Set<string>();

    for (const virtualRow of virtualRows) {
      const row = rows[virtualRow.index];
      const previous = seen.get(row.id);
      const current: Record<string, unknown> = {};

      mountedIds.add(row.id);
      columns.forEach((column, columnIndex) => {
        const value = row.original[column.key];
        current[column.key] = value;

        if (highlightChanges && previous && !Object.is(previous[column.key], value)) {
          const cell = viewportRef.current?.querySelector<HTMLElement>(
            `[data-grid-row="${virtualRow.index}"][data-grid-column="${columnIndex}"]`,
          );

          if (cell) {
            flashCell(cell);
          }
        }
      });
      seen.set(row.id, current);
    }

    const loadedIds = new Set(rows.map((row) => row.id));

    for (const id of seen.keys()) {
      if (!loadedIds.has(id)) {
        seen.delete(id);
      }
    }
  }, [rows, virtualRows, columns, highlightChanges]);

  const wasRefreshing = useRef(isRefreshing);

  useEffect(() => {
    if (wasRefreshing.current && !isRefreshing) {
      virtualizer.scrollToOffset(0);
      requestedLoadForLength.current = -1;
    }

    wasRefreshing.current = isRefreshing;
  }, [isRefreshing, virtualizer]);

  const focusCell = useCallback(
    (position: CellPosition) => {
      const row = Math.max(headerRow, Math.min(rows.length - 1, position.row));
      const column = Math.max(0, Math.min(columns.length - 1, position.column));

      pendingFocus.current = true;
      setActiveCell({ row, column });

      if (row >= 0 && (row < firstMounted || row > lastMounted)) {
        virtualizer.scrollToIndex(row, { align: "auto" });
      }
    },
    [rows.length, columns.length, firstMounted, lastMounted, virtualizer],
  );

  useEffect(() => {
    if (!pendingFocus.current) {
      return;
    }

    const selector = `[data-grid-row="${activeCell.row}"][data-grid-column="${activeCell.column}"]`;
    const element = viewportRef.current?.querySelector<HTMLElement>(selector);

    if (element) {
      pendingFocus.current = false;
      element.focus({ preventScroll: activeCell.row === headerRow });
    }
  }, [activeCell, firstMounted, lastMounted]);

  const toggleSort = useCallback(
    (column: DataGridColumn<T>) => {
      if (!column.sortable || !onSortChange) {
        return;
      }

      const direction: SortDirection = sort?.key === column.key && sort.direction === "asc" ? "desc" : "asc";

      onSortChange({ key: column.key, direction });
    },
    [sort, onSortChange],
  );

  const startPointerResize = (header: Header<T, unknown>) => {
    const handler = header.getResizeHandler();

    return (event: MouseEvent | TouchEvent) => {
      // A drag released over the header would otherwise register as a sort click.
      suppressHeaderClick.current = true;
      const release = () => setTimeout(() => (suppressHeaderClick.current = false), 0);
      window.addEventListener("mouseup", release, { once: true });
      window.addEventListener("touchend", release, { once: true });
      handler(event);
    };
  };

  const resizeColumn = useCallback((header: Header<T, unknown>, delta: number) => {
    const next = Math.min(
      header.column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER,
      Math.max(header.column.columnDef.minSize ?? 0, header.getSize() + delta),
    );

    setColumnSizing((sizing) => ({ ...sizing, [header.column.id]: next }));
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, position: CellPosition, header?: Header<T, unknown>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    const lastRow = rows.length - 1;
    const lastColumn = columns.length - 1;

    switch (event.key) {
      case "ArrowUp":
        focusCell({ row: position.row - 1, column: position.column });
        break;
      case "ArrowDown":
        focusCell({ row: position.row + 1, column: position.column });
        break;
      case "ArrowLeft":
        if (event.shiftKey && header) {
          resizeColumn(header, -keyboardResizeStep);
        } else {
          focusCell({ row: position.row, column: position.column - 1 });
        }
        break;
      case "ArrowRight":
        if (event.shiftKey && header) {
          resizeColumn(header, keyboardResizeStep);
        } else {
          focusCell({ row: position.row, column: position.column + 1 });
        }
        break;
      case "Home":
        focusCell({ row: event.ctrlKey ? headerRow : position.row, column: 0 });
        break;
      case "End":
        focusCell({ row: event.ctrlKey ? lastRow : position.row, column: lastColumn });
        break;
      case "Tab": {
        const next = event.shiftKey
          ? position.column > 0
            ? { row: position.row, column: position.column - 1 }
            : position.row > headerRow
              ? { row: position.row - 1, column: lastColumn }
              : null
          : position.column < lastColumn
            ? { row: position.row, column: position.column + 1 }
            : position.row < lastRow
              ? { row: position.row + 1, column: 0 }
              : null;

        if (!next) {
          return;
        }

        focusCell(next);
        break;
      }
      case "Enter":
      case " ":
        if (header) {
          toggleSort(header.column.columnDef.meta as DataGridColumn<T>);
          break;
        }
        return;
      default:
        return;
    }

    event.preventDefault();
  };

  const isInitialLoading = isLoading && data.length === 0;
  const isInitialError = Boolean(error) && data.length === 0;
  const showEmpty = !isInitialLoading && !isInitialError && data.length === 0;
  const countLabel =
    totalCount !== undefined
      ? `${data.length.toLocaleString()} of ${totalCount.toLocaleString()} records`
      : `${data.length.toLocaleString()} records`;

  return (
    <section
      id={gridId}
      className={cx(
        "flex max-h-full flex-col overflow-hidden rounded-[18px] border border-border bg-surface shadow-[0_24px_80px_rgb(18_27_58/8%)] max-sm:rounded-none max-sm:border-x-0",
        className,
      )}
      style={style}
      aria-labelledby={ariaLabel ? undefined : titleId}
      aria-label={ariaLabel}
    >
      <div className="flex items-end justify-between gap-6 px-6 pt-5 pb-4 max-sm:items-start max-sm:px-4 max-sm:pt-4 max-sm:pb-3">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-[0.72rem] font-extrabold tracking-[0.12em] text-accent uppercase">{eyebrow}</p>
          ) : null}
          <h2 className="m-0 text-[clamp(1.05rem,3vw,1.35rem)] font-semibold tracking-tight text-ink" id={titleId}>
            {name}
          </h2>
        </div>
        <span className="flex-none text-xs text-muted tabular-nums" aria-live="polite">
          {countLabel}
        </span>
      </div>

      {toolbar ? <div className="px-6 pb-4 max-sm:px-4 max-sm:pb-3.5">{toolbar}</div> : null}

      {isInitialLoading ? (
        <DataGridSkeleton label={`Loading ${name}`} showHeading={false} />
      ) : isInitialError ? (
        <div className="grid justify-items-center gap-3.5 border-t border-border px-6 py-14 text-center" role="alert">
          <p className="m-0 text-muted-strong">{error?.message ?? "Something went wrong."}</p>
          {onRetry ? (
            <button type="button" className={buttonClass} onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 border-t border-border">
          <div
            className={cx(
              "h-full overflow-auto overscroll-contain transition-opacity duration-200",
              isRefreshing && "pointer-events-none opacity-50",
            )}
            ref={viewportRef}
          >
            <table
              className="min-w-full border-separate border-spacing-0 table-fixed"
              role="grid"
              aria-labelledby={titleId}
              aria-rowcount={rows.length + 1}
              aria-colcount={columns.length}
              aria-busy={isLoading || isRefreshing || undefined}
              style={{ width: table.getTotalSize() }}
            >
              <colgroup>
                {table.getFlatHeaders().map((header) => (
                  <col key={header.id} style={{ width: header.getSize() }} />
                ))}
              </colgroup>
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} role="row" aria-rowindex={1}>
                    {headerGroup.headers.map((header, columnIndex) => {
                      const column = header.column.columnDef.meta as DataGridColumn<T>;
                      const isSorted = sort?.key === column.key;
                      const isResizing = header.column.getIsResizing();
                      const position = { row: headerRow, column: columnIndex };
                      const isActive = activeCell.row === headerRow && activeCell.column === columnIndex;

                      return (
                        <th
                          key={header.id}
                          role="columnheader"
                          scope="col"
                          aria-colindex={columnIndex + 1}
                          aria-label={column["aria-label"]}
                          aria-sort={
                            column.sortable
                              ? isSorted
                                ? sort.direction === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"
                              : undefined
                          }
                          aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight"
                          className={cx(
                            cellBase,
                            alignClass[column.align ?? "start"],
                            "sticky top-0 z-[2] bg-surface-strong text-[0.72rem] font-bold tracking-[0.06em] text-muted-strong uppercase select-none",
                            columnIndex === 0 && cx(stickyFirstColumn, "z-[3]"),
                            column.sortable && "cursor-pointer hover:text-accent-strong",
                            isSorted && "text-accent",
                          )}
                          tabIndex={isActive ? 0 : -1}
                          data-grid-row={headerRow}
                          data-grid-column={columnIndex}
                          onClick={() => {
                            if (!suppressHeaderClick.current) {
                              toggleSort(column);
                            }
                          }}
                          onFocus={() => setActiveCell(position)}
                          onKeyDown={(event) => handleKeyDown(event, position, header)}
                        >
                          <span className="inline-flex max-w-full items-center gap-1.5">
                            <span className="overflow-hidden text-ellipsis">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            {column.sortable ? (
                              <span
                                className={cx("flex-none text-[0.65rem]", isSorted ? "opacity-100" : "opacity-45")}
                                aria-hidden="true"
                              >
                                {isSorted ? (sort.direction === "asc" ? "▲" : "▼") : "⇅"}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={cx(
                              "absolute inset-y-0 right-0 z-[1] w-3.5 cursor-col-resize touch-none after:absolute after:top-2.5 after:right-1.5 after:bottom-2.5 after:w-0.5 after:rounded-full after:bg-border after:transition-colors after:content-[''] hover:after:bg-accent",
                              isResizing && "after:bg-accent",
                            )}
                            aria-hidden="true"
                            onMouseDown={startPointerResize(header)}
                            onTouchStart={startPointerResize(header)}
                            onClick={(event) => event.stopPropagation()}
                            onDoubleClick={() => header.column.resetSize()}
                          />
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {showEmpty ? (
                  <tr role="row" aria-rowindex={2}>
                    <td className="h-[180px] text-center text-muted" role="gridcell" colSpan={columns.length}>
                      {emptyMessage}
                    </td>
                  </tr>
                ) : null}
                {paddingTop > 0 ? (
                  <tr aria-hidden="true" style={{ height: paddingTop }}>
                    <td colSpan={columns.length} className="p-0" />
                  </tr>
                ) : null}
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  const isLastRow = virtualRow.index === rows.length - 1;

                  return (
                    <tr
                      key={row.id}
                      role="row"
                      aria-rowindex={virtualRow.index + 2}
                      className="group"
                      style={{ height: virtualRow.size }}
                    >
                      {row.getVisibleCells().map((cell, columnIndex) => {
                        const column = cell.column.columnDef.meta as DataGridColumn<T>;
                        const value = row.original[column.key];
                        const position = { row: virtualRow.index, column: columnIndex };
                        const isActive = activeCell.row === virtualRow.index && activeCell.column === columnIndex;
                        const text = value === null || value === undefined ? "" : String(value);

                        return (
                          <td
                            key={cell.id}
                            role="gridcell"
                            aria-colindex={columnIndex + 1}
                            className={cx(
                              cellBase,
                              alignClass[column.align ?? "start"],
                              "bg-surface transition-colors group-hover:bg-row-hover",
                              columnIndex === 0 && stickyFirstColumn,
                              isLastRow && "border-b-0",
                            )}
                            title={text}
                            tabIndex={isActive ? 0 : -1}
                            data-grid-row={virtualRow.index}
                            data-grid-column={columnIndex}
                            onFocus={() => setActiveCell(position)}
                            onKeyDown={(event) => handleKeyDown(event, position)}
                          >
                            {column.renderCell ? column.renderCell(value, row.original) : text}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {paddingBottom > 0 ? (
                  <tr aria-hidden="true" style={{ height: paddingBottom }}>
                    <td colSpan={columns.length} className="p-0" />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div
            className={cx(
              "pointer-events-none absolute top-14 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-muted-strong shadow-[0_8px_24px_rgb(18_27_58/12%)] transition-opacity duration-200",
              isRefreshing ? "opacity-100" : "opacity-0",
            )}
            role="status"
            aria-hidden={!isRefreshing}
          >
            <Spinner />
            Updating rows…
          </div>
        </div>
      )}

      <DataGridFooter
        rowCount={data.length}
        isLoading={isLoading}
        error={error}
        hasMore={hasMore}
        autoLoadMore={autoLoadMore}
        onLoadMore={onLoadMore}
        onRetry={onRetry}
      />
    </section>
  );
}

interface DataGridFooterProps {
  rowCount: number;
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  autoLoadMore: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
}

function DataGridFooter({ rowCount, isLoading, error, hasMore, autoLoadMore, onLoadMore, onRetry }: DataGridFooterProps) {
  if (rowCount === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={footerClass} role="status">
        <Spinner />
        Loading more rows…
      </div>
    );
  }

  if (error) {
    return (
      <div className={footerClass} role="alert">
        <span>Couldn&apos;t load more rows. {error.message}</span>
        {onRetry ? (
          <button type="button" className={buttonClass} onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (hasMore) {
    return (
      <div className={footerClass}>
        {autoLoadMore ? (
          <span>Scroll to load more rows</span>
        ) : onLoadMore ? (
          <button type="button" className={buttonClass} onClick={onLoadMore}>
            Load more
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={footerClass} role="status">
      End of results
    </div>
  );
}

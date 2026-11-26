import React, { useState } from 'react';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function useTableSort() {
  const [activeColumn, setActiveColumn] = useState(null);

  return {
    activeColumn,
    toggle(column) {
      setActiveColumn((current) => current === column ? null : column);
    },
    order(rows, columns, originalOrder) {
      const value = columns[activeColumn];
      if (!value) return originalOrder ? [...rows].sort(originalOrder) : rows;

      return [...rows].sort((first, second) => (
        collator.compare(value(first) ?? '', value(second) ?? '') ||
        (originalOrder ? originalOrder(first, second) : 0)
      ));
    },
  };
}

export default function SortableTableHeader({ sort, column, children, ...props }) {
  const sorted = sort.activeColumn === column;
  const action = sorted ? 'Restore original order' : `Sort by ${children}`;

  return (
    <th scope="col" aria-sort={sorted ? 'ascending' : undefined} {...props}>
      <span className="d-inline-flex align-items-center gap-1">
        {children}
        <button className="btn btn-sm btn-link text-secondary border-0 bg-transparent table-action-button" type="button" onClick={() => sort.toggle(column)} aria-label={action} title={action}>
          <i className={sorted ? 'bi bi-arrow-counterclockwise' : 'bi bi-arrow-down-up'} aria-hidden="true" />
        </button>
      </span>
    </th>
  );
}

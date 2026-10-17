'use client';
import { useEffect, type RefObject } from 'react';
import { prepareSortableTables, sortTable } from '@/lib/sorttable';

type Props = { root: RefObject<HTMLElement | null> };

export default function TableSort({ root }: Props) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    prepareSortableTables(el);

    const activate = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const head = target.closest<HTMLElement>('[data-sort-col]');
      if (!head) return;
      const table = head.closest('table');
      if (!table) return;
      sortTable(table as HTMLTableElement, Number(head.dataset.sortCol));
    };

    const onClick = (e: MouseEvent) => activate(e.target);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const head = e.target instanceof Element ? e.target.closest('[data-sort-col]') : null;
      if (!head) return;
      e.preventDefault();
      activate(head);
    };

    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKeyDown);

    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('keydown', onKeyDown);
    };
  }, [root]);

  return null;
}
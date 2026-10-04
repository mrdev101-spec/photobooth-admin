'use client';

import { useEffect } from 'react';

const loaded = (img: HTMLImageElement) =>
  img.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });

/** Opens the print dialog once every image has loaded, then closes the print window. */
export function AutoPrint() {
  useEffect(() => {
    void Promise.all([...document.images].map(loaded)).then(() => {
      window.addEventListener('afterprint', () => window.close(), { once: true });
      window.print();
    });
  }, []);
  return null;
}

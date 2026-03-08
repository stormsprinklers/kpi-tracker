"use client";

import { useRef, useEffect, useState } from "react";

interface NavDropdownItem {
  label: string;
  href: string;
}

interface NavDropdownProps {
  label: React.ReactNode;
  items: NavDropdownItem[];
  navLinkClass?: string;
}

export function NavDropdown({ label, items, navLinkClass }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const linkClass =
    navLinkClass ??
    "block rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={linkClass}
      >
        {label}
      </button>
      {open && items.length > 0 && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

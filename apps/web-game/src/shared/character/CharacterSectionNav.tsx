import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';

const ITEMS = [
  { to: '/character', label: 'Hồ sơ', end: true },
  { to: '/character/wellness', label: 'Thể lực & Hồi phục' },
  { to: '/character/account', label: 'Tài khoản' },
];

export function CharacterSectionNav() {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Mục nhân vật">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            clsx(
              'inline-flex min-h-[44px] items-center rounded-xl border px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

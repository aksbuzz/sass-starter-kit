import { Outlet } from '@tanstack/react-router';
import { Providers } from '../providers';

export function RootLayout() {
  return (
    <Providers>
      <Outlet />
    </Providers>
  );
}

import { Outlet } from '@tanstack/react-router';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <Outlet />
    </div>
  );
}

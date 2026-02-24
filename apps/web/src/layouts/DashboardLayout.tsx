import { Outlet } from '@tanstack/react-router';
import { AuthGuard } from '../components/auth/AuthGuard';
import { Sidebar } from '../components/layout/Sidebar';
import { ImpersonationBanner } from '../components/layout/ImpersonationBanner';

export function DashboardLayout() {
  return (
    <AuthGuard>
      <div className="flex h-screen flex-col overflow-hidden">
        <ImpersonationBanner />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}

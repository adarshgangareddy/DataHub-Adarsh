import { Outlet } from 'react-router-dom';
import Header from './Header.jsx';
import ToastNotification from './ToastNotification.jsx';

export default function AppShell() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-panel focus:p-2">
        Skip to content
      </a>
      <Header />
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 pb-24">
        <Outlet />
      </main>
      <ToastNotification />
    </>
  );
}

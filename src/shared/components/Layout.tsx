import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';
import { usePageTitle } from '../hooks/usePageTitle';

export function Layout() {
  usePageTitle();

  return (
    <>
      <Header />
      <div className="app-layout">
        <Sidebar />
        <div className="app-main">
          <div className="main-content">
            <Outlet />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

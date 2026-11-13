import React from 'react';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

function Home() {
  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <BrandHeader showMenu />
      <main className="container-fluid py-3 flex-grow-1">
        <div className="card border-0 shadow-sm overflow-hidden">
          <iframe
            src={`${API_BASE_URL}/api/home-article`}
            title="Learning and Development Certification Management System article"
            sandbox="allow-same-origin"
            style={{ width: '100%', height: 'calc(100vh - 250px)', minHeight: '620px', border: 0 }}
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default Home;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

async function bootstrap() {
  // 1. Sinkronisasi Kredensial Supabase antara Server dan Browser
  // Memastikan bahwa setelah pengguna mengonfigurasi database baru,
  // semua browser, perangkat, dan sesi akan selalu menggunakan database terbaru secara permanen.
  try {
    const res = await fetch('/api/supabase-config');
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        const localUrl = localStorage.getItem('CUSTOM_SUPABASE_URL');
        const localKey = localStorage.getItem('CUSTOM_SUPABASE_ANON_KEY');

        if (data?.url && data?.anonKey) {
          (window as any).__INITIAL_SUPABASE_CONFIG__ = data;
          if (localUrl !== data.url || localKey !== data.anonKey) {
            localStorage.setItem('CUSTOM_SUPABASE_URL', data.url);
            localStorage.setItem('CUSTOM_SUPABASE_ANON_KEY', data.anonKey);
          }
        }
      }
    }
  } catch (_) {
    // Mode offline atau environment tanpa server proxy
  }

  // 2. Muat App setelah konfigurasi database terverifikasi
  const { default: App } = await import('./App.tsx');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap();

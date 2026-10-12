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
      const data = await res.json();
      const localUrl = localStorage.getItem('CUSTOM_SUPABASE_URL');
      const localKey = localStorage.getItem('CUSTOM_SUPABASE_ANON_KEY');

      if (data?.url && data?.anonKey) {
        if (data.isCustom) {
          // Server memiliki konfigurasi kustom tersimpan -> sinkronkan ke browser ini
          if (localUrl !== data.url || localKey !== data.anonKey) {
            localStorage.setItem('CUSTOM_SUPABASE_URL', data.url);
            localStorage.setItem('CUSTOM_SUPABASE_ANON_KEY', data.anonKey);
          }
        } else if (localUrl && localKey) {
          // Browser ini memiliki konfigurasi kustom tapi server belum -> daftarkan ke server
          fetch('/api/supabase-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: localUrl, anonKey: localKey }),
          }).catch(() => {});
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

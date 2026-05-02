/**
 * register-sw.js — Service Worker Registration
 * ใส่ <script src="register-sw.js"></script> ในทุก HTML
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      // มี SW ใหม่รอ → แจ้งผู้ใช้
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });

    } catch (err) {
      console.warn('[SW] Registration failed:', err);
    }
  });

  // แสดง banner "มีเวอร์ชันใหม่" แตะเพื่ออัปเดต
  function showUpdateBanner(worker) {
    const banner = document.createElement('div');
    banner.style.cssText = [
      'position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);',
      'background:#3d2b1f;color:#fff;padding:0.65rem 1.25rem;',
      'border-radius:999px;font-family:Mitr,Sarabun,sans-serif;',
      'font-size:0.88rem;font-weight:600;z-index:9999;',
      'box-shadow:0 4px 20px rgba(0,0,0,0.35);cursor:pointer;',
      'display:flex;align-items:center;gap:0.5rem;',
      'animation:swBannerIn 0.3s ease;',
    ].join('');
    banner.innerHTML = '🔄 มีเวอร์ชันใหม่ — แตะเพื่ออัปเดต';

    // inject animation
    const style = document.createElement('style');
    style.textContent = '@keyframes swBannerIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
    document.head.appendChild(style);

    banner.addEventListener('click', () => {
      worker.postMessage('SKIP_WAITING');
      window.location.reload();
    });

    document.body.appendChild(banner);
    // ซ่อนเองใน 10 วิ
    setTimeout(() => banner.remove(), 10000);
  }

  // Online/Offline indicator
  function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    let indicator = document.getElementById('_sw_online_indicator');

    if (!isOnline) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = '_sw_online_indicator';
        indicator.style.cssText = [
          'position:fixed;top:0;left:0;right:0;',
          'background:#c0392b;color:#fff;text-align:center;',
          'font-family:Mitr,Sarabun,sans-serif;font-size:0.82rem;',
          'font-weight:600;padding:0.3rem;z-index:9998;',
        ].join('');
        indicator.textContent = '📵 ไม่มีอินเทอร์เน็ต — ข้อมูลบางส่วนอาจไม่อัปเดต';
        document.body.prepend(indicator);
      }
    } else {
      indicator?.remove();
    }
  }

  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
})();

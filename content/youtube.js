// ============================================================
// Picture In Picture — контент-скрипт для YouTube
// Добавляет плавающую кнопку «Картинка в картинке» поверх видео,
// как в Firefox / Microsoft Edge.
// ============================================================

(function () {
  const STYLE_ID = 'pip-youtube-style';
  const BTN_CLASS = 'pip-youtube-btn';
  const MIN_W = 200;
  const MIN_H = 150;

  // Стили кнопки
  const css = `
    #${STYLE_ID} { display: none !important; }
    .${BTN_CLASS} {
      position: fixed;
      z-index: 2147483647;
      display: none;
      width: 36px;
      height: 36px;
      min-width: 36px;
      min-height: 36px;
      border: 1px solid rgba(0,0,0,0.25);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.75);
      color: #fff;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,0.45);
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
      backdrop-filter: blur(2px);
    }
    .${BTN_CLASS}:hover {
      background: rgba(0, 0, 0, 0.9);
      border-color: rgba(255,255,255,0.4);
      transform: translateY(-1px);
    }
    .${BTN_CLASS}:active { transform: translateY(0); }
    .${BTN_CLASS}.pip-active {
      background: #1a73e8;
      border-color: rgba(255,255,255,0.3);
    }
    .${BTN_CLASS} svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
      display: block;
      margin: auto;
    }
  `;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.documentElement.appendChild(style);

  const buttons = new Map(); // video -> button
  let hideTimer = null;

  function createButton(video) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_CLASS;
    btn.title = 'Картинка в картинке';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <rect x="2" y="2" width="18" height="18" rx="2"/>
        <rect x="16" y="16" width="6" height="6" rx="1.5"/>
      </svg>
    `;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        if (document.pictureInPictureElement === video) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch (err) {
        console.warn('[PiP] error:', err);
      }
    });

    // Кнопка не прятать сразу, если курсор ушёл с видео на кнопку
    btn.addEventListener('mouseenter', () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      btn.style.display = 'block';
    });
    btn.addEventListener('mouseleave', () => scheduleHide(btn));

    document.body.appendChild(btn);
    buttons.set(video, btn);
    return btn;
  }

  function scheduleHide(btn) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!btn.matches(':hover')) btn.style.display = 'none';
      hideTimer = null;
    }, 250);
  }

  function positionButton(btn, video) {
    const rect = video.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.width < MIN_W || rect.height < MIN_H) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = 'block';
    btn.style.left = Math.round(rect.right - btn.offsetWidth - 12) + 'px';
    btn.style.top = Math.round(rect.top + 12) + 'px';

    if (document.pictureInPictureElement === video) {
      btn.classList.add('pip-active');
      btn.title = 'Вернуть видео на вкладку';
    } else {
      btn.classList.remove('pip-active');
      btn.title = 'Картинка в картинке';
    }
  }

  function attachVideo(video) {
    if (buttons.has(video)) return;
    const btn = createButton(video);

    video.addEventListener('mouseenter', () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      positionButton(btn, video);
    });
    video.addEventListener('mouseleave', () => scheduleHide(btn));
    // Если курсор уже над видео (например, после навигации)
    if (video.matches(':hover')) positionButton(btn, video);
  }

  function detachVideo(video) {
    const btn = buttons.get(video);
    if (btn) {
      btn.remove();
      buttons.delete(video);
    }
  }

  function repositionAll() {
    buttons.forEach((btn, video) => positionButton(btn, video));
  }

  function init() {
    document.querySelectorAll('video').forEach(attachVideo);
  }

  // YouTube — SPA, навигация без перезагрузки страницы
  window.addEventListener('yt-navigate-finish', () => {
    buttons.forEach((btn, video) => {
      if (!document.contains(video)) detachVideo(video);
    });
    init();
  });

  // Наблюдатель за динамически добавленными/удалёнными видео
  const observer = new MutationObserver((mutations) => {
    let changed = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('video')) { attachVideo(node); changed = true; }
        if (node.querySelectorAll) node.querySelectorAll('video').forEach(attachVideo);
      }
      for (const node of m.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('video')) detachVideo(node);
        if (node.querySelectorAll) node.querySelectorAll('video').forEach(detachVideo);
      }
    }
    if (changed) init();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('scroll', repositionAll, { passive: true });
  window.addEventListener('resize', repositionAll);

  // Подсветка состояния PiP
  document.addEventListener('enterpictureinpicture', (e) => {
    if (e.target && e.target.tagName === 'VIDEO') {
      const btn = buttons.get(e.target);
      if (btn) btn.classList.add('pip-active');
    }
  }, true);
  document.addEventListener('leavepictureinpicture', (e) => {
    if (e.target && e.target.tagName === 'VIDEO') {
      const btn = buttons.get(e.target);
      if (btn) btn.classList.remove('pip-active');
    }
  }, true);

  // Управление кнопкой панели расширения на YouTube
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'TOGGLE_PIP') return;
    toggleBestVideo();
  });

  async function toggleBestVideo() {
    let best = null;
    let bestScore = -1;
    for (const v of document.querySelectorAll('video')) {
      if (v.disablePictureInPicture) continue;
      if (!v.videoWidth && !v.videoHeight) continue;
      const rect = v.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      const score = (v.paused ? 0 : 1e9) + rect.width * rect.height;
      if (score > bestScore) { bestScore = score; best = v; }
    }
    if (!best) return;

    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      if (document.pictureInPictureElement === best) return;
    }
    await best.requestPictureInPicture().catch(() => {});
  }

  init();
})();

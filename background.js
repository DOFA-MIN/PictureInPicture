// ============================================================
// Picture In Picture — сервис-воркер расширения
// Клик по иконке (или Alt+P):
//  - на YouTube — шлёт сообщение контент-скрипту (кнопка на видео),
//  - на остальных сайтах — внедряет скрипт и ищет видео на вкладке.
// ============================================================

chrome.action.onClicked.addListener((tab) => {
  if (!tab) return;
  togglePip(tab).catch((err) => {
    console.warn('[PiP] click handler error:', err);
    safeFlashError(tab.id);
  });
});

async function togglePip(tab) {
  // chrome://, edge://, магазин расширений и др. — туда скрипты не внедрить
  if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
    safeFlashError(tab?.id);
    return;
  }

  const isYoutube = /^https?:\/\/(www\.)?youtube\.com\//.test(tab.url);

  // На YouTube управляем через контент-скрипт (у него есть прямая кнопка на видео)
  if (isYoutube) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PIP' });
      return;
    } catch {
      // Контент-скрипт ещё не загрузился или вкладка закрылась — fallback ниже
    }
  }

  try {
    // Быстрый путь — только верхний фрейм.
    const top = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageAction,
      args: ['toggle'],
    });
    const res = top?.[0]?.result;

    if (res && res.status !== 'no-video') {
      report(tab.id, res);
      return;
    }

    // Видео во встроенном iframe — ищем во всех фреймах.
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: pageAction,
      args: ['probe'],
    });

    let best = null;
    for (const frame of frames ?? []) {
      const r = frame?.result;
      if (r?.status !== 'found') continue;
      if (!best || r.area > best.area) best = { frameId: frame.frameId, ...r };
    }
    if (!best) {
      safeFlashError(tab.id);
      return;
    }

    const enter = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [best.frameId] },
      func: pageAction,
      args: ['toggle'],
    });
    report(tab.id, enter?.[0]?.result);
  } catch {
    safeFlashError(tab.id);
  }
}

// Безопасная установка красного бейджа «!» — не кидает, если вкладка уже закрыта
function safeFlashError(tabId) {
  if (!tabId) return;
  try {
    chrome.action.setBadgeText({ tabId, text: '!' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#E11D48' });
    setTimeout(() => {
      try { chrome.action.setBadgeText({ tabId, text: '' }); } catch {}
    }, 2500);
  } catch {}
}

function report(tabId, res) {
  if (!res || res.status === 'error' || res.status === 'no-video') safeFlashError(tabId);
}

// ============================================================
// Функция выполняется НА СТРАНИЦЕ (изолированный мир).
// Полностью автономна — executeScript сериализует её без замыканий.
// ============================================================
async function pageAction(mode) {
  // --- выбор лучшего видео ---
  function pickBestVideo() {
    let best = null;
    let bestScore = -1;
    for (const v of document.querySelectorAll('video')) {
      if (v.disablePictureInPicture) continue;
      if (!v.videoWidth && !v.videoHeight) continue; // нет видеодорожки
      const rect = v.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue; // скрытые/мусорные
      const score = (v.paused ? 0 : 1e9) + rect.width * rect.height;
      if (score > bestScore) { bestScore = score; best = v; }
    }
    return best;
  }

  // --- включение PiP с ожиданием метаданных ---
  async function enterPipNow(video) {
    if (video.readyState === 0) {
      await new Promise((resolve) => {
        const done = () => {
          video.removeEventListener('loadedmetadata', done);
          resolve();
        };
        video.addEventListener('loadedmetadata', done, { once: true });
        setTimeout(resolve, 1200);
      });
    }
    try {
      await video.requestPictureInPicture();
      return { status: 'entered' };
    } catch (err) {
      return { status: 'error', message: String(err?.message || err) };
    }
  }

  // probe: только информация о лучшем видео фрейма
  if (mode === 'probe') {
    const v = pickBestVideo();
    if (!v) return { status: 'no-video' };
    const rect = v.getBoundingClientRect();
    return { status: 'found', area: rect.width * rect.height, paused: v.paused };
  }

  // toggle: включить/выключить PiP
  const best = pickBestVideo();
  if (!best) return { status: 'no-video' };

  if (document.pictureInPictureElement) {
    const isSame = document.pictureInPictureElement === best;
    try { await document.exitPictureInPicture(); } catch {}
    if (isSame) return { status: 'exit' };
    // переключаемся на другое видео
    return await enterPipNow(best);
  }

  return await enterPipNow(best);
}

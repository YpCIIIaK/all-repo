// Вкладки, открытые до установки или обновления расширения, не получают скрипт сами —
// подгружаем его в них вручную, чтобы курсор заработал без перезагрузки страниц.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const target = { tabId: tab.id, allFrames: true };
    try {
      await chrome.scripting.insertCSS({ target, files: ['cursor.css'] });
      await chrome.scripting.executeScript({ target, files: ['settings.js', 'cursor.js'] });
    } catch (e) {
      // chrome://, магазин расширений и т. п. — туда расширениям нельзя
    }
  }
});

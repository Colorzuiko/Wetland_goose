# ZUIKO｜濕地警戒

在加拿大草原濕地穿過雁群的包圍，撐到撤離。網頁版使用 HTML、CSS 和 JavaScript。

[線上試玩](https://zuiko-wetland-watch.holyzuiko.chatgpt.site/)

## 網頁版

用瀏覽器開啟 `index.html` 即可遊玩。

- 方向鍵或 WASD 移動。
- 長按滑鼠左鍵或空白鍵，向移動反方向射擊。停步時沿用最後的射擊方向。
- 從遊戲畫面上方切換音效或暫停。

## RPG Maker MZ 原型

將 `rpg-maker-mz/ZuikoWetlandWatch.js` 放進 MZ 專案的 `js/plugins/`，在插件管理器啟用。建立一張非循環地圖，在 NPC 事件的最後加入插件指令「開始濕地巡查」。預設巡查時間為 180 秒。按 Esc 暫停或繼續。

插件可把撤離結果及驅離數寫入遊戲變數，並於正常結算時呼叫指定的共通事件。結果代碼為 `0` 巡查中、`1` 撤離成功、`2` 體力耗盡、`3` 中止。原型內有簡易像素雁群，地圖可在 MZ 專案自行設計。

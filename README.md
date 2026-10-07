# 照片風格轉換

手機與電腦都能用的照片工具，前端可直接部署 GitHub Pages。

- **童話 Q 版**：使用 FLUX.2 klein 4B，把照片重新繪成可愛插畫。人物提示採用大頭、小身體；相似度、構圖和細節可能改變。
- **鉛筆素描**：在瀏覽器本機處理，可調整強度。
- 可拖曳的原圖／處理後比較，以及完整效果預覽。
- PNG、JPG 下載，支援的手機可用原生分享或長按圖片儲存。

## 帳號與免費額度

使用者不需要 Cloudflare 帳號、不需要 API 金鑰，也不用登入 Hugging Face。Q 版使用模型作者的公開示範服務：

https://huggingface.co/spaces/black-forest-labs/FLUX.2-klein-4B

本專案透過官方 `@gradio/client` 呼叫其公開 API。它是第三方示範服務，可能排隊、暫停、改版或限制匿名呼叫，不是保證持續可用的正式後端。沒有任何付費備援、自動購買或轉帳流程。

截至 2026-10-07，Hugging Face ZeroGPU 文件列出的匿名使用額度為每日 2 分鐘 GPU 時間；這不等於固定圖片張數。當額度不足或服務忙碌，程式會顯示錯誤並保留照片，不會冒充生成成功。

官方額度：https://huggingface.co/docs/hub/spaces-zerogpu#usage-tiers

## 照片如何處理

選擇照片時只在裝置內讀取。鉛筆素描完全在瀏覽器內完成。

只有按下 **上傳並產生 Q 版** 才會將縮小、重新編碼的照片傳到上述 Hugging Face Space。公開示範服務會暫存輸入及輸出圖片，檔案有服務端 URL；不適合私密照片。本專案不另設資料庫或分析追蹤。取消等待不保證已開始的 GPU 運算停止，也不保證退回額度。

重新整理頁面會清除本機狀態。圖片從 Canvas 重新輸出，不保留原檔 EXIF。

## 尺寸與格式

每張照片上限 25 MB。鉛筆素描的長邊最多 1800 px，小圖不放大。Q 版輸入與輸出長邊最多 768 px，過長或過窄的照片會加入白邊，避免拉伸變形。

支援瀏覽器能解碼的 JPG、PNG、WebP、AVIF；HEIC／HEIF 依瀏覽器支援程度而定。透明圖片以白底處理，動畫圖片取單張畫面。

下載內容只有處理後圖片，不含比較線、頁面介面或新增浮水印。

## GitHub Pages 部署

1. 將本資料夾的檔案放在 repository 根目錄，保留 `.nojekyll`。
2. 開啟 **Settings → Pages**。
3. **Source** 選 **Deploy from a branch**。
4. **Branch** 選 `main`，資料夾選 `/(root)`，按 **Save**。
5. 等待部署完成，以 `https://你的帳號.github.io/儲存庫名稱/` 開啟。

一般免費個人帳號請使用公開 repository。本專案不需要建置或 npm install；所有執行檔及用戶端程式均已放在資料夾內。

官方文件：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 本機預覽

使用任意靜態 HTTP 伺服器開啟此資料夾。已安裝 Python 時可執行：

```sh
python -m http.server 8000
```

瀏覽 `http://localhost:8000`，不要直接雙擊 `index.html`。JavaScript modules 和 Worker 需要 HTTP 來源環境。

## 檔案

- `index.html`、`styles.css`：介面與手機排版。
- `app.js`：照片、狀態、前後比較與下載。
- `chibi.js`：FLUX 公開服務串接、Q 版提示詞與錯誤說明。
- `filters.js`、`filter-worker.js`：本機像素濾鏡。
- `vendor/gradio-client.js`：打包後的官方 Gradio client 2.7.1。
- `demo.jpg`、`demo-chibi.webp`：示範原圖及實際 AI 重繪結果。

修改模型服務時，要重新確認 API 格式、授權及額度。請勿將任何私密金鑰寫在前端或 GitHub repository。

## 授權與示範圖

Bibury Cottages，攝影 Saffron Blaze，採 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) 授權。[來源](https://commons.wikimedia.org/wiki/File:Bibury_Cottages.jpg)。`demo-chibi.webp` 是經 FLUX.2 klein 4B 重繪的修改版本，也採 CC BY-SA 3.0。分享這些示範圖時請標示作者、來源、授權與修改情形；使用者自己的照片不因此受此授權約束。

`vendor/gradio-client.js` 包含下列第三方程式碼；散布時請保留對應授權文件：

- `@gradio/client` 2.7.1：套件附帶的授權保存在 `vendor/GRADIO-LICENSE.txt`。
- `fetch-event-stream` 0.1.6：MIT 授權，保存在 `vendor/FETCH-EVENT-STREAM-LICENSE.txt`。
- Deno `@std/streams` 0.221.0 的 `TextLineStream`（由上述相依套件引入）：MIT 授權，保存在 `vendor/DENO-STD-LICENSE.txt`。

模型說明：https://huggingface.co/black-forest-labs/FLUX.2-klein-4B

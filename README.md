# 算力顯卡租借平台 · GPU Compute Rental Platform

[中文](#中文) · [English](#english)

---

## 中文

用 **Google 試算表 + Google Apps Script（GAS）** 做的 GPU 時租預約網頁應用程式。這是「與 AI 協作，打造智慧製造的現場工具」課程的 APP 設計作業，以講者的異常通報系統為基礎延伸而來。

**作者：** 經濟四　B11302212　蔡佑澤

### 功能

| 功能 | 說明 |
|---|---|
| 方案介紹 | 13 款顯卡（RTX 3060 到 B200），顯示顯存、適合用途、時租與即時可用台數，可依等級篩選 |
| 立即租借 | 四個步驟：選顯卡 → 選時段 → 填資料 → 確認訂單，右側即時顯示費用 |
| 時段衝突檢查 | 同一張卡有多台，系統逐小時計算已租台數，租滿的時段無法預約；送出時伺服器會再檢查一次 |
| 計價 | 時租 × 時數，學生 8 折，優惠碼由試算表驗證（可停用） |
| 逾時計費 | 超過預約時間未結束標示「逾時中」，逾時部分以 1.5 倍時租計費 |
| Email 通知 | 預約、取消、結束租用時自動寄信給租用人，並副本給管理者 |
| 我的訂單 | 以 Email 或訂單編號查詢，可取消預約或結束租用 |
| 營運報表 | 近 30 天營收、訂單數、使用率、每日營收、各顯卡營收與使用率排名、學生比例、優惠碼使用次數、逾時警示 |

### 系統架構

```
網頁介面 (Index.html)
   │  google.script.run
   ▼
Google Apps Script (Code.gs) ──► Gmail（寄送通知信）
   │
   ▼
Google 試算表：顯卡方案 ／ 租借訂單 ／ 優惠碼
```

### 檔案

| 檔案 | 說明 |
|---|---|
| `gpu-rental/Code.gs` | 後端：讀寫試算表、衝突檢查、計價、寄信、報表、`seedDemo()` 範例資料 |
| `gpu-rental/Index.html` | 網頁介面（單一 HTML，含 CSS 與 JavaScript） |
| `B11302212 蔡佑澤＿算力顯卡租借平台_作業.pdf` | 作業報告：操作截圖與說明 |

### 試算表結構

| 分頁 | 欄位 |
|---|---|
| `顯卡方案` | 型號代碼、顯卡名稱、等級、顯存(GB)、適合用途、時租(NT$)、台數、介紹 |
| `租借訂單` | 訂單編號、建立時間、型號代碼、顯卡名稱、姓名、Email、身分、學號、用途、開始時間、時數、結束時間、時租、原價、優惠碼、折扣後金額、狀態、實際結束時間、逾時時數、逾時費、總金額 |
| `優惠碼` | 優惠碼、折扣倍率、說明、啟用（TRUE／FALSE） |

### 部署步驟

1. 建立 Google 試算表，依上表建立三個分頁與標題列，並在「檔案 → 設定」將時區設為 `Asia/Taipei`。
2. 點選「擴充功能 → Apps Script」，把 `Code.gs` 貼到 `程式碼.gs`。
3. 新增 HTML 檔，命名為 `Index`，貼上 `Index.html`。
4. 在函式選單選 `seedDemo` 並執行，產生範例訂單，同時完成授權。
5. 點選「部署 → 新增部署作業 → 網頁應用程式」，「執行身分」選「我」，再選擇存取權限。

> ⚠️ 若存取權限設為「所有人」，任何拿到網址的人都能建立訂單，並透過你的 Gmail 寄出通知信。

---

## English

A GPU rental booking web app built with **Google Sheets + Google Apps Script (GAS)**. It is my app-design assignment for the course "Collaborating with AI: Building Shop-Floor Tools for Smart Manufacturing". It extends the lecturer's incident-reporting system.

**Author:** Yuze Tsai (蔡佑澤), B11302212, Economics, 4th year

### Features

| Feature | Description |
|---|---|
| GPU catalog | 13 GPUs from RTX 3060 to B200, each showing VRAM, typical use, hourly price and live availability, with a filter by tier |
| Booking | Four steps: choose a GPU → pick a time slot → enter your details → confirm. A side panel updates the price as you go |
| Conflict check | Each GPU model can have several units, so the app counts booked units hour by hour. Fully booked slots can't be selected, and the server checks again on submit |
| Pricing | Hourly rate × hours, 20% student discount, coupon codes validated against the sheet (codes can be disabled) |
| Overtime | Rentals running past their end time are marked "overdue", and the extra hours are billed at 1.5× the hourly rate |
| Email | Booking, cancellation and end-of-rental emails go to the renter, with a copy to the admin |
| My orders | Look up orders by email or order number, then cancel a booking or end a rental |
| Report | Last 30 days of revenue, orders and utilization, daily revenue, revenue and utilization by GPU, student share, coupon usage and overdue alerts |

### Architecture

```
Web UI (Index.html)
   │  google.script.run
   ▼
Google Apps Script (Code.gs) ──► Gmail (notifications)
   │
   ▼
Google Sheets: 顯卡方案 (plans) / 租借訂單 (orders) / 優惠碼 (coupons)
```

### Files

| File | Description |
|---|---|
| `gpu-rental/Code.gs` | Backend: sheet read/write, conflict check, pricing, email, report, and `seedDemo()` for sample data |
| `gpu-rental/Index.html` | Web UI (a single HTML file with its CSS and JavaScript) |
| `B11302212 蔡佑澤＿算力顯卡租借平台_作業.pdf` | Assignment report with screenshots and walkthrough (in Chinese) |

### Sheet structure

The code looks tabs up by their Chinese names, so keep them exactly as shown.

| Tab | Columns |
|---|---|
| `顯卡方案` (plans) | ID, name, tier, VRAM (GB), typical use, hourly price (NT$), units, description |
| `租借訂單` (orders) | Order no., created, GPU ID, GPU name, name, email, role, student ID, purpose, start, hours, end, hourly price, base price, coupon, discounted price, state, actual end, overtime hours, overtime fee, total |
| `優惠碼` (coupons) | Code, discount multiplier, description, enabled (TRUE/FALSE) |

### Deploy

1. Create a Google Sheet with the three tabs and header rows above. Set the time zone to `Asia/Taipei` under File → Settings.
2. Open Extensions → Apps Script and paste `Code.gs` into `Code.gs`.
3. Add an HTML file named `Index` and paste in `Index.html`.
4. Pick `seedDemo` in the function menu and run it. This creates sample orders and asks you to authorize the script.
5. Deploy → New deployment → Web app. Set "Execute as" to "Me", then choose who has access.

> ⚠️ If access is set to "Anyone", anyone with the URL can create bookings and send notification emails from your Gmail.

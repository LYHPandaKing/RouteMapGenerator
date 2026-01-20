// 【關鍵設定】使用你的 Cloudflare Worker 代理來避開 CORS 錯誤
const API_BASE = 'https://kmbapi.wg7fg9sf3.workers.dev';

let stopMap = {};
const canvas = document.getElementById('routeCanvas');
const ctx = canvas.getContext('2d');

// 1. 初始化
window.onload = async function() {
    updateStatus("正在連接數據庫...");
    try {
        // 取得車站清單 (透過代理)
        const response = await fetch(`${API_BASE}/stop`);
        if (!response.ok) throw new Error("無法連接代理伺服器");
        
        const json = await response.json();
        if (json.data) {
            json.data.forEach(stop => {
                stopMap[stop.stop] = stop.name_tc;
            });
            updateStatus("系統就緒，請搜尋路線。");
        }
    } catch (e) {
        console.error(e);
        updateStatus("⚠️ 初始化失敗: 請檢查網絡");
    }
};

function updateStatus(msg) {
    const el = document.getElementById('statusMsg');
    if (el) el.innerText = msg;
}

// 2. 搜尋路線
async function findRouteVariants() {
    const route = document.getElementById('routeInput').value.trim().toUpperCase();
    const container = document.getElementById('routeOptionsArea');
    
    if (!route) { alert("請輸入路線號碼"); return; }
    container.innerHTML = '搜尋中...';

    try {
        // 透過代理搜尋路線
        const response = await fetch(`${API_BASE}/route/${route}`);
        const json = await response.json();

        if (!json.data || json.data.length === 0) {
            container.innerHTML = '找不到此路線';
            return;
        }

        container.innerHTML = ''; // 清空

        // 產生按鈕
        json.data.forEach(variant => {
            // 【核心修正】在這裡將 O/I 轉成英文全寫
            // 這樣傳給代理伺服器的就會是 correctBound (outbound)
            let correctBound = 'outbound'; 
            if (variant.bound === 'I') correctBound = 'inbound';
            
            const boundText = variant.bound === 'O' ? '去程' : '回程';

            const btn = document.createElement('button');
            btn.className = 'variant-btn';
            btn.innerHTML = `<strong>往 ${variant.dest_tc}</strong><br><small>${boundText} (類別 ${variant.service_type})</small>`;
            
            // 綁定點擊事件，傳送正確的英文參數
            btn.onclick = () => {
                fetchStops(variant.route, correctBound, variant.service_type);
            };
            container.appendChild(btn);
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = '搜尋失敗 (CORS或代理錯誤)';
    }
}

// 3. 獲取站點
async function fetchStops(route, bound, serviceType) {
    updateStatus(`載入中...`);
    
    // 【雙重保險】確保不會發送 "O" 出去
    if (bound === 'O' || bound === 'I') {
        alert("程式邏輯錯誤：參數未轉換，請檢查代碼");
        return;
    }

    // 組合代理網址： .../route-stop/960/outbound/1
    const url = `${API_BASE}/route-stop/${route}/${bound}/${serviceType}`;
    console.log("正在請求:", url); // 除錯用

    try {
        const response = await fetch(url);
        
        // 如果這裡報 422，代表 bound 還是錯的；如果是 404，代表代理路徑錯
        if (!response.ok) throw new Error(`API 錯誤: ${response.status}`);
        
        const json = await response.json();
        
        if (!json.data) {
            updateStatus("沒有站點資料");
            return;
        }

        // 排序並轉換名稱
        const stops = json.data.sort((a, b) => a.seq - b.seq);
        const names = stops.map(s => stopMap[s.stop] || s.stop);
        
        document.getElementById('stationList').value = names.join('\n');
        generateImage();
        updateStatus(`成功載入 ${names.length} 個站點`);

    } catch (e) {
        console.error(e);
        updateStatus("載入失敗: " + e.message);
    }
}

// 4. 繪圖 (包含 iPad 防崩潰修正)
function generateImage() {
    const routeNo = document.getElementById('routeInput').value.toUpperCase();
    const price = document.getElementById('priceInput').value;
    const stops = document.getElementById('stationList').value.split('\n').filter(s => s.trim() !== "");
    
    // 檢查字體選單是否存在
    const fontEl = document.getElementById('fontSelect');
    const selectedFont = fontEl ? fontEl.value : "sans-serif";

    if (stops.length === 0) return;

    // 畫布設定
    const spacing = 60;
    canvas.width = 500;
    canvas.height = 150 + (stops.length * spacing);

    // 白底
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 紅色標題
    ctx.fillStyle = "#e60012";
    ctx.fillRect(0, 0, canvas.width, 80);
    
    // 文字
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 40px ${selectedFont}`;
    ctx.fillText(routeNo, 20, 55);
    
    ctx.font = `20px ${selectedFont}`;
    ctx.fillText(`全程收費: $${price}`, 150, 50);

    // 線條
    ctx.strokeStyle = "#e60012";
    ctx.lineWidth = 5;
    const lineX = 60;
    const startY = 120;
    
    ctx.beginPath();
    ctx.moveTo(lineX, startY);
    ctx.lineTo(lineX, startY + (stops.length - 1) * spacing);
    ctx.stroke();

    // 站點
    stops.forEach((name, i) => {
        const y = startY + (i * spacing);
        
        // 圓點
        ctx.beginPath();
        ctx.arc(lineX, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.stroke();
        
        // 站名
        ctx.fillStyle = "#333";
        ctx.font = `bold 18px ${selectedFont}`;
        ctx.fillText(name, 100, y + 7);
    });
}

function downloadImage() {
    const link = document.createElement('a');
    link.download = `bus_route.png`;
    link.href = canvas.toDataURL();
    link.click();
}

// 代理伺服器網址
const API_PROXY = 'https://kmbapi.wg7fg9sf3.workers.dev';

let stopMap = {};
const canvas = document.getElementById('routeCanvas');
const ctx = canvas.getContext('2d');

// 1. 初始化車站名稱數據庫
window.onload = async function() {
    updateStatus("正在下載車站清單...");
    try {
        const response = await fetch(`${API_PROXY}/stop`);
        const json = await response.json();
        if (json.data) {
            [span_8](start_span)[span_9](start_span)// 建立 ID 對應名稱的 Map[span_8](end_span)[span_9](end_span)
            json.data.forEach(stop => { stopMap[stop.stop] = stop.name_tc; });
            updateStatus("系統就緒");
        }
    } catch (e) {
        updateStatus("車站資料載入失敗");
        console.error(e);
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
    if (!route) return;

    container.innerHTML = '搜尋中...';

    try {
        const response = await fetch(`${API_PROXY}/route/${route}`);
        const json = await response.json();

        if (!json.data || json.data.length === 0) {
            container.innerHTML = '找不到路線';
            return;
        }

        container.innerHTML = '';
        json.data.forEach(variant => {
            [span_10](start_span)[span_11](start_span)// 【核心修正】將文檔定義的 O/I 轉為 API 請求要求的全寫[span_10](end_span)[span_11](end_span)
            let apiBound = (variant.bound === 'I') ? 'inbound' : 'outbound';
            const boundLabel = (variant.bound === 'I') ? '回程' : '去程';

            const btn = document.createElement('button');
            btn.className = 'variant-btn';
            btn.innerHTML = `<strong>往 ${variant.dest_tc}</strong><br><small>${boundLabel} (類別 ${variant.service_type})</small>`;
            
            // 點擊後發送正確的英文參數 (outbound/inbound)
            btn.onclick = () => fetchStops(variant.route, apiBound, variant.service_type);
            container.appendChild(btn);
        });
    } catch (e) {
        container.innerHTML = '搜尋發生錯誤';
    }
}

[span_12](start_span)// 3. 獲取特定服務的站點[span_12](end_span)
async function fetchStops(route, bound, serviceType) {
    updateStatus("載入站點中...");
    
    // 安全檢查：防止發送簡寫代碼導致 422 錯誤
    if (bound.length === 1) {
        alert("程式邏輯錯誤：嘗試發送簡寫方向代碼 " + bound);
        return;
    }

    try {
        const url = `${API_PROXY}/route-stop/${route}/${bound}/${serviceType}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`API 回傳錯誤: ${response.status}`);
        
        const json = await response.json();
        
        [span_13](start_span)// 排序並提取站名[span_13](end_span)
        const stops = json.data.sort((a, b) => a.seq - b.seq);
        const names = stops.map(s => stopMap[s.stop] || s.stop);
        
        document.getElementById('stationList').value = names.join('\n');
        generateImage();
        updateStatus(`載入成功: ${names.length} 站`);
    } catch (e) {
        updateStatus("載入失敗: " + e.message);
    }
}

// 4. 繪製路線圖
function generateImage() {
    const routeNo = document.getElementById('routeInput').value.toUpperCase();
    const price = document.getElementById('priceInput').value;
    const stops = document.getElementById('stationList').value.split('\n').filter(s => s.trim() !== "");
    
    // 安全讀取 DOM，防止 iPad 崩潰
    const fontSelect = document.getElementById('fontSelect');
    const selectedFont = fontSelect ? fontSelect.value : "sans-serif";

    if (stops.length === 0) return;

    const spacing = 60;
    canvas.width = 500;
    canvas.height = 150 + (stops.length * spacing);

    // 背景與標題
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e60012";
    ctx.fillRect(0, 0, canvas.width, 80);
    
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 40px ${selectedFont}`;
    ctx.fillText(routeNo, 20, 55);
    ctx.font = `20px ${selectedFont}`;
    ctx.fillText(`全程收費: $${price}`, 150, 50);

    // 繪製路徑線
    const lineX = 60;
    const startY = 120;
    ctx.strokeStyle = "#e60012";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(lineX, startY);
    ctx.lineTo(lineX, startY + (stops.length - 1) * spacing);
    ctx.stroke();

    // 繪製圓點與站名
    stops.forEach((name, i) => {
        const y = startY + (i * spacing);
        ctx.beginPath();
        ctx.arc(lineX, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = "#333";
        ctx.font = `bold 18px ${selectedFont}`;
        ctx.fillText(name, 100, y + 7);
    });
}

function downloadImage() {
    const link = document.createElement('a');
    link.download = `KMB_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
}

// 定義全域變數
let stopMap = {};
const canvas = document.getElementById('routeCanvas');
const ctx = canvas.getContext('2d');

// 1. 初始化：載入車站資料庫
window.onload = async function() {
    updateStatus("正在下載車站資料庫...");
    try {
        const response = await fetch('https://data.etabus.gov.hk/v1/transport/kmb/stop');
        const json = await response.json();
        if (json.data) {
            json.data.forEach(stop => {
                stopMap[stop.stop] = stop.name_tc;
            });
            updateStatus("系統就緒，請搜尋路線。");
        } else {
            updateStatus("車站資料載入異常");
        }
    } catch (error) {
        console.error(error);
        updateStatus("錯誤：無法連線至資料庫");
    }
};

function updateStatus(msg) {
    const el = document.getElementById('statusMsg');
    if (el) el.innerText = msg;
}

// 2. 搜尋路線
async function findRouteVariants() {
    const routeInput = document.getElementById('routeInput');
    const route = routeInput.value.trim().toUpperCase();
    if (!route) { alert("請輸入路線號碼"); return; }

    const container = document.getElementById('routeOptionsArea');
    container.innerHTML = '<p class="status">正在搜尋...</p>';

    try {
        // 使用官方 API
        const response = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route/${route}`);
        const json = await response.json();

        if (!json.data || json.data.length === 0) {
            container.innerHTML = '<p class="status" style="color:red;">找不到此路線。</p>';
            return;
        }

        container.innerHTML = ''; // 清空狀態

        // 產生按鈕
        json.data.forEach(variant => {
            // 【修正 422 錯誤的核心】
            // 雖然 Data Dictionary 說 bound 是 "O"/"I"，但 API 請求必須用全寫
            let apiBound = "outbound"; // 預設值
            if (variant.bound === 'I') {
                apiBound = "inbound";
            } else if (variant.bound === 'O') {
                apiBound = "outbound";
            }

            const boundName = variant.bound === 'O' ? '去程' : '回程';
            
            const btn = document.createElement('button');
            btn.className = 'variant-btn'; 
            // 顯示給用家看
            btn.innerHTML = `<strong>往 ${variant.dest_tc}</strong><br><small>${boundName} | 服務類別: ${variant.service_type}</small>`;
            
            // 點擊時，傳送「轉換後」的 apiBound
            btn.onclick = () => {
                loadStopsForService(variant.route, apiBound, variant.service_type);
            };

            container.appendChild(btn);
        });

    } catch (error) {
        console.error(error);
        container.innerHTML = '<p class="status">搜尋失敗，請檢查網絡。</p>';
    }
}

// 3. 載入站點
async function loadStopsForService(route, bound, serviceType) {
    updateStatus(`正在載入 ${route} (${bound}) 資料...`);
    
    // 再次檢查，確保不會傳送 "O" 或 "I" 給 API
    if (bound === 'O' || bound === 'I') {
        alert("程式錯誤：參數未轉換");
        return;
    }

    const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${bound}/${serviceType}`;
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API 錯誤: ${response.status} (請檢查是否為 422)`);
        }

        const json = await response.json();

        if (!json.data || json.data.length === 0) {
            updateStatus("此路線無站點資料。");
            return;
        }

        // 排序
        const stops = json.data.sort((a, b) => a.seq - b.seq);
        
        // 轉換名稱
        const stopNames = stops.map(item => stopMap[item.stop] || item.stop);

        // 填入列表
        const textarea = document.getElementById('stationList');
        if (textarea) {
            textarea.value = stopNames.join('\n');
            // 自動生成圖片
            generateImage();
            updateStatus(`成功載入 ${stopNames.length} 個站點！`);
        }

    } catch (error) {
        console.error("載入站點錯誤:", error);
        updateStatus("載入失敗: " + error.message);
    }
}

// 4. 生成圖片
function generateImage() {
    const routeNo = document.getElementById('routeInput').value.toUpperCase();
    const price = document.getElementById('priceInput').value;
    const stopsText = document.getElementById('stationList').value;
    const stops = stopsText.split('\n').filter(s => s.trim() !== "");
    
    // 【修正 DOMException 的核心】
    // 安全地讀取字體，如果找不到元素就用預設值，防止 iPad 崩潰
    let selectedFont = "sans-serif";
    const fontSelect = document.getElementById('fontSelect');
    if (fontSelect) {
        selectedFont = fontSelect.value;
    }

    if (stops.length === 0) return;

    // 畫布設定
    const padding = 50;
    const headerHeight = 100;
    const stopSpacing = 60;
    const canvasWidth = 500;
    const canvasHeight = headerHeight + (stops.length * stopSpacing) + padding;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // 背景
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 紅頭牌
    ctx.fillStyle = "#e60012";
    ctx.fillRect(0, 0, canvasWidth, 80);
    
    // 路線號
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 40px ${selectedFont}`;
    ctx.fillText(routeNo, 20, 55);
    
    // 收費
    ctx.font = `20px ${selectedFont}`;
    ctx.fillText("全程收費: $" + price, 150, 50);

    // 路線線條
    const lineX = 60;
    const textX = 100;
    let startY = headerHeight + 30;

    ctx.beginPath();
    ctx.moveTo(lineX, startY);
    ctx.lineTo(lineX, startY + ((stops.length - 1) * stopSpacing));
    ctx.strokeStyle = "#e60012";
    ctx.lineWidth = 5;
    ctx.stroke();

    // 站點圈圈與文字
    stops.forEach((stopName, index) => {
        const y = startY + (index * stopSpacing);

        ctx.beginPath();
        ctx.arc(lineX, y, 10, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#333333";
        ctx.font = `bold 18px ${selectedFont}`;
        ctx.fillText((index + 1) + ". " + stopName, textX, y + 6);
    });
}

// 5. 下載圖片
function downloadImage() {
    const link = document.createElement('a');
    const routeNo = document.getElementById('routeInput').value || "route";
    link.download = `KMB_${routeNo}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

// 全域變數：儲存車站 ID 與名稱的對照表
let stopMap = {};
const canvas = document.getElementById('routeCanvas');
const ctx = canvas.getContext('2d');

// --- 1. 初始化：載入全港車站名稱 ---
window.onload = async function() {
    updateStatus("正在下載車站資料庫 (首次載入較慢)...");
    try {
        const response = await fetch('https://data.etabus.gov.hk/v1/transport/kmb/stop');
        const json = await response.json();
        
        json.data.forEach(stop => {
            stopMap[stop.stop] = stop.name_tc; // 建立 ID -> 中文名 對照
        });
        updateStatus("車站資料庫就緒！請輸入路線並按載入。");
    } catch (error) {
        console.error(error);
        updateStatus("錯誤：無法連線至資料庫");
    }
};

function updateStatus(msg) {
    document.getElementById('statusMsg').innerText = msg;
}

// --- 2. 抓取特定路線資料 ---
async function fetchRouteData() {
    const route = document.getElementById('routeInput').value.trim();
    const bound = document.getElementById('boundInput').value;
    const serviceType = document.getElementById('serviceTypeInput').value;

    if (!route) { alert("請輸入路線號碼"); return; }
    
    updateStatus(`正在搜尋 ${route} 號線資料...`);

    const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${bound}/${serviceType}`;

    try {
        const response = await fetch(url);
        const json = await response.json();

        if (!json.data || json.data.length === 0) {
            updateStatus("找不到資料 (請檢查方向或服務類別)");
            alert("找不到該路線資料，請嘗試更改方向 (Outbound/Inbound) 或服務類別 (通常為 1)。");
            return;
        }

        // 排序：依照 seq 順序
        const stops = json.data.sort((a, b) => a.seq - b.seq);
        
        // 轉換 ID 為中文名
        const stopNames = stops.map(item => stopMap[item.stop] || `未知站點 (${item.stop})`);

        // 填入 Textarea
        document.getElementById('stationList').value = stopNames.join('\n');
        updateStatus(`成功載入 ${stopNames.length} 個站點！請按生成圖片。`);

    } catch (error) {
        console.error(error);
        updateStatus("API 連線錯誤");
    }
}

// --- 3. 繪圖核心邏輯 (Canvas) ---
function generateImage() {
    const routeNo = document.getElementById('routeInput').value;
    const price = document.getElementById('priceInput').value;
    // 取得站點列表，過濾空行
    const stops = document.getElementById('stationList').value.split('\n').filter(s => s.trim() !== "");

    if (stops.length === 0) {
        alert("沒有站點資料，無法繪圖");
        return;
    }

    // 設定參數 (你可以修改這裡來調整樣式)
    const padding = 50;
    const headerHeight = 100;
    const stopSpacing = 60; // 每個站之間的距離
    const circleRadius = 10;
    const canvasWidth = 500;
    const canvasHeight = headerHeight + (stops.length * stopSpacing) + padding;

    // 設定畫布大小
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // 填滿背景色 (白色)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // --- 繪製標題區 ---
    ctx.fillStyle = "#e60012"; // 紅色背景
    ctx.fillRect(0, 0, canvasWidth, 80);
    
    ctx.fillStyle = "#ffffff"; // 白色字
    ctx.font = "bold 40px Arial";
    ctx.fillText(routeNo, 20, 55);
    
    ctx.font = "20px Arial";
    ctx.fillText("全程收費: $" + price, 150, 50);

    // --- 繪製路線 ---
    const lineX = 60; // 線條的 X 軸位置
    const textX = 100; // 文字的 X 軸位置
    let startY = headerHeight + 30;

    // 畫主線條 (貫穿第一個站到最後一個站)
    ctx.beginPath();
    ctx.moveTo(lineX, startY);
    ctx.lineTo(lineX, startY + ((stops.length - 1) * stopSpacing));
    ctx.strokeStyle = "#e60012";
    ctx.lineWidth = 5;
    ctx.stroke();

    // 迴圈畫每一個站
    stops.forEach((stopName, index) => {
        const y = startY + (index * stopSpacing);

        // 畫圓點
        ctx.beginPath();
        ctx.arc(lineX, y, circleRadius, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff"; // 圓點內部白
        ctx.fill();
        ctx.stroke(); // 圓點邊框紅 (承接上面的 strokeStyle)

        // 畫站名
        ctx.fillStyle = "#333333";
        ctx.font = "bold 18px Microsoft JhengHei";
        ctx.fillText((index + 1) + ". " + stopName, textX, y + 6);
    });
}

// --- 4. 下載功能 ---
function downloadImage() {
    // 檢查是否有內容
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) {
        alert("請先生成圖片！");
        return;
    }

    const link = document.createElement('a');
    const routeNo = document.getElementById('routeInput').value || "route";
    link.download = `KMB_${routeNo}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

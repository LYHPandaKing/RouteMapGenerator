let stopMap = {};
const canvas = document.getElementById('routeCanvas');
const ctx = canvas.getContext('2d');

// --- 1. 初始化 ---
window.onload = async function() {
    updateStatus("正在下載車站資料庫 (首次載入較慢)...");
    try {
        const response = await fetch('https://data.etabus.gov.hk/v1/transport/kmb/stop');
        const json = await response.json();
        json.data.forEach(stop => {
            stopMap[stop.stop] = stop.name_tc; 
        });
        updateStatus("車站資料庫就緒，請搜尋路線。");
    } catch (error) {
        console.error(error);
        updateStatus("錯誤：無法連線至資料庫");
    }
};

function updateStatus(msg) {
    document.getElementById('searchStatus').innerText = msg;
}

// --- 2. 新功能：搜尋路線的所有變種 ---
async function findRouteVariants() {
    const route = document.getElementById('routeInput').value.trim().toUpperCase();
    if (!route) { alert("請輸入路線號碼"); return; }

    const container = document.getElementById('routeOptionsArea');
    container.innerHTML = '<p class="status">正在分析路線資料...</p>';

    try {
        const response = await fetch('https://data.etabus.gov.hk/v1/transport/kmb/route');
        const json = await response.json();

        // 🔥 正確：在前端 filter
        const variants = json.data.filter(r => r.route === route);

        if (variants.length === 0) {
            container.innerHTML = '<p class="status" style="color:red;">找不到此路線</p>';
            return;
        }

        container.innerHTML = '';

        variants.forEach(variant => {
            const boundFull = variant.bound === 'O' ? 'outbound' : 'inbound';
            const boundName = variant.bound === 'O' ? '去程' : '回程';
            const serviceName = variant.service_type === '1'
                ? '主線'
                : `特別班次 (${variant.service_type})`;

            const btn = document.createElement('button');
            btn.style.textAlign = "left";

            btn.innerHTML = `
              <strong>往 ${variant.dest_tc}</strong><br>
              <small>${variant.orig_tc} 開出 | ${boundName} | ${serviceName}</small>
            `;

            btn.onclick = () => {
                fetchRouteData(variant.route, boundFull, variant.service_type);
            };
            
            console.log(
          "選擇方向：",
          variant.route,
          boundFull,
          variant.service_type
        );

            container.appendChild(btn);
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = '<p class="status">API 讀取失敗</p>';
    }
}

// --- 3. 載入特定路線的站點資料 (由上方按鈕觸發) ---
async function fetchRouteData(route, bound, serviceType) {
    updateStatus(`正在載入 ${route} ${bound === 'outbound' ? '去程' : '回程'} 資料...`);

    // 🔴 關鍵：強制轉字串
    const service = String(serviceType);

    const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${bound}/${service}`;

    try {
        const response = await fetch(url);
        const json = await response.json();

        // ✅ 防呆：沒有資料直接提示
        if (!json.data || json.data.length === 0) {
            updateStatus("此方向沒有站點資料（可能是特別班次）");
            document.getElementById('stationList').value = "";
            return;
        }

        const stops = json.data.sort((a, b) => a.seq - b.seq);

        const stopNames = stops.map(item =>
            stopMap[item.stop] || item.stop
        );

        document.getElementById('stationList').value = stopNames.join('\n');

        generateImage();
        updateStatus(`已載入 ${stopNames.length} 個站點`);

    } catch (error) {
        console.error(error);
        updateStatus("載入站點時發生錯誤");
    }
}

// --- 4. 繪圖與下載 (與之前相同，無須變動) ---
function generateImage() {
    const routeNo = document.getElementById('routeInput').value.toUpperCase();
    const price = document.getElementById('priceInput').value;
    const stops = document.getElementById('stationList').value.split('\n').filter(s => s.trim() !== "");

    if (stops.length === 0) return;

    const padding = 50;
    const headerHeight = 100;
    const stopSpacing = 60;
    const circleRadius = 10;
    const canvasWidth = 500;
    const canvasHeight = headerHeight + (stops.length * stopSpacing) + padding;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = "#e60012";
    ctx.fillRect(0, 0, canvasWidth, 80);
    
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 40px Arial";
    ctx.fillText(routeNo, 20, 55);
    
    ctx.font = "20px Arial";
    ctx.fillText("全程收費: $" + price, 150, 50);

    const lineX = 60;
    const textX = 100;
    let startY = headerHeight + 30;

    ctx.beginPath();
    ctx.moveTo(lineX, startY);
    ctx.lineTo(lineX, startY + ((stops.length - 1) * stopSpacing));
    ctx.strokeStyle = "#e60012";
    ctx.lineWidth = 5;
    ctx.stroke();

    stops.forEach((stopName, index) => {
        const y = startY + (index * stopSpacing);
        ctx.beginPath();
        ctx.arc(lineX, y, circleRadius, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#333333";
        ctx.font = "bold 18px Microsoft JhengHei";
        ctx.fillText((index + 1) + ". " + stopName, textX, y + 6);
    });
}

function downloadImage() {
    const link = document.createElement('a');
    const routeNo = document.getElementById('routeInput').value || "route";
    link.download = `KMB_${routeNo}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

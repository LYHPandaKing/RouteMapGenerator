/* ======================================================
   全域變數
====================================================== */

let stopMap = {};               // stopId -> { tc, en }
let stopMapReady = false;

let routeStops = {
    outbound: [],
    inbound: []
};

let currentBound = null;

const canvas = document.getElementById("routeCanvas");
const ctx = canvas.getContext("2d");

/* ======================================================
   站名排版設定
====================================================== */

const STOP_LABEL_MAX_WIDTH = 210;
const MIN_SCALE_X = 0.85;

/* ======================================================
   初始化：下載車站資料（雙語）
====================================================== */

window.onload = async function () {
    updateStatus("正在下載車站資料庫（首次載入較慢）...");

    try {
        const response = await fetch(
            "https://data.etabus.gov.hk/v1/transport/kmb/stop"
        );
        const json = await response.json();

        json.data.forEach(stop => {
            stopMap[stop.stop] = {
                tc: stop.name_tc,
                en: stop.name_en
            };
        });

        stopMapReady = true;
        updateStatus("車站資料庫就緒，請搜尋路線。");

    } catch (error) {
        console.error(error);
        updateStatus("錯誤：無法載入車站資料");
    }
};

/* ======================================================
   UI 工具
====================================================== */

function updateStatus(msg) {
    const el = document.getElementById("searchStatus");
    if (el) el.innerText = msg;
}

/* ======================================================
   1. 搜尋路線 → 顯示行車方向
====================================================== */

async function findRouteVariants() {
    const route = document
        .getElementById("routeInput")
        .value
        .trim()
        .toUpperCase();

    if (!route) {
        alert("請輸入路線號碼");
        return;
    }

    const container = document.getElementById("routeOptionsArea");
    container.innerHTML = '<p class="status">正在搜尋路線...</p>';

    try {
        const response = await fetch(
            "https://data.etabus.gov.hk/v1/transport/kmb/route"
        );
        const json = await response.json();

        const variants = json.data.filter(r => r.route === route);

        if (variants.length === 0) {
            container.innerHTML =
                '<p class="status" style="color:red;">找不到此路線</p>';
            return;
        }

        container.innerHTML = "";

        variants.forEach(variant => {
            const boundFull =
                variant.bound === "O" ? "outbound" : "inbound";
            const boundName =
                variant.bound === "O" ? "去程" : "回程";
            const serviceName =
                String(variant.service_type) === "1"
                    ? "主線"
                    : `特別班次 (${variant.service_type})`;

            const btn = document.createElement("button");
            btn.className = "route-option-btn";

            btn.innerHTML = `
                <strong>往 ${variant.dest_tc}</strong><br>
                <small>${variant.orig_tc} 開出 ｜ ${boundName} ｜ ${serviceName}</small>
            `;

            btn.onclick = () => {
                if (!stopMapReady) {
                    alert("車站資料仍在載入，請稍候再試");
                    return;
                }

                Array.from(container.children).forEach(b =>
                    b.classList.remove("active")
                );
                btn.classList.add("active");

                currentBound = boundFull;

                fetchRouteData(
                    variant.route,
                    boundFull,
                    String(variant.service_type)
                );
            };

            container.appendChild(btn);
        });

        updateStatus("請選擇行車方向");

    } catch (error) {
        console.error(error);
        container.innerHTML =
            '<p class="status">查詢失敗，請檢查網路</p>';
    }
}

/* ======================================================
   2. 載入站點資料（雙語）
====================================================== */

async function fetchRouteData(route, bound, serviceType) {
    updateStatus(
        `正在載入 ${route} ${bound === "outbound" ? "去程" : "回程"} 站點...`
    );

    const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${bound}/${serviceType}`;

    try {
        const response = await fetch(url);
        const json = await response.json();

        if (!json.data || json.data.length === 0) {
            updateStatus("此方向沒有站點資料");
            routeStops[bound] = [];
            return;
        }

        const stops = json.data.sort((a, b) => a.seq - b.seq);

        const stopList = stops.map(item => {
            const stop = stopMap[item.stop];
            if (!stop) {
                return { tc: item.stop, en: "" };
            }
            return {
                tc: stop.tc,
                en: stop.en
            };
        });

        routeStops[bound] = stopList;

        generateImage();
        updateStatus(`已載入 ${stopList.length} 個站點`);

    } catch (error) {
        console.error(error);
        updateStatus("載入站點時發生錯誤");
    }
}

/* ======================================================
   站名排版判斷
====================================================== */

function decideStopLayout(ctx, tc, en) {
    const lines = [];

    const fontTC = "16px 新細明體";
    const fontEN = "15px Arial Narrow";

    ctx.font = fontTC;
    const wTC = ctx.measureText(tc).width;

    ctx.font = fontEN;
    const wEN = ctx.measureText(en).width;

    ctx.font = fontTC;
    const wSpace = ctx.measureText(" ").width;

    // Mode 1：中英同一行
    if (en && wTC + wSpace + wEN <= STOP_LABEL_MAX_WIDTH) {
        lines.push({
            text: tc + " " + en,
            font: fontTC,
            scaleX: 1
        });
        return lines;
    }

    // Mode 2：中英分行
    if (wTC <= STOP_LABEL_MAX_WIDTH && wEN <= STOP_LABEL_MAX_WIDTH) {
        lines.push({ text: tc, font: fontTC, scaleX: 1 });
        if (en) lines.push({ text: en, font: fontEN, scaleX: 1 });
        return lines;
    }

    // Mode 3：分行 + 橫向壓縮
    const scaleTC = Math.min(1, STOP_LABEL_MAX_WIDTH / wTC);
    const scaleEN = en ? Math.min(1, STOP_LABEL_MAX_WIDTH / wEN) : 1;
    const scale = Math.max(MIN_SCALE_X, Math.min(scaleTC, scaleEN));

    lines.push({ text: tc, font: fontTC, scaleX: scale });
    if (en) lines.push({ text: en, font: fontEN, scaleX: scale });

    return lines;
}

/* ======================================================
   繪製單個站名
====================================================== */

function drawStopLabel(ctx, x, y, stop) {
    const lines = decideStopLayout(ctx, stop.tc, stop.en);
    const lineHeight = 18;

    let currentY = y;

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#333";

    lines.forEach(line => {
        ctx.save();
        ctx.font = line.font;
        ctx.scale(line.scaleX, 1);
        ctx.fillText(line.text, x / line.scaleX, currentY);
        ctx.restore();
        currentY += lineHeight;
    });

    return lines.length * lineHeight;
}

/* ======================================================
   3. 生成路線圖（雙語站名）
====================================================== */

function generateImage() {
    if (!currentBound || routeStops[currentBound].length === 0) return;

    const routeNo =
        document.getElementById("routeInput").value.toUpperCase();
    const price =
        document.getElementById("priceInput").value;

    const stops = routeStops[currentBound];

    const padding = 50;
    const headerHeight = 100;
    const stopSpacing = 60;
    const circleRadius = 10;
    const canvasWidth = 520;
    const canvasHeight =
        headerHeight + stops.length * stopSpacing + padding;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // 背景
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Header
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

    // 垂直線
    ctx.beginPath();
    ctx.moveTo(lineX, startY);
    ctx.lineTo(
        lineX,
        startY + (stops.length - 1) * stopSpacing
    );
    ctx.strokeStyle = "#e60012";
    ctx.lineWidth = 5;
    ctx.stroke();

    // 站點
    stops.forEach((stop, index) => {
        const y = startY + index * stopSpacing;

        ctx.beginPath();
        ctx.arc(lineX, y, circleRadius, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#e60012";
        ctx.stroke();

        drawStopLabel(ctx, textX, y + 6, stop);
    });
}

/* ======================================================
   4. 下載圖片
====================================================== */

function downloadImage() {
    const link = document.createElement("a");
    const routeNo =
        document.getElementById("routeInput").value || "route";
    link.download = `KMB_${routeNo}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}
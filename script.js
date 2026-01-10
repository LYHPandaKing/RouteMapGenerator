/* ======================================================
   固定尺寸與常數
====================================================== */

const CANVAS_W = 954;
const CANVAS_H = 1320;

const MAP_W = 538;
const MAP_H = 1237;

const TOP_BOX_H = 57;
const BOTTOM_BOX_H = 53;

const MAP_X = (CANVAS_W - MAP_W) / 2;

const STOP_LABEL_MAX_WIDTH = 210;
const MIN_SCALE_X = 0.85;

const canvas = document.getElementById("routeCanvas");
const ctx = canvas.getContext("2d");

canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

/* ======================================================
   全域狀態
====================================================== */

let stopMap = {};
let stopMapReady = false;

let allServices = [];
let currentService = null;

/* ======================================================
   Smart 同步（stop 資料）
====================================================== */

async function hashData(obj) {
  const buf = new TextEncoder().encode(JSON.stringify(obj));
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalizeStopData(data) {
  return data
    .map(s => ({
      stop: s.stop,
      tc: s.name_tc,
      en: s.name_en,
      lat: parseFloat(s.lat),
      lng: parseFloat(s.long)
    }))
    .sort((a, b) => a.stop.localeCompare(b.stop));
}

async function loadStopDatabaseSmart() {
  const CACHE = "kmb_stop_cache";
  const HASH = "kmb_stop_hash";

  const res = await fetch("https://data.etabus.gov.hk/v1/transport/kmb/stop");
  const json = await res.json();

  const normalized = normalizeStopData(json.data);
  const newHash = await hashData(normalized);
  const oldHash = localStorage.getItem(HASH);

  if (newHash !== oldHash) {
    localStorage.setItem(CACHE, JSON.stringify(normalized));
    localStorage.setItem(HASH, newHash);
    return normalized;
  }

  return JSON.parse(localStorage.getItem(CACHE));
}

/* ======================================================
   初始化
====================================================== */

window.onload = async () => {
  const data = await loadStopDatabaseSmart();

  data.forEach(s => {
    stopMap[s.stop] = {
      tc: s.tc,
      en: s.en,
      lat: s.lat,
      lng: s.lng
    };
  });

  stopMapReady = true;

  document.getElementById("dataTimestamp").innerText =
    "最後同步：" + new Date().toLocaleString("zh-HK");
};

/* ======================================================
   UI 工具
====================================================== */

function updateStatus(msg) {
  document.getElementById("searchStatus").innerText = msg;
}

/* ======================================================
   搜尋路線 → services
====================================================== */

async function findRouteVariants() {
  if (!stopMapReady) return;

  const route = routeInput.value.trim().toUpperCase();
  if (!route) return alert("請輸入路線號碼");

  updateStatus("正在搜尋路線…");

  const res = await fetch("https://data.etabus.gov.hk/v1/transport/kmb/route");
  const json = await res.json();

  const area = document.getElementById("routeOptionsArea");
  area.innerHTML = "";

  allServices = [];
  currentService = null;

  json.data.filter(r => r.route === route).forEach(v => {
    const service = {
      id: crypto.randomUUID(),
      route: v.route,
      bound: v.bound,
      serviceType: v.service_type,
      label: `${v.orig_tc} → ${v.dest_tc}`,
      routeItems: []
    };

    allServices.push(service);

    const btn = document.createElement("button");
    btn.className = "route-option-btn";
    btn.innerText = service.label;

    btn.onclick = async () => {
      document
        .querySelectorAll(".route-option-btn")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

      currentService = service;
      await loadStopsForService(service);
      renderEditorPanel(service);
      generateImage();
    };

    area.appendChild(btn);
  });

  updateStatus("請選擇一個服務方向");
}

async function loadStopsForService(service) {
  const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${service.route}/${service.bound}/${service.serviceType}`;
  const res = await fetch(url);
  const json = await res.json();

  service.routeItems = json.data
    .sort((a, b) => a.seq - b.seq)
    .map(s => ({
      type: "stop",
      stopId: s.stop,
      tc: stopMap[s.stop]?.tc || s.stop,
      en: stopMap[s.stop]?.en || ""
    }));

  if (!service.routeItems.length) {
    alert("未能載入站點資料");
  }
}

/* ======================================================
   編輯 UI
====================================================== */

function renderEditorPanel(service) {
  const panel = document.getElementById("editorPanel");
  panel.innerHTML = "";

  if (!service || !service.routeItems) {
    panel.innerHTML = "<p class='hint'>請先選擇一個服務方向</p>";
    return;
  }

  let stopCount = 0;

  service.routeItems.forEach((item, index) => {
    if (item.type !== "stop") return;

    const box = document.createElement("div");
    box.className = "editor-stop";

    box.innerHTML = `
      <h3>站點 ${++stopCount}</h3>
      <div class="editor-row">
        <input value="${item.tc}" placeholder="中文站名">
        <input value="${item.en}" placeholder="英文站名">
      </div>
      <div class="editor-actions">
        <button>+ 途經街道</button>
      </div>
    `;

    const inputs = box.querySelectorAll("input");
    inputs[0].oninput = e => { item.tc = e.target.value; generateImage(); };
    inputs[1].oninput = e => { item.en = e.target.value; generateImage(); };

    box.querySelector("button").onclick = () => {
      service.routeItems.splice(index + 1, 0, {
        type: "street",
        tc: "",
        en: ""
      });
      renderEditorPanel(service);
      generateImage();
    };

    let i = index + 1;
    while (service.routeItems[i]?.type === "street") {
      const street = service.routeItems[i];

      const row = document.createElement("div");
      row.className = "street-item editor-row";
      row.innerHTML = `
        <input value="${street.tc}" placeholder="中文街道名">
        <input value="${street.en}" placeholder="英文街道名">
        <button>✖</button>
      `;

      const sinputs = row.querySelectorAll("input");
      sinputs[0].oninput = e => { street.tc = e.target.value; generateImage(); };
      sinputs[1].oninput = e => { street.en = e.target.value; generateImage(); };

      row.querySelector("button").onclick = () => {
        service.routeItems.splice(i, 1);
        renderEditorPanel(service);
        generateImage();
      };

      box.appendChild(row);
      i++;
    }

    panel.appendChild(box);
  });
}

/* ======================================================
   排版與繪圖
====================================================== */

function decideStopLayout(tc, en) {
  const lines = [];
  const fontTC = "16px 新細明體";
  const fontEN = "15px Arial Narrow";

  ctx.font = fontTC;
  const wTC = ctx.measureText(tc).width;
  ctx.font = fontEN;
  const wEN = en ? ctx.measureText(en).width : 0;
  ctx.font = fontTC;
  const wSpace = ctx.measureText(" ").width;

  if (en && wTC + wSpace + wEN <= STOP_LABEL_MAX_WIDTH) {
    return [{ text: tc + " " + en, font: fontTC, scaleX: 1 }];
  }

  if (wTC <= STOP_LABEL_MAX_WIDTH && wEN <= STOP_LABEL_MAX_WIDTH) {
    const out = [{ text: tc, font: fontTC, scaleX: 1 }];
    if (en) out.push({ text: en, font: fontEN, scaleX: 1 });
    return out;
  }

  const scale = Math.max(
    MIN_SCALE_X,
    Math.min(
      STOP_LABEL_MAX_WIDTH / wTC,
      en ? STOP_LABEL_MAX_WIDTH / wEN : 1
    )
  );

  const out = [{ text: tc, font: fontTC, scaleX: scale }];
  if (en) out.push({ text: en, font: fontEN, scaleX: scale });
  return out;
}

function drawRenderGroup(x, anchorY, item) {
  const lines = decideStopLayout(item.tc, item.en);
  const lh = 18;
  let y = anchorY - (lines.length * lh) / 2 + lh;

  lines.forEach(line => {
    ctx.save();
    ctx.font = line.font;
    ctx.scale(line.scaleX, 1);
    ctx.fillStyle = item.type === "street" ? "#666" : "#333";
    ctx.fillText(line.text, x / line.scaleX, y);
    ctx.restore();
    y += lh;
  });
}

function generateImage() {
  if (!currentService || !currentService.routeItems) return;

  const items = currentService.routeItems;
  if (!items.length) return;

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const boxX = MAP_X + 2;
  ctx.strokeRect(boxX, 0, 534, TOP_BOX_H);
  ctx.strokeRect(boxX, MAP_H - BOTTOM_BOX_H, 534, BOTTOM_BOX_H);

  if (items.length < 2) return;

  const usable = MAP_H - TOP_BOX_H - BOTTOM_BOX_H;
  const spacing = usable / (items.length - 1);

  const lineX = MAP_X + 40;
  const textX = MAP_X + 80;

  ctx.beginPath();
  ctx.moveTo(lineX, TOP_BOX_H);
  ctx.lineTo(lineX, TOP_BOX_H + usable);
  ctx.strokeStyle = "#e60012";
  ctx.lineWidth = 5;
  ctx.stroke();

  items.forEach((item, i) => {
    const y = TOP_BOX_H + i * spacing;

    if (item.type === "stop") {
      ctx.beginPath();
      ctx.arc(lineX, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#e60012";
      ctx.stroke();
    }

    drawRenderGroup(textX, y, item);
  });
}

/* ======================================================
   下載
====================================================== */

function downloadImage() {
  const a = document.createElement("a");
  a.download = "KMB_Route_Map.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
}
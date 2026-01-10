/* ======================================================
   安全工具
====================================================== */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ======================================================
   固定尺寸與常數（Canvas 世界）
====================================================== */

const CANVAS_W = 954;
const CANVAS_H = 1320;

const MAP_X = 17;
const MAP_Y = 15;
const MAP_W = 538;
const MAP_H = 1237;

const TOP_BOX_H = 57;
const BOTTOM_BOX_H = 53;

const CONTENT_Y_START = 18 + TOP_BOX_H; // 75
const CONTENT_Y_END = 1196;
const CONTENT_H = CONTENT_Y_END - CONTENT_Y_START;

const STOP_LABEL_MAX_WIDTH = 210;
const MIN_SCALE_X = 0.85;

const API_BASE = "https://kmbapi.wg7fg9sf3.workers.dev";

/* ======================================================
   Canvas 初始化
====================================================== */

const canvas = document.getElementById("routeCanvas");
const ctx = canvas.getContext("2d");

canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

/* ======================================================
   DOM
====================================================== */

const routeInput = document.getElementById("routeInput");
const searchRouteBtn = document.getElementById("searchRouteBtn");
const routeOptions = document.getElementById("routeOptions");
const editorPanel = document.getElementById("editorPanel");

/* ======================================================
   狀態
====================================================== */

let stopMap = {};
let stopMapReady = false;

let allServices = [];
let currentService = null;

/* ======================================================
   載入 stop database（每次重新下載）
====================================================== */

async function loadStopDatabase() {
const res = await fetch(`${API_BASE}/stop`);
const json = await res.json();

  json.data.forEach(s => {
    stopMap[s.stop] = {
      tc: s.name_tc,
      en: s.name_en
    };
  });

  stopMapReady = true;
}

/* ======================================================
   初始化
====================================================== */

window.addEventListener("DOMContentLoaded", async () => {
  await loadStopDatabase();
  searchRouteBtn.onclick = findRouteVariants;
  drawEmptyTemplate();
});

/* ======================================================
   搜尋路線 → services
====================================================== */

async function findRouteVariants() {
  if (!stopMapReady) return;

  const route = routeInput.value.trim().toUpperCase();
  if (!route) {
    alert("請輸入路線號碼");
    return;
  }

const res = await fetch(`${API_BASE}/route`);
const json = await res.json();

  routeOptions.innerHTML = "";
  editorPanel.innerHTML = "<p class='hint'>請先選擇一個服務方向</p>";

  allServices = [];
  currentService = null;

  json.data.filter(r => r.route === route).forEach(v => {
    const service = {
      id: uid(),
      route: v.route,
      bound: v.bound,
      serviceType: v.service_type,
      orig: v.orig_tc,
      dest: v.dest_tc,
      routeItems: []
    };

    allServices.push(service);

    const btn = document.createElement("button");
    btn.className = "route-option-btn";
    btn.innerHTML = `
      <div class="route-main">${v.orig_tc} → ${v.dest_tc}</div>
      <div class="route-sub">
        ${v.bound === "O" ? "去程" : "回程"}｜
        ${v.service_type === "1" ? "正常班" : "特別班"}
      </div>
    `;

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

    routeOptions.appendChild(btn);
  });
}

/* ======================================================
   載入站點
====================================================== */

async function loadStopsForService(service) {
const res = await fetch(
  `${API_BASE}/route-stop/${service.route}/${service.bound}/${service.serviceType}`
);
const json = await res.json();

  service.routeItems = json.data
    .sort((a, b) => a.seq - b.seq)
    .map(s => ({
      type: "stop",
      tc: stopMap[s.stop]?.tc || s.stop,
      en: stopMap[s.stop]?.en || ""
    }));
}

/* ======================================================
   編輯 UI
====================================================== */

function renderEditorPanel(service) {
  editorPanel.innerHTML = "";

  service.routeItems.forEach((item, index) => {
    const box = document.createElement("div");
    box.className = "editor-stop";

    box.innerHTML = `
      <h3>站點 ${index + 1}</h3>
      <div class="editor-row">
        <input value="${item.tc}">
        <input value="${item.en}">
      </div>
    `;

    const inputs = box.querySelectorAll("input");
    inputs[0].oninput = e => { item.tc = e.target.value; generateImage(); };
    inputs[1].oninput = e => { item.en = e.target.value; generateImage(); };

    editorPanel.appendChild(box);
  });
}

/* ======================================================
   排版工具
====================================================== */

function decideStopLayout(tc, en) {
  const lines = [];
  const fontTC = "16px serif";
  const fontEN = "15px sans-serif";

  ctx.font = fontTC;
  const wTC = ctx.measureText(tc).width;

  ctx.font = fontEN;
  const wEN = en ? ctx.measureText(en).width : 0;

  if (en && wTC + 6 + wEN <= STOP_LABEL_MAX_WIDTH) {
    return [{ text: tc + " " + en, font: fontTC, scaleX: 1 }];
  }

  const out = [{ text: tc, font: fontTC, scaleX: 1 }];
  if (en) out.push({ text: en, font: fontEN, scaleX: 1 });
  return out;
}

/* ======================================================
   繪圖
====================================================== */

function drawEmptyTemplate() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.strokeStyle = "#ccc";
  ctx.strokeRect(MAP_X + 2, MAP_Y, 534, TOP_BOX_H);
  ctx.strokeRect(MAP_X + 2, MAP_Y + MAP_H - BOTTOM_BOX_H, 534, BOTTOM_BOX_H);
}

function generateImage() {
  if (!currentService) return;

  drawEmptyTemplate();

  const items = currentService.routeItems;
  if (items.length < 2) return;

  const spacing = CONTENT_H / (items.length - 1);
  const lineX = MAP_X + 40;
  const textX = MAP_X + 80;

  ctx.strokeStyle = "#e60012";
  ctx.lineWidth = 5;

  ctx.beginPath();
  ctx.moveTo(lineX, CONTENT_Y_START);
  ctx.lineTo(lineX, CONTENT_Y_END);
  ctx.stroke();

  items.forEach((item, i) => {
    const y = CONTENT_Y_START + i * spacing;

    ctx.beginPath();
    ctx.arc(lineX, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();

    const lines = decideStopLayout(item.tc, item.en);
    let yy = y - (lines.length * 18) / 2 + 18;

    lines.forEach(line => {
      ctx.font = line.font;
      ctx.fillStyle = "#333";
      ctx.fillText(line.text, textX, yy);
      yy += 18;
    });
  });
}
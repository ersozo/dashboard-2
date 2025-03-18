Chart.register(ChartDataLabels);

// TARİH/ZAMAN SEÇİMİ
document.addEventListener("DOMContentLoaded", function () {
  document
    .getElementById("fetch-data-btn")
    .addEventListener("click", fetchAllUnits);

  connectWebSocket();
});

// WEBSOCKET AÇMA İŞLEMLERİ
let ws;
let charts = {}; // Grafikleri takip etmek için
let unitDataStore = {}; // Tüm üretim verilerini saklayacağız

function connectWebSocket() {
  ws = new WebSocket("ws://127.0.0.1:8000/ws/production");

  ws.onopen = () => console.log("✅ WebSocket bağlantısı açıldı.");

  ws.onmessage = (event) => {
    try {
      let receivedData = JSON.parse(event.data);
      console.log("📩 Gelen WebSocket verisi:", receivedData);

      Object.entries(receivedData).forEach(([unitName, data]) => {
        updateExistingTables(unitName, data);
      });
    } catch (error) {
      console.error("❌ WebSocket verisi işlenirken hata:", error);
    }
  };

  ws.onclose = (event) => {
    console.warn(`⚠️ WebSocket bağlantısı kapandı: ${event.reason}`);
    setTimeout(connectWebSocket, 3000);
  };
}

// API İLE ÜRETİM YERLERİNİ GETİRME
async function fetchAllUnits() {
  let startDatetime = document.getElementById("start-datetime").value;
  let endDatetime = document.getElementById("end-datetime").value;

  if (!startDatetime || !endDatetime) {
    alert("Lütfen başlangıç ve bitiş tarihlerini seçin!");
    return;
  }

  let response = await fetch("http://127.0.0.1:8000/unit-names");
  let result = await response.json();
  if (result.error) {
    alert(result.error);
    return;
  }

  let container = document.getElementById("grid-container");
  container.innerHTML = "";

  result.unit_names
    .sort()
    .forEach((unit) => createUnitCard(unit, startDatetime, endDatetime));
}

// HTML OLUŞTURMA
function createUnitCard(unit, startDateTime, endDateTime) {
  console.log(`🛠️ createUnitCard çağrıldı: ${unit}`);

  let container = document.getElementById("grid-container");
  let div = document.createElement("div");
  div.className = "bg-white p-4 rounded-lg shadow-lg";
  div.innerHTML = `
      <h2 class="text-lg font-bold">${unit}</h2>
      <div class="w-64 h-64 mx-auto">
        <canvas id="chart-${unit}" width="256" height="256"></canvas>
      </div>
      <table class="w-full border-collapse border mt-2">
        <thead>
          <tr class="bg-gray-200 text-center">
            <th class="border px-4 py-2">Saat</th>
            <th class="border px-4 py-2">OK</th>
            <th class="border px-4 py-2">Tamir</th>
            <th class="border px-4 py-2">Toplam</th>
            <th class="border px-4 py-2">Tamir Oranı (%)</th>
          </tr>
        </thead>
        <tbody id="table-${unit}"></tbody>
      </table>
    `;
  container.appendChild(div);

  console.log(`🟢 ${unit} kartı DOM'a eklendi`);

  fetchUnitData(unit, startDateTime, endDateTime);
}

// API İLE VERİ GETİRME
async function fetchUnitData(unitName, startDateTime, endDateTime) {
  let apiUrl = `http://127.0.0.1:8000/hourly-production?start_date=${startDateTime}&end_date=${endDateTime}&unit_name=${unitName}`;
  let response = await fetch(apiUrl);
  let result = await response.json();
  if (!result.error) {
    updateExistingTables(unitName, result.data);
  }
}

// TABLO GÜNCELLEME
function updateExistingTables(unitName, data) {
  if (!data || !Array.isArray(data)) return;

  if (!unitDataStore[unitName]) {
    unitDataStore[unitName] = [];
  }

  unitDataStore[unitName] = mergeData(unitDataStore[unitName], data);
  renderTable(unitName);
  renderChart(unitName);
}

// VERİLERİ BİRLEŞTİRME
function mergeData(oldData, newData) {
  let merged = [...oldData];

  newData.forEach((newRow) => {
    let existingRow = merged.find((row) => row.hour === newRow.hour);
    if (existingRow) {
      existingRow.success = newRow.success;
      existingRow.fail = newRow.fail;
      existingRow.total = newRow.total;
    } else {
      merged.push(newRow);
    }
  });

  return merged.sort((a, b) => a.hour - b.hour);
}

// TABLO OLUŞTURMA
function renderTable(unitName) {
  let tableBody = document.getElementById(`table-${unitName}`);
  if (!tableBody) return;

  tableBody.innerHTML = "";
  let totalSuccess = 0,
    totalFail = 0,
    totalProduction = 0;

  unitDataStore[unitName].forEach((row) => {
    let failRate =
      row.total > 0 ? ((row.fail / row.total) * 100).toFixed(2) : "0.00";
    tableBody.innerHTML += `
      <tr>
        <td class="border px-4 py-2">${row.hour}:00 - ${row.hour + 1}:00</td>
        <td class="border px-4 py-2 text-green-600 text-center">${
          row.success
        }</td>
        <td class="border px-4 py-2 text-red-600 text-center">${row.fail}</td>
        <td class="border px-4 py-2 text-blue-600 text-center">${row.total}</td>
        <td class="border px-4 py-2 text-center">${failRate}%</td>
      </tr>
    `;
    totalSuccess += row.success;
    totalFail += row.fail;
    totalProduction += row.total;
  });

  let overallFailRate =
    totalProduction > 0
      ? ((totalFail / totalProduction) * 100).toFixed(2)
      : "0.00";
  tableBody.innerHTML += `
    <tr class="bg-gray-300 font-bold">
      <td class="border px-4 py-2">TOPLAM</td>
      <td class="border px-4 py-2 text-green-600 text-center">${totalSuccess}</td>
      <td class="border px-4 py-2 text-red-600 text-center">${totalFail}</td>
      <td class="border px-4 py-2 text-blue-600 text-center">${totalProduction}</td>
      <td class="border px-4 py-2 text-center">${overallFailRate}%</td>
    </tr>
  `;
}

// GRAFİK OLUŞTURMA
function renderChart(unitName) {
  let chartId = `chart-${unitName}`;
  let canvas = document.getElementById(chartId);
  if (!canvas) return;

  let ctx = canvas.getContext("2d");

  if (!window.charts) {
    window.charts = {}; // charts objesini başlat
  }

  if (charts[chartId]) {
    charts[chartId].destroy();
  }

  let totalSuccess = 0,
    totalFail = 0;

  if (!unitDataStore[unitName] || !Array.isArray(unitDataStore[unitName])) {
    console.warn(
      `unitDataStore[${unitName}] tanımlı değil veya uygun formatta değil.`
    );
    return;
  }

  unitDataStore[unitName].forEach((row) => {
    totalSuccess += row.success || 0;
    totalFail += row.fail || 0;
  });

charts[chartId] = new Chart(ctx, {
  type: "pie",
  data: {
    labels: ["OK", "Tamir"],
    datasets: [
      {
        data: [totalSuccess, totalFail],
        backgroundColor: ["#4CAF50", "#F44336"],
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
      },
      tooltip: {
        enabled: true,
      },
      datalabels: {
        color: "#fff",
        font: {
          weight: "bold",
          size: 16,
        },
        anchor: "end", // Label pozisyonu
        align: "start",
        offset: 10,
        formatter: (value, ctx) => {
          let sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
          let percentage = ((value / sum) * 100).toFixed(1) + "%";
          return `${value} (${percentage})`; // 10 (25.0%) şeklinde gösterim
        },
      },
    },
  },
  plugins: [ChartDataLabels], // Burada eklendiğinden emin ol
});
}

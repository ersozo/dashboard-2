// Sonuçları göstermek için
// URL parametrelerinden seçimleri al ve verileri getir
import { API_BASE_URL } from "./config.js";
Chart.register(ChartDataLabels);


// WEBSOCKET AÇMA İŞLEMLERİ
let ws;
let charts = {}; // Grafikleri takip etmek için
let unitDataStore = {}; // Tüm üretim verilerini saklayacağız

function connectWebSocket() {
  // Replace "http" with "ws" to create WebSocket URL
  const WS_BASE_URL = API_BASE_URL.replace("http", "ws");
  ws = new WebSocket(`${WS_BASE_URL}/ws/production`);

  ws.onopen = () => console.log("✅ WebSocket bağlantısı açıldı.");

  ws.onmessage = (event) => {
    try {
      let receivedData = JSON.parse(event.data);
      console.log("📩 Gelen WebSocket verisi:", receivedData);

      // Store the received data in the unitDataStore
      Object.entries(receivedData).forEach(([unitName, data]) => {
        unitDataStore[unitName] = data;

        // Only update the UI if this unit is currently displayed
        const tableElement = document.getElementById(`table-${unitName}`);
        if (tableElement) {
          updateExistingTables(unitName, data);
        }
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

connectWebSocket();



function getQueryParams() {
  const params = {};
  window.location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(str,key,value) {
    if (!params[key]) params[key] = [];
    params[key].push(decodeURIComponent(value));
  });
  return params;
}

async function fetchAndShowResults() {
  const params = getQueryParams();
  const units = params.unit_name || [];
  const start = params.start_date ? params.start_date[0] : null;
  const end = params.end_date ? params.end_date[0] : null;
  if (!units.length || !start || !end) {
    document.getElementById('grid-container').innerHTML = '<div class="text-red-600">Eksik parametre!</div>';
    return;
  }

  // Clear the grid container
  document.getElementById('grid-container').innerHTML = '';

  // Set the appropriate grid layout based on number of units
  const gridContainer = document.getElementById('grid-container');
  if (units.length === 1) {
    // Full width for single unit
    gridContainer.className = 'grid grid-cols-1 gap-6';
  } else if (units.length % 2 === 0 && units.length <= 10) {
    // For even numbers of units (2, 4, 6, 8, 10), use 2 columns
    gridContainer.className = 'grid grid-cols-2 gap-6';
  } else {
    // Default responsive behavior for other cases
    gridContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
  }

  // Create unit cards
  units.forEach(unit => createUnitCard(unit, start, end));
}

function createUnitCard(unit, startDateTime, endDateTime) {
  let container = document.getElementById("grid-container");
  let div = document.createElement("div");
  div.className = "bg-white p-4 rounded-lg shadow-lg";

  // Remove '+' characters from the unit name for display
  const displayUnitName = unit.replace(/\+/g, '');

  div.innerHTML = `
      <h2 class="text-4xl font-bold mb-4">${displayUnitName}</h2>
      <div class="flex flex-col md:flex-row gap-4 mb-4">
        <div class="w-full md:w-1/2 flex items-center">
          <table class="w-full border-collapse border text-3xl" id="summary-table-${unit}">
            <thead>
              <tr class="bg-gray-200 text-center">
                <th class="border px-4 py-2">OK</th>
                <th class="border px-4 py-2">Tamir</th>
                <th class="border px-4 py-2">Toplam</th>
                <th class="border px-4 py-2">FPR (%)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="border px-4 py-3 text-green-600 font-bold text-center text-3xl" id="total-success-${unit}">0</td>
                <td class="border px-4 py-3 text-red-600 font-bold text-center text-3xl" id="total-fail-${unit}">0</td>
                <td class="border px-4 py-3 text-blue-600 font-bold text-center text-3xl" id="total-production-${unit}">0</td>
                <td class="border px-4 py-3 font-bold text-center text-3xl" id="total-fail-rate-${unit}">0.00%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="w-full md:w-1/2">
          <div class="w-full h-64 mx-auto">
            <canvas id="chart-${unit}" width="256" height="256"></canvas>
          </div>
        </div>
      </div>
      <table class="w-full border-collapse border">
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

  // Check if we already have real-time data for this unit from websocket
  if (unitDataStore[unit] && unitDataStore[unit].length > 0) {
    updateExistingTables(unit, unitDataStore[unit]);
  } else {
    // If not, fetch initial data from API
    fetchUnitData(unit, startDateTime, endDateTime);
  }
}

async function fetchUnitData(unitName, startDateTime, endDateTime) {
  try {
    let apiUrl = `${API_BASE_URL}/hourly-production?start_date=${startDateTime}&end_date=${endDateTime}&unit_name=${unitName}`;
    let response = await fetch(apiUrl);
    let result = await response.json();
    if (!result.error) {
      // Check if data is in the new format (object with unit names as keys) or old format (array)
      if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
        // New format - multiple units selected
        const unitData = result.data[unitName];
        if (unitData) {
          updateExistingTables(unitName, unitData);
        }
      } else {
        // Old format - single unit
        updateExistingTables(unitName, result.data);
      }
    }
  } catch (error) {
    console.error(`Error fetching data for ${unitName}:`, error);
  }
}

function updateExistingTables(unitName, data) {
  if (!data || !Array.isArray(data)) return;
  console.log(`Updating tables for ${unitName} with data:`, data);
  renderTable(unitName, data);
  renderChart(unitName, data);
}

function renderTable(unitName, data) {
  let tableBody = document.getElementById(`table-${unitName}`);
  if (!tableBody) return;
  tableBody.innerHTML = "";
  let totalSuccess = 0,
    totalFail = 0,
    totalProduction = 0;
  data.forEach((row) => {
    let failRate = row.total > 0 ? ((row.fail / row.total) * 100).toFixed(2) : "0.00";
    tableBody.innerHTML += `
      <tr>
        <td class="border px-4 py-2">${row.hour}:00 - ${row.hour + 1}:00</td>
        <td class="border px-4 py-2 text-green-600 text-center">${row.success}</td>
        <td class="border px-4 py-2 text-red-600 text-center">${row.fail}</td>
        <td class="border px-4 py-2 text-blue-600 text-center">${row.total}</td>
        <td class="border px-4 py-2 text-center">${failRate}%</td>
      </tr>
    `;
    totalSuccess += row.success;
    totalFail += row.fail;
    totalProduction += row.total;
  });
  let overallFailRate = totalProduction > 0 ? ((totalFail / totalProduction) * 100).toFixed(2) : "0.00";
  
  // Update the summary table
  document.getElementById(`total-success-${unitName}`).textContent = totalSuccess;
  document.getElementById(`total-fail-${unitName}`).textContent = totalFail;
  document.getElementById(`total-production-${unitName}`).textContent = totalProduction;
  document.getElementById(`total-fail-rate-${unitName}`).textContent = `${overallFailRate}%`;
  
  // Add the total row to the main table
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

function renderChart(unitName, data) {
  let chartId = `chart-${unitName}`;
  let canvas = document.getElementById(chartId);
  if (!canvas) return;
  let ctx = canvas.getContext("2d");
  let totalSuccess = 0, totalFail = 0;
  data.forEach((row) => {
    totalSuccess += row.success || 0;
    totalFail += row.fail || 0;
  });
  if (!window.charts) window.charts = {};
  if (charts[chartId]) charts[chartId].destroy();
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
        legend: { position: "top" },
        tooltip: { enabled: true },
        datalabels: {
          color: "#000",
          font: { weight: "bold", size: 30 },
          anchor: "end",
          align: "start",
          offset: 10,
          formatter: (value, ctx) => {
            let sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
            let percentage = ((value / sum) * 100).toFixed(1) + "%";
            // return `${value} (${percentage})`;
            return `${percentage}`;
          },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

document.addEventListener("DOMContentLoaded", fetchAndShowResults);

// Fetch and update data every 30 seconds
setInterval(() => {
  const params = getQueryParams();
  const units = params.unit_name || [];
  units.forEach(unit => fetchUnitData(unit, params.start_date[0], params.end_date[0]));
}, 30000);

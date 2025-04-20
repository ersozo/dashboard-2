// results.js: Sadece sonuçları göstermek için
// URL parametrelerinden seçimleri al ve verileri getir

Chart.register(ChartDataLabels);

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
  const units = params.unit || [];
  const start = params.start ? params.start[0] : null;
  const end = params.end ? params.end[0] : null;
  if (!units.length || !start || !end) {
    document.getElementById('grid-container').innerHTML = '<div class="text-red-600">Eksik parametre!</div>';
    return;
  }
  document.getElementById('grid-container').innerHTML = '';
  units.forEach(unit => createUnitCard(unit, start, end));
}

function createUnitCard(unit, startDateTime, endDateTime) {
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
  fetchUnitData(unit, startDateTime, endDateTime);
}

async function fetchUnitData(unitName, startDateTime, endDateTime) {
  let apiUrl = `http://127.0.0.1:8000/hourly-production?start_date=${startDateTime}&end_date=${endDateTime}&unit_name=${unitName}`;
  let response = await fetch(apiUrl);
  let result = await response.json();
  if (!result.error) {
    updateExistingTables(unitName, result.data);
  }
}

function updateExistingTables(unitName, data) {
  if (!data || !Array.isArray(data)) return;
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
          color: "#fff",
          font: { weight: "bold", size: 16 },
          anchor: "end",
          align: "start",
          offset: 10,
          formatter: (value, ctx) => {
            let sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
            let percentage = ((value / sum) * 100).toFixed(1) + "%";
            return `${value} (${percentage})`;
          },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

document.addEventListener("DOMContentLoaded", fetchAndShowResults);

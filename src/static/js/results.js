// Sonuçları göstermek için
// URL parametrelerinden seçimleri al ve verileri getir
import { API_BASE_URL } from "./config.js";
import { timePeriods, setDateTimeForPeriod } from "./app.js"; // Import time periods and setDateTimeForPeriod from app.js
Chart.register(ChartDataLabels);


// WEBSOCKET AÇMA İŞLEMLERİ
let ws;
let charts = {}; // Grafikleri takip etmek için
let unitDataStore = {}; // Tüm üretim verilerini saklayacağız
let currentPeriod = null; // Track the current time period instead of just the hour

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

// Function to update the global current time display
function updateGlobalTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hours}:${minutes}`;

  const globalTimeElement = document.getElementById('global-current-time');
  if (globalTimeElement) {
    globalTimeElement.textContent = currentTime;
  }
}

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

  // Initialize and update the global time
  updateGlobalTime();
  setInterval(updateGlobalTime, 60000); // Update the time every minute
}

function createUnitCard(unit, startDateTime, endDateTime) {
  let container = document.getElementById("grid-container");
  let div = document.createElement("div");
  div.className = "bg-white p-4 rounded-lg shadow-lg";

  // Remove '+' characters from the unit name for display
  const displayUnitName = unit.replace(/\+/g, '');

  div.innerHTML = `
      <div class="mb-6">
        <table class="w-full border-collapse border text-6xl" id="summary-table-${unit}">
          <thead>
            <tr class="bg-red-900 text-center text-white">
              <th class="border px-4 py-2">${displayUnitName.substring(5,7)} ÜRETİM</th>
              <th class="border px-4 py-2">OEE (%)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="border px-4 py-3 text-black font-bold text-center text-9xl bg-yellow-200" id="total-success-${unit}">0</td>
              <td class="border px-4 py-3 font-bold text-center text-9xl bg-green-200" id="total-fail-rate-${unit}">0.0</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4">
        <table class="w-full border-collapse border text-4xl">
          <thead>
            <tr class="bg-gray-300 text-center">
              <th class="border px-4 py-2">Saat</th>
              <th class="border px-4 py-2">Üretim</th>
              <th class="border px-4 py-2">Tamir</th>
              <th class="border px-4 py-2">OEE (%)</th>
            </tr>
          </thead>
          <tbody id="table-${unit}"></tbody>
        </table>
      </div>
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
    let apiUrl = `${API_BASE_URL}/hourly-production/?start_date=${startDateTime}&end_date=${endDateTime}&unit_name=${unitName}`;
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
  // Chart rendering removed as requested
}

function renderTable(unitName, data) {
  let tableBody = document.getElementById(`table-${unitName}`);
  if (!tableBody) return;
  tableBody.innerHTML = "";
  let totalSuccess = 0,
    totalFail = 0,
    totalProduction = 0;
  let totalOEE = 0;
  let dataPointsWithOEE = 0;

  // Sort data by hour in descending order to display newest hours at the top
  const sortedData = [...data].sort((a, b) => b.hour - a.hour);

  console.log(`Data for ${unitName}:`, sortedData);

  sortedData.forEach((row, index) => {
    // Check if the new fields exist in the data
    const hasOEEData = row.hasOwnProperty('oee') && row.hasOwnProperty('quality') && row.hasOwnProperty('performance');
    console.log(`Row ${index} has OEE data: ${hasOEEData}, OEE value: ${hasOEEData ? row.oee : 'N/A'}`);

    let qualityRate = 0;
    if (hasOEEData) {
      qualityRate = row.quality * 100;
      totalOEE += row.oee;
      dataPointsWithOEE++;
    } else {
      // Fallback to the old calculation if oee is not provided
      const successRate = row.success + row.fail > 0 ? row.success / (row.success + row.fail) : 0;
      qualityRate = (successRate * 100).toFixed(1);

      // Also calculate an estimated OEE value in case we need it
      const estimatedOEE = successRate;
      totalOEE += estimatedOEE;
      dataPointsWithOEE++;
    }

    const rowClass = index % 2 === 0 ? "" : "bg-gray-200";
    tableBody.innerHTML += `
      <tr class="${rowClass}">
        <td class="border px-4 py-2 text-center text-5xl font-bold">${String(row.hour).padStart(2, '0')}:00 - ${
      String(row.hour + 1).padStart(2, '0')
    }:00</td>
        <td class="border px-4 py-2 text-black text-center text-5xl font-bold">${
          row.success
        }</td>
        <td class="border px-4 py-2 text-red-800 text-center text-5xl font-bold">${
          row.fail
        }</td>
        <td class="border px-4 py-2 text-center text-5xl font-bold">${hasOEEData ? qualityRate.toFixed(1) : qualityRate}</td>
      </tr>
    `;
    totalSuccess += row.success;
    totalFail += row.fail;
    totalProduction += row.total;
  });

  // Calculate average OEE across all hourly data points
  let avgOEE = 0;
  if (dataPointsWithOEE > 0) {
    avgOEE = (totalOEE / dataPointsWithOEE) * 100;
  } else if (totalSuccess + totalFail > 0) {
    // If no OEE data, calculate a simple estimate based on success rate
    avgOEE = (totalSuccess / (totalSuccess + totalFail)) * 100;
  }

  console.log(`${unitName} - Total OEE: ${totalOEE}, Data points: ${dataPointsWithOEE}, Avg OEE: ${avgOEE}`);

  // Update the summary table with OEE instead of FPR
  document.getElementById(`total-success-${unitName}`).textContent = totalSuccess;

  // Update the header to show OEE instead of FPR
  // Escape '+' character for CSS selector
  const safeUnitName = unitName.replace(/\+/g, '\\+');
  const headerElement = document.querySelector(`#summary-table-${safeUnitName} thead tr th:nth-child(2)`);
  if (headerElement) {
    headerElement.textContent = "OEE (%)";
  }

  // Display OEE value in the summary table
  document.getElementById(`total-fail-rate-${unitName}`).textContent = avgOEE.toFixed(1);
}

function checkForNewTimePeriod() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeDecimal = currentHour + currentMinute / 60;

  // Detect which time period we're in now
  let newPeriod = null;
  for (const [period, timeRange] of Object.entries(timePeriods)) {
    const startHour = parseInt(timeRange.start.split(":")[0]);
    const startMinute = parseInt(timeRange.start.split(":")[1]);
    const endHour = parseInt(timeRange.end.split(":")[0]);
    const endMinute = parseInt(timeRange.end.split(":")[1]);

    const startTimeDecimal = startHour + startMinute / 60;
    const endTimeDecimal = endHour + endMinute / 60;

    if (timeRange.overnight) {
      // For overnight periods (ending next day)
      if (currentTimeDecimal >= startTimeDecimal || currentTimeDecimal <= endTimeDecimal) {
        newPeriod = period;
        break;
      }
    } else {
      // For same-day periods
      if (currentTimeDecimal >= startTimeDecimal && currentTimeDecimal < endTimeDecimal) {
        newPeriod = period;
        break;
      }
    }
  }

  // If period has changed or it's the first check (currentPeriod is null), refresh data
  if (newPeriod !== currentPeriod) {
    console.log(`⏰ New time period detected: ${currentPeriod || 'none'} -> ${newPeriod}. Refreshing data...`);
    currentPeriod = newPeriod;

    // Get the current parameters and fetch fresh data for all units
    const params = getQueryParams();
    const units = params.unit_name || [];

    if (units.length && newPeriod && timePeriods[newPeriod]) {
      // Use the imported helper function to get start and end dates
      const { start: adjustedStart, end: adjustedEnd } = setDateTimeForPeriod(newPeriod);

      // Fetch fresh data for all units with adjusted time period
      units.forEach(unit => fetchUnitData(unit, adjustedStart, adjustedEnd));

      // Update the URL parameters to reflect the new time period
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('start_date', adjustedStart);
      newUrl.searchParams.set('end_date', adjustedEnd);
      window.history.replaceState({}, '', newUrl.toString());
    } else if (units.length) {
      // If no specific period is detected, maintain current date parameters
      const start = params.start_date ? params.start_date[0] : null;
      const end = params.end_date ? params.end_date[0] : null;

      if (start && end) {
        units.forEach(unit => fetchUnitData(unit, start, end));
      }
    }
  }
}

// Run the time period check every minute
setInterval(checkForNewTimePeriod, 60000);

document.addEventListener("DOMContentLoaded", () => {
  fetchAndShowResults();
  // Initial time period check
  checkForNewTimePeriod();
});

// Fetch and update data every 30 seconds
setInterval(() => {
  const params = getQueryParams();
  const units = params.unit_name || [];
  units.forEach(unit => fetchUnitData(unit, params.start_date[0], params.end_date[0]));
}, 30000);

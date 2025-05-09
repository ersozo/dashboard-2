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
        <table class="w-full border-collapse border text-3xl">
          <thead>
            <tr class="bg-gray-300 text-center">
              <th class="border px-4 py-2">Saat</th>
              <th class="border px-4 py-2">Üretim</th>
              <th class="border px-4 py-2">Tamir</th>
              <th class="border px-4 py-2">Kalite</th>
              <th class="border px-4 py-2">Performans</th>
              <th class="border px-4 py-2">OEE</th>

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
    console.log(`[DEBUG] Fetching data from URL: ${apiUrl}`);
    let response = await fetch(apiUrl);
    let result = await response.json();
    console.log(`[DEBUG] Raw API response:`, JSON.stringify(result, null, 2));

    if (!result.error) {
      // Check if data is in the new format (object with unit names as keys) or old format (array)
      if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
        // New format - multiple units selected
        const unitData = result.data[unitName];
        if (unitData) {
          // Detailed inspection of the data - checking every entry for performance and OEE
          unitData.forEach((entry, index) => {
            console.log(`[DEBUG DETAIL] Unit ${unitName}, Hour ${entry.hour} data:`, {
              performance: entry.performance,
              quality: entry.quality,
              oee: entry.oee,
              type: {
                performance: typeof entry.performance,
                quality: typeof entry.quality,
                oee: typeof entry.oee
              },
              isNull: {
                performance: entry.performance === null,
                quality: entry.quality === null,
                oee: entry.oee === null
              }
            });
          });

          // Check if any items have performance and OEE data
          const hasPerformanceData = unitData.some(item =>
            item.hasOwnProperty('performance') && item.performance !== null && item.performance !== undefined);
          const hasOEEData = unitData.some(item =>
            item.hasOwnProperty('oee') && item.oee !== null && item.oee !== undefined);

          console.log(`[API CHECK] Unit ${unitName} - Contains performance data: ${hasPerformanceData}, OEE data: ${hasOEEData}`);

          updateExistingTables(unitName, unitData);
        }
      } else if (Array.isArray(result.data)) {
        // Old format - single unit
        // Detailed inspection of the data
        result.data.forEach((entry, index) => {
          console.log(`[DEBUG DETAIL] Unit ${unitName}, Hour ${entry.hour} data:`, {
            performance: entry.performance,
            quality: entry.quality,
            oee: entry.oee,
            type: {
              performance: typeof entry.performance,
              quality: typeof entry.quality,
              oee: typeof entry.oee
            },
            isNull: {
              performance: entry.performance === null,
              quality: entry.quality === null,
              oee: entry.oee === null
            }
          });
        });

        // Check if any items have performance and OEE data
        const hasPerformanceData = result.data.some(item =>
          item.hasOwnProperty('performance') && item.performance !== null && item.performance !== undefined);
        const hasOEEData = result.data.some(item =>
          item.hasOwnProperty('oee') && item.oee !== null && item.oee !== undefined);

        console.log(`[API CHECK] Unit ${unitName} - Contains performance data: ${hasPerformanceData}, OEE data: ${hasOEEData}`);

        updateExistingTables(unitName, result.data);
      } else {
        console.error(`[API ERROR] Unexpected data format:`, result.data);
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

  // Get current hour to exclude from overall OEE calculation
  const currentHour = new Date().getHours();

  // Sort data by hour in descending order to display newest hours at the top
  const sortedData = [...data].sort((a, b) => b.hour - a.hour);

  // Enhanced logging to check data format and presence of key metrics
  console.log(`Data for ${unitName}:`, sortedData);

  // Check if performance and OEE fields exist in the data
  const hasAnyPerformanceData = sortedData.some(row =>
    row.hasOwnProperty('performance') && row.performance !== null);
  const hasAnyOEEData = sortedData.some(row =>
    row.hasOwnProperty('oee') && row.oee !== null);

  console.log(`[TABLE DEBUG] ${unitName} - Performance data present: ${hasAnyPerformanceData}, OEE data present: ${hasAnyOEEData}`);
  if (!hasAnyPerformanceData || !hasAnyOEEData) {
    console.log('[TABLE DEBUG] Data structure for first row:', sortedData.length > 0 ? Object.keys(sortedData[0]) : 'No data');
    console.log('[TABLE DEBUG] Example data for first few rows:', sortedData.slice(0, 2));
  }

  sortedData.forEach((row, index) => {
    // Check if the new fields exist in the data AND have numeric values (not null or undefined)
    const hasQualityProp = row.hasOwnProperty('quality') && row.quality !== null && row.quality !== undefined;
    const hasPerformanceProp = row.hasOwnProperty('performance') && row.performance !== null && row.performance !== undefined;
    const hasOEEProp = row.hasOwnProperty('oee') && row.oee !== null && row.oee !== undefined;

    // Log detailed info about what fields are present for debugging
    console.log(`[ROW DEBUG] Hour ${row.hour} - ` +
      `Has properties: oee=${hasOEEProp}, ` +
      `quality=${hasQualityProp}, ` +
      `performance=${hasPerformanceProp}. ` +
      `Values: oee=${row.oee}, quality=${row.quality}, performance=${row.performance}` +
      `. Using fallback: ${!hasOEEProp || !hasQualityProp || !hasPerformanceProp}`
    );

    // For each metric, we'll show it if it exists and has a value
    // This way we respect the backend's calculation, which excludes models without targets

    // Calculate quality value
    let quality = 0;
    if (hasQualityProp) {
      // Use the quality value provided by the backend
      quality = row.quality * 100;
    } else {
      // Calculate quality if not provided
      quality = row.success + row.fail > 0 ? (row.success / (row.success + row.fail)) * 100 : 0;
    }

    // Get performance value if available or calculate using fallback
    let performance;
    if (hasPerformanceProp) {
      performance = row.performance * 100;
    } else {
      // Fallback calculation: performance = total / 150 (assuming 150/hour ideal)
      // This aligns with the frontend fallback described in the stored memory
      const totalProduced = row.success + row.fail;
      performance = totalProduced > 0 ? (totalProduced / 150) * 100 : 0;
    }

    // Get OEE value if available or calculate using fallback
    let oee;
    if (hasOEEProp) {
      oee = row.oee * 100;
    } else {
      // Fallback calculation: OEE = Quality × Performance
      oee = (quality / 100) * (performance / 100) * 100;
    }

    // Track OEE data for average calculation - excluding current hour
    // Only include completed time periods in the overall OEE calculation
    if (row.hour !== currentHour) {
      totalOEE += hasOEEProp ? row.oee : oee/100; // Convert our calculated percentage back to decimal
      dataPointsWithOEE++;
    }

    const rowClass = index % 2 === 0 ? "" : "bg-gray-200";
    tableBody.innerHTML += `
      <tr class="${rowClass}">
        <td class="border px-4 py-2 text-center text-2xl font-bold">${String(row.hour).padStart(2, '0')}-${
      String(row.hour + 1).padStart(2, '0')
    }</td>
        <td class="border px-4 py-2 text-black text-center text-5xl font-bold">${
          row.success
        }</td>
        <td class="border px-4 py-2 text-red-800 text-center text-5xl font-bold">${
          row.fail
        }</td>
        <td class="border px-4 py-2 text-center text-5xl font-bold">${quality.toFixed(1)}</td>
        <td class="border px-4 py-2 text-center text-5xl font-bold">${performance.toFixed(1)}</td>
        <td class="border px-4 py-2 text-center text-5xl font-bold">${oee.toFixed(1)}</td>

      </tr>
    `;
    totalSuccess += row.success;
    totalFail += row.fail;
    totalProduction += row.total;
  });

  // Calculate overall quality, performance and OEE
  let overallQuality = 0;
  let overallPerformance = null;
  let avgOEE = null;

  // Calculate overall quality (success rate)
  if (totalSuccess + totalFail > 0) {
    overallQuality = (totalSuccess / (totalSuccess + totalFail)) * 100;
  }

  // Only use OEE data from backend, no fallback calculations
  if (dataPointsWithOEE > 0) {
    avgOEE = (totalOEE / dataPointsWithOEE) * 100;

    // We don't need to calculate implied performance here as we want to rely only on backend values
    // Models without targets shouldn't be included in performance calculations
  }

  // Log available metrics
  console.log(`${unitName} - Quality: ${overallQuality.toFixed(1)}%, ` +
    `Performance: ${overallPerformance !== null ? overallPerformance.toFixed(1) + '%' : 'N/A'}, ` +
    `OEE: ${avgOEE !== null ? avgOEE.toFixed(1) + '%' : 'N/A'}`);

  // Update the summary table with production count
  document.getElementById(`total-success-${unitName}`).textContent = totalSuccess;

  // Update the header to show OEE instead of FPR
  // Escape '+' character for CSS selector
  const safeUnitName = unitName.replace(/\+/g, '\\+');
  const headerElement = document.querySelector(`#summary-table-${safeUnitName} thead tr th:nth-child(2)`);
  if (headerElement) {
    headerElement.textContent = "OEE (%)";
  }

  // Display OEE value in the summary table
  // Now we should always have an OEE value thanks to fallback calculations
  document.getElementById(`total-fail-rate-${unitName}`).textContent = avgOEE.toFixed(1);
}

function checkForNewTimePeriod() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeDecimal = currentHour + currentMinute / 60;

  // Get the current URL parameters
  const params = getQueryParams();
  const units = params.unit_name || [];
  const explicitStartDate = params.start_date ? params.start_date[0] : null;
  const explicitEndDate = params.end_date ? params.end_date[0] : null;

  // Check if the user explicitly selected a time period by examining the URL parameters
  const hasExplicitTimePeriod = explicitStartDate && explicitEndDate;

  // If the user has explicitly set a time period, respect their choice and don't auto-update
  if (hasExplicitTimePeriod) {
    // Only run the first time to set currentPeriod
    if (currentPeriod === null) {
      // Still detect which period we're in for reference
      for (const [period, timeRange] of Object.entries(timePeriods)) {
        // Check if the explicit dates match this time period
        const { start, end } = setDateTimeForPeriod(period);
        if (explicitStartDate === start && explicitEndDate === end) {
          console.log(`Found matching time period for explicit selection: ${period}`);
          currentPeriod = period;
          break;
        }
      }
    }
    return;
  }

  // Only proceed with auto-detection if no explicit time period was set
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

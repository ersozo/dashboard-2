// ÜRETİM HATLARI SEÇİMİ CHECKBOX'LARINI DOLDUR
async function populateUnitCheckboxes() {
  let checkboxContainer = document.getElementById("unit-checkboxes");
  checkboxContainer.innerHTML = "";
  
  try {
    let response = await fetch("http://127.0.0.1:8000/unit-names");
    let result = await response.json();

    if (result.unit_names && result.unit_names.length > 0) {
      result.unit_names.sort().forEach((unit) => {
        // Create a wrapper div for each checkbox
        let wrapper = document.createElement("div");
        wrapper.className = "flex items-center";

        // Create the checkbox input
        let checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `unit-${unit}`;
        checkbox.value = unit;
        checkbox.className = "unit-checkbox mr-2";

        // Create the label
        let label = document.createElement("label");
        label.htmlFor = `unit-${unit}`;
        // Remove '+' characters from display text
        label.textContent = unit.replace(/\+/g, '');
        label.className = "text-sm";

        // Add elements to the DOM
        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        checkboxContainer.appendChild(wrapper);
      });
    } else {
      checkboxContainer.innerHTML = "<p>Üretim hattı bulunamadı.</p>";
    }
  } catch (error) {
    console.error("Üretim hatları yüklenirken hata:", error);
    checkboxContainer.innerHTML = "<p class='text-red-500'>Üretim hatları yüklenirken bir hata oluştu.</p>";
  }
}

// TARİH/ZAMAN SEÇİMİ

document.addEventListener("DOMContentLoaded", function () {
  populateUnitCheckboxes();
  console.log("DOM yüklendi");

  // Zaman dilimi checkboxları
  const timePeriods = {
    "08:00-16:00": { start: "08:00", end: "16:00" },
    "16:00-24:00": { start: "16:00", end: "00:00", overnight: true },
    "24:00-08:00": { start: "00:00", end: "08:00", overnight: true },
    "08:00-20:00": { start: "08:00", end: "20:00" },
    "20:00-08:00": { start: "20:00", end: "08:00", overnight: true }
  };

  function setDateTimeForPeriod(period) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    let start, end;
    if (timePeriods[period].overnight) {
      // Overnight period: end time is next day
      start = `${todayStr}T${timePeriods[period].start}`;
      let endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 1); // Always set to next day for overnight periods
      const endDayStr = endDate.toISOString().slice(0, 10);
      end = `${endDayStr}T${timePeriods[period].end}`;
    } else {
      start = `${todayStr}T${timePeriods[period].start}`;
      end = `${todayStr}T${timePeriods[period].end}`;
    }
    return { start, end };
  }

  const timePeriodCheckboxes = document.querySelectorAll('.time-period-checkbox');
  timePeriodCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function () {
      // If checked, set the date fields to this period (if multiple checked, use the last one checked)
      if (checkbox.checked) {
        const period = checkbox.value;
        const { start, end } = setDateTimeForPeriod(period);
        document.getElementById("start-datetime").value = start;
        document.getElementById("end-datetime").value = end;
        // Uncheck all other checkboxes to enforce single selection
        timePeriodCheckboxes.forEach(cb => { if (cb !== checkbox) cb.checked = false; });
      } else {
        // If unchecked, clear the date fields only if no other period is selected
        const anyChecked = Array.from(timePeriodCheckboxes).some(cb => cb.checked);
        if (!anyChecked) {
          document.getElementById("start-datetime").value = "";
          document.getElementById("end-datetime").value = "";
        }
      }
    });
  });

  // Sonuçları göster butonu
  document.getElementById("fetch-data-btn").addEventListener("click", function () {
    let startDatetime = document.getElementById("start-datetime").value;
    let endDatetime = document.getElementById("end-datetime").value;
    
    // Get all selected checkboxes
    let checkboxes = document.querySelectorAll('.unit-checkbox:checked');
    let selected = Array.from(checkboxes).map(cb => cb.value);

    if (!startDatetime || !endDatetime) {
      alert("Lütfen başlangıç ve bitiş tarihlerini seçin!");
      return;
    }
    
    let params = new URLSearchParams();
    params.append("start_date", startDatetime);
    params.append("end_date", endDatetime);
    selected.forEach((unit) => params.append("unit_name", unit));
    window.location.href = `/results?${params.toString()}`;
  });
  
  // Tümünü seç butonu
  document.getElementById("select-all-btn").addEventListener("click", function () {
    let checkboxes = document.querySelectorAll('.unit-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
  });
  
  // Seçimi temizle butonu
  document.getElementById("clear-selection-btn").addEventListener("click", function () {
    let checkboxes = document.querySelectorAll('.unit-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
  });
});

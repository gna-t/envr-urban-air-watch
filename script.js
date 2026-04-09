// Default locations used when the page first loads.
const defaultLocation = {
  city: "Houston",
  state: "Texas",
  county: "Harris",
  latitude: 29.7604,
  longitude: -95.3698
};

const defaultComparisonLocation = {
  city: "Dallas",
  state: "Texas",
  county: "Dallas",
  latitude: 32.7767,
  longitude: -96.797
};

const dashboardPanel = document.querySelector(".dashboard-panel");
const comparisonPanel = document.querySelector(".comparison-panel");
const chartPanel = document.querySelector(".chart-panel");

const citySearchForm = document.getElementById("city-search-form");
const cityInput = document.getElementById("city-input");
const searchButton = document.getElementById("search-button");
const searchResults = document.getElementById("search-results");

const compareSearchForm = document.getElementById("compare-search-form");
const compareCityInput = document.getElementById("compare-city-input");
const compareSearchButton = document.getElementById("compare-search-button");
const compareSearchResults = document.getElementById("compare-search-results");

const selectedLocation = document.getElementById("selected-location");
const statusMessage = document.getElementById("status-message");
const aqiCard = document.getElementById("aqi-card");
const aqiValue = document.getElementById("aqi-value");
const aqiLabel = document.getElementById("aqi-label");
const pm25Value = document.getElementById("pm25-value");
const pm10Value = document.getElementById("pm10-value");
const ozoneValue = document.getElementById("ozone-value");
const pm25EpaStatus = document.getElementById("pm25-epa-status");
const pm25Hint = document.getElementById("pm25-hint");
const ozoneHint = document.getElementById("ozone-hint");
const updatedValue = document.getElementById("updated-value");
const updatedCityLabel = document.getElementById("updated-city-label");
const healthTitle = document.getElementById("health-title");
const healthMessage = document.getElementById("health-message");
const trendTitle = document.getElementById("trend-title");
const trendMessage = document.getElementById("trend-message");
const timePatternTitle = document.getElementById("time-pattern-title");
const timePatternMessage = document.getElementById("time-pattern-message");
const anomalyTitle = document.getElementById("anomaly-title");
const anomalyMessage = document.getElementById("anomaly-message");
const chartCanvas = document.getElementById("air-quality-chart");

const mainComparisonCity = document.getElementById("main-comparison-city");
const mainComparisonAqi = document.getElementById("main-comparison-aqi");
const mainComparisonPm25 = document.getElementById("main-comparison-pm25");
const comparisonCityName = document.getElementById("comparison-city-name");
const comparisonCityAqi = document.getElementById("comparison-city-aqi");
const comparisonCityPm25 = document.getElementById("comparison-city-pm25");
const comparisonAqiDifference = document.getElementById("comparison-aqi-difference");
const comparisonPm25Difference = document.getElementById("comparison-pm25-difference");

let airQualityChart;
let mainSearchDebounceId;
let compareSearchDebounceId;
let latestMainSearchToken = 0;
let latestCompareSearchToken = 0;
let pendingMainMatches = [];
let pendingCompareMatches = [];
let mainCityState = null;
let comparisonCityState = null;

// Build the geocoding URL for a city search inside the United States.
function createGeocodingUrl(cityName) {
  const params = new URLSearchParams({
    name: cityName,
    count: "8",
    language: "en",
    format: "json",
    countryCode: "US"
  });

  return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

// Build the air quality URL from coordinates.
function createAirQualityUrl(location) {
  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    current: "us_aqi,pm2_5,pm10,ozone",
    hourly: "pm2_5,us_aqi,ozone",
    timezone: "auto",
    forecast_hours: "24"
  });

  return `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`;
}

// Turn a city and state into a consistent display label.
function getLocationLabel(location) {
  return `${location.city}, ${location.state}`;
}

// Build a secondary label for search suggestions.
function getLocationDetail(location) {
  return `${location.state}${location.county ? `, ${location.county} County` : ""}`;
}

// Format numeric values so the dashboard stays easy to scan.
function formatValue(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }

  return Number(value).toFixed(digits);
}

// Convert API timestamps into friendly local strings.
function formatLocalDateTime(dateTimeString) {
  const [datePart, timePart] = dateTimeString.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute);

  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatLocalTime(dateTimeString) {
  const [datePart, timePart] = dateTimeString.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

// Convert the API hour string into a short chart label.
function formatHourLabel(dateTimeString) {
  const hourValue = Number(dateTimeString.split("T")[1].split(":")[0]);
  const period = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;

  return `${hour} ${period}`;
}

// Turn a signed difference into readable comparison text.
function describeDifference(value, unit, label, mainLocationName, comparisonLocationName) {
  if (value === 0) {
    return `${mainLocationName} ${label} is the same as ${comparisonLocationName} right now.`;
  }

  const direction = value > 0 ? "higher" : "lower";
  const amount = Math.abs(value).toFixed(unit === "AQI points" ? 0 : 1);

  return `${mainLocationName} ${label} is ${amount} ${unit} ${direction} than ${comparisonLocationName}.`;
}

// Map AQI values to the requested color ranges.
function getAqiCategory(aqi) {
  if (aqi <= 50) {
    return { label: "Good", className: "aqi-good" };
  }

  if (aqi <= 100) {
    return { label: "Moderate", className: "aqi-moderate" };
  }

  if (aqi <= 150) {
    return { label: "Unhealthy for Sensitive Groups", className: "aqi-sensitive" };
  }

  return { label: "Unhealthy", className: "aqi-unhealthy" };
}

// Translate AQI into a simple health message.
function getHealthInterpretation(aqi) {
  if (aqi <= 50) {
    return "Air quality is good. Safe for outdoor activities.";
  }

  if (aqi <= 100) {
    return "Air quality is moderate. Sensitive individuals should take caution.";
  }

  if (aqi <= 150) {
    return "Unhealthy for sensitive groups. Limit prolonged outdoor exposure.";
  }

  return "Unhealthy. Everyone should reduce outdoor activity.";
}

// Compare the near-term forecast with the later part of the 24-hour window.
function getTrendMessage(hourlyPm25) {
  const firstWindow = hourlyPm25.slice(0, 3);
  const lastWindow = hourlyPm25.slice(-3);

  if (firstWindow.length < 3 || lastWindow.length < 3) {
    return "Not enough forecast data is available to estimate a short-term trend.";
  }

  const firstAverage = firstWindow.reduce((sum, value) => sum + value, 0) / firstWindow.length;
  const lastAverage = lastWindow.reduce((sum, value) => sum + value, 0) / lastWindow.length;
  const difference = lastAverage - firstAverage;

  if (difference <= -1) {
    return "Air quality is improving over the next few hours.";
  }

  if (difference >= 1) {
    return "Air quality is worsening.";
  }

  return "Air quality is stable.";
}

// Compare current PM2.5 with the EPA annual guideline.
function getPm25EpaStatus(pm25) {
  if (pm25 > 12) {
    return "Above EPA guideline";
  }

  return "Within EPA guideline";
}

// Add a simple pollutant source hint for PM2.5.
function getPm25Hint(pm25) {
  if (pm25 >= 12) {
    return "Likely from combustion sources such as traffic or wildfire smoke.";
  }

  return "Particle pollution is relatively low compared with the EPA annual guideline.";
}

// Add a simple pollutant source hint for ozone.
function getOzoneHint(ozone) {
  if (ozone >= 100) {
    return "Likely driven by sunlight and atmospheric reactions.";
  }

  return "Ozone is present, but a strong sunlight-driven buildup is not obvious right now.";
}

// Infer a likely time-of-day pattern from the forecast curve.
function getTimePatternInsight(hourlyPm25, hourlyOzone) {
  const morningPm25 = hourlyPm25.slice(0, 6);
  const afternoonOzone = hourlyOzone.slice(10, 16);

  if (morningPm25.length === 0 || afternoonOzone.length === 0) {
    return "Time-of-day insight is limited because forecast coverage is incomplete.";
  }

  const maxMorningPm25 = Math.max(...morningPm25);
  const maxAfternoonOzone = Math.max(...afternoonOzone);

  if (maxAfternoonOzone >= 100) {
    return "Afternoon ozone peaks are expected due to sunlight and atmospheric chemistry.";
  }

  if (maxMorningPm25 >= 12) {
    return "Morning pollution may be influenced by traffic emissions and other combustion sources.";
  }

  return "No strong daily pollution pattern stands out in the current forecast window.";
}

// Flag an unusual current spike if conditions are much higher than nearby forecast hours.
function getAnomalyMessage(currentPm25, currentAqi, hourlyPm25, hourlyAqi) {
  const nearbyPm25 = hourlyPm25.slice(1, 4);
  const nearbyAqi = hourlyAqi.slice(1, 4);

  if (nearbyPm25.length === 0 || nearbyAqi.length === 0) {
    return "Not enough nearby forecast values are available to check for spikes.";
  }

  const pm25Average = nearbyPm25.reduce((sum, value) => sum + value, 0) / nearbyPm25.length;
  const aqiAverage = nearbyAqi.reduce((sum, value) => sum + value, 0) / nearbyAqi.length;

  if (currentPm25 >= pm25Average + 5 || currentAqi >= aqiAverage + 20) {
    return "Unusual spike detected compared with nearby forecast values.";
  }

  return "Current values are close to nearby forecast levels.";
}

// Show loading feedback while requests are in progress.
function setLoadingState(target, isLoading, message = "") {
  if (target === "main") {
    dashboardPanel.classList.toggle("is-loading", isLoading);
    chartPanel.classList.toggle("is-loading", isLoading);
    searchButton.disabled = isLoading;

    if (message) {
      statusMessage.classList.remove("error");
      statusMessage.textContent = message;
    }

    return;
  }

  comparisonPanel.classList.toggle("is-loading", isLoading);
  compareSearchButton.disabled = isLoading;
}

// Hide the main search suggestion menu.
function clearMainSearchResults() {
  pendingMainMatches = [];
  searchResults.innerHTML = "";
  searchResults.classList.remove("is-visible");
}

// Hide the comparison search suggestion menu.
function clearCompareSearchResults() {
  pendingCompareMatches = [];
  compareSearchResults.innerHTML = "";
  compareSearchResults.classList.remove("is-visible");
}

// Render suggestion buttons for either search box.
function renderSearchResults(matches, target) {
  const container = target === "main" ? searchResults : compareSearchResults;

  if (target === "main") {
    pendingMainMatches = matches;
  } else {
    pendingCompareMatches = matches;
  }

  container.innerHTML = "";

  matches.forEach((location, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-option";
    button.setAttribute("role", "option");
    button.dataset.index = String(index);
    button.innerHTML = `
      <strong>${getLocationLabel(location)}</strong>
      <span>${getLocationDetail(location)}</span>
    `;
    container.appendChild(button);
  });

  container.classList.add("is-visible");
}

// Look up coordinates for a U.S. city using Open Meteo geocoding.
async function getCoordinates(cityName) {
  const response = await fetch(createGeocodingUrl(cityName));

  if (!response.ok) {
    throw new Error("The city search service could not be reached.");
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error("City not found. Try a different U.S. city name.");
  }

  return data.results.map((result) => ({
    city: result.name,
    state: result.admin1 || "Unknown State",
    county: result.admin2 || "",
    latitude: result.latitude,
    longitude: result.longitude
  }));
}

// Fetch air quality data for any location.
async function getAirQualityData(location) {
  const response = await fetch(createAirQualityUrl(location));

  if (!response.ok) {
    throw new Error("The air quality service could not be reached.");
  }

  const data = await response.json();

  if (!data.current || !data.hourly) {
    throw new Error("The API returned incomplete air quality data.");
  }

  if (!data.hourly.ozone) {
    data.hourly.ozone = new Array(data.hourly.time.length).fill(data.current.ozone);
  }

  return data;
}

// Update the main dashboard values and analysis cards.
function updateMainDashboard(data, location) {
  const current = data.current;
  const aqi = Math.round(current.us_aqi);
  const category = getAqiCategory(aqi);
  const locationLabel = getLocationLabel(location);

  aqiCard.classList.remove("aqi-good", "aqi-moderate", "aqi-sensitive", "aqi-unhealthy");
  aqiCard.classList.add(category.className);

  selectedLocation.textContent = locationLabel;
  aqiValue.textContent = aqi;
  aqiLabel.textContent = `${category.label} in ${locationLabel}`;
  pm25Value.textContent = `${formatValue(current.pm2_5)} ug/m3`;
  pm10Value.textContent = `${formatValue(current.pm10)} ug/m3`;
  ozoneValue.textContent = `${formatValue(current.ozone)} ug/m3`;
  pm25EpaStatus.textContent = `${getPm25EpaStatus(current.pm2_5)} | EPA annual standard for PM2.5 is 12 ug per m3`;
  pm25Hint.textContent = getPm25Hint(current.pm2_5);
  ozoneHint.textContent = getOzoneHint(current.ozone);
  updatedValue.textContent = formatLocalDateTime(current.time);
  updatedCityLabel.textContent = `Local time for ${locationLabel}: ${formatLocalTime(current.time)}`;

  healthTitle.textContent = `${category.label} Conditions`;
  healthMessage.textContent = getHealthInterpretation(aqi);
  trendTitle.textContent = "Short-Term Direction";
  trendMessage.textContent = getTrendMessage(data.hourly.pm2_5);
  timePatternTitle.textContent = "Daily Pattern";
  timePatternMessage.textContent = getTimePatternInsight(data.hourly.pm2_5, data.hourly.ozone);
  anomalyTitle.textContent = "Current Spike Check";
  anomalyMessage.textContent = getAnomalyMessage(current.pm2_5, aqi, data.hourly.pm2_5, data.hourly.us_aqi);

  statusMessage.classList.remove("error");
  statusMessage.textContent = `Showing live conditions and forecast data for ${locationLabel}.`;
}

// Update the comparison summary cards.
function updateComparisonCards() {
  if (!mainCityState) {
    return;
  }

  const mainCurrent = mainCityState.data.current;
  const mainLabel = getLocationLabel(mainCityState.location);

  mainComparisonCity.textContent = mainLabel;
  mainComparisonAqi.textContent = Math.round(mainCurrent.us_aqi);
  mainComparisonPm25.textContent = `${formatValue(mainCurrent.pm2_5)} ug/m3`;

  if (!comparisonCityState) {
    comparisonCityName.textContent = "Search for a city";
    comparisonCityAqi.textContent = "--";
    comparisonCityPm25.textContent = "--";
    comparisonAqiDifference.textContent = "Search for a second city to compare current AQI.";
    comparisonPm25Difference.textContent = "Search for a second city to compare particle pollution.";
    return;
  }

  const comparisonCurrent = comparisonCityState.data.current;
  const comparisonLabel = getLocationLabel(comparisonCityState.location);
  const aqiDifference = Math.round(mainCurrent.us_aqi) - Math.round(comparisonCurrent.us_aqi);
  const pm25Difference = Number(mainCurrent.pm2_5) - Number(comparisonCurrent.pm2_5);

  comparisonCityName.textContent = comparisonLabel;
  comparisonCityAqi.textContent = Math.round(comparisonCurrent.us_aqi);
  comparisonCityPm25.textContent = `${formatValue(comparisonCurrent.pm2_5)} ug/m3`;
  comparisonAqiDifference.textContent = describeDifference(aqiDifference, "AQI points", "AQI", mainLabel, comparisonLabel);
  comparisonPm25Difference.textContent = describeDifference(pm25Difference, "ug/m3", "PM2.5", mainLabel, comparisonLabel);
}

// Draw the 24 hour PM2.5 chart for the selected main city.
function renderChart(data, location) {
  const labels = data.hourly.time.map((time) => formatHourLabel(time));
  const pm25Values = data.hourly.pm2_5;

  if (airQualityChart) {
    airQualityChart.destroy();
  }

  airQualityChart = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${getLocationLabel(location)} PM2.5 Forecast`,
          data: pm25Values,
          borderColor: "#56d39b",
          backgroundColor: "rgba(86, 211, 155, 0.15)",
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 4,
          borderWidth: 2.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: "#e8eef9"
          }
        },
        tooltip: {
          displayColors: false
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Hour",
            color: "#a7b4cc"
          },
          ticks: {
            color: "#a7b4cc"
          },
          grid: {
            color: "rgba(255, 255, 255, 0.05)"
          }
        },
        y: {
          title: {
            display: true,
            text: "PM2.5 (ug/m3)",
            color: "#a7b4cc"
          },
          ticks: {
            color: "#a7b4cc"
          },
          grid: {
            color: "rgba(255, 255, 255, 0.05)"
          }
        }
      }
    }
  });
}

// Reset the main dashboard if something fails.
function showMainError(message) {
  clearMainSearchResults();
  statusMessage.classList.add("error");
  statusMessage.textContent = message;
  aqiCard.classList.remove("aqi-good", "aqi-moderate", "aqi-sensitive", "aqi-unhealthy");
  aqiValue.textContent = "--";
  aqiLabel.textContent = "Unable to load AQI";
  pm25Value.textContent = "--";
  pm10Value.textContent = "--";
  ozoneValue.textContent = "--";
  pm25EpaStatus.textContent = "EPA guideline status unavailable";
  pm25Hint.textContent = "Source interpretation unavailable.";
  ozoneHint.textContent = "Source interpretation unavailable.";
  updatedValue.textContent = "--";
  updatedCityLabel.textContent = "Local time unavailable";
  healthTitle.textContent = "Current Guidance";
  healthMessage.textContent = "Health guidance could not be loaded.";
  trendTitle.textContent = "Short-Term Direction";
  trendMessage.textContent = "Trend analysis could not be calculated.";
  timePatternTitle.textContent = "Daily Pattern";
  timePatternMessage.textContent = "Time-of-day interpretation could not be calculated.";
  anomalyTitle.textContent = "Current Spike Check";
  anomalyMessage.textContent = "Spike detection could not be calculated.";

  if (airQualityChart) {
    airQualityChart.destroy();
    airQualityChart = null;
  }
}

// Reset only the comparison panel if its search fails.
function showComparisonError(message) {
  clearCompareSearchResults();
  comparisonCityName.textContent = "City not available";
  comparisonCityAqi.textContent = "--";
  comparisonCityPm25.textContent = "--";
  comparisonAqiDifference.textContent = message;
  comparisonPm25Difference.textContent = "Try another city to update the side-by-side comparison.";
}

// Load data for the main city dashboard and chart.
async function loadMainCity(location) {
  clearMainSearchResults();
  const data = await getAirQualityData(location);
  mainCityState = { location, data };
  updateMainDashboard(data, location);
  renderChart(data, location);
  updateComparisonCards();
}

// Load data for the comparison city panel.
async function loadComparisonCity(location) {
  clearCompareSearchResults();
  const data = await getAirQualityData(location);
  comparisonCityState = { location, data };
  updateComparisonCards();
}

// Search for matches while typing in either input.
async function fetchSearchMatches(cityName, target) {
  const trimmedCityName = cityName.trim();
  const searchToken = target === "main" ? ++latestMainSearchToken : ++latestCompareSearchToken;

  if (trimmedCityName.length < 2) {
    if (target === "main") {
      clearMainSearchResults();
    } else {
      clearCompareSearchResults();
    }
    return;
  }

  try {
    const matches = await getCoordinates(trimmedCityName);
    const latestToken = target === "main" ? latestMainSearchToken : latestCompareSearchToken;

    if (searchToken !== latestToken) {
      return;
    }

    renderSearchResults(matches, target);

    if (target === "main") {
      statusMessage.classList.remove("error");
      statusMessage.textContent = "Choose the correct city from the menu below.";
    }
  } catch (error) {
    if (target === "main") {
      showMainError(error.message || "Something went wrong while searching for the city.");
    } else {
      showComparisonError(error.message || "Something went wrong while searching for the comparison city.");
    }
  }
}

// Pick a selected main-city match and load its dashboard.
function selectMainMatch(location) {
  cityInput.value = getLocationLabel(location);
  setLoadingState("main", true, `Loading air quality data for ${getLocationLabel(location)}...`);

  loadMainCity(location)
    .catch((error) => {
      showMainError(error.message || "Something went wrong while loading data.");
    })
    .finally(() => {
      setLoadingState("main", false);
    });
}

// Pick a comparison-city match and update the comparison panel.
function selectCompareMatch(location) {
  compareCityInput.value = getLocationLabel(location);
  setLoadingState("compare", true);

  loadComparisonCity(location)
    .catch((error) => {
      showComparisonError(error.message || "Something went wrong while loading comparison data.");
    })
    .finally(() => {
      setLoadingState("compare", false);
    });
}

// Live suggestions for the main search input.
cityInput.addEventListener("input", () => {
  window.clearTimeout(mainSearchDebounceId);

  const typedValue = cityInput.value.trim();

  if (typedValue.length < 2) {
    clearMainSearchResults();

    if (!typedValue && mainCityState) {
      statusMessage.classList.remove("error");
      statusMessage.textContent = `Showing live conditions and forecast data for ${getLocationLabel(mainCityState.location)}.`;
    }

    return;
  }

  mainSearchDebounceId = window.setTimeout(() => {
    fetchSearchMatches(typedValue, "main");
  }, 250);
});

// Live suggestions for the comparison search input.
compareCityInput.addEventListener("input", () => {
  window.clearTimeout(compareSearchDebounceId);

  const typedValue = compareCityInput.value.trim();

  if (typedValue.length < 2) {
    clearCompareSearchResults();
    return;
  }

  compareSearchDebounceId = window.setTimeout(() => {
    fetchSearchMatches(typedValue, "compare");
  }, 250);
});

// Allow Enter to load the best main-city match.
citySearchForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (pendingMainMatches.length > 0) {
    const exactMatch = pendingMainMatches.find(
      (location) => getLocationLabel(location).toLowerCase() === cityInput.value.trim().toLowerCase()
    );
    selectMainMatch(exactMatch || pendingMainMatches[0]);
    return;
  }

  if (cityInput.value.trim().length >= 2) {
    fetchSearchMatches(cityInput.value, "main");
  } else {
    showMainError("Enter a U.S. city to search.");
  }
});

// Allow Enter to load the best comparison-city match.
compareSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (pendingCompareMatches.length > 0) {
    const exactMatch = pendingCompareMatches.find(
      (location) => getLocationLabel(location).toLowerCase() === compareCityInput.value.trim().toLowerCase()
    );
    selectCompareMatch(exactMatch || pendingCompareMatches[0]);
    return;
  }

  if (compareCityInput.value.trim().length >= 2) {
    fetchSearchMatches(compareCityInput.value, "compare");
  } else {
    showComparisonError("Enter a comparison city to begin the side-by-side analysis.");
  }
});

// Load the selected main-city suggestion.
searchResults.addEventListener("click", (event) => {
  const resultButton = event.target.closest(".result-option");

  if (!resultButton) {
    return;
  }

  const selectedMatch = pendingMainMatches[Number(resultButton.dataset.index)];

  if (selectedMatch) {
    selectMainMatch(selectedMatch);
  }
});

// Load the selected comparison-city suggestion.
compareSearchResults.addEventListener("click", (event) => {
  const resultButton = event.target.closest(".result-option");

  if (!resultButton) {
    return;
  }

  const selectedMatch = pendingCompareMatches[Number(resultButton.dataset.index)];

  if (selectedMatch) {
    selectCompareMatch(selectedMatch);
  }
});

// Close suggestion menus when the user clicks away.
document.addEventListener("click", (event) => {
  if (!citySearchForm.contains(event.target)) {
    clearMainSearchResults();
  }

  if (!compareSearchForm.contains(event.target)) {
    clearCompareSearchResults();
  }
});

// Load default main and comparison cities when the page opens.
cityInput.value = defaultLocation.city;
compareCityInput.value = defaultComparisonLocation.city;

setLoadingState("main", true, `Loading air quality data for ${getLocationLabel(defaultLocation)}...`);
setLoadingState("compare", true);

Promise.allSettled([
  loadMainCity(defaultLocation),
  loadComparisonCity(defaultComparisonLocation)
]).then((results) => {
  const [mainResult, compareResult] = results;

  if (mainResult.status === "rejected") {
    showMainError(mainResult.reason?.message || "Something went wrong while loading the main city.");
  }

  if (compareResult.status === "rejected") {
    showComparisonError(compareResult.reason?.message || "Something went wrong while loading the comparison city.");
  }
}).finally(() => {
  setLoadingState("main", false);
  setLoadingState("compare", false);
});

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

function getLocationLabel(location) {
  return `${location.city}, ${location.state}`;
}

function getLocationDetail(location) {
  return `${location.state}${location.county ? `, ${location.county} County` : ""}`;
}

function formatValue(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }

  return Number(value).toFixed(digits);
}

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

function formatHourLabel(dateTimeString) {
  const hourValue = Number(dateTimeString.split("T")[1].split(":")[0]);
  const period = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;

  return `${hour} ${period}`;
}

function describeDifference(value, unit, label, mainLocationName, comparisonLocationName) {
  if (value === 0) {
    return `${mainLocationName} ${label} matches ${comparisonLocationName} at this update window.`;
  }

  const direction = value > 0 ? "higher" : "lower";
  const amount = Math.abs(value).toFixed(unit === "AQI points" ? 0 : 1);

  return `${mainLocationName} reports ${amount} ${unit} ${direction} ${label} than ${comparisonLocationName} in the current readout.`;
}

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

function getHealthInterpretation(aqi) {
  if (aqi <= 50) {
    return "Air quality is favorable for outdoor activity with no broad public health concern.";
  }

  if (aqi <= 100) {
    return "Conditions are acceptable overall, but residents with respiratory sensitivity should stay alert.";
  }

  if (aqi <= 150) {
    return "Sensitive groups should reduce prolonged outdoor exertion while the signal remains elevated.";
  }

  return "Air conditions are unhealthy and outdoor exposure should be reduced across the general population.";
}

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
    return "Particle load trends downward across the forecast window, suggesting cleaner air later in the cycle.";
  }

  if (difference >= 1) {
    return "Particle load trends upward across the forecast window, suggesting conditions may deteriorate later today.";
  }

  return "The forecast window is comparatively steady with no strong rise or drop in particle concentration.";
}

function getPm25EpaStatus(pm25) {
  if (pm25 > 12) {
    return "Above EPA annual guideline";
  }

  return "Within EPA annual guideline";
}

function getPm25Hint(pm25) {
  if (pm25 >= 12) {
    return "Elevated fine particles often align with combustion sources such as traffic, industrial activity, or smoke transport.";
  }

  return "Fine particle concentration is comparatively restrained against the EPA annual reference point.";
}

function getOzoneHint(ozone) {
  if (ozone >= 100) {
    return "The ozone signal suggests active sunlight-driven atmospheric chemistry in the current air mass.";
  }

  return "The ozone signal is present without a strong photochemical buildup at this update.";
}

function getTimePatternInsight(hourlyPm25, hourlyOzone) {
  const morningPm25 = hourlyPm25.slice(0, 6);
  const afternoonOzone = hourlyOzone.slice(10, 16);

  if (morningPm25.length === 0 || afternoonOzone.length === 0) {
    return "Time-of-day interpretation is limited because forecast coverage is incomplete.";
  }

  const maxMorningPm25 = Math.max(...morningPm25);
  const maxAfternoonOzone = Math.max(...afternoonOzone);

  if (maxAfternoonOzone >= 100) {
    return "The later daylight window shows the clearest risk of ozone buildout as sunlight intensifies atmospheric reactions.";
  }

  if (maxMorningPm25 >= 12) {
    return "The earlier hours show the stronger particle burden, which often lines up with commute and combustion patterns.";
  }

  return "No dominant time-of-day pollution signature stands out in the present forecast strip.";
}

function getAnomalyMessage(currentPm25, currentAqi, hourlyPm25, hourlyAqi) {
  const nearbyPm25 = hourlyPm25.slice(1, 4);
  const nearbyAqi = hourlyAqi.slice(1, 4);

  if (nearbyPm25.length === 0 || nearbyAqi.length === 0) {
    return "Not enough nearby forecast values are available to check for spikes.";
  }

  const pm25Average = nearbyPm25.reduce((sum, value) => sum + value, 0) / nearbyPm25.length;
  const aqiAverage = nearbyAqi.reduce((sum, value) => sum + value, 0) / nearbyAqi.length;

  if (currentPm25 >= pm25Average + 5 || currentAqi >= aqiAverage + 20) {
    return "Current conditions sit well above nearby forecast values, which flags a short-lived spike worth watching.";
  }

  return "The live reading tracks closely with the surrounding forecast values, so no unusual jump is evident.";
}

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

function clearMainSearchResults() {
  pendingMainMatches = [];
  searchResults.innerHTML = "";
  searchResults.classList.remove("is-visible");
}

function clearCompareSearchResults() {
  pendingCompareMatches = [];
  compareSearchResults.innerHTML = "";
  compareSearchResults.classList.remove("is-visible");
}

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

function updateMainDashboard(data, location) {
  const current = data.current;
  const aqi = Math.round(current.us_aqi);
  const category = getAqiCategory(aqi);
  const locationLabel = getLocationLabel(location);

  aqiCard.classList.remove("aqi-good", "aqi-moderate", "aqi-sensitive", "aqi-unhealthy");
  aqiCard.classList.add(category.className);

  selectedLocation.textContent = locationLabel;
  aqiValue.textContent = aqi;
  aqiLabel.textContent = category.label;
  pm25Value.textContent = `${formatValue(current.pm2_5)} ug/m3`;
  pm10Value.textContent = formatValue(current.pm10);
  ozoneValue.textContent = formatValue(current.ozone);
  pm25EpaStatus.textContent = `${getPm25EpaStatus(current.pm2_5)} | EPA annual PM2.5 reference: 12 ug/m3`;
  pm25Hint.textContent = getPm25Hint(current.pm2_5);
  ozoneHint.textContent = getOzoneHint(current.ozone);
  updatedValue.textContent = formatLocalDateTime(current.time);
  updatedCityLabel.textContent = `Local time for ${locationLabel}`;

  healthTitle.textContent = `${category.label} Conditions`;
  healthMessage.textContent = getHealthInterpretation(aqi);
  trendTitle.textContent = "Short-Term Direction";
  trendMessage.textContent = getTrendMessage(data.hourly.pm2_5);
  timePatternTitle.textContent = "Daily Pattern";
  timePatternMessage.textContent = getTimePatternInsight(data.hourly.pm2_5, data.hourly.ozone);
  anomalyTitle.textContent = "Current Spike Check";
  anomalyMessage.textContent = getAnomalyMessage(current.pm2_5, aqi, data.hourly.pm2_5, data.hourly.us_aqi);

  statusMessage.classList.remove("error");
  statusMessage.textContent = `Monitoring bulletin updated for ${locationLabel}. Live conditions and forecast strip are active.`;
}

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
          borderColor: "#bc5c33",
          backgroundColor: "rgba(188, 92, 51, 0.1)",
          fill: true,
          tension: 0.28,
          pointRadius: 1.8,
          pointHoverRadius: 3.4,
          pointBackgroundColor: "#16212b",
          borderWidth: 2
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
      animation: {
        duration: 250
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          displayColors: false,
          backgroundColor: "rgba(22, 33, 43, 0.94)",
          titleColor: "#f6f2e8",
          bodyColor: "#f6f2e8",
          borderColor: "rgba(201, 161, 78, 0.5)",
          borderWidth: 1,
          padding: 10
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#435260",
            maxRotation: 0,
            autoSkip: true
          },
          grid: {
            color: "rgba(77, 89, 99, 0.16)",
            tickLength: 6
          },
          border: {
            color: "rgba(77, 89, 99, 0.5)"
          }
        },
        y: {
          ticks: {
            color: "#435260"
          },
          title: {
            display: true,
            text: "PM2.5 ug/m3",
            color: "#435260"
          },
          grid: {
            color: "rgba(77, 89, 99, 0.16)"
          },
          border: {
            color: "rgba(77, 89, 99, 0.5)"
          }
        }
      }
    }
  });
}

function showMainError(message) {
  clearMainSearchResults();
  statusMessage.classList.add("error");
  statusMessage.textContent = message;
  aqiCard.classList.remove("aqi-good", "aqi-moderate", "aqi-sensitive", "aqi-unhealthy");
  aqiValue.textContent = "--";
  aqiLabel.textContent = "Unable to load";
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

function showComparisonError(message) {
  clearCompareSearchResults();
  comparisonCityName.textContent = "City not available";
  comparisonCityAqi.textContent = "--";
  comparisonCityPm25.textContent = "--";
  comparisonAqiDifference.textContent = message;
  comparisonPm25Difference.textContent = "Try another city to refresh the side investigation.";
}

async function loadMainCity(location) {
  clearMainSearchResults();
  const data = await getAirQualityData(location);
  mainCityState = { location, data };
  updateMainDashboard(data, location);
  renderChart(data, location);
  updateComparisonCards();
}

async function loadComparisonCity(location) {
  clearCompareSearchResults();
  const data = await getAirQualityData(location);
  comparisonCityState = { location, data };
  updateComparisonCards();
}

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
      statusMessage.textContent = "Select the correct city from the lookup ledger below.";
    }
  } catch (error) {
    if (target === "main") {
      showMainError(error.message || "Something went wrong while searching for the city.");
    } else {
      showComparisonError(error.message || "Something went wrong while searching for the comparison city.");
    }
  }
}

function selectMainMatch(location) {
  cityInput.value = getLocationLabel(location);
  setLoadingState("main", true, `Loading monitoring bulletin for ${getLocationLabel(location)}...`);

  loadMainCity(location)
    .catch((error) => {
      showMainError(error.message || "Something went wrong while loading data.");
    })
    .finally(() => {
      setLoadingState("main", false);
    });
}

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

cityInput.addEventListener("input", () => {
  window.clearTimeout(mainSearchDebounceId);

  const typedValue = cityInput.value.trim();

  if (typedValue.length < 2) {
    clearMainSearchResults();

    if (!typedValue && mainCityState) {
      statusMessage.classList.remove("error");
      statusMessage.textContent = `Monitoring bulletin active for ${getLocationLabel(mainCityState.location)}.`;
    }

    return;
  }

  mainSearchDebounceId = window.setTimeout(() => {
    fetchSearchMatches(typedValue, "main");
  }, 250);
});

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
    showMainError("Enter a U.S. city to start the monitoring bulletin.");
  }
});

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
    showComparisonError("Enter a comparison city to begin the side investigation.");
  }
});

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

document.addEventListener("click", (event) => {
  if (!citySearchForm.contains(event.target)) {
    clearMainSearchResults();
  }

  if (!compareSearchForm.contains(event.target)) {
    clearCompareSearchResults();
  }
});

cityInput.value = defaultLocation.city;
compareCityInput.value = defaultComparisonLocation.city;

setLoadingState("main", true, `Loading monitoring bulletin for ${getLocationLabel(defaultLocation)}...`);
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

# Air Quality Monitoring Dashboard

https://urbanairwatch.vercel.app/

A real time air quality dashboard that analyzes pollution levels, explains health impact, and compares conditions between cities using free public data.

This project focuses on one goal:
Turn raw air quality data into clear, actionable insights.

---

## What it does

- Displays live AQI, PM2.5, PM10, and ozone levels  
- Provides health interpretation based on AQI  
- Detects short term trends and pollution changes  
- Compares air quality between two cities  
- Identifies unusual pollution spikes  
- Shows a 24 hour PM2.5 forecast  

The system acts like a simplified environmental monitoring report.

---

## Tech Stack

- JavaScript, HTML, CSS  
- Chart.js for time series visualization  
- Open Meteo Air Quality API  
- Open Meteo Geocoding API  

No API key required. Fully client side.

---

## Data Source

- Open Meteo Air Quality API  
- Open Meteo Geocoding API  

The dashboard pulls:
- Current AQI and pollutant levels  
- Hourly PM2.5, AQI, and ozone forecasts :contentReference[oaicite:0]{index=0}  

---

## How it works

1. User searches for a U.S. city  
2. App fetches coordinates using geocoding  
3. Air quality data is retrieved from Open Meteo  
4. Values are processed into readable metrics  
5. Insights are generated from trends and thresholds  
6. Data is displayed in dashboard and chart form  

---

## Key Features

### Real Time Monitoring
- Displays current AQI and pollutants  
- Updates with local timestamps  

### Health Interpretation
- Converts AQI into clear guidance  
- Example:
  - Good → safe  
  - Moderate → caution for sensitive groups  
  - Unhealthy → limit outdoor activity  

### Trend Detection
- Compares early vs later forecast values  
- Identifies if air quality is improving or worsening :contentReference[oaicite:1]{index=1}  

### Daily Pattern Insight
- Detects patterns like:
  - Morning PM2.5 spikes from traffic  
  - Afternoon ozone peaks from sunlight  

### Anomaly Detection
- Flags unusual spikes compared to nearby forecast values  
- Helps identify sudden pollution events  

### City Comparison
- Compare two cities side by side  
- Shows differences in AQI and PM2.5  
- Generates readable comparisons  

---

## Project Structure

- index.html → layout and dashboard UI  
- script.js → data fetching, analysis logic, comparisons :contentReference[oaicite:2]{index=2}  
- style.css → full UI system and layout design :contentReference[oaicite:3]{index=3}  

---

## Why I built this

Most air quality tools show numbers but do not explain them.

This project focuses on:
- Interpreting environmental data  
- Turning data into decisions  
- Building tools that resemble real monitoring systems  

It shows how I:
- Work with environmental APIs  
- Analyze pollutant behavior  
- Translate data into clear insights  


function updateAlerts() {
  fetch('/api/alerts')
    .then(response => response.json())
    .then(alerts => {
      const alertContainer = document.getElementById('alert-scroller');
      if (alerts && alerts.length > 0) {
        const messages = alerts.map(alert => alert.message).join(' • ');
        alertContainer.textContent = messages;
        document.getElementById('alert-footer').style.display = 'block';
      } else {
        document.getElementById('alert-footer').style.display = 'none';
      }
    })
    .catch(err => console.error('Error updating alerts:', err));
}

// Update alerts every 30 seconds
setInterval(updateAlerts, 30000);
// Initial update
updateAlerts();

// Global variables for tracking update state
let updateTimer = null;
let lastUpdateTime = 0;
let socket = null;
let eventSource = null;
let retryCount = 0;
const MAX_RETRIES = 3;
const MIN_UPDATE_INTERVAL = 10000; // 10 seconds minimum between updates

// Update clock with HH:MM:SS format
function updateClock() {
    const now = new Date();
    const timeElem = document.getElementById('currentTime');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    timeElem.textContent = `${hours}:${minutes}:${seconds}`;
}

// Accessibility icon SVG
const accessibilityIcon = `
<span class="accessibility-icon">
    <img src="/static/images/Wheelchair_accessible_icon.svg" alt="Accessibility" width="24" height="24">
</span>`;

// Check if enough time has passed to allow an update
function canUpdate() {
    const now = Date.now();
    return (now - lastUpdateTime) >= MIN_UPDATE_INTERVAL;
}

// Update schedules with rate limiting
async function updateSchedules(force = false) {
    // If not forced update and update interval hasn't passed, skip
    if (!force && !canUpdate()) {
        console.log('Skipping update - too soon since last update');
        return;
    }
    
    try {
        const stationName = document.querySelector('.station-name').textContent.split('-')[0].trim();
        const response = await fetch(`/api/schedules?station=${encodeURIComponent(stationName)}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch schedules: ${response.status}`);
        }

        const schedules = await response.json();
        const container = document.getElementById('scheduleRows');
        container.innerHTML = '';

        schedules.forEach(schedule => {
            const row = document.createElement('div');
            row.className = 'schedule-row';

            const statusClass = schedule.status.toLowerCase() === 'delayed' 
                ? 'status-delayed' 
                : schedule.status.toLowerCase() === 'cancelled' 
                    ? 'status-cancelled' 
                    : '';

            // Format the train info with route code span
            const [routeCode, ...destinationParts] = schedule.train.split(' ');
            
            // Route code colored span
            const routeCodeSpan = `<span class="route-code" style="background-color: ${schedule.color}">${routeCode}</span>`;
            
            // Format platform display
            let platformDisplay = schedule.status;
            
            // If the status is a platform number (when train is on time)
            if (schedule.status !== 'Delayed' && schedule.status !== 'Cancelled') {
                platformDisplay = `<span class="platform-number">${schedule.status}</span>`;
                if (schedule.accessible) {
                    platformDisplay += ` ${accessibilityIcon}`;
                }
            }

            row.innerHTML = `
                <div class="col-scheduled">${schedule.departure}</div>
                <div class="col-to">
                    ${routeCodeSpan}
                    ${schedule.destination}
                </div>
                <div class="col-stop">
                    ${destinationParts.join(' ')}
                </div>
                <div class="col-platform ${statusClass}">
                    ${platformDisplay}
                </div>
            `;
            container.appendChild(row);
        });
        
        // Update last successful update time
        lastUpdateTime = Date.now();
        retryCount = 0;
    } catch (error) {
        console.error('Error updating schedules:', error);
        retryCount++;
        
        if (retryCount > MAX_RETRIES) {
            // Show error message after multiple retries
            const container = document.getElementById('scheduleRows');
            container.innerHTML = `
                <div role="alert">
                    Unable to load schedule data. Please try again later.
                </div>
            `;
        } else {
            console.log(`Retry ${retryCount}/${MAX_RETRIES} - Will retry in ${5*retryCount} seconds`);
            // Exponential backoff for retries
            setTimeout(() => updateSchedules(true), 5000 * retryCount);
        }
    }
}

// Update station title
function updateStationTitle(stationName) {
    const stationNameElement = document.querySelector('.station-name');
    if (stationNameElement) {
        const currentText = stationNameElement.textContent;
        const parts = currentText.split('-');
        
        if (parts.length > 1) {
            // Keep the part after the hyphen (typically "Train Departures | Départs des Trains")
            stationNameElement.textContent = `${stationName} - ${parts[1].trim()}`;
        } else {
            stationNameElement.textContent = `${stationName} - Train Departures | Départs des Trains`;
        }
        
        // Trigger schedule update after station change
        updateSchedules(true);
    }
}

// Language toggle
async function toggleLanguage() {
    try {
        const currentLang = document.documentElement.lang;
        const newLang = currentLang === 'en' ? 'fr' : 'en';

        const response = await fetch('/api/set_language', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `language=${newLang}`
        });

        if (response.ok) {
            window.location.reload();
        }
    } catch (error) {
        console.error('Error toggling language:', error);
    }
}

// Initialize WebSocket connection
function initializeWebSocket() {
    socket = io();
    
    socket.on('connect', () => {
        socket.emit('request_station');
    });
    
    socket.on('station_update', data => {
        updateStationTitle(data.station);
    });
    
    socket.on('connect_error', () => {
        initializeSSE();
    });
}

// Initialize Server-Sent Events as fallback
function initializeSSE() {
    // Close existing connection if any
    if (eventSource) {
        eventSource.close();
    }
    
    try {
        console.log('Initializing SSE connection...');
        eventSource = new EventSource('/api/sse/station_updates');
        
        eventSource.onopen = () => {
            console.log('SSE connection established');
        };
        
        eventSource.onmessage = event => {
            try {
                const data = JSON.parse(event.data);
                console.log('SSE message received:', data);
                
                if (data.event === 'station_update') {
                    updateStationTitle(data.station);
                }
            } catch (error) {
                console.error('Error parsing SSE message:', error);
            }
        };
        
        eventSource.onerror = error => {
            console.error('SSE connection error:', error);
            eventSource.close();
            
            // Attempt to reconnect after a delay
            setTimeout(initializeSSE, 5000);
        };
    } catch (error) {
        console.error('Error setting up SSE:', error);
    }
}

// Initialize display
function initializeDisplay() {
    // Set up the clock update
    setInterval(updateClock, 1000);
    updateClock();
    
    // Set up a regular schedule update (as a fallback)
    updateTimer = setInterval(() => updateSchedules(), 30000); // Update every 30 seconds
    
    // Initial schedule update
    updateSchedules(true);
    
    // Attempt WebSocket connection first
    initializeWebSocket();
}

// Start display when page loads
document.addEventListener('DOMContentLoaded', initializeDisplay);
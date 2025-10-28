// Dashboard functionality

// Simulate SOL price updates
function updateSolPrice() {
    const priceElement = document.getElementById('sol-price');
    if (priceElement) {
        // In production, fetch real price from API
        const price = (150 + Math.random() * 10).toFixed(2);
        priceElement.textContent = `$${price}`;
    }
}

// Update price every 5 seconds
updateSolPrice();
setInterval(updateSolPrice, 5000);

// Add click handlers to dashboard buttons
document.querySelectorAll('.dashboard-btn').forEach(button => {
    button.addEventListener('click', function() {
        const btnText = this.querySelector('.btn-text').textContent;
        addLogEntry(`Action: ${btnText}`);
        
        // Visual feedback
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.style.transform = '';
        }, 150);
    });
});

// Activity log
function addLogEntry(message) {
    const activityLog = document.querySelector('.activity-log');
    if (!activityLog) return;
    
    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.innerHTML = `
        <span class="log-time">Just now</span>
        <span class="log-message">${message}</span>
        <span class="log-status status-success">●</span>
    `;
    
    // Add new log at the top
    activityLog.insertBefore(logItem, activityLog.firstChild);
    
    // Keep only last 10 entries
    while (activityLog.children.length > 10) {
        activityLog.removeChild(activityLog.lastChild);
    }
    
    // Update timestamps
    updateTimestamps();
}

// Update all timestamps
function updateTimestamps() {
    const logItems = document.querySelectorAll('.log-item');
    logItems.forEach((item, index) => {
        const timeSpan = item.querySelector('.log-time');
        if (index === 0) {
            timeSpan.textContent = 'Just now';
        } else {
            timeSpan.textContent = `${index}m ago`;
        }
    });
}

// Simulate real-time updates
setInterval(() => {
    // Random system events
    const events = [
        'Price check completed',
        'Wallet health verified',
        'Connection pool refreshed',
        'System status: Optimal'
    ];
    
    if (Math.random() > 0.7) {
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        addLogEntry(randomEvent);
    }
    
    updateTimestamps();
}, 30000); // Every 30 seconds

// Animate stats on load
window.addEventListener('load', () => {
    const statBoxes = document.querySelectorAll('.stat-box');
    statBoxes.forEach((box, index) => {
        box.style.opacity = '0';
        box.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            box.style.transition = 'all 0.5s ease';
            box.style.opacity = '1';
            box.style.transform = 'translateY(0)';
        }, index * 100);
    });
    
    const cards = document.querySelectorAll('.dashboard-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            card.style.transition = 'all 0.5s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 200 + index * 100);
    });
});

// Clear activity log
document.querySelector('.card-header .btn-small')?.addEventListener('click', function() {
    const activityLog = document.querySelector('.activity-log');
    if (activityLog) {
        activityLog.innerHTML = `
            <div class="log-item">
                <span class="log-time">Just now</span>
                <span class="log-message">Activity log cleared</span>
                <span class="log-status status-success">●</span>
            </div>
        `;
    }
});


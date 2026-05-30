// State management for trails
const trailLength = 8;
const leftStickHistory = [];
const rightStickHistory = [];

let configObj = {};
let packetRateCounter = 0;
let lastPacketCheckTime = Date.now();

// Elements
const statusBadge = document.getElementById('status-badge');
const portNameEl = document.getElementById('port-name');
const telemetryRateEl = document.getElementById('telemetry-rate');
const totalPacketsEl = document.getElementById('total-packets');

const valLx = document.getElementById('val-lx');
const valLy = document.getElementById('val-ly');
const valRx = document.getElementById('val-rx');
const valRy = document.getElementById('val-ry');
const valCamera = document.getElementById('val-camera');

const rawLx = document.getElementById('raw-lx');
const rawLy = document.getElementById('raw-ly');
const rawRx = document.getElementById('raw-rx');
const rawRy = document.getElementById('raw-ry');
const rawCamera = document.getElementById('raw-camera');

const potLx = document.getElementById('pot-lx');
const potLy = document.getElementById('pot-ly');
const potRx = document.getElementById('pot-rx');
const potRy = document.getElementById('pot-ry');
const potCamera = document.getElementById('pot-camera');

const dialGaugeBar = document.getElementById('dial-gauge-bar');
const dialBtnLeft = document.getElementById('dial-btn-left');
const dialBtnRight = document.getElementById('dial-btn-right');

const chkUsb = document.getElementById('chk-usb');
const chkBridge = document.getElementById('chk-bridge');

// Config Inputs
const configForm = document.getElementById('config-form');
const swapSticksInput = document.getElementById('swap_sticks');
const invertLxInput = document.getElementById('invert_lx');
const invertLyInput = document.getElementById('invert_ly');
const invertRxInput = document.getElementById('invert_rx');
const invertRyInput = document.getElementById('invert_ry');
const cameraThresholdInput = document.getElementById('camera_threshold');
const cameraThresholdVal = document.getElementById('camera-threshold-val');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');

// Canvas Setup
const leftCanvas = document.getElementById('left-stick-canvas');
const rightCanvas = document.getElementById('right-stick-canvas');
const leftCtx = leftCanvas.getContext('2d');
const rightCtx = rightCanvas.getContext('2d');

// Adjust slider readout dynamically
cameraThresholdInput.addEventListener('input', (e) => {
    cameraThresholdVal.innerText = e.target.value;
});

// Canvas Drawing function
function drawStickHUD(ctx, canvas, xVal, yVal, history, colorPrimary, colorGlow) {
    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = w / 2 - 16;

    // Clear Canvas
    ctx.clearRect(0, 0, w, h);

    // 1. Draw Outer boundary circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 14, 23, 0.45)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    // 2. Draw standard grids (Crosshairs)
    ctx.beginPath();
    ctx.moveTo(centerX, 10);
    ctx.lineTo(centerX, h - 10);
    ctx.moveTo(10, centerY);
    ctx.lineTo(w - 10, centerY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. Draw intermediate grid circles
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.stroke();

    // 4. Calculate current dot position
    // Virtual axes range from -32768 to 32767
    const posX = centerX + (xVal / 32768) * radius;
    // Invert Y coordinate because canvas y-axis points downwards
    const posY = centerY - (yVal / 32768) * radius;

    // Save current point to history for trail
    history.push({ x: posX, y: posY });
    if (history.length > trailLength) {
        history.shift();
    }

    // 5. Draw Trail
    for (let i = 0; i < history.length - 1; i++) {
        const pt = history[i];
        const opacity = (i + 1) / history.length * 0.25;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4 + i * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = colorGlow.replace('0.35', opacity.toString());
        ctx.fill();
    }

    // 6. Draw Glow ring around the active stick dot
    ctx.save();
    ctx.beginPath();
    ctx.arc(posX, posY, 10, 0, Math.PI * 2);
    ctx.shadowColor = colorPrimary;
    ctx.shadowBlur = 12;
    ctx.fillStyle = colorPrimary;
    ctx.fill();
    ctx.restore();

    // Inner bright dot core
    ctx.beginPath();
    ctx.arc(posX, posY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
}

// Map potentiometer percentage (364 to 1684) to CSS width percentages
function getPotPercent(val) {
    // raw values typically range from 364 to 1684
    let pct = ((val - 364) / (1684 - 364)) * 100;
    return Math.max(0, Math.min(100, pct));
}

// Establish live SSE connection to the backend
function startTelemetryStream() {
    console.log("Connecting to live telemetry stream...");
    const source = new EventSource('/stream');

    source.onopen = () => {
        console.log("SSE Stream connected.");
    };

    source.onerror = (err) => {
        console.error("SSE Stream connection failed. Retrying...", err);
        updateStatus(false, 'None', 0);
    };

    source.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // 1. Update Connection statuses
        updateStatus(data.connected, data.port_name, data.packets_received);

        // 2. Count packets for rate
        packetRateCounter++;
        const now = Date.now();
        if (now - lastPacketCheckTime >= 1000) {
            const dt = (now - lastPacketCheckTime) / 1000;
            const rate = Math.round(packetRateCounter / dt);
            telemetryRateEl.innerText = `${rate} Pkt/s`;
            packetRateCounter = 0;
            lastPacketCheckTime = now;
        }

        // 3. Render Calibrated Live values
        valLx.innerText = data.lx;
        valLy.innerText = data.ly;
        valRx.innerText = data.rx;
        valRy.innerText = data.ry;
        valCamera.innerText = data.camera;

        // 4. Render Raw Potentiometer values in Diagnostics tab
        rawLx.innerText = data.raw_lx;
        rawLy.innerText = data.raw_ly;
        rawRx.innerText = data.raw_rx;
        rawRy.innerText = data.raw_ry;
        rawCamera.innerText = data.raw_camera;

        potLx.style.width = `${getPotPercent(data.raw_lx)}%`;
        potLy.style.width = `${getPotPercent(data.raw_ly)}%`;
        potRx.style.width = `${getPotPercent(data.raw_rx)}%`;
        potRy.style.width = `${getPotPercent(data.raw_ry)}%`;
        potCamera.style.width = `${getPotPercent(data.raw_camera)}%`;

        // 5. Draw HUD Joysticks
        // Left stick: Cyan style
        drawStickHUD(leftCtx, leftCanvas, data.lx, data.ly, leftStickHistory, 'hsl(180, 100%, 50%)', 'rgba(0, 242, 254, 0.35)');
        // Right stick: Electric Blue style
        drawStickHUD(rightCtx, rightCanvas, data.rx, data.ry, rightStickHistory, 'hsl(215, 100%, 55%)', 'rgba(0, 102, 255, 0.35)');

        // 6. Gimbal Dial progress slider
        // Convert -32768 to 32767 range to 0-100% width
        const dialPct = ((data.camera + 32768) / 65535) * 100;
        dialGaugeBar.style.width = `${dialPct}%`;

        // Gimbal button threshold triggers
        const cameraThreshold = data.config.camera_threshold;
        if (data.camera >= cameraThreshold) {
            dialBtnRight.classList.add('active');
            dialBtnLeft.classList.remove('active');
        } else if (data.camera <= -cameraThreshold) {
            dialBtnLeft.classList.add('active');
            dialBtnRight.classList.remove('active');
        } else {
            dialBtnLeft.classList.remove('active');
            dialBtnRight.classList.remove('active');
        }

        // Apply config checks from backend if first run
        if (Object.keys(configObj).length === 0) {
            configObj = data.config;
            applyConfigToUI(configObj);
        }
    };
}

// Toggle connection labels & wizards based on active connection
function updateStatus(connected, portName, totalPackets) {
    if (connected) {
        statusBadge.innerText = "Online";
        statusBadge.className = "badge badge-online";
        portNameEl.innerText = portName;
        
        chkUsb.classList.add('checked');
        chkBridge.classList.add('checked');
    } else {
        statusBadge.innerText = "Offline";
        statusBadge.className = "badge badge-offline";
        portNameEl.innerText = "None Detected";
        telemetryRateEl.innerText = "0 Pkt/s";
        
        chkUsb.classList.remove('checked');
        chkBridge.classList.remove('checked');
    }
    totalPacketsEl.innerText = totalPackets;
}

// Fill UI form inputs with loaded configurations
function applyConfigToUI(conf) {
    swapSticksInput.checked = conf.swap_sticks;
    invertLxInput.checked = conf.invert_lx;
    invertLyInput.checked = conf.invert_ly;
    invertRxInput.checked = conf.invert_rx;
    invertRyInput.checked = conf.invert_ry;
    cameraThresholdInput.value = conf.camera_threshold;
    cameraThresholdVal.innerText = conf.camera_threshold;
}

// Push updated settings back to the bridge
configForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const newConfig = {
        swap_sticks: swapSticksInput.checked,
        invert_lx: invertLxInput.checked,
        invert_ly: invertLyInput.checked,
        invert_rx: invertRxInput.checked,
        invert_ry: invertRyInput.checked,
        camera_threshold: parseInt(cameraThresholdInput.value)
    };

    saveBtn.innerText = "Saving settings...";
    saveBtn.disabled = true;

    fetch('/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(newConfig)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            configObj = data.config;
            saveBtn.innerText = "Configurations Applied!";
            saveBtn.style.background = "linear-gradient(135deg, hsl(145, 80%, 45%), hsl(160, 100%, 40%))";
            
            setTimeout(() => {
                saveBtn.innerText = "Apply Configurations";
                saveBtn.style.background = "";
                saveBtn.disabled = false;
            }, 2000);
        }
    })
    .catch(err => {
        console.error("Error saving configuration:", err);
        saveBtn.innerText = "Error Saving!";
        setTimeout(() => {
            saveBtn.innerText = "Apply Configurations";
            saveBtn.disabled = false;
        }, 2000);
    });
});

// Reset settings to defaults and push to the bridge
resetBtn.addEventListener('click', () => {
    const defaultConfig = {
        swap_sticks: false,
        invert_lx: false,
        invert_ly: false,
        invert_rx: false,
        invert_ry: false,
        camera_threshold: 25000
    };

    resetBtn.innerText = "Resetting...";
    resetBtn.disabled = true;

    fetch('/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(defaultConfig)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            configObj = data.config;
            applyConfigToUI(configObj);
            
            resetBtn.innerText = "Defaults Applied!";
            resetBtn.style.background = "linear-gradient(135deg, hsl(145, 80%, 45%), hsl(160, 100%, 40%))";
            resetBtn.style.color = "#fff";
            
            setTimeout(() => {
                resetBtn.innerText = "Reset to Defaults";
                resetBtn.style.background = "";
                resetBtn.style.color = "";
                resetBtn.disabled = false;
            }, 2000);
        }
    })
    .catch(err => {
        console.error("Error resetting configuration:", err);
        resetBtn.innerText = "Error!";
        setTimeout(() => {
            resetBtn.innerText = "Reset to Defaults";
            resetBtn.disabled = false;
        }, 2000);
    });
});

// Interactive Tab Switcher
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');

        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
    });
});

// Initialize on page load
window.addEventListener('load', () => {
    // Initial HUD clears
    drawStickHUD(leftCtx, leftCanvas, 0, 0, leftStickHistory, 'hsl(180, 100%, 50%)', 'rgba(0, 242, 254, 0.35)');
    drawStickHUD(rightCtx, rightCanvas, 0, 0, rightStickHistory, 'hsl(215, 100%, 55%)', 'rgba(0, 102, 255, 0.35)');
    
    // Start telemetry listener
    startTelemetryStream();
});

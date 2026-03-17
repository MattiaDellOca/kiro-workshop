let names = [];
const COLORS = ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40"];

let currentAngle = 0;
let spinning = false;
let sessionId = null;
let ws = null;
let reconnectDelay = 1000;

let canvas;
let ctx;
let centerX;
let centerY;
let radius;

function drawWheel() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (names.length === 0) {
    // Empty state: grey circle with prompt text
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = "#444";
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Scan QR code to join", centerX, centerY);
    return;
  }

  const n = names.length;
  const slotAngle = (2 * Math.PI) / n;

  for (let i = 0; i < n; i++) {
    const startAngle = currentAngle + i * slotAngle;
    const endAngle = startAngle + slotAngle;

    // Draw colored arc segment
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();

    // Draw name text at the midpoint of the arc
    ctx.save();
    const midAngle = startAngle + slotAngle / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(midAngle);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(names[i], radius - 12, 0);
    ctx.restore();
  }
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

function getWinner(angle) {
  const n = names.length;
  const slotAngle = (2 * Math.PI) / n;
  // Arrow is at top (12 o'clock = -π/2 in canvas coords).
  let effective = (-Math.PI / 2 - angle) % (2 * Math.PI);
  if (effective < 0) effective += 2 * Math.PI;
  const index = Math.floor(effective / slotAngle) % n;
  return names[index];
}

function spin() {
  const winnerDisplay = document.getElementById("winner");
  const spinBtn = document.getElementById("spin-btn");
  const clearBtn = document.getElementById("clear-btn");

  if (names.length === 0) {
    winnerDisplay.textContent = "No participants — ask attendees to scan the QR code";
    return;
  }

  if (spinning) return;
  spinning = true;

  spinBtn.disabled = true;
  clearBtn.disabled = true;

  const duration = 3000 + Math.random() * 3000;
  const totalRotation = (4 + Math.random() * 4) * 2 * Math.PI + Math.random() * 2 * Math.PI;
  const startAngle = currentAngle;
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    currentAngle = startAngle + totalRotation * easeOut(t);
    drawWheel();

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      spinning = false;
      const winner = getWinner(currentAngle);
      winnerDisplay.textContent = winner;

      // Broadcast winner via WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "sendmessage", type: "winner", name: winner, sessionId }));
      }

      spinBtn.disabled = false;
      clearBtn.disabled = false;
    }
  }

  requestAnimationFrame(animate);
}

function connectWebSocket() {
  ws = new WebSocket(`${window.WEBSOCKET_API_URL}?sessionId=${sessionId}`);

  ws.onopen = function () {
    reconnectDelay = 1000;
  };

  ws.onmessage = function (event) {
    const data = JSON.parse(event.data);

    if (data.action === "newName") {
      names.push(data.name);
      drawWheel();
    } else if (data.action === "clear") {
      names = [];
      drawWheel();
      document.getElementById("winner").textContent = "";
    }
    // "winner" action is a no-op on the presenter (already handled locally)
  };

  ws.onclose = function () {
    // Auto-reconnect with exponential backoff
    setTimeout(function () {
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      connectWebSocket();
    }, reconnectDelay);
  };

  ws.onerror = function (err) {
    console.error("WebSocket error:", err);
  };
}

function clearNames() {
  const clearBtn = document.getElementById("clear-btn");
  clearBtn.disabled = true;

  fetch(`${window.REGISTRATION_API_URL}/register`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  })
    .then(function (res) {
      if (!res.ok) throw new Error("Clear failed");
      clearBtn.disabled = false;
    })
    .catch(function (err) {
      console.error("Clear error:", err);
      document.getElementById("winner").textContent = "Error clearing names";
      setTimeout(function () {
        document.getElementById("winner").textContent = "";
      }, 3000);
      clearBtn.disabled = false;
    });
}

function init() {
  sessionId = crypto.randomUUID();

  canvas = document.getElementById("wheel");
  ctx = canvas.getContext("2d");
  centerX = canvas.width / 2;
  centerY = canvas.height / 2;
  radius = 190;

  // Build registration URL and render QR code
  const registrationUrl = `${window.location.origin}/register.html?sessionId=${sessionId}`;
  const qr = qrcode(0, "M");
  qr.addData(registrationUrl);
  qr.make();
  document.getElementById("qr-code").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });

  // Connect WebSocket
  connectWebSocket();

  // Draw initial empty wheel
  drawWheel();

  // Wire buttons
  document.getElementById("spin-btn").addEventListener("click", spin);
  document.getElementById("clear-btn").addEventListener("click", clearNames);
}

document.addEventListener("DOMContentLoaded", init);
